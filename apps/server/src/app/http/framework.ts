import type { FrameworkInfoDto, HarnessReportDto } from "@mrd/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ModuleError } from "../../kernel/errors.js";
import type { Container } from "../container.js";
import { fwScope } from "../workflows/framework-chat.js";

/** Route cần ghép dữ liệu nhiều module: danh sách framework kèm số repo, xoá an toàn, harness của repo. */
export function registerFrameworkAppRoutes(app: FastifyInstance, c: Container) {
  const { modules: m } = c;

  app.get("/api/frameworks", async (): Promise<FrameworkInfoDto[]> => {
    const [list, repos, settings] = await Promise.all([m.framework.list(), m.repos.list(), m.settings.snapshot()]);
    const count = new Map<string, number>();
    for (const r of repos) {
      const id = r.frameworkId ?? settings.defaultFramework;
      count.set(id, (count.get(id) ?? 0) + 1);
    }
    return list.map((f) => ({ ...f, repoCount: count.get(f.id) ?? 0 }));
  });

  // ---------- chat cải thiện / xây framework (đề xuất sửa chờ người duyệt qua /api/actions/:id/approve) ----------
  app.get<{ Params: { id: string } }>("/api/frameworks/:id/chat", async (req) => {
    await m.framework.detail(req.params.id);
    const scope = fwScope(req.params.id);
    return { messages: await m.agent.listMessages(scope), lessons: [], actions: await m.agent.listActions(scope), live: c.chatLive.get(scope) ?? null };
  });
  const ChatBody = z.object({
    text: z.string().trim().max(4000).default(""),
    images: z.array(z.object({ mediaType: z.enum(["image/png", "image/jpeg", "image/gif", "image/webp"]), data: z.string().max(5_000_000) })).max(4).default([]),
  }).refine((b) => b.text.length > 0 || b.images.length > 0, "Cần nội dung hoặc ảnh");
  app.post<{ Params: { id: string } }>("/api/frameworks/:id/chat", { bodyLimit: 24 * 1024 * 1024 }, async (req) => {
    const b = ChatBody.parse(req.body);
    return c.workflows.frameworkChat(req.params.id, b.text || "Xem ảnh đính kèm.", b.images);
  });
  c.frameworkTools.register(app);

  app.delete<{ Params: { id: string } }>("/api/frameworks/:id", async (req, reply) => {
    const id = req.params.id;
    const [repos, settings] = await Promise.all([m.repos.list(), m.settings.snapshot()]);
    const users = repos.filter((r) => (r.frameworkId ?? settings.defaultFramework) === id);
    if (settings.defaultFramework === id) throw new ModuleError("http", "conflict", "Đang là framework mặc định của hệ thống");
    if (users.length) throw new ModuleError("http", "conflict", `${users.length} repo đang dùng framework này (${users.slice(0, 3).map((r) => r.fullPath).join(", ")}). Chuyển các repo sang framework khác trước.`);
    await m.framework.remove(id);
    return reply.status(204).send();
  });

  app.get<{ Params: { id: string } }>("/api/repos/:id/harness", async (req): Promise<{ report: HarnessReportDto | null; runId: string | null }> => {
    const repo = await m.repos.get(req.params.id);
    const { items } = await m.reviews.listRuns({ repositoryId: repo.id, status: "succeeded", limit: 1 });
    const run = items[0] ? await m.reviews.getRun(items[0].id) : null;
    return { report: run?.harnessReport ?? null, runId: run?.id ?? null };
  });
}
