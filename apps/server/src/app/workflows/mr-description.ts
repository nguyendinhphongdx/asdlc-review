import type { Finding, MrDescriptionDto, MrDescriptionSpec, Severity } from "@mrd/contracts";

/** Kiểm tra mô tả MR theo chuẩn tài liệu của framework (không dùng AI): mỗi loại tài liệu khớp một biểu thức chính quy. */
export function checkMrDescription(mr: { title: string; description: string }, spec: MrDescriptionSpec | undefined): MrDescriptionDto {
  const body = mr.description ?? "";
  const docs = (spec?.docs ?? []).map((d) => {
    let match: string | null = null;
    try {
      const m = new RegExp(d.pattern, "i").exec(body);
      match = m ? (m[0].length > 120 ? `${m[0].slice(0, 117)}…` : m[0]) : null;
    } catch {
      // Biểu thức lỗi (người dùng gõ sai) coi như không khớp, không làm hỏng cả review.
    }
    return { kind: d.kind, required: d.required, found: match !== null, match, hint: d.hint };
  });
  return { title: mr.title, body, docs, missingRequired: docs.filter((d) => d.required && !d.found).length };
}

/** Điểm trừ → mức độ của finding tĩnh: ≥8 major, ≥3 minor, còn lại nit (để dùng lại cơ chế chấm điểm sẵn có). */
export const penaltySeverity = (penalty: number): Severity => (penalty >= 8 ? "major" : penalty >= 3 ? "minor" : "nit");

export function descriptionFindings(res: MrDescriptionDto, spec: MrDescriptionSpec | undefined, category: string): Finding[] {
  const penalty = spec?.penalty ?? 0;
  if (penalty <= 0) return [];
  return res.docs.filter((d) => d.required && !d.found).map((d): Finding => ({
    category, ruleId: null, severity: penaltySeverity(penalty), kind: "issue", title: `Mô tả MR thiếu tài liệu bắt buộc: ${d.kind}`,
    file: null, lineStart: null, lineEnd: null, why: d.hint || `Chuẩn mô tả MR của framework yêu cầu đính kèm ${d.kind}.`,
    evidence: null, suggestion: d.hint || null, question: null, confidence: 1, source: "static",
  }));
}
