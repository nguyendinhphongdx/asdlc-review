import type { Platform, ReviewJobData, ReviewTrigger } from "@mrd/contracts";
import { ModuleError } from "../../kernel/errors.js";
import type { Logger } from "../../kernel/logger.js";
import type { Modules } from "../modules.js";
import type { ProgressHub } from "../progress.js";
import { REVIEW_QUEUE, toSnapshot } from "./mappers.js";

export interface RequestReviewInput {
  platform: Platform;
  projectPath: string;
  iid: number;
  trigger: ReviewTrigger;
  triggeredBy?: string;
  force?: boolean;
  /** Head đã biết từ webhook/poller: cho phép bỏ qua sớm mà không gọi API. */
  knownHeadSha?: string;
}

export type RequestReviewResult =
  | { status: "queued" | "duplicate"; jobId: string; runId: string }
  | { status: "already_reviewed"; runId: string }
  | { status: "skipped"; reason: string };

/** Khớp tên nhánh với danh sách `a, release/*, feature-*` (dấu * khớp mọi ký tự). */
export function matchesBranch(list: string, branch: string): boolean {
  return list.split(",").map((s) => s.trim()).filter(Boolean).some((g) => new RegExp(`^${g.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`).test(branch));
}

/** Quyết định "có xếp hàng review MR này không" rồi enqueue. Không chạy review. */
export function createRequestReview(m: Modules, log: Logger, hub?: ProgressHub) {
  return async (input: RequestReviewInput): Promise<RequestReviewResult> => {
    if (!m.scm.isConfigured(input.platform)) throw new ModuleError("app", "not_configured", `Chưa cấu hình token ${input.platform}`);
    const auto = input.trigger === "webhook" || input.trigger === "poll";
    const repo = await m.repos.find(input.platform, input.projectPath);
    if (repo && !repo.enabled) return { status: "skipped", reason: "repo đang tắt" };
    if (auto && repo && !repo.autoReview) return { status: "skipped", reason: "repo tắt tự động review" };

    // Run đang chờ/đang chạy ở đúng commit → trả về run đó (bấm nhiều lần không xếp chồng). Run đã xong chỉ chặn khi không ép.
    const existing = async (headSha: string) => {
      if (!repo) return null;
      const rec = await m.reviews.findMr(repo.id, input.iid);
      const hit = rec ? await m.reviews.findRunByHead(rec.id, headSha) : null;
      if (!hit) return null;
      if (hit.status === "queued" || hit.status === "running") return { status: "duplicate" as const, jobId: hit.id, runId: hit.id };
      return input.force ? null : { status: "already_reviewed" as const, runId: hit.id };
    };
    if (input.knownHeadSha) {
      const hit = await existing(input.knownHeadSha);
      if (hit) return hit;
    }

    const mr = await m.scm.getMergeRequest(input.platform, input.projectPath, input.iid);
    if (auto && mr.state !== "opened") return { status: "skipped", reason: "MR không còn mở" };
    if (auto && mr.draft && (repo?.skipDrafts ?? (await m.settings.get("skipDrafts")))) return { status: "skipped", reason: "MR đang là draft" };
    if (auto && repo?.targetBranches && !matchesBranch(repo.targetBranches, mr.targetBranch)) return { status: "skipped", reason: `nhánh đích ${mr.targetBranch} không nằm trong danh sách của repo` };
    const hit = await existing(mr.headSha);
    if (hit) return hit;
    // Tự động (poll/webhook) không thử lại commit đã lỗi: tránh vòng lặp lỗi + tốn tiền. Bấm "Review lại" để chạy lại.
    if (auto && repo) {
      const rec = await m.reviews.findMr(repo.id, input.iid);
      const last = rec ? await m.reviews.latestRunByHead(rec.id, mr.headSha) : null;
      if (last?.status === "failed") return { status: "skipped", reason: "lần review trước ở commit này đã lỗi (bấm Review lại để thử lại)" };
    }

    // Tạo MR + run ở trạng thái "chờ" NGAY (trước khi worker nhận việc) để UI thấy được và cập nhật theo thời gian thực.
    const repoRec = repo ?? (await m.repos.register({ platform: mr.platform, fullPath: mr.projectPath, webUrl: mr.projectWebUrl, defaultBranch: mr.defaultBranch }));
    const memberId = await m.identity.resolveOrCreate(mr.platform, mr.authorUsername, mr.authorName);
    const rec = await m.reviews.upsertMr(toSnapshot(mr, repoRec.id, memberId));
    const { runId } = await m.reviews.queueRun({ mrId: rec.id, trigger: input.trigger, triggeredBy: input.triggeredBy, headSha: mr.headSha, baseSha: mr.baseSha, commits: mr.commits });

    const data: ReviewJobData = { platform: input.platform, projectPath: mr.projectPath, iid: mr.iid, trigger: input.trigger, triggeredBy: input.triggeredBy, force: input.force, runId, mrId: rec.id };
    const jobId = `${mr.platform}/${mr.projectPath}#${mr.iid}@${mr.headSha.slice(0, 12)}@${runId}`;
    try {
      const stats = await m.queue.stats(REVIEW_QUEUE).catch(() => null);
      const res = await m.queue.enqueue(REVIEW_QUEUE, data, { jobId, attempts: 2 });
      const ahead = stats ? stats.waiting + stats.active : 0;
      hub?.emit(runId, rec.id, "queue", "info", ahead > 0 ? `Đã xếp hàng (${input.trigger}), phía trước có ${ahead} việc — chờ tới lượt` : `Đã xếp hàng (${input.trigger}), sắp chạy`);
      log.info("đã xếp hàng review", { jobId, runId, trigger: input.trigger, ahead });
      return { status: "queued", jobId: res.id, runId };
    } catch (err) {
      // Không để run "chờ" mồ côi nếu không xếp hàng được.
      await m.reviews.failRun(runId, `Không xếp hàng được: ${String((err as Error)?.message ?? err).slice(0, 300)}`, hub?.backlog(runId)).catch(() => undefined);
      throw err;
    }
  };
}
export type RequestReview = ReturnType<typeof createRequestReview>;
