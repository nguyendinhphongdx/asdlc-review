import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { loadConfig } from "../src/kernel/config.js";

const cfg = loadConfig();
mkdirSync(cfg.dataDir, { recursive: true });
const cmd = process.argv[2] ?? "push";
const args = cmd === "generate" ? ["prisma", "generate", "--schema", "prisma/schema"] : ["prisma", "db", "push", "--skip-generate", "--schema", "prisma/schema"];
const r = spawnSync("npx", ["--no-install", ...args], { stdio: "inherit", env: { ...process.env, DATABASE_URL: cfg.databaseUrl } });
process.exit(r.status ?? 1);
