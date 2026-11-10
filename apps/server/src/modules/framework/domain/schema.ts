import { z } from "zod";
import { SeveritySchema } from "@mrd/contracts";

const CriterionSchema = z.object({
  id: z.string(),
  title: z.string(),
  check: z.string(),
  why: z.string().default(""),
  defaultSeverity: SeveritySchema.default("minor"),
});

export const FrameworkFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  language: z.string().default("vi"),
  severity: z.record(SeveritySchema, z.object({ deduction: z.number(), label: z.string(), description: z.string() })),
  gates: z
    .array(
      z.object({
        id: z.string(),
        when: z.object({
          ruleIds: z.array(z.string()).optional(),
          category: z.string().optional(),
          minSeverity: SeveritySchema.optional(),
        }),
        capTotal: z.number(),
        reason: z.string(),
      }),
    )
    .default([]),
  grades: z.array(z.object({ grade: z.enum(["A", "B", "C", "D", "F"]), min: z.number() })),
  sizeBaseline: z.number().default(200),
  categories: z.array(
    z.object({ id: z.string(), name: z.string(), weight: z.number().min(0), criteria: z.array(CriterionSchema).default([]) }),
  ),
});
export type FrameworkFile = z.infer<typeof FrameworkFileSchema>;

/** Cấu hình riêng của repo (`.asdlc.yml`). */
export const RepoConfigSchema = z.object({
  framework: z.string().optional(),
  language: z.string().optional(),
  weights: z.record(z.string(), z.number().min(0)).optional(),
  disable: z.array(z.string()).optional(),
  extraRules: z
    .array(
      z.object({
        id: z.string(),
        category: z.string(),
        title: z.string(),
        check: z.string(),
        why: z.string().default(""),
        defaultSeverity: SeveritySchema.default("minor"),
      }),
    )
    .optional(),
  ignore: z.array(z.string()).optional(),
  docs: z.array(z.string()).optional(),
  notes: z.string().optional(),
});
export type RepoConfig = z.infer<typeof RepoConfigSchema>;
