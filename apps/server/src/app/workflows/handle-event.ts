import type { Logger } from "../../kernel/logger.js";
import type { ScmEvent } from "../../modules/scm/index.js";
import type { Modules } from "../modules.js";
import { toSnapshot } from "./mappers.js";
import type { RequestReview, RequestReviewResult } from "./request-review.js";

/** Chuyển sự kiện nền tảng (đã chuẩn hoá bởi scm) thành hành động. */
export function createHandleScmEvent(m: Modules, requestReview: RequestReview, log: Logger) {
  return async (e: ScmEvent): Promise<RequestReviewResult | { status: "synced" | "ignored" }> => {
    switch (e.kind) {
      case "mr_opened":
      case "mr_updated":
        // Chỉ nhận sự kiện MR từ webhook khi ở chế độ webhook; chế độ polling tự quét, manual không tự review.
        if ((await m.settings.get("triggerMode")) !== "webhook") return { status: "ignored" };
        return requestReview({ platform: e.platform, projectPath: e.projectPath, iid: e.iid, trigger: "webhook", triggeredBy: e.actor, knownHeadSha: e.headSha });
      case "review_requested":
        return requestReview({ platform: e.platform, projectPath: e.projectPath, iid: e.iid, trigger: "comment", triggeredBy: e.actor, force: true });
      case "mr_merged":
      case "mr_closed": {
        // Cập nhật trạng thái để tính lead time/tỷ lệ merge.
        const repo = await m.repos.find(e.platform, e.projectPath);
        const rec = repo ? await m.reviews.findMr(repo.id, e.iid) : null;
        if (!repo || !rec) return { status: "ignored" };
        const mr = await m.scm.getMergeRequest(e.platform, e.projectPath, e.iid);
        await m.reviews.upsertMr(toSnapshot(mr, repo.id, rec.memberId));
        log.info("đã đồng bộ trạng thái MR", { iid: e.iid, state: mr.state });
        return { status: "synced" };
      }
    }
  };
}
