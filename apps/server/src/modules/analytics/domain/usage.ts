import type { UsageDayDto, UsageFilterDto, UsageReportDto, UsageRunDto, UsageSliceDto } from "@mrd/contracts";
import type { UsageRow } from "../ports.js";

const tok = (r: UsageRow) => (r.inputTokens ?? 0) + (r.outputTokens ?? 0) + (r.cacheReadTokens ?? 0) + (r.cacheWriteTokens ?? 0);
const cost = (r: UsageRow) => r.costUsd ?? 0;
/** Ngày theo giờ máy chạy server (desktop = giờ người dùng). */
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function applyFilter(rows: UsageRow[], f: UsageFilterDto): UsageRow[] {
  const has = (a: string[] | undefined, v: string | null) => !a?.length || (v !== null && a.includes(v));
  return rows.filter((r) => has(f.repoIds, r.repositoryId) && has(f.providers, r.provider) && has(f.models, r.model) && has(f.frameworks, r.frameworkId) && (!f.status || f.status === "all" || r.status === f.status));
}

function slices(rows: UsageRow[], keyOf: (r: UsageRow) => string, labelOf: (r: UsageRow) => string, top = 12): UsageSliceDto[] {
  const m = new Map<string, UsageSliceDto>();
  for (const r of rows) {
    const k = keyOf(r);
    const s = m.get(k) ?? { key: k, label: labelOf(r), costUsd: 0, runs: 0, tokens: 0 };
    s.costUsd += cost(r); s.runs++; s.tokens += tok(r);
    m.set(k, s);
  }
  const all = [...m.values()].sort((a, b) => b.costUsd - a.costUsd || b.tokens - a.tokens || b.runs - a.runs);
  if (all.length <= top) return all;
  const rest = all.slice(top - 1).reduce((s, x) => ({ ...s, costUsd: s.costUsd + x.costUsd, runs: s.runs + x.runs, tokens: s.tokens + x.tokens }), { key: "_other", label: "Khác", costUsd: 0, runs: 0, tokens: 0 });
  return [...all.slice(0, top - 1), rest];
}

const BUCKETS: [string, number][] = [["< $0.05", 0.05], ["$0.05–0.20", 0.2], ["$0.20–0.50", 0.5], ["$0.50–1", 1], ["$1–3", 3], ["> $3", Infinity]];

/** `all` = mọi run trong [from - span, to] (đã lọc), phần trước `from` chỉ dùng để so sánh kỳ trước. */
export function computeUsage(all: UsageRow[], range: { from: Date; to: Date }, filter: UsageFilterDto, options: UsageReportDto["options"]): UsageReportDto {
  const rows = all.filter((r) => r.createdAt >= range.from && r.createdAt <= range.to);
  const prev = all.filter((r) => r.createdAt < range.from);
  const days = Math.max(1, (range.to.getTime() - range.from.getTime()) / 86_400_000);

  const tokens = rows.reduce((t, r) => ({ input: t.input + (r.inputTokens ?? 0), output: t.output + (r.outputTokens ?? 0), cacheRead: t.cacheRead + (r.cacheReadTokens ?? 0), cacheWrite: t.cacheWrite + (r.cacheWriteTokens ?? 0) }), { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  const costUsd = rows.reduce((s, r) => s + cost(r), 0);
  const withCost = rows.filter((r) => r.costUsd != null);
  const failed = rows.filter((r) => r.status === "failed");
  const dur = rows.filter((r) => r.durationMs != null);
  const prompt = tokens.input + tokens.cacheRead + tokens.cacheWrite;

  // Mỗi ngày trong khoảng đều có một dòng (kể cả 0) để biểu đồ liên tục.
  const byDayMap = new Map<string, UsageDayDto>();
  for (let t = new Date(range.from.getFullYear(), range.from.getMonth(), range.from.getDate()); t <= range.to; t = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1)) {
    byDayMap.set(dayKey(t), { date: dayKey(t), costUsd: 0, runs: 0, failed: 0, input: 0, output: 0, cache: 0, models: {} });
  }
  const heat = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const r of rows) {
    const d = byDayMap.get(dayKey(r.createdAt));
    if (d) { d.costUsd += cost(r); d.runs++; if (r.status === "failed") d.failed++; d.input += r.inputTokens ?? 0; d.output += r.outputTokens ?? 0; d.cache += (r.cacheReadTokens ?? 0) + (r.cacheWriteTokens ?? 0); const m = (d.models[r.model ?? "?"] ??= [0, 0, 0]); m[0] += cost(r); m[1] += tok(r); m[2]++; }
    heat[r.createdAt.getDay()]![r.createdAt.getHours()]!++;
  }

  const costBuckets = BUCKETS.map(([label]) => ({ label, runs: 0 }));
  for (const r of withCost) costBuckets[BUCKETS.findIndex(([, max]) => (r.costUsd ?? 0) < max)]!.runs++;

  const topRuns: UsageRunDto[] = [...rows].sort((a, b) => cost(b) - cost(a) || tok(b) - tok(a)).slice(0, 10).map((r) => ({
    runId: r.runId, mrId: r.mrId, iid: r.iid, title: r.title, repo: r.repoName, at: r.createdAt.toISOString(), provider: r.provider, model: r.model, status: r.status, costUsd: r.costUsd, tokens: tok(r), durationMs: r.durationMs, score: r.score,
  }));
  void filter;

  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    totals: {
      costUsd, runs: rows.length, runsWithCost: withCost.length, failedRuns: failed.length, failedCostUsd: failed.reduce((s, r) => s + cost(r), 0), tokens,
      avgCostUsd: withCost.length ? costUsd / withCost.length : null,
      avgDurationMs: dur.length ? dur.reduce((s, r) => s + (r.durationMs ?? 0), 0) / dur.length : null,
      cacheHitRate: prompt > 0 ? tokens.cacheRead / prompt : null,
      projectedMonthUsd: (costUsd / days) * 30,
      prevCostUsd: prev.reduce((s, r) => s + cost(r), 0), prevRuns: prev.length,
    },
    byDay: [...byDayMap.values()],
    byRepo: slices(rows, (r) => r.repositoryId, (r) => r.repoName),
    byModel: slices(rows, (r) => r.model ?? "?", (r) => r.model ?? "Không rõ"),
    byProvider: slices(rows, (r) => r.provider ?? "?", (r) => r.provider ?? "Không rõ"),
    byFramework: slices(rows, (r) => r.frameworkId ?? "?", (r) => r.frameworkId ?? "Không rõ"),
    heat, costBuckets, topRuns, options,
  };
}
