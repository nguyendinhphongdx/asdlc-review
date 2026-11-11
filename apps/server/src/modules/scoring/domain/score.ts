import { SEVERITY_RANK, type Finding, type Rubric, type ScoreResult, type Severity, type Verdict } from "@mrd/contracts";

export interface ScoreInput {
  rubric: Rubric;
  findings: Finding[];
  /** Số dòng thay đổi có ý nghĩa (đã loại file sinh tự động/lockfile). */
  changedLines: number;
}

const MIN_COUNT_CONFIDENCE = 0.4;
const MIN_GATE_CONFIDENCE = 0.5;
const round1 = (n: number) => Math.round(n * 10) / 10;
const HEAVY: Severity[] = ["blocker", "critical", "major"];

export function sizeFactor(severity: Severity, changedLines: number, baseline: number): number {
  if (HEAVY.includes(severity)) return 1;
  return 1 / Math.max(1, Math.sqrt(changedLines / Math.max(1, baseline)));
}

const dedupKey = (f: Finding) => [f.category, f.ruleId ?? "", f.file ?? "", f.lineStart ?? "", f.title.toLowerCase()].join("|");

/** Chấm điểm tất định. Cùng đầu vào → cùng điểm (xem docs/SCORING.md). */
export function scoreFindings({ rubric, findings, changedLines }: ScoreInput): ScoreResult {
  const ruleCategory = new Map<string, string>();
  for (const c of rubric.categories) for (const r of c.criteria) ruleCategory.set(r.id, c.id);
  const knownCategories = new Set(rubric.categories.map((c) => c.id));

  const seen = new Set<string>();
  const deductions = findings.map((f) => {
    if (f.kind !== "issue" || f.confidence < MIN_COUNT_CONFIDENCE) return 0;
    const key = dedupKey(f);
    if (seen.has(key)) return 0;
    seen.add(key);
    const base = rubric.severity[f.severity]?.deduction ?? 0;
    return round1(base * f.confidence * sizeFactor(f.severity, changedLines, rubric.sizeBaseline));
  });

  const perCategory = new Map<string, { deduction: number; findings: number }>();
  findings.forEach((f, i) => {
    const cat = (f.ruleId && ruleCategory.get(f.ruleId)) || (knownCategories.has(f.category) ? f.category : null);
    if (!cat || f.kind !== "issue") return;
    const cur = perCategory.get(cat) ?? { deduction: 0, findings: 0 };
    cur.deduction += deductions[i]!;
    if (deductions[i]! > 0) cur.findings += 1;
    perCategory.set(cat, cur);
  });

  const categories = rubric.categories.map((c) => {
    const agg = perCategory.get(c.id) ?? { deduction: 0, findings: 0 };
    return {
      category: c.id,
      name: c.name,
      weight: c.weight,
      score: round1(Math.max(0, 100 - agg.deduction)),
      deduction: round1(agg.deduction),
      findings: agg.findings,
    };
  });

  const totalWeight = categories.reduce((s, c) => s + c.weight, 0);
  const rawTotal = totalWeight > 0 ? categories.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight : 100;

  const gating = findings.filter((f) => f.kind === "issue" && f.confidence >= MIN_GATE_CONFIDENCE);
  const gates: ScoreResult["gates"] = [];
  for (const g of rubric.gates) {
    const min = g.when.minSeverity ? SEVERITY_RANK[g.when.minSeverity] : 0;
    const matched = gating.filter((f) => {
      const cat = (f.ruleId && ruleCategory.get(f.ruleId)) || f.category;
      if (g.when.ruleIds && !(f.ruleId && g.when.ruleIds.includes(f.ruleId))) return false;
      if (g.when.category && cat !== g.when.category) return false;
      if (min && SEVERITY_RANK[f.severity] < min) return false;
      return Boolean(g.when.ruleIds || g.when.category || min);
    });
    if (new Set(matched.map(dedupKey)).size >= (g.when.minCount ?? 1)) gates.push({ id: g.id, reason: g.reason, cap: g.capTotal });
  }

  const total = round1(Math.min(rawTotal, ...gates.map((g) => g.cap)));
  const grade = rubric.grades.find((g) => total >= g.min)?.grade ?? "F";

  const hasHeavy = gating.some((f) => SEVERITY_RANK[f.severity] >= SEVERITY_RANK.major);
  const hasAny = findings.some((f) => f.kind !== "praise" && f.confidence >= MIN_COUNT_CONFIDENCE);
  const verdict: Verdict = gates.length > 0 || hasHeavy ? "request_changes" : hasAny ? "comment" : "approve";

  return { total, rawTotal: round1(rawTotal), grade, verdict, gates, categories, deductions };
}
