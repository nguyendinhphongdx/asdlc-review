import { createHmac, timingSafeEqual } from "node:crypto";
import type { ScmEvent } from "./types.js";

type Headers = Record<string, string | string[] | undefined>;
const h = (headers: Headers, name: string) => {
  const v = headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
};
const obj = (v: unknown): Record<string, any> => (v && typeof v === "object" ? (v as Record<string, any>) : {}); // eslint-disable-line @typescript-eslint/no-explicit-any

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function verifyGitLab(headers: Headers, secret: string): boolean {
  const token = h(headers, "x-gitlab-token");
  return Boolean(secret && token && safeEqual(token, secret));
}

export function verifyGitHub(headers: Headers, rawBody: string | Buffer, secret: string): boolean {
  const sig = h(headers, "x-hub-signature-256");
  if (!secret || !sig) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqual(sig, expected);
}

/** `/review` hoặc `@bot review` → yêu cầu review. */
export function isReviewCommand(body: string, mention: string): boolean {
  const text = body.trim().toLowerCase();
  const m = mention.trim().toLowerCase();
  if (/^\/review(\s|$)/.test(text)) return true;
  return Boolean(m) && text.includes(m) && /\breview\b/.test(text.replace(m, ""));
}

export function parseGitLabWebhook(headers: Headers, payload: unknown, mention: string): ScmEvent | null {
  const body = obj(payload);
  const project = obj(body.project).path_with_namespace as string | undefined;
  if (!project) return null;
  const kind = body.object_kind;
  if (kind === "merge_request") {
    const a = obj(body.object_attributes);
    const base = { platform: "gitlab" as const, projectPath: project, iid: Number(a.iid), headSha: obj(a.last_commit).id as string | undefined, draft: Boolean(a.draft ?? a.work_in_progress), actor: obj(body.user).username as string | undefined };
    switch (a.action) {
      case "open":
      case "reopen":
        return { ...base, kind: "mr_opened" };
      case "update":
        return a.oldrev ? { ...base, kind: "mr_updated" } : null; // chỉ khi có commit mới
      case "merge":
        return { ...base, kind: "mr_merged" };
      case "close":
        return { ...base, kind: "mr_closed" };
      default:
        return null;
    }
  }
  if (kind === "note" && obj(body.object_attributes).noteable_type === "MergeRequest") {
    const note = String(obj(body.object_attributes).note ?? "");
    if (!isReviewCommand(note, mention)) return null;
    return { platform: "gitlab", projectPath: project, iid: Number(obj(body.merge_request).iid), kind: "review_requested", actor: obj(body.user).username };
  }
  return null;
}

export function parseGitHubWebhook(headers: Headers, payload: unknown, mention: string): ScmEvent | null {
  const body = obj(payload);
  const event = h(headers, "x-github-event");
  const repo = obj(body.repository).full_name as string | undefined;
  if (!repo) return null;
  if (event === "pull_request") {
    const pr = obj(body.pull_request);
    const base = { platform: "github" as const, projectPath: repo, iid: Number(pr.number), headSha: obj(pr.head).sha as string | undefined, draft: Boolean(pr.draft), actor: obj(body.sender).login as string | undefined };
    switch (body.action) {
      case "opened":
      case "reopened":
      case "ready_for_review":
        return { ...base, kind: "mr_opened" };
      case "synchronize":
        return { ...base, kind: "mr_updated" };
      case "closed":
        return { ...base, kind: pr.merged ? "mr_merged" : "mr_closed" };
      default:
        return null;
    }
  }
  if (event === "issue_comment" && body.action === "created" && obj(body.issue).pull_request) {
    if (!isReviewCommand(String(obj(body.comment).body ?? ""), mention)) return null;
    return { platform: "github", projectPath: repo, iid: Number(obj(body.issue).number), kind: "review_requested", actor: obj(body.sender).login };
  }
  return null;
}
