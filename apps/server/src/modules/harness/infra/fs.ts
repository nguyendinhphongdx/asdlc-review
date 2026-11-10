import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { run } from "../../../kernel/exec.js";

export const listTrackedFiles = async (dir: string) => (await run("git", ["ls-files"], { cwd: dir })).stdout.split("\n").filter(Boolean);
export const fileSize = async (dir: string, p: string) => (await stat(path.join(dir, p)).catch(() => null))?.size ?? 0;
export const readText = (dir: string, p: string) => readFile(path.join(dir, p), "utf8").catch(() => "");

/** Đọc file tại một commit/ref cụ thể (không cần checkout). null nếu không tồn tại. */
export async function readAtRef(dir: string, ref: string, p: string): Promise<string | null> {
  const r = await run("git", ["show", `${ref}:${p}`], { cwd: dir, allowFailure: true });
  return r.code === 0 && r.stdout.trim() ? r.stdout : null;
}
