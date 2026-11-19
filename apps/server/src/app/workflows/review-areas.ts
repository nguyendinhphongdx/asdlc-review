import type { AreaPassDto, ChangeAreaDto, DesignMapDto, DesignReviewDto, Finding, Rubric } from "@mrd/contracts";
import type { Modules } from "../modules.js";

type ReviewReq = Parameters<Modules["reviewer"]["review"]>[0];
type Emit = (level: "info" | "tool" | "ai" | "warn" | "done", message: string) => void;

/** Chạy tối đa `limit` việc cùng lúc, giữ thứ tự kết quả. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]!, i); }
  }));
  return out;
}

export interface AreaFlowInput {
  m: Modules;
  emit: Emit;
  provider: string;
  model: string | undefined;
  workdir: string;
  maxBudgetUsd: number | undefined;
  repoId: string;
  baseSha: string;
  rubric: Rubric;
  mr: { title: string; description: string };
  areas: ChangeAreaDto[];
  /** Diff đầy đủ tách theo file. */
  byFile: Map<string, string>;
  diffBudget: number;
  /** Phần ReviewRequest dùng chung cho mọi lượt (mr, rubric, harness, notebook, notes, vòng trước…). */
  base: Omit<ReviewReq, "diff" | "omittedFiles" | "focus" | "synthesis" | "staticFindings" | "onActivity">;
  harnessText: string;
  staticFindings: Finding[];
  concurrency?: number;
}

export interface AreaFlowResult {
  findings: Finding[];
  passes: AreaPassDto[];
  maps: DesignMapDto[];
  design: DesignReviewDto | null;
  harnessUsed: string[];
  costUsd: number;
  tokens: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number } | null;
  /** File thực sự chưa được soi (quá lớn để nhét vừa một lượt). */
  omitted: string[];
}

const needsMap = (a: ChangeAreaDto) => a.files.some((f) => f.role === "logic") && (a.risk >= 0.2 || a.additions + a.deletions >= 80);
const areaDiff = (a: ChangeAreaDto, byFile: Map<string, string>, max: number) => {
  let out = "";
  for (const f of a.files) { const d = byFile.get(f.path); if (d && out.length + d.length <= max) out += d; }
  return out || "(diff quá lớn để nhúng; mở từng file bằng công cụ)";
};
const sumTokens = (a: AreaFlowResult["tokens"], b: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number } | undefined) =>
  !b ? a : { inputTokens: (a?.inputTokens ?? 0) + b.inputTokens, outputTokens: (a?.outputTokens ?? 0) + b.outputTokens, cacheReadTokens: (a?.cacheReadTokens ?? 0) + b.cacheReadTokens, cacheWriteTokens: (a?.cacheWriteTokens ?? 0) + b.cacheWriteTokens };

/**
 * MR lớn: T2 (thiết kế hiện tại, có cache) → T3 (đánh giá thiết kế) → T4 (review từng khu vực, song song).
 * Mỗi lượt lỗi riêng lẻ chỉ ghi cảnh báo và đi tiếp; chỉ khi mọi lượt T4 đều hỏng mới ném lỗi để cả review thất bại rõ ràng.
 */
export async function reviewByAreas(i: AreaFlowInput): Promise<AreaFlowResult> {
  const { m, emit } = i;
  const conc = i.concurrency ?? 3;
  const common = { provider: i.provider, model: i.model, workdir: i.workdir, maxBudgetUsd: i.maxBudgetUsd, language: i.rubric.language };
  let costUsd = 0;
  let tokens: AreaFlowResult["tokens"] = null;
  const addUsage = (u: { costUsd: number | null; tokens?: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number } | undefined }) => { costUsd += u.costUsd ?? 0; tokens = sumTokens(tokens, u.tokens); };

  // ── T2: thiết kế hiện tại của các khu vực đáng đọc (cache theo base + khu vực).
  const maps: DesignMapDto[] = [];
  const toMap = i.areas.filter(needsMap).slice(0, 6);
  if (toMap.length) emit("info", `T2 · Đọc thiết kế hiện tại của ${toMap.length}/${i.areas.length} khu vực (khu vực nhỏ, rủi ro thấp bỏ qua)`);
  await pool(toMap, conc, async (a) => {
    try {
      const hit = await m.reviews.getDesignMap(i.repoId, i.baseSha, a.id);
      if (hit) { maps.push({ area: a.label, text: hit, cached: true }); emit("info", `T2 · ${a.label}: dùng bản đã lưu (cùng base ${i.baseSha.slice(0, 8)})`); return; }
      const r = await m.reviewer.understand({ ...common, mr: i.mr, area: { label: a.label, files: a.files.map((f) => f.path) }, diff: areaDiff(a, i.byFile, 20_000), harnessText: i.harnessText, onActivity: (e) => emit(e.kind, `[${a.label}] ${e.message}`) });
      addUsage(r.usage);
      maps.push({ area: a.label, text: r.text, cached: false });
      await m.reviews.saveDesignMap(i.repoId, i.baseSha, a.id, r.text).catch(() => undefined);
      emit("info", `T2 · ${a.label}: đã mô tả thiết kế hiện tại (${r.text.length} ký tự)`);
    } catch (err) {
      emit("warn", `T2 · ${a.label}: bỏ qua (${String((err as Error)?.message ?? err).slice(0, 140)})`);
    }
  });
  maps.sort((x, y) => i.areas.findIndex((a) => a.label === x.area) - i.areas.findIndex((a) => a.label === y.area));

  // ── T3: đánh giá thiết kế toàn MR.
  let design: DesignReviewDto | null = null;
  try {
    emit("info", "T3 · Đánh giá thiết kế toàn MR (bản đồ khu vực + thiết kế hiện tại)");
    const r = await m.reviewer.assessDesign({ ...common, mr: i.mr, areas: i.areas, designMaps: maps.map((x) => ({ area: x.area, text: x.text })), digest: m.analysis.digest(i.areas, i.byFile), harnessText: i.harnessText, onActivity: (e) => emit(e.kind, `[thiết kế] ${e.message}`) });
    addUsage(r.usage);
    design = r.design;
    emit("info", `T3 · Thiết kế: ${design.verdict}${design.concerns.length ? `, ${design.concerns.length} mối quan tâm` : ""}${design.focus.length ? `, trọng tâm: ${design.focus.join(", ")}` : ""}`);
  } catch (err) {
    emit("warn", `T3 · Bỏ qua đánh giá thiết kế (${String((err as Error)?.message ?? err).slice(0, 140)})`);
  }

  // ── T4: review từng khu vực (mỗi phần diff một lượt), rủi ro cao trước.
  const jobs: { area: ChangeAreaDto; files: string[]; diff: string; index: number; total: number }[] = [];
  const omitted: string[] = [];
  const omittedBy = new Map<string, string[]>();
  for (const a of i.areas) {
    const packed = m.analysis.packDiff(a.files.map((f) => f.path), i.byFile, i.diffBudget);
    packed.chunks.forEach((c, idx) => jobs.push({ area: a, files: c.files, diff: c.diff, index: idx + 1, total: packed.chunks.length }));
    omittedBy.set(a.label, packed.omitted);
    omitted.push(...packed.omitted);
  }
  emit("info", `T4 · Review ${i.areas.length} khu vực thành ${jobs.length} lượt (tối đa ${conc} lượt song song)${omitted.length ? `; ${omitted.length} file quá lớn không nhét vừa một lượt` : ""}`);
  const mapOf = new Map(maps.map((x) => [x.area, x.text]));
  const findings: Finding[] = [];
  const harnessUsed = new Set<string>();
  const perArea = new Map<string, { files: number; findings: number; cost: number }>();
  let failed = 0;
  await pool(jobs, conc, async (job) => {
    const tag = `${job.area.label}${job.total > 1 ? ` ${job.index}/${job.total}` : ""}`;
    try {
      emit("info", `T4 · Bắt đầu ${tag} (${job.files.length} file)`);
      const concerns = design?.concerns.filter((c) => c.area === job.area.label).map((c) => c.text) ?? [];
      const focusNote = [design?.focus.includes(job.area.label) ? "design review flagged this area for a deep look" : "", ...concerns].filter(Boolean).join("; ");
      const r = await m.reviewer.review({
        ...i.base, staticFindings: i.staticFindings.filter((f) => !f.file || job.files.includes(f.file)),
        diff: job.diff, omittedFiles: omittedBy.get(job.area.label) ?? [],
        focus: { label: job.area.label, files: job.files, others: i.areas.filter((a) => a.id !== job.area.id).map((a) => ({ label: a.label, files: a.files.length })), ...(mapOf.get(job.area.label) ? { designMap: mapOf.get(job.area.label)! } : {}), ...(focusNote ? { designFocus: focusNote } : {}), chunk: { index: job.index, total: job.total } },
        onActivity: (e) => emit(e.kind, `[${tag}] ${e.message}`),
      });
      addUsage(r.usage);
      // Chỉ nhận finding thuộc file của lượt này (hoặc không gắn file); AI có thể lạc sang khu vực khác.
      const mine = r.review.findings.filter((f) => !f.file || job.files.includes(f.file)).map((f): Finding => ({ ...f, source: "ai" }));
      findings.push(...mine);
      for (const h of r.review.harnessUsed) harnessUsed.add(h);
      const s = perArea.get(job.area.label) ?? { files: 0, findings: 0, cost: 0 };
      perArea.set(job.area.label, { files: s.files + job.files.length, findings: s.findings + mine.length, cost: s.cost + (r.usage.costUsd ?? 0) });
      emit("info", `T4 · Xong ${tag}: ${mine.length} finding${r.usage.costUsd != null ? `, $${r.usage.costUsd.toFixed(2)}` : ""}`);
    } catch (err) {
      failed++;
      emit("warn", `T4 · ${tag} lỗi: ${String((err as Error)?.message ?? err).slice(0, 160)}`);
      omitted.push(...job.files);
    }
  });
  if (jobs.length && failed === jobs.length) throw new Error("Mọi lượt review theo khu vực đều lỗi (xem nhật ký ở trên).");

  const passes: AreaPassDto[] = i.areas.map((a) => { const s = perArea.get(a.label); return { area: a.label, files: s?.files ?? 0, findings: s?.findings ?? 0, costUsd: s ? Number(s.cost.toFixed(4)) : null, omitted: omittedBy.get(a.label) ?? [] }; });
  return { findings: dedupe(findings), passes, maps, design, harnessUsed: [...harnessUsed], costUsd, tokens, omitted: [...new Set(omitted)] };
}

const dedupe = (fs: Finding[]) => {
  const seen = new Set<string>();
  return fs.filter((f) => { const k = `${f.file}|${f.lineStart}|${f.title.toLowerCase()}`; if (seen.has(k)) return false; seen.add(k); return true; });
};

/** Mối quan tâm cấp thiết kế (major/minor) của T3 thành finding để tính vào điểm; `info` chỉ hiện ở báo cáo. Tối đa 5. */
export function designFindings(design: DesignReviewDto | null, rubric: Rubric): Finding[] {
  if (!design) return [];
  const cat = rubric.categories.find((c) => /design|architect|kiến trúc|thiết kế/i.test(`${c.id} ${c.name}`)) ?? rubric.categories[0];
  if (!cat) return [];
  return design.concerns.filter((c) => c.severity !== "info").slice(0, 5).map((c): Finding => ({
    category: cat.id, ruleId: null, severity: c.severity === "major" ? "major" : "minor", kind: "issue",
    title: `Thiết kế${c.area ? ` (${c.area})` : ""}: ${c.text.split(/(?<=[.!?。])\s/)[0]!.slice(0, 110)}`,
    file: null, why: c.text, confidence: 0.7, source: "ai",
  }));
}
