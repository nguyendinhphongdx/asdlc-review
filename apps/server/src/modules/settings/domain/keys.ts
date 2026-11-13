import path from "node:path";
import { z } from "zod";

/** Các khoá cấu hình runtime được phép chỉnh từ UI, kèm kiểu và mặc định. */
export const SETTING_SCHEMAS = {
  reviewProvider: z.enum(["claude-cli", "codex-cli", "gemini-api", "openai-compatible"]),
  defaultFramework: z.string().min(1),
  /** Model cho từng provider ("" = mặc định của provider/CLI). Repo có thể ghi đè bằng model riêng. */
  claudeModel: z.string().max(120),
  codexModel: z.string().max(120),
  geminiModel: z.string().max(120),
  openaiModel: z.string().max(120),
  /** Provider riêng cho chat ("" = dùng chung provider review). Khi đặt thì `chatModel` áp dụng cho provider này. */
  chatProvider: z.enum(["", "claude-cli", "codex-cli", "gemini-api", "openai-compatible"]),
  /** Model riêng cho chat với agent; chỉ dùng khi đã chọn `chatProvider` riêng ("" = mặc định của provider đó). */
  chatModel: z.string().max(120),
  passScore: z.number().min(0).max(100),
  skipDrafts: z.boolean(),
  diffBudgetChars: z.number().int().min(10_000).max(1_000_000),
  /** Trần chi phí (USD) mỗi lần review bằng Claude CLI; 0 = không giới hạn. */
  maxBudgetUsd: z.number().min(0).max(1000),
  /** Cách nhận MR mới: quét định kỳ (mặc định, chạy được sau NAT), webhook, hoặc chỉ review thủ công. */
  /** Thư mục lưu repo đã clone (repos/) và thư mục làm việc tạm (runs/). Rỗng = mặc định trong DATA_DIR. */
  workDir: z.string().max(500).refine((v) => v === "" || path.isAbsolute(v), "Phải là đường dẫn tuyệt đối"),
  triggerMode: z.enum(["polling", "webhook", "manual"]),
  pollIntervalMin: z.number().int().min(1).max(120),
} as const;

export type SettingKey = keyof typeof SETTING_SCHEMAS;
export type SettingsSnapshot = { [K in SettingKey]: z.infer<(typeof SETTING_SCHEMAS)[K]> };
export const isSettingKey = (k: string): k is SettingKey => k in SETTING_SCHEMAS;
