import { RawReviewSchema, SEVERITIES, type RawReview, type Rubric } from "@mrd/contracts";

const nullable = (t: string) => ({ type: [t, "null"] });

/** JSON schema ở dạng strict (mọi field required, nullable) để dùng được với cả Claude lẫn Codex. */
export const REVIEW_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "intent", "findings", "strengths", "harnessUsed", "checks"],
  properties: {
    summary: { type: "string" },
    intent: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    harnessUsed: { type: "array", items: { type: "string" } },
    checks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ruleId", "status", "note"],
        properties: { ruleId: { type: "string" }, status: { type: "string", enum: ["pass", "fail", "na"] }, note: { type: "string" } },
      },
    },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category", "ruleId", "severity", "kind", "title", "file", "lineStart", "lineEnd", "why", "evidence", "suggestion", "question", "confidence"],
        properties: {
          category: { type: "string" },
          ruleId: nullable("string"),
          severity: { type: "string", enum: [...SEVERITIES] },
          kind: { type: "string", enum: ["issue", "question", "praise"] },
          title: { type: "string" },
          file: nullable("string"),
          lineStart: nullable("integer"),
          lineEnd: nullable("integer"),
          why: { type: "string" },
          evidence: nullable("string"),
          suggestion: nullable("string"),
          question: nullable("string"),
          confidence: { type: "number" },
        },
      },
    },
  },
} as const;

/** Lấy JSON từ văn bản (bỏ rào ```), kiểm tra bằng zod. */
export function parseReviewText(text: string): RawReview {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Không tìm thấy JSON trong phản hồi của AI");
  return RawReviewSchema.parse(JSON.parse(t.slice(start, end + 1)));
}

/** Chuẩn hoá: ruleId không có trong rubric → bỏ; category suy từ rubric; kẹp confidence. */
export function normalizeReview(review: RawReview, rubric: Rubric): RawReview {
  const ruleCat = new Map<string, string>();
  for (const c of rubric.categories) for (const r of c.criteria) ruleCat.set(r.id, c.id);
  const cats = new Set(rubric.categories.map((c) => c.id));
  return {
    ...review,
    checks: review.checks.filter((c) => ruleCat.has(c.ruleId)),
    findings: review.findings.map((f) => {
      const ruleId = f.ruleId && ruleCat.has(f.ruleId) ? f.ruleId : null;
      const category = ruleId ? ruleCat.get(ruleId)! : cats.has(f.category) ? f.category : rubric.categories[0]?.id ?? f.category;
      return { ...f, ruleId, category, confidence: Math.min(1, Math.max(0, f.confidence)) };
    }),
  };
}
