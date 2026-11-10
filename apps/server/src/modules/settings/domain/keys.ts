import { z } from "zod";

/** Các khoá cấu hình runtime được phép chỉnh từ UI, kèm kiểu và mặc định. */
export const SETTING_SCHEMAS = {
  reviewProvider: z.enum(["claude-cli", "codex-cli", "openai-compatible"]),
  defaultFramework: z.string().min(1),
  publishComments: z.boolean(),
  inlineMinSeverity: z.enum(["blocker", "critical", "major", "minor", "nit"]),
  maxInlineComments: z.number().int().min(0).max(100),
  passScore: z.number().min(0).max(100),
} as const;

export type SettingKey = keyof typeof SETTING_SCHEMAS;
export type SettingsSnapshot = { [K in SettingKey]: z.infer<(typeof SETTING_SCHEMAS)[K]> };
export const isSettingKey = (k: string): k is SettingKey => k in SETTING_SCHEMAS;
