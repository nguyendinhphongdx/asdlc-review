import type { MrSnapshot } from "../../modules/reviews/index.js";
import type { MrInfo } from "../../modules/scm/index.js";

export const REVIEW_QUEUE = "review";
export const POLL_QUEUE = "poll";

export const toSnapshot = (mr: MrInfo, repositoryId: string, memberId: string | null): MrSnapshot => ({
  repositoryId, iid: mr.iid, title: mr.title, description: mr.description, webUrl: mr.webUrl, sourceBranch: mr.sourceBranch, targetBranch: mr.targetBranch,
  authorUsername: mr.authorUsername, memberId, state: mr.state, draft: mr.draft, openedAt: mr.createdAt, mergedAt: mr.mergedAt, closedAt: mr.closedAt,
});
