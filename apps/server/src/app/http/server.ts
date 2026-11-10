import { existsSync } from "node:fs";
import path from "node:path";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { ModuleError } from "../../kernel/errors.js";
import { installErrorHandler, parseRange } from "../../kernel/http.js";
import type { Logger } from "../../kernel/logger.js";
import { registerAnalyticsRoutes } from "../../modules/analytics/index.js";
import { registerFrameworkRoutes } from "../../modules/framework/index.js";
import { registerIdentityRoutes } from "../../modules/identity/index.js";
import { registerReposRoutes } from "../../modules/repos/index.js";
import { registerReviewsRoutes } from "../../modules/reviews/index.js";
import { registerSettingsRoutes } from "../../modules/settings/index.js";
import type { Container } from "../container.js";
import { REVIEW_QUEUE } from "../workflows/mappers.js";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: string;
  }
}

export interface ServerOptions {
  webDist: string;
  log: Logger;
}

export async function buildServer(c: Container, opts: ServerOptions): Promise<FastifyInstance> {
  const { modules: m, workflows: w } = c;
  const app = Fastify({ logger: false, bodyLimit: 5 * 1024 * 1024 });
  installErrorHandler(app, opts.log);
  await app.register(cors, { origin: [/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, /^app:\/\//] });

  // Giữ body thô để kiểm chữ ký webhook (GitHub HMAC).
  app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
    req.rawBody = body as string;
    try {
      done(null, body ? JSON.parse(body as string) : {});
    } catch (err) {
      done(err as Error);
    }
  });

  // ---------- webhook ----------
  app.post<{ Params: { platform: string } }>("/webhooks/:platform", async (req, reply) => {
    const platform = req.params.platform;
    if (platform !== "gitlab" && platform !== "github") throw new ModuleError("http", "not_found", "Nền tảng không hỗ trợ");
    if (!m.scm.webhookConfigured(platform)) throw new ModuleError("http", "not_configured", `Chưa đặt ${platform.toUpperCase()}_WEBHOOK_SECRET`);
    if (!m.scm.verifyWebhook(platform, req.headers, req.rawBody ?? "")) throw new ModuleError("http", "unauthorized", "Sai chữ ký/secret webhook");
    const event = m.scm.parseWebhook(platform, req.headers, req.body);
    if (!event) return reply.status(200).send({ ok: true, ignored: true });
    // Trả lời nhanh (GitLab timeout 10s), xử lý nền.
    void w.handleScmEvent(event).then((r) => opts.log.info("webhook xử lý xong", { kind: event.kind, iid: event.iid, result: r.status })).catch((err) => opts.log.error("webhook lỗi", { err: String(err).slice(0, 300) }));
    return reply.status(202).send({ ok: true });
  });

  // ---------- module routes ----------
  registerIdentityRoutes(app, m.identity);
  registerReposRoutes(app, m.repos);
  registerSettingsRoutes(app, m.settings);
  registerFrameworkRoutes(app, m.framework);
  registerReviewsRoutes(app, m.reviews);
  registerAnalyticsRoutes(app, m.analytics);

  // ---------- trigger thủ công / chat ----------
  const ReviewBody = z.object({ url: z.string().url(), force: z.boolean().optional() });
  app.post("/api/reviews", async (req, reply) => {
    const body = ReviewBody.parse(req.body);
    const ref = m.scm.parseUrl(body.url);
    if (!ref) throw new ModuleError("http", "invalid_input", "Không nhận ra link MR/PR");
    return reply.status(202).send(await w.requestReview({ ...ref, trigger: "manual", force: body.force }));
  });
  app.post<{ Params: { id: string } }>("/api/mrs/:id/rerun", async (req, reply) => {
    const mr = await m.reviews.getMr(req.params.id);
    const repo = await m.repos.get(mr.repositoryId);
    return reply.status(202).send(await w.requestReview({ platform: repo.platform as "gitlab" | "github", projectPath: repo.fullPath, iid: mr.iid, trigger: "manual", force: true }));
  });
  app.post("/api/repos", async (req, reply) => reply.status(201).send(await w.registerRepo(z.object({ url: z.string() }).parse(req.body).url)));
  app.post("/api/chat/command", async (req) => ({ reply: await w.chatCommand(z.object({ text: z.string(), user: z.string().optional() }).parse(req.body)) }));

  app.get<{ Querystring: { from?: string; to?: string; days?: string } }>("/api/reports/export.md", async (req, reply) => {
    const names = Object.fromEntries((await m.repos.list()).map((r) => [r.id, r.fullPath]));
    return reply.header("content-type", "text/markdown; charset=utf-8").header("content-disposition", 'attachment; filename="report.md"').send(await m.analytics.exportMarkdown(parseRange(req.query), names));
  });

  // ---------- hệ thống ----------
  app.get("/api/providers", () => m.reviewer.providers());
  app.get("/api/queue", async () => ({ driver: m.queue.driver, review: await m.queue.stats(REVIEW_QUEUE) }));
  app.get("/api/health", () => ({
    ok: true,
    queue: m.queue.driver,
    gitlab: { configured: m.scm.isConfigured("gitlab"), webhook: m.scm.webhookConfigured("gitlab") },
    github: { configured: m.scm.isConfigured("github"), webhook: m.scm.webhookConfigured("github") },
  }));

  // ---------- web (SPA) ----------
  if (existsSync(path.join(opts.webDist, "index.html"))) {
    await app.register(fastifyStatic, { root: opts.webDist, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === "GET" && !req.url.startsWith("/api/") && !req.url.startsWith("/webhooks/")) return reply.sendFile("index.html");
      return reply.status(404).send({ error: "not_found", message: "Không tìm thấy" });
    });
  }
  return app;
}
