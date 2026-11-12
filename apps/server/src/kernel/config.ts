import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(here, "../../../..");

const bool = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v === "" ? undefined : ["1", "true", "yes", "on"].includes(v.toLowerCase())));

const EnvSchema = z.object({
  PORT: z.coerce.number().default(4319),
  HOST: z.string().default("127.0.0.1"),
  PUBLIC_URL: z.string().optional(),
  DATA_DIR: z.string().default("./data"),
  DATABASE_URL: z.string().optional(),
  /** "memory" = hàng đợi trong process (dev/test); còn lại là URL Redis cho BullMQ. */
  /** "memory" = hàng đợi trong process (mặc định, không cần cài gì). Đặt redis://… nếu muốn hàng đợi bền qua khởi động lại / chạy nhiều server. */
  REDIS_URL: z.string().default("memory"),
  REVIEW_CONCURRENCY: z.coerce.number().int().min(1).default(2),
  FRAMEWORKS_DIR: z.string().default("./frameworks"),
  WEB_DIST: z.string().default("./apps/web/dist"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  /** Khoá mã hoá secret trong DB. Bỏ trống: app tự tạo file `secret.key` trong DATA_DIR (quyền 0600). */
  MRD_SECRET_KEY: z.string().default(""),
  GITLAB_URL: z.string().default("https://gitlab.com"),
  GITLAB_TOKEN: z.string().default(""),
  GITLAB_WEBHOOK_SECRET: z.string().default(""),
  GITHUB_TOKEN: z.string().default(""),
  GITHUB_WEBHOOK_SECRET: z.string().default(""),
  BOT_MENTION: z.string().default("@mr-reviewer"),

  REVIEW_PROVIDER: z.enum(["claude-cli", "codex-cli", "openai-compatible"]).default("claude-cli"),
  CLAUDE_BIN: z.string().default("claude"),
  CLAUDE_MODEL: z.string().default("claude-opus-5-5"),
  /** Trần chi phí (USD) mỗi lần review bằng Claude CLI; 0 = không giới hạn. Đổi được ở Cài đặt → Giới hạn khi review. */
  CLAUDE_MAX_BUDGET_USD: z.coerce.number().min(0).default(0),
  CODEX_BIN: z.string().default("codex"),
  CODEX_MODEL: z.string().default(""),
  OPENAI_BASE_URL: z.string().default("https://api.openai.com/v1"),
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_MODEL: z.string().default(""),
  REVIEW_TIMEOUT_MIN: z.coerce.number().default(20),
  /** Trần an toàn tổng cho harness nạp vào review (ký tự). Mặc định đủ lớn để nạp đầy đủ; vượt thì file ưu tiên thấp bị liệt kê là "chưa nạp". */
  CONTEXT_BUDGET_CHARS: z.coerce.number().default(1_500_000),
  DIFF_BUDGET_CHARS: z.coerce.number().default(120_000),
  INLINE_MIN_SEVERITY: z.enum(["blocker", "critical", "major", "minor", "nit"]).default("major"),
  MAX_INLINE_COMMENTS: z.coerce.number().default(15),
  POLL_INTERVAL_MIN: z.coerce.number().default(0),
  KEEP_WORKTREES: bool,
});

const abs = (p: string) => (path.isAbsolute(p) ? p : path.resolve(ROOT_DIR, p));

/** Chỉ `main.ts`, `app/` và scripts được import file này (M12). */
export function loadConfig(source: NodeJS.ProcessEnv = process.env) {
  const env = EnvSchema.parse(source);
  const dataDir = abs(env.DATA_DIR);
  const databaseUrl = env.DATABASE_URL ?? `file:${path.join(dataDir, "mrd.db")}`;
  return {
    ...env,
    PUBLIC_URL: env.PUBLIC_URL ?? `http://localhost:${env.PORT}`,
    KEEP_WORKTREES: env.KEEP_WORKTREES ?? false,
    databaseUrl,
    dataDir,
    reposDir: path.join(dataDir, "repos"),
    runsDir: path.join(dataDir, "runs"),
    frameworksDir: abs(env.FRAMEWORKS_DIR),
    webDist: abs(env.WEB_DIST),
  };
}
export type Config = ReturnType<typeof loadConfig>;
