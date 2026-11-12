/** Lỗi có mã, là cách duy nhất module báo lỗi ra ngoài (R13). */
export type ErrorCode =
  | "not_found"
  | "invalid_input"
  | "conflict"
  | "unauthorized"
  | "not_configured"
  | "upstream_error"
  | "timeout"
  | "quota_exceeded"
  | "internal";

export class ModuleError extends Error {
  constructor(
    public readonly module: string,
    public readonly code: ErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(`[${module}] ${message}`);
    this.name = "ModuleError";
  }
}

export const httpStatusOf = (code: ErrorCode): number =>
  ({ not_found: 404, invalid_input: 400, conflict: 409, unauthorized: 401, not_configured: 412, upstream_error: 502, timeout: 504, quota_exceeded: 402, internal: 500 })[code];
