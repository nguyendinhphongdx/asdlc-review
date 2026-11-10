import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { buildContainer } from "./app/container.js";
import { buildServer } from "./app/http/server.js";
import { loadConfig, ROOT_DIR } from "./kernel/config.js";
import { run } from "./kernel/exec.js";
import { createLogger } from "./kernel/logger.js";

const config = loadConfig();
const log = createLogger("mrd", config.LOG_LEVEL);

async function ensureDatabase() {
  await mkdir(config.dataDir, { recursive: true });
  const file = config.databaseUrl.replace(/^file:/, "");
  if (existsSync(file)) return;
  log.info("tạo cơ sở dữ liệu lần đầu", { file });
  await run("npx", ["--no-install", "prisma", "db", "push", "--skip-generate", "--schema", path.join(ROOT_DIR, "apps/server/prisma/schema")], {
    cwd: path.join(ROOT_DIR, "apps/server"),
    env: { DATABASE_URL: config.databaseUrl },
    timeoutMs: 120_000,
  });
}

await ensureDatabase();
process.env.DATABASE_URL = config.databaseUrl;
const container = buildContainer(config, log);
const server = await buildServer(container, { webDist: config.webDist, log: log.child("http") });
await container.startWorkers();
await server.listen({ port: config.PORT, host: config.HOST });
log.info(`MR Dashboard chạy tại ${config.PUBLIC_URL}`, { queue: container.modules.queue.driver, provider: config.REVIEW_PROVIDER });
if (!config.GITLAB_TOKEN && !config.GITHUB_TOKEN) log.warn("Chưa cấu hình GITLAB_TOKEN/GITHUB_TOKEN: chưa thể lấy MR để review");

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
