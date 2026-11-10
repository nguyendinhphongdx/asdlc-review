import { run } from "../../../kernel/exec.js";

/** Kiểm tra CLI có chạy được không (`<bin> --version`). */
export async function binAvailable(bin: string): Promise<boolean> {
  const r = await run(bin, ["--version"], { allowFailure: true, timeoutMs: 10_000 }).catch(() => ({ code: 1 }));
  return r.code === 0;
}
