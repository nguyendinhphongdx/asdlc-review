import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { httpStatusOf, ModuleError } from "./errors.js";
import type { Logger } from "./logger.js";

/** Khoảng thời gian từ query: `from`/`to` (ISO hoặc YYYY-MM-DD) hoặc `days` (mặc định 30 ngày gần nhất). */
export function parseRange(q: { from?: string; to?: string; days?: string }, now = new Date()): { from: Date; to: Date } {
  const dateOnly = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const to = q.to ? new Date(dateOnly(q.to) ? `${q.to}T23:59:59.999Z` : q.to) : now;
  const from = q.from ? new Date(q.from) : new Date(to.getTime() - (Number(q.days) || 30) * 86_400_000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new ModuleError("http", "invalid_input", "from/to không hợp lệ");
  return { from, to };
}

export function installErrorHandler(app: FastifyInstance, log: Logger) {
  app.setErrorHandler((error: unknown, _req, reply) => {
    const err = error as Error;
    if (err instanceof ModuleError) {
      if (err.code === "internal") log.error(err.message, { cause: String(err.cause) });
      return reply.status(httpStatusOf(err.code)).send({ error: err.code, message: err.message });
    }
    if (err instanceof ZodError) return reply.status(400).send({ error: "invalid_input", message: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.status(status).send({ error: "bad_request", message: err.message });
    log.error("lỗi không xử lý", { err: String(err), stack: err.stack?.split("\n").slice(0, 4).join(" | ") });
    return reply.status(500).send({ error: "internal", message: "Lỗi máy chủ" });
  });
}
