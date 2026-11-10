import { z } from "zod";

export const SEVERITIES = ["blocker", "critical", "major", "minor", "nit"] as const;
export const SeveritySchema = z.enum(SEVERITIES);
export type Severity = z.infer<typeof SeveritySchema>;

export const SEVERITY_RANK: Record<Severity, number> = { blocker: 5, critical: 4, major: 3, minor: 2, nit: 1 };

export const FindingKindSchema = z.enum(["issue", "question", "praise"]);
export type FindingKind = z.infer<typeof FindingKindSchema>;

/** AI đôi khi trả 0 hoặc số lẻ: không làm hỏng cả review, quy về null / số nguyên dương. */
const lineNumber = z
  .number()
  .nullish()
  .transform((n) => (n != null && n >= 1 ? Math.floor(n) : null))
  .optional();

/** Một phát hiện từ AI hoặc phân tích tĩnh. */
export const FindingSchema = z.object({
  category: z.string().min(1),
  ruleId: z.string().nullish(),
  severity: SeveritySchema,
  kind: FindingKindSchema.default("issue"),
  title: z.string().min(1),
  file: z.string().nullish(),
  lineStart: lineNumber,
  lineEnd: lineNumber,
  why: z.string().default(""),
  evidence: z.string().nullish(),
  suggestion: z.string().nullish(),
  question: z.string().nullish(),
  confidence: z.number().default(0.8).transform((n) => Math.min(1, Math.max(0, n))),
});
export type FindingInput = z.input<typeof FindingSchema>;
export type Finding = z.infer<typeof FindingSchema> & { source: "ai" | "static" };
