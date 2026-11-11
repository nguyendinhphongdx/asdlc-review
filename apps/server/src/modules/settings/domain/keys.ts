import { z } from "zod";

/** Các khoá cấu hình runtime được phép chỉnh từ UI, kèm kiểu và mặc định. */
export const SETTING_SCHEMAS = {
  reviewProvider: z.enum(["claude-cli", "codex-cli", "openai-compatible"]),
  defaultFramework: z.string().min(1),
  publishComments: z.boolean(),
  inlineMinSeverity: z.enum(["blocker", "critical", "major", "minor", "nit"]),
  maxInlineComments: z.number().int().min(0).max(100),
  passScore: z.number().min(0).max(100),
  skipDrafts: z.boolean(),
  diffBudgetChars: z.number().int().min(10_000).max(1_000_000),
  /** Cách nhận MR mới: quét định kỳ (mặc định, chạy được sau NAT), webhook, hoặc chỉ review thủ công. */
  triggerMode: z.enum(["polling", "webhook", "manual"]),
  pollIntervalMin: z.number().int().min(1).max(120),
} as const;

export type SettingKey = keyof typeof SETTING_SCHEMAS;
export type SettingsSnapshot = { [K in SettingKey]: z.infer<(typeof SETTING_SCHEMAS)[K]> };
export const isSettingKey = (k: string): k is SettingKey => k in SETTING_SCHEMAS;
