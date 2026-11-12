import { ModuleError } from "../../../kernel/errors.js";
import type { ConnectionProbe, DiscoverMr, DiscoverProject, GitAuth, ProjectProbe, InlineComment, MrInfo, OpenMrRef, PlatformClient } from "../domain/types.js";

interface GlMr {
  iid: number; title: string; description: string | null; web_url: string; source_branch: string; target_branch: string;
  author: { username: string; name: string }; state: string; draft?: boolean; work_in_progress?: boolean;
  created_at: string; updated_at: string; merged_at: string | null; closed_at: string | null; sha: string;
  diff_refs: { base_sha: string; head_sha: string; start_sha: string } | null;
}
interface GlProject { id: number; path_with_namespace: string; web_url: string; http_url_to_repo: string; default_branch: string | null }

export class GitLabClient implements PlatformClient {
  private baseUrl: string;
  constructor(baseUrl: string, private token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }
  isConfigured() { return Boolean(this.token); }

  private async api<T>(method: string, pathname: string, body?: unknown): Promise<{ data: T; headers: Headers }> {
    if (!this.token) throw new ModuleError("scm", "not_configured", "Chưa cấu hình token GitLab");
    const res = await fetch(`${this.baseUrl}/api/v4${pathname}`, {
      method,
      headers: { "PRIVATE-TOKEN": this.token, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    }).catch((e: unknown) => {
      throw new ModuleError("scm", "upstream_error", `unreachable: ${this.baseUrl} (${e instanceof Error ? e.message : String(e)})`);
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ModuleError("scm", res.status === 404 ? "not_found" : res.status === 401 || res.status === 403 ? "unauthorized" : res.status === 400 ? "invalid_input" : "upstream_error", `GitLab ${method} ${pathname} → ${res.status}: ${text.slice(0, 400)}`);
    }
    return { data: (res.status === 204 ? undefined : await res.json()) as T, headers: res.headers };
  }
  private pid = (p: string) => encodeURIComponent(p);

  async getMergeRequest(projectPath: string, iid: number): Promise<MrInfo> {
    const pid = this.pid(projectPath);
    const [{ data: mr }, { data: project }, commits] = await Promise.all([
      this.api<GlMr>("GET", `/projects/${pid}/merge_requests/${iid}`),
      this.api<GlProject>("GET", `/projects/${pid}`),
      this.api<unknown[]>("GET", `/projects/${pid}/merge_requests/${iid}/commits?per_page=100`),
    ]);
    return {
      platform: "gitlab",
      projectPath: project.path_with_namespace,
      projectId: String(project.id),
      projectWebUrl: project.web_url,
      defaultBranch: project.default_branch,
      cloneUrl: project.http_url_to_repo,
      iid: mr.iid,
      title: mr.title,
      description: mr.description ?? "",
      webUrl: mr.web_url,
      sourceBranch: mr.source_branch,
      targetBranch: mr.target_branch,
      authorUsername: mr.author.username,
      authorName: mr.author.name,
      state: mr.state === "merged" ? "merged" : mr.state === "opened" ? "opened" : "closed",
      draft: Boolean(mr.draft ?? mr.work_in_progress),
      createdAt: new Date(mr.created_at),
      mergedAt: mr.merged_at ? new Date(mr.merged_at) : null,
      closedAt: mr.closed_at ? new Date(mr.closed_at) : null,
      headSha: mr.diff_refs?.head_sha ?? mr.sha,
      baseSha: mr.diff_refs?.base_sha ?? null,
      startSha: mr.diff_refs?.start_sha ?? null,
      headRef: `refs/merge-requests/${mr.iid}/head`,
      commits: Number(commits.headers.get("x-total")) || commits.data.length,
    };
  }

  async listOpen(projectPath: string, updatedAfter?: Date): Promise<OpenMrRef[]> {
    const qs = new URLSearchParams({ state: "opened", per_page: "100", order_by: "updated_at" });
    if (updatedAfter) qs.set("updated_after", updatedAfter.toISOString());
    const { data } = await this.api<GlMr[]>("GET", `/projects/${this.pid(projectPath)}/merge_requests?${qs}`);
    return data.map((m) => ({ iid: m.iid, headSha: m.sha, updatedAt: new Date(m.updated_at), draft: Boolean(m.draft ?? m.work_in_progress) }));
  }

  /** Repo mà token là thành viên, mới hoạt động trước; `search` lọc theo tên/đường dẫn. */
  async searchProjects(search: string): Promise<DiscoverProject[]> {
    const qs = new URLSearchParams({ membership: "true", simple: "true", order_by: "last_activity_at", sort: "desc", per_page: "20" });
    if (search.trim()) qs.set("search", search.trim());
    const { data } = await this.api<Array<{ path_with_namespace: string; name_with_namespace: string; web_url: string; last_activity_at?: string }>>("GET", `/projects?${qs}`);
    return data.map((p) => ({ path: p.path_with_namespace, name: p.name_with_namespace, webUrl: p.web_url, lastActivityAt: p.last_activity_at ? new Date(p.last_activity_at) : null }));
  }

  async listMrs(projectPath: string, state: "opened" | "merged" | "all", search: string): Promise<DiscoverMr[]> {
    const qs = new URLSearchParams({ state, per_page: state === "opened" && !search.trim() ? "100" : "30", order_by: "updated_at", sort: "desc" });
    if (search.trim()) qs.set("search", search.trim());
    const { data } = await this.api<GlMr[]>("GET", `/projects/${this.pid(projectPath)}/merge_requests?${qs}`);
    return data.map((m) => ({
      iid: m.iid, title: m.title, authorUsername: m.author.username, webUrl: m.web_url, sourceBranch: m.source_branch, targetBranch: m.target_branch,
      state: m.state === "merged" ? "merged" : m.state === "closed" ? "closed" : "opened", draft: Boolean(m.draft ?? m.work_in_progress), updatedAt: new Date(m.updated_at), headSha: m.sha,
    }));
  }

  async upsertSummaryNote(mr: MrInfo, body: string, marker: string) {
    const base = `/projects/${this.pid(mr.projectPath)}/merge_requests/${mr.iid}/notes`;
    const { data: notes } = await this.api<{ id: number; body: string }[]>("GET", `${base}?per_page=100&sort=desc`);
    const existing = notes.find((n) => n.body.includes(marker));
    const { data } = existing ? await this.api<{ id: number }>("PUT", `${base}/${existing.id}`, { body }) : await this.api<{ id: number }>("POST", base, { body });
    return `${mr.webUrl}#note_${data.id}`;
  }

  async postInline(mr: MrInfo, c: InlineComment) {
    if (!mr.baseSha || !mr.startSha) return false;
    try {
      await this.api("POST", `/projects/${this.pid(mr.projectPath)}/merge_requests/${mr.iid}/discussions`, {
        body: c.body,
        position: { position_type: "text", base_sha: mr.baseSha, start_sha: mr.startSha, head_sha: mr.headSha, new_path: c.file, old_path: c.file, new_line: c.line },
      });
      return true;
    } catch (err) {
      if (err instanceof ModuleError && err.code === "invalid_input") return false; // dòng không thuộc diff
      throw err;
    }
  }

  async reply(mr: MrInfo, body: string) {
    await this.api("POST", `/projects/${this.pid(mr.projectPath)}/merge_requests/${mr.iid}/notes`, { body });
  }

  /** Gọi /user, /personal_access_tokens/self, /projects để biết token dùng được không. Không ném lỗi. */
  async probe(): Promise<ConnectionProbe> {
    if (!this.token) return { ok: false, error: { code: "not_configured", message: "Chưa có token GitLab" } };
    let user: { username: string; name: string };
    try {
      user = (await this.api<{ username: string; name: string }>("GET", "/user")).data;
    } catch (err) {
      return { ok: false, error: classify(err) };
    }
    let scopes: string[] | undefined;
    let expiresAt: string | null | undefined;
    try {
      const { data } = await this.api<{ scopes: string[]; expires_at: string | null; active?: boolean; revoked?: boolean }>("GET", "/personal_access_tokens/self");
      scopes = data.scopes;
      expiresAt = data.expires_at;
      if (data.revoked || data.active === false) return { ok: false, user, scopes, expiresAt, error: { code: "expired", message: "Token đã bị thu hồi hoặc hết hạn" } };
    } catch {
      // Group/Project token hoặc bản GitLab cũ có thể không có endpoint này: bỏ qua, kiểm tra bằng các lời gọi sau.
    }
    if (scopes && !scopes.includes("api")) return { ok: false, user, scopes, expiresAt, error: { code: "missing_scope", message: `Token thiếu scope "api" (đang có: ${scopes.join(", ") || "không"})` } };
    let projectCount = 0;
    try {
      const { data, headers } = await this.api<unknown[]>("GET", "/projects?membership=true&per_page=1");
      projectCount = Number(headers.get("x-total")) || data.length;
    } catch (err) {
      return { ok: false, user, scopes, expiresAt, error: classify(err) };
    }
    if (projectCount === 0) return { ok: false, user, scopes, expiresAt, projectCount, error: { code: "no_projects", message: "Token không truy cập được repo nào" } };
    return { ok: true, user, scopes, expiresAt, projectCount };
  }

  async probeProject(projectPath: string): Promise<ProjectProbe> {
    try {
      const { data } = await this.api<GlProject & { permissions?: { project_access?: { access_level: number } | null; group_access?: { access_level: number } | null } }>("GET", `/projects/${this.pid(projectPath)}`);
      const level = Math.max(data.permissions?.project_access?.access_level ?? 0, data.permissions?.group_access?.access_level ?? 0);
      return { ok: true, fullPath: data.path_with_namespace, webUrl: data.web_url, defaultBranch: data.default_branch, canCreateWebhook: level >= 40 };
    } catch (err) {
      const e = classify(err);
      return { ok: false, error: e.code === "unauthorized" ? "Token không có quyền truy cập repo này" : e.code === "unknown" ? "Không tìm thấy repo (kiểm tra đường dẫn và quyền của token)" : e.message };
    }
  }

  async ensureWebhook(projectPath: string, url: string, secret: string): Promise<void> {
    const base = `/projects/${this.pid(projectPath)}/hooks`;
    const payload = { url, token: secret, merge_requests_events: true, note_events: true, push_events: false, enable_ssl_verification: url.startsWith("https://") };
    const { data: hooks } = await this.api<{ id: number; url: string }[]>("GET", `${base}?per_page=100`);
    const existing = hooks.find((h) => h.url === url);
    if (existing) await this.api("PUT", `${base}/${existing.id}`, payload);
    else await this.api("POST", base, payload);
  }

  gitAuth(): GitAuth {
    if (!this.token) return { secrets: [] };
    const b64 = Buffer.from(`oauth2:${this.token}`).toString("base64");
    return { header: `Authorization: Basic ${b64}`, secrets: [this.token, b64] };
  }
}

function classify(err: unknown): NonNullable<ConnectionProbe["error"]> {
  const msg = err instanceof Error ? err.message : String(err);
  if (err instanceof ModuleError) {
    if (err.code === "unauthorized") return { code: msg.includes("→ 403") ? "missing_scope" : "unauthorized", message: msg.includes("→ 403") ? "Token không đủ quyền (thiếu scope api?)" : "Token sai hoặc đã hết hạn" };
    if (msg.includes("unreachable:")) return { code: "unreachable", message: "Không kết nối được tới GitLab (kiểm tra URL/mạng)" };
  }
  const status = msg.match(/→ (\d{3})/)?.[1];
  if (status === "429") return { code: "unknown", message: "GitLab đang giới hạn tần suất (HTTP 429) — đợi vài phút rồi thử lại" };
  if (status === "404") return { code: "unknown", message: "Không tìm thấy API GitLab (HTTP 404) — kiểm tra URL, chỉ nhập địa chỉ gốc như https://gitlab.com" };
  if (status && status.startsWith("5")) return { code: "unknown", message: `GitLab báo lỗi máy chủ (HTTP ${status})` };
  return { code: "unknown", message: status ? `GitLab trả về HTTP ${status}` : "Lỗi không xác định từ GitLab" };
}
