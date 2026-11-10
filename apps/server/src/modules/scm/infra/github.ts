import { ModuleError } from "../../../kernel/errors.js";
import type { GitAuth, InlineComment, MrInfo, OpenMrRef, PlatformClient } from "../domain/types.js";

interface GhPr {
  number: number; title: string; body: string | null; html_url: string; state: string; draft: boolean;
  created_at: string; updated_at: string; merged_at: string | null; closed_at: string | null; commits: number;
  user: { login: string }; head: { ref: string; sha: string };
  base: { ref: string; sha: string; repo: { id: number; full_name: string; html_url: string; clone_url: string; default_branch: string } };
}

export class GitHubClient implements PlatformClient {
  constructor(private token: string, private baseUrl = "https://api.github.com") {}
  isConfigured() { return Boolean(this.token); }

  private async api<T>(method: string, pathname: string, body?: unknown): Promise<T> {
    if (!this.token) throw new ModuleError("scm", "not_configured", "Chưa cấu hình GITHUB_TOKEN");
    const res = await fetch(`${this.baseUrl}${pathname}`, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ModuleError("scm", res.status === 404 ? "not_found" : res.status === 401 || res.status === 403 ? "unauthorized" : res.status === 422 ? "invalid_input" : "upstream_error", `GitHub ${method} ${pathname} → ${res.status}: ${text.slice(0, 400)}`);
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  async getMergeRequest(projectPath: string, iid: number): Promise<MrInfo> {
    const pr = await this.api<GhPr>("GET", `/repos/${projectPath}/pulls/${iid}`);
    const repo = pr.base.repo;
    return {
      platform: "github", projectPath: repo.full_name, projectId: String(repo.id), projectWebUrl: repo.html_url, defaultBranch: repo.default_branch,
      cloneUrl: repo.clone_url, iid: pr.number, title: pr.title, description: pr.body ?? "", webUrl: pr.html_url,
      sourceBranch: pr.head.ref, targetBranch: pr.base.ref, authorUsername: pr.user.login, authorName: pr.user.login,
      state: pr.merged_at ? "merged" : pr.state === "open" ? "opened" : "closed", draft: pr.draft,
      createdAt: new Date(pr.created_at), mergedAt: pr.merged_at ? new Date(pr.merged_at) : null, closedAt: pr.closed_at ? new Date(pr.closed_at) : null,
      headSha: pr.head.sha, baseSha: pr.base.sha, startSha: pr.base.sha, headRef: `refs/pull/${pr.number}/head`, commits: pr.commits,
    };
  }

  async listOpen(projectPath: string, updatedAfter?: Date): Promise<OpenMrRef[]> {
    const prs = await this.api<GhPr[]>("GET", `/repos/${projectPath}/pulls?state=open&sort=updated&direction=desc&per_page=100`);
    return prs.filter((p) => !updatedAfter || new Date(p.updated_at) > updatedAfter).map((p) => ({ iid: p.number, headSha: p.head.sha, updatedAt: new Date(p.updated_at), draft: p.draft }));
  }

  async upsertSummaryNote(mr: MrInfo, body: string, marker: string) {
    const comments = await this.api<{ id: number; body: string }[]>("GET", `/repos/${mr.projectPath}/issues/${mr.iid}/comments?per_page=100`);
    const existing = comments.find((c) => c.body.includes(marker));
    const res = existing
      ? await this.api<{ html_url: string }>("PATCH", `/repos/${mr.projectPath}/issues/comments/${existing.id}`, { body })
      : await this.api<{ html_url: string }>("POST", `/repos/${mr.projectPath}/issues/${mr.iid}/comments`, { body });
    return res.html_url;
  }

  async postInline(mr: MrInfo, c: InlineComment) {
    try {
      await this.api("POST", `/repos/${mr.projectPath}/pulls/${mr.iid}/comments`, { body: c.body, commit_id: mr.headSha, path: c.file, line: c.line, side: "RIGHT" });
      return true;
    } catch (err) {
      if (err instanceof ModuleError && err.code === "invalid_input") return false;
      throw err;
    }
  }

  async reply(mr: MrInfo, body: string) {
    await this.api("POST", `/repos/${mr.projectPath}/issues/${mr.iid}/comments`, { body });
  }

  gitAuth(): GitAuth {
    if (!this.token) return { secrets: [] };
    const b64 = Buffer.from(`x-access-token:${this.token}`).toString("base64");
    return { header: `Authorization: Basic ${b64}`, secrets: [this.token, b64] };
  }
}
