import { existsSync } from "node:fs";
import { mkdir, rm, unlink } from "node:fs/promises";
import path from "node:path";
import { run } from "../../../kernel/exec.js";

export interface GitCtx {
  auth?: string;
  secrets: string[];
}

export function gitRunner(ctx: GitCtx) {
  return (args: string[], cwd?: string, allowFailure = false) =>
    run("git", [...(ctx.auth ? ["-c", `http.extraHeader=${ctx.auth}`] : []), ...args], {
      cwd,
      redact: ctx.secrets,
      timeoutMs: 15 * 60_000,
      env: { GIT_TERMINAL_PROMPT: "0" },
      allowFailure,
    });
}

// Khoá theo repo: fetch vào cùng một bare repo không được chạy song song.
const locks = new Map<string, Promise<unknown>>();
export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  locks.set(key, next);
  try {
    return await next;
  } finally {
    if (locks.get(key) === next) locks.delete(key);
  }
}

export async function ensureBare(git: ReturnType<typeof gitRunner>, bareDir: string, cloneUrl: string, refspecs: string[]) {
  await withLock(bareDir, async () => {
    await mkdir(path.dirname(bareDir), { recursive: true });
    if (!existsSync(bareDir)) await git(["clone", "--bare", "--quiet", cloneUrl, bareDir]);
    await git(["fetch", "--quiet", "--force", "origin", ...refspecs], bareDir);
  });
}

export async function resolveBase(bareDir: string, baseSha: string | null | undefined, targetRef: string, headSha: string) {
  if (baseSha && (await run("git", ["cat-file", "-e", `${baseSha}^{commit}`], { cwd: bareDir, allowFailure: true })).code === 0) return baseSha;
  return (await run("git", ["merge-base", targetRef, headSha], { cwd: bareDir })).stdout.trim();
}

export async function addWorktree(bareDir: string, wtDir: string, sha: string) {
  if (existsSync(wtDir)) await rm(wtDir, { recursive: true, force: true });
  await run("git", ["worktree", "prune"], { cwd: bareDir, allowFailure: true });
  await run("git", ["worktree", "add", "--detach", "--force", wtDir, sha], { cwd: bareDir });
}

export async function removeWorktree(bareDir: string, wtDir: string) {
  await run("git", ["worktree", "remove", "--force", wtDir], { cwd: bareDir, allowFailure: true });
  await rm(wtDir, { recursive: true, force: true });
}

/**
 * Code trong MR là dữ liệu không tin cậy. Agent CLI sẽ chạy trong worktree, nên gỡ các file cấu hình
 * có thể thực thi lệnh hoặc kết nối ra ngoài (hooks, MCP). Harness dạng tài liệu được giữ nguyên.
 */
export async function sanitizeWorktree(dir: string) {
  for (const f of [".claude/settings.json", ".claude/settings.local.json", ".mcp.json", ".codex/config.toml"]) {
    await unlink(path.join(dir, f)).catch(() => undefined);
  }
}

export async function diffAgainstBase(wtDir: string, baseSha: string, headSha: string) {
  const range = `${baseSha}...${headSha}`;
  const [diff, numstat] = await Promise.all([
    run("git", ["diff", "--no-color", "--no-ext-diff", "-M", "--unified=3", range], { cwd: wtDir }),
    run("git", ["diff", "--numstat", "-M", range], { cwd: wtDir }),
  ]);
  return { diff: diff.stdout, numstat: numstat.stdout };
}
