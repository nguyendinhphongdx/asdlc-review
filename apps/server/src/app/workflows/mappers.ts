import type { MrSnapshot } from "../../modules/reviews/index.js";
import type { MrInfo } from "../../modules/scm/index.js";

export const REVIEW_QUEUE = "review";

/**
 * Chọn provider + model cho một vai trò dùng AI — NƠI DUY NHẤT quyết định, mọi workflow gọi hàm này.
 * - Vai trò (vd. `chat`) có provider riêng trong `aiRoles` → dùng provider đó + model của vai trò (hoặc model cấu hình cho provider).
 * - Ngược lại dùng provider review (repo có thể ghi đè provider/model riêng).
 * model "" = để provider tự dùng mặc định.
 */
export function resolveAi(
  settings: { reviewProvider: string; providerModels: Record<string, string>; aiRoles: Record<string, { provider: string; model: string }> },
  role: "review" | string,
  repo?: { provider?: string | null; model?: string | null },
): { provider: string; model: string } {
  const r = role === "review" ? undefined : settings.aiRoles[role];
  if (r?.provider) return { provider: r.provider, model: r.model || settings.providerModels[r.provider] || "" };
  const provider = repo?.provider || settings.reviewProvider;
  return { provider, model: repo?.model || settings.providerModels[provider] || "" };
}
export const POLL_QUEUE = "poll";

export const toSnapshot = (mr: MrInfo, repositoryId: string, memberId: string | null): MrSnapshot => ({
  repositoryId, iid: mr.iid, title: mr.title, description: mr.description, webUrl: mr.webUrl, sourceBranch: mr.sourceBranch, targetBranch: mr.targetBranch,
  authorUsername: mr.authorUsername, memberId, state: mr.state, draft: mr.draft, openedAt: mr.createdAt, mergedAt: mr.mergedAt, closedAt: mr.closedAt,
});
