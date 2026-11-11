import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { buildContainer } from "./app/container.js";
import { buildServer } from "./app/http/server.js";
import { loadConfig, ROOT_DIR } from "./kernel/config.js";
import { run } from "./kernel/exec.js";
import { createLogger } from "./kernel/logger.js";

const config = loadConfig();
const log = createLogger("mrd", config.LOG_LEVEL);

/** Đẩy schema khi DB chưa có hoặc schema đổi (so hash lưu cạnh DB): nâng cấp app không cần thao tác tay. */
async function ensureDatabase() {
  await mkdir(config.dataDir, { recursive: true });
  const file = config.databaseUrl.replace(/^file:/, "");
  const schemaDir = path.join(ROOT_DIR, "apps/server/prisma/schema");
  const hash = createHash("sha256");
  for (const f of readdirSync(schemaDir).filter((n) => n.endsWith(".prisma")).sort()) hash.update(f).update(readFileSync(path.join(schemaDir, f)));
  const digest = hash.digest("hex");
  const stamp = path.join(config.dataDir, "schema.hash");
  const current = existsSync(stamp) ? readFileSync(stamp, "utf8").trim() : "";
  if (existsSync(file) && current === digest) return;
  log.info(existsSync(file) ? "cập nhật cấu trúc cơ sở dữ liệu" : "tạo cơ sở dữ liệu lần đầu", { file });
  await run("npx", ["--no-install", "prisma", "db", "push", "--skip-generate", "--schema", schemaDir], {
    cwd: path.join(ROOT_DIR, "apps/server"),
    env: { DATABASE_URL: config.databaseUrl },
    timeoutMs: 120_000,
  });
  writeFileSync(stamp, digest);
}

await ensureDatabase();
process.env.DATABASE_URL = config.databaseUrl;
const container = buildContainer(config, log);
const server = await buildServer(container, { webDist: config.webDist, log: log.child("http") });
await container.startWorkers();
await server.listen({ port: config.PORT, host: config.HOST });
log.info(`MR Dashboard chạy tại ${config.PUBLIC_URL}`, { queue: container.modules.queue.driver, provider: config.REVIEW_PROVIDER });
if (!container.modules.scm.isConfigured("gitlab") && !container.modules.scm.isConfigured("github")) log.warn("Chưa kết nối GitLab: mở Cài đặt → Kết nối để nhập URL và token");

let stopping = false;
const shutdown = async (sig: string) => {
  if (stopping) return;
  stopping = true;
  log.info(`nhận ${sig}, đang dừng…`);
  await server.close().catch(() => undefined);
  await container.stop().catch(() => undefined);
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
