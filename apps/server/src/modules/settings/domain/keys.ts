import path from "node:path";
import { z } from "zod";

/** Các khoá cấu hình runtime được phép chỉnh từ UI, kèm kiểu và mặc định. */
export const SETTING_SCHEMAS = {
  /** Id provider (module reviewer là nơi biết provider nào tồn tại; ở đây chỉ lưu chuỗi). */
  reviewProvider: z.string().min(1).max(60),
  defaultFramework: z.string().min(1),
  /** Model theo provider ("" hoặc thiếu = mặc định của provider/CLI). Repo có thể ghi đè bằng model riêng. Thêm provider không cần thêm khoá. */
  providerModels: z.record(z.string().max(60), z.string().max(120)),
  /** Vai trò dùng AI khác ngoài review (hiện có `chat`). provider "" = dùng chung provider review; model "" = mặc định của provider đó. */
  aiRoles: z.record(z.string().max(40), z.object({ provider: z.string().max(60), model: z.string().max(120) })),
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

/** Khoá dạng bản đồ: cập nhật gộp từng mục thay vì ghi đè cả bản đồ (client chỉ gửi phần đổi). */
export const MERGE_KEYS: SettingKey[] = ["providerModels", "aiRoles"];

/** Chuyển cài đặt kiểu cũ (mỗi provider một khoá) sang `providerModels`/`aiRoles` khi đọc từ DB. */
export function migrateLegacy(stored: Record<string, unknown>): Record<string, unknown> {
  const out = { ...stored };
  const legacyModels: Record<string, string> = { claudeModel: "claude-cli", codexModel: "codex-cli", geminiModel: "gemini-api", openaiModel: "openai-compatible" };
  const models = { ...((out.providerModels as Record<string, string> | undefined) ?? {}) };
  for (const [k, id] of Object.entries(legacyModels)) {
    if (typeof out[k] === "string" && out[k] && models[id] === undefined) models[id] = out[k] as string;
    delete out[k];
  }
  if (Object.keys(models).length) out.providerModels = models;
  if (typeof out.chatProvider === "string" || typeof out.chatModel === "string") {
    const roles = { ...((out.aiRoles as Record<string, unknown> | undefined) ?? {}) };
    if (roles.chat === undefined) roles.chat = { provider: String(out.chatProvider ?? ""), model: String(out.chatModel ?? "") };
    out.aiRoles = roles;
    delete out.chatProvider;
    delete out.chatModel;
  }
  return out;
}

export type SettingKey = keyof typeof SETTING_SCHEMAS;
export type SettingsSnapshot = { [K in SettingKey]: z.infer<(typeof SETTING_SCHEMAS)[K]> };
export const isSettingKey = (k: string): k is SettingKey => k in SETTING_SCHEMAS;
