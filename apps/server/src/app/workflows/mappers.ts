import type { MrSnapshot } from "../../modules/reviews/index.js";
import type { MrInfo } from "../../modules/scm/index.js";

export const REVIEW_QUEUE = "review";

/** Model theo provider từ cài đặt chung ("" = mặc định của provider/CLI). */
export const providerModel = (provider: string, s: { claudeModel: string; codexModel: string; geminiModel: string; openaiModel: string }): string =>
  provider === "claude-cli" ? s.claudeModel : provider === "codex-cli" ? s.codexModel : provider === "gemini-api" ? s.geminiModel : s.openaiModel;
export const POLL_QUEUE = "poll";

export const toSnapshot = (mr: MrInfo, repositoryId: string, memberId: string | null): MrSnapshot => ({
  repositoryId, iid: mr.iid, title: mr.title, description: mr.description, webUrl: mr.webUrl, sourceBranch: mr.sourceBranch, targetBranch: mr.targetBranch,
  authorUsername: mr.authorUsername, memberId, state: mr.state, draft: mr.draft, openedAt: mr.createdAt, mergedAt: mr.mergedAt, closedAt: mr.closedAt,
});
