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
import { registerConnectionRoutes } from "./connection.js";
import { registerEventRoutes } from "./events.js";
import { registerFrameworkAppRoutes } from "./framework.js";
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
  /** Tên dự án trong payload: CHỈ để ghi nhật ký (dữ liệu không tin cậy, không dùng để quyết định). */
  const projectOf = (body: unknown): string | null => {
    const o = (body ?? {}) as { project?: { path_with_namespace?: unknown }; repository?: { full_name?: unknown } };
    const v = o.project?.path_with_namespace ?? o.repository?.full_name;
    return typeof v === "string" && v.length < 300 ? v : null;
  };
  const eventLabel = (headers: Record<string, unknown>, body: unknown): string => {
    const kind = String(headers["x-gitlab-event"] ?? headers["x-github-event"] ?? "event").slice(0, 60);
    const action = ((body ?? {}) as { object_attributes?: { action?: unknown }; action?: unknown }).object_attributes?.action ?? ((body ?? {}) as { action?: unknown }).action;
    return typeof action === "string" ? `${kind} · ${action.slice(0, 30)}` : kind;
  };
  /** Chỉ ghi nhật ký cho repo đã đăng ký: tránh kẻ lạ làm phình DB bằng request giả. */
  const logHook = async (platform: string, body: unknown, headers: Record<string, unknown>, result: "accepted" | "rejected" | "ignored" | "skipped", detail?: string) => {
    const path = projectOf(body);
    if (!path || !(await m.repos.find(platform, path))) return;
    await m.repos.logWebhook(`${platform}/${path}`, { event: eventLabel(headers, body), result, detail }).catch(() => undefined);
  };
  app.post<{ Params: { platform: string } }>("/webhooks/:platform", async (req, reply) => {
    const platform = req.params.platform;
    if (platform !== "gitlab" && platform !== "github") throw new ModuleError("http", "not_found", "Nền tảng không hỗ trợ");
    if (!m.scm.webhookConfigured(platform)) {
      await logHook(platform, req.body, req.headers, "rejected", "Chưa cấu hình secret webhook trên server");
      throw new ModuleError("http", "not_configured", "Chưa cấu hình secret webhook");
    }
    if (!m.scm.verifyWebhook(platform, req.headers, req.rawBody ?? "")) {
      await logHook(platform, req.body, req.headers, "rejected", "Secret không khớp");
      throw new ModuleError("http", "unauthorized", "Sai chữ ký/secret webhook");
    }
    const event = m.scm.parseWebhook(platform, req.headers, req.body);
    if (!event) {
      await logHook(platform, req.body, req.headers, "ignored", "Loại sự kiện không liên quan");
      return reply.status(200).send({ ok: true, ignored: true });
    }
    const key = `${platform}/${event.projectPath}`;
    const label = eventLabel(req.headers, req.body);
    const log = (result: "accepted" | "ignored" | "skipped", detail: string) => m.repos.find(platform, event.projectPath).then((r) => r && m.repos.logWebhook(key, { event: label, result, detail })).catch(() => undefined);
    // Trả lời nhanh (GitLab timeout 10s), xử lý nền.
    void w.handleScmEvent(event)
      .then(async (r) => {
        opts.log.info("webhook xử lý xong", { kind: event.kind, iid: event.iid, result: r.status });
        if (r.status === "skipped") await log("skipped", `!${event.iid} — ${r.reason}`);
        else if (r.status === "ignored") await log("ignored", `!${event.iid} — chưa có review để đồng bộ`);
        else await log("accepted", `!${event.iid} — ${r.status === "queued" ? "đã xếp hàng review" : r.status === "duplicate" ? "đã có trong hàng đợi" : r.status === "already_reviewed" ? "commit này đã review" : "đã đồng bộ trạng thái"}`);
      })
      .catch(async (err) => {
        opts.log.error("webhook lỗi", { err: String(err).slice(0, 300) });
        await log("skipped", `!${event.iid} — lỗi: ${String(err instanceof Error ? err.message : err).slice(0, 160)}`);
      });
    return reply.status(202).send({ ok: true });
  });

  // ---------- module routes ----------
  registerIdentityRoutes(app, m.identity);
  registerReposRoutes(app, m.repos);
  registerConnectionRoutes(app, c, c.publicUrl);
  registerEventRoutes(app, c);
  registerFrameworkAppRoutes(app, c);
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
  // ---------- hộp MR chờ review (poller) ----------
  app.get("/api/inbox", async () => {
    if (!c.inbox.hasData) await c.inbox.sync({ review: false }).catch(() => undefined);
    return c.inbox.list((await m.settings.get("triggerMode")) === "polling");
  });
  app.post("/api/inbox/refresh", async () => {
    const auto = (await m.settings.get("triggerMode")) === "polling";
    await c.inbox.sync({ review: auto });
    return c.inbox.list(auto);
  });

  // ---------- agent: chat theo MR + sổ tay bài học ----------
  app.get<{ Params: { id: string } }>("/api/mrs/:id/chat", async (req) => {
    const mr = await m.reviews.getMr(req.params.id);
    return { messages: await m.agent.listMessages(mr.id), lessons: await m.agent.listLessons(mr.repositoryId), actions: await m.agent.listActions(mr.id), live: c.chatLive.get(mr.id) ?? null };
  });
  const ChatBody = z.object({
    text: z.string().trim().max(4000).default(""),
    images: z.array(z.object({ mediaType: z.enum(["image/png", "image/jpeg", "image/gif", "image/webp"]), data: z.string().max(5_000_000) })).max(4).default([]),
  }).refine((b) => b.text.length > 0 || b.images.length > 0, "Cần nội dung hoặc ảnh");
  app.post<{ Params: { id: string } }>("/api/mrs/:id/chat", { bodyLimit: 24 * 1024 * 1024 }, async (req) => { const b = ChatBody.parse(req.body); return w.agentChat(req.params.id, b.text || "Xem ảnh đính kèm.", undefined, b.images); });
  app.post<{ Params: { id: string } }>("/api/actions/:id/approve", async (req) => w.agentActions.approve(req.params.id));
  app.post<{ Params: { id: string } }>("/api/actions/:id/dismiss", async (req) => w.agentActions.dismiss(req.params.id));
  c.agentTools.register(app);
  app.get<{ Params: { id: string } }>("/api/repos/:id/lessons", async (req) => m.agent.listLessons(req.params.id));
  app.post<{ Params: { id: string } }>("/api/lessons/:id/approve", async (req) => m.agent.setLessonStatus(req.params.id, "active"));
  app.post<{ Params: { id: string } }>("/api/lessons/:id/reject", async (req) => m.agent.setLessonStatus(req.params.id, "rejected"));
  app.delete<{ Params: { id: string } }>("/api/lessons/:id", async (req, reply) => { await m.agent.removeLesson(req.params.id); return reply.status(204).send(); });
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
