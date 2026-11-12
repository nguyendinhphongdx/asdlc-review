import type { FastifyInstance } from "fastify";
import type { Container } from "../container.js";

/**
 * Server-Sent Events: đẩy tiến trình review xuống UI theo thời gian thực.
 * `GET /api/events` (mọi run) hoặc `?run=<id>` (một run, kèm phát lại phần đã qua khi vào giữa chừng).
 * Sự kiện: `status` {runId, mrId, status, stage} (chờ → chạy → từng bước), `progress` {runId, mrId, entry}, `completed`, `failed`. Server gửi `: ping` mỗi 15 giây để giữ kết nối.
 */
export function registerEventRoutes(app: FastifyInstance, c: Container) {
  app.get<{ Querystring: { run?: string } }>("/api/events", (req, reply) => {
    const run = req.query.run;
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": req.headers.origin ?? "*",
    });
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    res.write("retry: 3000\n\n");
    if (run) for (const entry of c.progress.backlog(run)) send("progress", { runId: run, mrId: "", entry });

    const off = [
      c.events.subscribe("reviews.run.progress", (p) => { if (!run || p.runId === run) send("progress", p); }),
      c.events.subscribe("reviews.run.status", (p) => { if (!run || p.runId === run) send("status", p); }),
      c.events.subscribe("reviews.run.completed", (p) => { if (!run || p.runId === run) send("completed", p); }),
      c.events.subscribe("reviews.run.failed", (p) => { if (!run || p.runId === run) send("failed", p); }),
    ];
    const ping = setInterval(() => res.write(": ping\n\n"), 15_000);
    req.raw.on("close", () => { clearInterval(ping); off.forEach((f) => f()); });
  });
}
