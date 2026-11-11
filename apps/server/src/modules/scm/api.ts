import type { Platform } from "@mrd/contracts";
import { ModuleError } from "../../kernel/errors.js";
import type { ConnectionProbe, GitAuth, ProjectProbe, InlineComment, MrInfo, OpenMrRef, ParsedMrUrl, PlatformClient, ScmEvent } from "./domain/types.js";
import { parseGitHubWebhook, parseGitLabWebhook, verifyGitHub, verifyGitLab } from "./domain/webhooks.js";
import { GitHubClient } from "./infra/github.js";
import { GitLabClient } from "./infra/gitlab.js";

type GitlabCreds = { baseUrl: string; token: string; webhookSecret: string };
type GithubCreds = { token: string; webhookSecret: string };
export interface ScmDeps {
  /** Object cố định, hoặc hàm trả giá trị hiện tại (để đổi token lúc chạy mà không dựng lại module). */
  gitlab: GitlabCreds | (() => GitlabCreds);
  github: GithubCreds | (() => GithubCreds);
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
  /** Kiểm tra kết nối GitLab: URL, token, scope, hạn dùng, số repo. Không ném lỗi: trả kết quả. */
  testConnection(platform: Platform): Promise<ConnectionProbe>;
  /** Kiểm tra token truy cập được repo và có đủ quyền tạo webhook không. */
  checkProject(platform: Platform, projectPath: string): Promise<ProjectProbe>;
  /** Tạo (hoặc cập nhật nếu đã có hook cùng URL) webhook MR + comment. */
  createWebhook(platform: Platform, projectPath: string, url: string): Promise<void>;
}

export function createScmModule(deps: ScmDeps): ScmApi {
  const gl = () => (typeof deps.gitlab === "function" ? deps.gitlab() : deps.gitlab);
  const gh = () => (typeof deps.github === "function" ? deps.github() : deps.github);
  const gitlab = () => new GitLabClient(gl().baseUrl, gl().token);
  const client = (p: Platform): PlatformClient => {
    if (p === "gitlab") return gitlab();
    if (p === "github") return new GitHubClient(gh().token);
    throw new ModuleError("scm", "invalid_input", `Nền tảng không hỗ trợ: ${p}`);
  };
  const gitlabHost = () => {
    try {
      return new URL(gl().baseUrl).host;
    } catch {
      return "";
    }
  };
  const glOnly = (p: Platform) => {
    if (p !== "gitlab") throw new ModuleError("scm", "invalid_input", "Chỉ hỗ trợ GitLab");
    return gitlab();
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
      if (gl?.[1] && gl[2] && url.host === gitlabHost()) return { platform: "gitlab", projectPath: decodeURIComponent(gl[1]), iid: Number(gl[2]) };
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
      if (url.host === gitlabHost()) return { platform: "gitlab", projectPath: decodeURIComponent(path), webUrl: `${url.origin}/${path}` };
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
    webhookConfigured: (p) => Boolean(p === "gitlab" ? gl().webhookSecret : gh().webhookSecret),
    verifyWebhook: (p, headers, raw) => (p === "gitlab" ? verifyGitLab(headers, gl().webhookSecret) : verifyGitHub(headers, raw, gh().webhookSecret)),
    testConnection: (p) => glOnly(p).probe(),
    checkProject: (p, path) => glOnly(p).probeProject(path),
    createWebhook: (p, path, url) => glOnly(p).ensureWebhook(path, url, gl().webhookSecret),
    parseWebhook: (p, headers, payload) => (p === "gitlab" ? parseGitLabWebhook(headers, payload, deps.botMention) : parseGitHubWebhook(headers, payload, deps.botMention)),
  };
}
