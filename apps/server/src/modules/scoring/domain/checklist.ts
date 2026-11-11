import type { Finding, RuleCheck, RuleCheckDto, Rubric } from "@mrd/contracts";

const MIN_COUNT_CONFIDENCE = 0.4;

/**
 * Checklist đầy đủ theo rubric: mỗi rule một dòng. `fail` luôn suy từ finding thật (AI không thể tự khai "pass"
 * cho rule đã có finding); rule AI không nhắc tới là `unchecked` (không giả định là đạt).
 */
export function buildChecklist(rubric: Rubric, aiChecks: RuleCheck[], findings: Finding[]): RuleCheckDto[] {
  const claimed = new Map(aiChecks.map((c) => [c.ruleId, c] as const));
  const byRule = new Map<string, Finding[]>();
  for (const f of findings) {
    if (f.kind !== "issue" || f.confidence < MIN_COUNT_CONFIDENCE || !f.ruleId) continue;
    byRule.set(f.ruleId, [...(byRule.get(f.ruleId) ?? []), f]);
  }
  const out: RuleCheckDto[] = [];
  for (const c of rubric.categories) {
    for (const r of c.criteria) {
      const hits = byRule.get(r.id);
      const ai = claimed.get(r.id);
      const base = { ruleId: r.id, category: c.id, categoryName: c.name, title: r.title, severity: r.defaultSeverity };
      if (hits?.length) out.push({ ...base, status: "fail", note: hits.length === 1 ? hits[0]!.title : `${hits.length} finding: ${hits[0]!.title}` });
      else if (ai) out.push({ ...base, status: ai.status === "fail" ? "pass" : ai.status, note: ai.note });
      else out.push({ ...base, status: "unchecked", note: "AI không báo cáo rule này" });
    }
  }
  return out;
}
