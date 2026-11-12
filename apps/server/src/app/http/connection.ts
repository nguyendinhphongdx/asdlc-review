import { access, constants, mkdir, readdir, stat, statfs } from "node:fs/promises";
import path from "node:path";
import type { AiKeyStatusDto, StorageCheckDto, StorageDto, ConnectionStatusDto, DiscoverMrDto, DiscoverProjectDto, ConnectionTestDto, RepoCheckDto, RepoWebhookDto, WebhookSecretDto } from "@mrd/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ModuleError } from "../../kernel/errors.js";
import { KEY } from "../credentials.js";
import type { Container } from "../container.js";

const Save = z.object({ baseUrl: z.string().url().max(300), token: z.string().min(8).max(500).optional() });
const CheckBody = z.object({ url: z.string().min(3).max(500) });

/**
 * Kết nối nền tảng + webhook. Quy tắc: không route nào trả token; secret webhook chỉ có ở
 * `GET /api/connection/webhook-secret` (người dùng bấm Hiện/Sao chép) và URL cấu hình trên GitLab.
 */
export function registerConnectionRoutes(app: FastifyInstance, c: Container, publicUrl: string) {
  const { modules: m, credentials } = c;
  const webhookUrl = `${publicUrl.replace(/\/$/, "")}/webhooks/gitlab`;

  const status = (): ConnectionStatusDto => {
    const g = credentials.gitlab();
    const source = credentials.tokenSource();
    return {
      gitlab: { baseUrl: g.baseUrl, tokenSet: Boolean(g.token), tokenHint: m.secrets.hint(KEY.gitlabToken) ?? (g.token ? g.token.slice(-4) : null), source },
      webhook: { url: webhookUrl, secretSet: Boolean(g.webhookSecret) },
      canStoreSecrets: m.secrets.canStore,
    };
  };

  app.get("/api/connection", () => status());

  // Khoá API AI cloud (Gemini): lưu mã hoá trong DB, không route nào trả lại khoá.
  const geminiStatus = (): AiKeyStatusDto => {
    const key = credentials.geminiKey();
    return { configured: Boolean(key), source: credentials.geminiSource(), hint: m.secrets.hint(KEY.geminiKey) ?? (key ? key.slice(-4) : null), canStore: m.secrets.canStore };
  };
  app.get("/api/ai-keys/gemini", () => geminiStatus());
  app.put("/api/ai-keys/gemini", async (req) => {
    const { apiKey } = z.object({ apiKey: z.string().trim().min(8).max(300) }).parse(req.body);
    await credentials.saveGeminiKey(apiKey);
    return geminiStatus();
  });
  app.delete("/api/ai-keys/gemini", async (_req, reply) => {
    await credentials.clearGeminiKey();
    return reply.status(204).send();
  });

  app.put("/api/connection/gitlab", async (req) => {
    const body = Save.parse(req.body);
    if (!/^https?:\/\//.test(body.baseUrl)) throw new ModuleError("http", "invalid_input", "URL phải bắt đầu bằng http:// hoặc https://");
    await credentials.saveGitlab(body);
    return status();
  });

  app.delete("/api/connection/gitlab", async (_req, reply) => {
    await credentials.clearGitlab();
    return reply.status(204).send();
  });

  app.post("/api/connection/test", async (): Promise<ConnectionTestDto> => {
    const probe = await m.scm.testConnection("gitlab");
    const settings = await m.settings.snapshot();
    const p = (await m.reviewer.providers()).find((x) => x.id === settings.reviewProvider);
    const llm = { provider: settings.reviewProvider, label: p?.label ?? settings.reviewProvider, available: Boolean(p?.available), detail: p?.available ? p.model : "Chưa tìm thấy CLI/API khả dụng trên máy chạy server" };
    const hint: Record<string, string> = {
      unreachable: "Kiểm tra URL GitLab và kết nối mạng.",
      unauthorized: "Tạo lại token và dán lại.",
      missing_scope: "Token cần scope `api`.",
      expired: "Tạo token mới (token cũ hết hạn hoặc bị thu hồi).",
      no_projects: "Thêm bot vào ít nhất một project/group (role Developer trở lên).",
      not_configured: "Nhập URL và token ở thẻ GitLab.",
    };
    return {
      ok: probe.ok && llm.available,
      checkedAt: new Date().toISOString(),
      error: probe.error ? { code: probe.error.code, message: probe.error.message, hint: hint[probe.error.code] } : undefined,
      user: probe.user, scopes: probe.scopes, expiresAt: probe.expiresAt, projectCount: probe.projectCount, llm,
    };
  });

  app.get("/api/connection/webhook-secret", async (): Promise<WebhookSecretDto> => ({ secret: await credentials.ensureWebhookSecret() }));
  app.post("/api/connection/webhook-secret/regenerate", async (): Promise<WebhookSecretDto> => {
    if (!m.secrets.canStore) throw new ModuleError("http", "not_configured", "Chưa có khoá mã hoá nên không thể lưu secret");
    return { secret: await credentials.regenerateWebhookSecret() };
  });

  // ---------- thư mục lưu repo clone ----------
  const dirSize = async (dir: string, depth = 0): Promise<number> => {
    if (depth > 12) return 0;
    let total = 0;
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) total += await dirSize(p, depth + 1);
      else if (e.isFile()) total += (await stat(p).catch(() => null))?.size ?? 0;
    }
    return total;
  };
  app.get("/api/storage", async (): Promise<StorageDto> => {
    const { reposDir, runsDir } = c.storage.dirs();
    return { reposDir, runsDir, dataDir: c.storage.defaults.dataDir, custom: reposDir !== c.storage.defaults.reposDir, reposBytes: await dirSize(reposDir) };
  });
  app.post("/api/storage/check", async (req): Promise<StorageCheckDto> => {
    const { path: p } = z.object({ path: z.string().max(500) }).parse(req.body);
    if (!path.isAbsolute(p)) return { ok: false, error: "Phải là đường dẫn tuyệt đối (vd: /Users/ban/asdlc hoặc D:\\asdlc)" };
    try {
      await mkdir(p, { recursive: true });
      await access(p, constants.W_OK);
      const fs = await statfs(p).catch(() => null);
      return { ok: true, freeBytes: fs ? Number(fs.bavail) * Number(fs.bsize) : undefined };
    } catch (e) {
      return { ok: false, error: `Không ghi được vào thư mục này: ${e instanceof Error ? e.message : String(e)}` };
    }
  });

  // ---------- duyệt repo / MR của tài khoản ----------
  app.get("/api/discover/projects", async (req): Promise<DiscoverProjectDto[]> => {
    const { q } = z.object({ q: z.string().max(100).optional() }).parse(req.query);
    const [found, repos] = await Promise.all([m.scm.searchProjects("gitlab", q ?? ""), m.repos.list()]);
    const have = new Set(repos.map((r) => `${r.platform}/${r.fullPath}`));
    return found.map((p) => ({ path: p.path, name: p.name, webUrl: p.webUrl, lastActivityAt: p.lastActivityAt?.toISOString() ?? null, registered: have.has(`gitlab/${p.path}`) }));
  });
  app.get("/api/discover/mrs", async (req): Promise<DiscoverMrDto[]> => {
    const q = z.object({ project: z.string().min(3).max(300), state: z.enum(["opened", "merged", "all"]).default("opened"), q: z.string().max(100).optional() }).parse(req.query);
    const list = await m.scm.listMrs("gitlab", q.project, q.state, q.q ?? "");
    return list.map((x) => ({ ...x, updatedAt: x.updatedAt.toISOString() }));
  });

  // ---------- repo ----------
  app.post("/api/repos/check", async (req): Promise<RepoCheckDto> => {
    const { url } = CheckBody.parse(req.body);
    const p = m.scm.parseProjectUrl(url) ?? (/^[\w.-]+(\/[\w.-]+)+$/.test(url.trim()) ? { platform: "gitlab" as const, projectPath: url.trim(), webUrl: "" } : null);
    if (!p) return { ok: false, error: "Không nhận ra link hoặc đường dẫn repo (vd: group/project)" };
    if (!m.scm.isConfigured(p.platform)) return { ok: false, error: "Chưa kết nối GitLab (Cài đặt → Kết nối)" };
    return m.scm.checkProject(p.platform, p.projectPath);
  });

  const repoKey = async (id: string) => {
    const r = await m.repos.get(id);
    return { repo: r, key: `${r.platform}/${r.fullPath}` };
  };

  app.get<{ Params: { id: string } }>("/api/repos/:id/webhook", async (req): Promise<RepoWebhookDto> => {
    const { key } = await repoKey(req.params.id);
    const s = await m.repos.webhookSummary(key);
    return {
      status: s.status, lastEventAt: s.lastEventAt?.toISOString() ?? null, rejectedCount: s.rejectedCount,
      events: s.events.map((e) => ({ id: e.id, at: e.at.toISOString(), event: e.event, result: e.result, detail: e.detail })),
    };
  });

  app.post<{ Params: { id: string } }>("/api/repos/:id/webhook/create", async (req, reply) => {
    const { repo } = await repoKey(req.params.id);
    if (repo.platform !== "gitlab") throw new ModuleError("http", "invalid_input", "Chỉ hỗ trợ GitLab");
    const probe = await m.scm.checkProject("gitlab", repo.fullPath);
    if (!probe.ok) throw new ModuleError("http", "invalid_input", probe.error ?? "Không truy cập được repo");
    if (!probe.canCreateWebhook) throw new ModuleError("http", "unauthorized", "Token cần quyền Maintainer để tạo webhook; hãy tạo thủ công theo hướng dẫn");
    await credentials.ensureWebhookSecret();
    await m.scm.createWebhook("gitlab", repo.fullPath, webhookUrl);
    return reply.status(204).send();
  });
}
