import { ModuleError } from "../../../kernel/errors.js";
import type { GitAuth, InlineComment, MrInfo, OpenMrRef, PlatformClient } from "../domain/types.js";

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
    if (!this.token) throw new ModuleError("scm", "not_configured", "Chưa cấu hình GITLAB_TOKEN");
    const res = await fetch(`${this.baseUrl}/api/v4${pathname}`, {
      method,
      headers: { "PRIVATE-TOKEN": this.token, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
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

  gitAuth(): GitAuth {
    if (!this.token) return { secrets: [] };
    const b64 = Buffer.from(`oauth2:${this.token}`).toString("base64");
    return { header: `Authorization: Basic ${b64}`, secrets: [this.token, b64] };
  }
}
