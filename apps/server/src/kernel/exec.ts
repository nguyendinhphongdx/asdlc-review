import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface ExecOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  input?: string;
  timeoutMs?: number;
  /** Chuỗi cần che khi in lỗi (token…). */
  redact?: string[];
  allowFailure?: boolean;
  /** Gọi cho từng dòng stdout ngay khi có (dùng để stream tiến trình). */
  onStdoutLine?: (line: string) => void;
}

export class ExecError extends Error {
  constructor(message: string, public result: ExecResult, public timedOut = false) {
    super(message);
  }
}

export function redact(text: string, secrets: string[] = []): string {
  let out = text;
  for (const s of secrets) if (s) out = out.split(s).join("***");
  return out;
}

export interface WinFs { exists(p: string): boolean; read(p: string): string }

/**
 * Windows: CLI cài bằng npm (codex, claude…) là file shim `.cmd`, mà `spawn` không qua shell không chạy được (ENOENT/EINVAL).
 * Tìm lệnh theo PATH + PATHEXT; nếu là `.exe` thì chạy thẳng; nếu là shim npm thì đọc ra file JS thật và chạy bằng node (không cần shell).
 */
export function resolveWindowsCommand(cmd: string, pathEnv: string, fs: WinFs = { exists: existsSync, read: (p) => readFileSync(p, "utf8") }): { cmd: string; args: string[] } | null {
  const hasDir = /[\\/]/.test(cmd);
  const dirs = hasDir ? [""] : pathEnv.split(";").filter(Boolean);
  const exts = path.extname(cmd) ? [""] : [".exe", ".com", ".cmd", ".bat"];
  for (const d of dirs) for (const e of exts) {
    const file = d ? path.win32.join(d, cmd + e) : cmd + e;
    if (!fs.exists(file)) continue;
    if (/\.(exe|com)$/i.test(file)) return { cmd: file, args: [] };
    if (/\.(cmd|bat)$/i.test(file)) {
      const m = /"?%(?:~dp0|dp0%)\\?([^"\r\n]+?\.(?:c|m)?js)"?/i.exec(fs.read(file));
      if (!m) return null;
      const js = path.win32.join(path.win32.dirname(file), m[1]!.replace(/^[\\/]+/, ""));
      if (fs.exists(js)) return { cmd: process.execPath, args: [js] };
    }
  }
  return null;
}

/** Chạy tiến trình con không qua shell (tránh injection), có timeout. Chỉ dùng từ thư mục infra của module. */
export function run(cmd: string, args: string[], opts: ExecOptions = {}): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, ...opts.env };
    let exe = cmd;
    let argv = args;
    if (process.platform === "win32") {
      const pathKey = Object.keys(env).find((k) => k.toLowerCase() === "path") ?? "PATH";
      const r = resolveWindowsCommand(cmd, env[pathKey] ?? "");
      if (r) { exe = r.cmd; argv = [...r.args, ...args]; if (r.args.length) env.ELECTRON_RUN_AS_NODE = "1"; }
    }
    const child = spawn(exe, argv, { cwd: opts.cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGTERM");
          setTimeout(() => child.kill("SIGKILL"), 5000).unref();
        }, opts.timeoutMs)
      : undefined;
    let lineBuf = "";
    child.stdout.on("data", (d) => {
      stdout += d;
      if (!opts.onStdoutLine) return;
      lineBuf += d;
      let i: number;
      while ((i = lineBuf.indexOf("\n")) >= 0) {
        const line = lineBuf.slice(0, i).trim();
        lineBuf = lineBuf.slice(i + 1);
        if (line) try { opts.onStdoutLine(line); } catch { /* lỗi của callback không được làm hỏng tiến trình */ }
      }
    });
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(new Error(`Không chạy được "${cmd}": ${err.message}`));
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      const result = { code: code ?? -1, stdout, stderr };
      if (timedOut) return reject(new ExecError(`${cmd} quá thời gian ${opts.timeoutMs}ms`, result, true));
      if (result.code !== 0 && !opts.allowFailure) {
        const shown = redact(`${cmd} ${args.join(" ")}`, opts.redact);
        return reject(new ExecError(`${shown} → exit ${result.code}: ${redact(stderr || stdout, opts.redact).slice(0, 2000)}`, result));
      }
      resolve(result);
    });
    child.stdin.on("error", () => undefined);
    child.stdin.end(opts.input ?? "");
  });
}
