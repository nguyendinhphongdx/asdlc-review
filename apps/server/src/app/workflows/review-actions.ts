import type { Logger } from "../../kernel/logger.js";
import { ModuleError } from "../../kernel/errors.js";
import type { Modules } from "../modules.js";
import type { ProgressHub } from "../progress.js";
import type { RunControl } from "./run-control.js";
import { toSnapshot } from "./mappers.js";

/** Hành động do người dùng bấm trên trang review: đăng comment tổng hợp đã sửa, merge MR. */
export function createReviewActions(m: Modules, log: Logger, control?: RunControl, hub?: ProgressHub) {
  const info = async (mrId: string) => {
    const mr = await m.reviews.getMr(mrId);
    const repo = await m.repos.get(mr.repositoryId);
    const platform = repo.platform as "gitlab" | "github";
    return { mr, repo, platform, scm: await m.scm.getMergeRequest(platform, repo.fullPath, mr.iid) };
  };
  return {
    /** Đăng (hoặc cập nhật nếu đã có) comment tổng hợp với nội dung người dùng đã sửa; ghi lại link vào run. */
    async postComment(runId: string, body: string): Promise<{ url: string | null }> {
      const text = body.trim();
      if (text.length < 5) throw new ModuleError("reviews", "invalid_input", "Nội dung comment quá ngắn");
      const run = await m.reviews.getRun(runId);
      const { scm } = await info(run.mr.id);
      const url = (await m.scm.upsertSummaryNote(scm, `${m.publisher.summaryMarker}\n${text}`, m.publisher.summaryMarker)) ?? null;
      await m.reviews.setCommentUrl(runId, url);
      log.info("đăng comment tổng hợp do người dùng sửa", { runId });
      return { url };
    },
    /**
     * Dừng một lần review đang chờ/đang chạy. Đang chạy trong tiến trình này: huỷ tín hiệu, tiến trình AI bị kill và workflow tự ghi nhận
     * "đã dừng". Đang xếp hàng (hoặc run mồ côi): đánh dấu dừng ngay để worker bỏ qua khi nhận job.
     */
    async cancel(runId: string): Promise<{ status: "cancelling" | "cancelled" }> {
      const run = await m.reviews.getRun(runId);
      if (run.status !== "queued" && run.status !== "running") throw new ModuleError("reviews", "conflict", "Lần review này đã kết thúc nên không dừng được");
      if (control?.abort(runId)) { log.info("yêu cầu dừng review đang chạy", { runId }); return { status: "cancelling" }; }
      await m.reviews.cancelRun(runId, "Đã dừng bởi người dùng", hub?.backlog(runId));
      log.info("dừng review (không có tiến trình đang chạy)", { runId });
      return { status: "cancelled" };
    },
    /** Merge MR trên nền tảng (chỉ khi còn mở), rồi đồng bộ trạng thái về DB. */
    async merge(mrId: string): Promise<{ state: string }> {
      const { mr, repo, scm } = await info(mrId);
      if (scm.state !== "opened") throw new ModuleError("reviews", "conflict", `MR không còn mở (${scm.state})`);
      await m.scm.mergeMergeRequest(scm);
      const after = await m.scm.getMergeRequest(scm.platform, repo.fullPath, mr.iid);
      await m.reviews.upsertMr(toSnapshot(after, repo.id, mr.memberId));
      log.info("merge MR", { mrId, iid: mr.iid, state: after.state });
      return { state: after.state };
    },
  };
}
