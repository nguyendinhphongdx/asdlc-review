import { spawn } from "node:child_process";

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

/** Chạy tiến trình con không qua shell (tránh injection), có timeout. Chỉ dùng từ thư mục infra của module. */
export function run(cmd: string, args: string[], opts: ExecOptions = {}): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env }, stdio: ["pipe", "pipe", "pipe"] });
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
    child.stdout.on("data", (d) => (stdout += d));
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
