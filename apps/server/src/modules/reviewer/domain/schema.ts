import { z } from "zod";
import { RawReviewSchema, SEVERITIES, type RawReview, type Rubric } from "@mrd/contracts";

const nullable = (t: string) => ({ type: [t, "null"] });

const NODE = { type: "object", additionalProperties: false, required: ["id", "label", "sub", "group", "status", "evidence", "note"], properties: { id: { type: "string" }, label: { type: "string" }, sub: nullable("string"), group: nullable("string"), status: { type: "string", enum: ["added", "changed", "removed", "unchanged"] }, evidence: { type: "array", items: { type: "string" } }, note: nullable("string") } } as const;
const EDGE = { type: "object", additionalProperties: false, required: ["from", "to", "label", "status", "violation", "evidence"], properties: { from: { type: "string" }, to: { type: "string" }, label: nullable("string"), status: { type: "string", enum: ["added", "changed", "removed", "unchanged"] }, violation: { type: "boolean" }, evidence: { type: "array", items: { type: "string" } } } } as const;
const MESSAGE = { type: "object", additionalProperties: false, required: ["from", "to", "text", "reply", "evidence"], properties: { from: { type: "string" }, to: { type: "string" }, text: { type: "string" }, reply: { type: "boolean" }, evidence: { type: "array", items: { type: "string" } } } } as const;

/** JSON schema ở dạng strict (mọi field required, nullable) để dùng được với cả Claude lẫn Codex. */
export const REVIEW_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "intent", "findings", "strengths", "harnessUsed", "checks", "overview", "blocks", "mrKind", "mrKindReason"],
  properties: {
    summary: { type: "string" },
    mrKind: nullable("string"),
    mrKindReason: nullable("string"),
    intent: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    harnessUsed: { type: "array", items: { type: "string" } },
    overview: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "text", "bullets", "verdict"],
        properties: { id: { type: "string" }, text: { type: "string" }, bullets: { type: "array", items: { type: "string" } }, verdict: nullable("string") },
      },
    },
    blocks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "title", "nodes", "edges", "beforeNodes", "beforeEdges", "actors", "messages"],
        properties: { kind: { type: "string", enum: ["flow", "architecture", "sequence"] }, title: { type: "string" }, nodes: { type: "array", items: NODE }, edges: { type: "array", items: EDGE }, beforeNodes: { type: "array", items: NODE }, beforeEdges: { type: "array", items: EDGE }, actors: { type: "array", items: { type: "string" } }, messages: { type: "array", items: MESSAGE } },
      },
    },
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
  const wanted = new Set((rubric.overview?.sections ?? []).filter((s) => s.enabled).map((s) => s.id));
  return {
    ...review,
    overview: review.overview.filter((o) => wanted.has(o.id)),
    checks: review.checks.filter((c) => ruleCat.has(c.ruleId)),
    findings: review.findings.map((f) => {
      const ruleId = f.ruleId && ruleCat.has(f.ruleId) ? f.ruleId : null;
      const category = ruleId ? ruleCat.get(ruleId)! : cats.has(f.category) ? f.category : rubric.categories[0]?.id ?? f.category;
      return { ...f, ruleId, category, confidence: Math.min(1, Math.max(0, f.confidence)) };
    }),
  };
}

/** T2: mô tả thiết kế hiện tại của một khu vực. */
export const UNDERSTAND_JSON_SCHEMA = { type: "object", additionalProperties: false, required: ["text"], properties: { text: { type: "string" } } } as const;
/** T3: đánh giá thiết kế của MR. */
export const DESIGN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "summary", "concerns", "focus", "splitSuggestion"],
  properties: {
    verdict: { type: "string", enum: ["accept", "conditional", "rework"] },
    summary: { type: "string" },
    concerns: { type: "array", items: { type: "object", additionalProperties: false, required: ["area", "severity", "text"], properties: { area: nullable("string"), severity: { type: "string", enum: ["info", "minor", "major"] }, text: { type: "string" } } } },
    focus: { type: "array", items: { type: "string" } },
    splitSuggestion: { type: "string" },
  },
} as const;

const objectFromText = (text: string): unknown => {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Không tìm thấy JSON trong phản hồi của AI");
  return JSON.parse(t.slice(start, end + 1));
};
export const UnderstandSchema = z.object({ text: z.string().min(1) });
export const DesignSchema = z.object({
  verdict: z.enum(["accept", "conditional", "rework"]).catch("conditional"),
  summary: z.string().default(""),
  concerns: z.array(z.object({ area: z.string().nullish().transform((a) => a ?? null), severity: z.enum(["info", "minor", "major"]).catch("minor"), text: z.string() })).default([]),
  focus: z.array(z.string()).default([]),
  splitSuggestion: z.string().default(""),
});
export const parseUnderstandText = (t: string) => UnderstandSchema.parse(objectFromText(t));
export const parseDesignText = (t: string) => DesignSchema.parse(objectFromText(t));
