import type { Platform } from "@mrd/contracts";
import { ModuleError } from "../../kernel/errors.js";
import type { GitAuth, InlineComment, MrInfo, OpenMrRef, ParsedMrUrl, PlatformClient, ScmEvent } from "./domain/types.js";
import { parseGitHubWebhook, parseGitLabWebhook, verifyGitHub, verifyGitLab } from "./domain/webhooks.js";
import { GitHubClient } from "./infra/github.js";
import { GitLabClient } from "./infra/gitlab.js";

export interface ScmDeps {
  gitlab: { baseUrl: string; token: string; webhookSecret: string };
  github: { token: string; webhookSecret: string };
  /** Chuỗi mention của bot để nhận lệnh trong comment, vd "@mr-reviewer". */
  botMention: string;
}

type Headers = Record<string, string | string[] | undefined>;

export interface ScmApi {
  isConfigured(platform: Platform): boolean;
  parseUrl(url: string): ParsedMrUrl | null;
  /** Link repo (không phải MR): https://host/group/repo(.git). */
  parseProjectUrl(url: string): { platform: Platform; projectPath: string; webUrl: string } | null;
  getMergeRequest(platform: Platform, projectPath: string, iid: number): Promise<MrInfo>;
  listOpen(platform: Platform, projectPath: string, updatedAfter?: Date): Promise<OpenMrRef[]>;
  /** Tạo hoặc cập nhật comment tổng hợp (tìm theo marker). Trả URL comment. */
  upsertSummaryNote(mr: MrInfo, body: string, marker: string): Promise<string | undefined>;
  /** Trả false nếu dòng không nằm trong diff (caller gộp vào comment tổng). */
  postInline(mr: MrInfo, comment: InlineComment): Promise<boolean>;
  reply(mr: MrInfo, body: string): Promise<void>;
  gitAuth(platform: Platform): GitAuth;
  verifyWebhook(platform: Platform, headers: Headers, rawBody: string | Buffer): boolean;
  webhookConfigured(platform: Platform): boolean;
  parseWebhook(platform: Platform, headers: Headers, payload: unknown): ScmEvent | null;
}

export function createScmModule(deps: ScmDeps): ScmApi {
  const clients: Record<Platform, PlatformClient> = {
    gitlab: new GitLabClient(deps.gitlab.baseUrl, deps.gitlab.token),
    github: new GitHubClient(deps.github.token),
  };
  const gitlabHost = new URL(deps.gitlab.baseUrl).host;
  const client = (p: Platform) => {
    const c = clients[p];
    if (!c) throw new ModuleError("scm", "invalid_input", `Nền tảng không hỗ trợ: ${p}`);
    return c;
  };
  return {
    isConfigured: (p) => client(p).isConfigured(),
    parseUrl(input) {
      let url: URL;
      try {
        url = new URL(input.trim());
      } catch {
        return null;
      }
      const gl = url.pathname.match(/^\/(.+?)\/-\/merge_requests\/(\d+)/);
      if (gl?.[1] && gl[2] && url.host === gitlabHost) return { platform: "gitlab", projectPath: decodeURIComponent(gl[1]), iid: Number(gl[2]) };
      const gh = url.pathname.match(/^\/([^/]+\/[^/]+)\/pull\/(\d+)/);
      if (gh?.[1] && gh[2] && url.host === "github.com") return { platform: "github", projectPath: gh[1], iid: Number(gh[2]) };
      return null;
    },
    parseProjectUrl(input) {
      let url: URL;
      try {
        url = new URL(input.trim());
      } catch {
        return null;
      }
      const path = url.pathname.replace(/\/-\/.*$/, "").replace(/\.git$/, "").replace(/^\/|\/$/g, "");
      if (!path.includes("/")) return null;
      if (url.host === gitlabHost) return { platform: "gitlab", projectPath: decodeURIComponent(path), webUrl: `${url.origin}/${path}` };
      if (url.host === "github.com") {
        const [o, r] = path.split("/");
        return o && r ? { platform: "github", projectPath: `${o}/${r}`, webUrl: `https://github.com/${o}/${r}` } : null;
      }
      return null;
    },
    getMergeRequest: (p, path, iid) => client(p).getMergeRequest(path, iid),
    listOpen: (p, path, after) => client(p).listOpen(path, after),
    upsertSummaryNote: (mr, body, marker) => client(mr.platform).upsertSummaryNote(mr, body, marker),
    postInline: (mr, c) => client(mr.platform).postInline(mr, c),
    reply: (mr, body) => client(mr.platform).reply(mr, body),
    gitAuth: (p) => client(p).gitAuth(),
    webhookConfigured: (p) => Boolean(p === "gitlab" ? deps.gitlab.webhookSecret : deps.github.webhookSecret),
    verifyWebhook: (p, headers, raw) => (p === "gitlab" ? verifyGitLab(headers, deps.gitlab.webhookSecret) : verifyGitHub(headers, raw, deps.github.webhookSecret)),
    parseWebhook: (p, headers, payload) => (p === "gitlab" ? parseGitLabWebhook(headers, payload, deps.botMention) : parseGitHubWebhook(headers, payload, deps.botMention)),
  };
}
