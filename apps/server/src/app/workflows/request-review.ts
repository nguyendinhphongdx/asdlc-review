import type { Platform, ReviewJobData, ReviewTrigger } from "@mrd/contracts";
import { ModuleError } from "../../kernel/errors.js";
import type { Logger } from "../../kernel/logger.js";
import type { Modules } from "../modules.js";
import { REVIEW_QUEUE } from "./mappers.js";

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
  | { status: "queued" | "duplicate"; jobId: string }
  | { status: "already_reviewed"; runId: string }
  | { status: "skipped"; reason: string };

/** Quyết định "có xếp hàng review MR này không" rồi enqueue. Không chạy review. */
export function createRequestReview(m: Modules, log: Logger) {
  return async (input: RequestReviewInput): Promise<RequestReviewResult> => {
    if (!m.scm.isConfigured(input.platform)) throw new ModuleError("app", "not_configured", `Chưa cấu hình token ${input.platform}`);
    const auto = input.trigger === "webhook" || input.trigger === "poll";
    const repo = await m.repos.find(input.platform, input.projectPath);
    if (repo && !repo.enabled) return { status: "skipped", reason: "repo đang tắt" };
    if (auto && repo && !repo.autoReview) return { status: "skipped", reason: "repo tắt tự động review" };

    const reviewed = async (headSha: string) => {
      if (input.force || !repo) return null;
      const rec = await m.reviews.findMr(repo.id, input.iid);
      return rec ? m.reviews.findRunByHead(rec.id, headSha) : null;
    };
    if (input.knownHeadSha) {
      const hit = await reviewed(input.knownHeadSha);
      if (hit) return { status: "already_reviewed", runId: hit.id };
    }

    const mr = await m.scm.getMergeRequest(input.platform, input.projectPath, input.iid);
    if (auto && mr.state !== "opened") return { status: "skipped", reason: "MR không còn mở" };
    if (auto && mr.draft) return { status: "skipped", reason: "MR đang là draft" };
    const hit = await reviewed(mr.headSha);
    if (hit) return { status: "already_reviewed", runId: hit.id };

    const data: ReviewJobData = { platform: input.platform, projectPath: mr.projectPath, iid: mr.iid, trigger: input.trigger, triggeredBy: input.triggeredBy, force: input.force };
    const jobId = `${mr.platform}/${mr.projectPath}#${mr.iid}@${mr.headSha.slice(0, 12)}${input.force ? `@f${Date.now()}` : ""}`;
    const res = await m.queue.enqueue(REVIEW_QUEUE, data, { jobId, attempts: 2 });
    log.info(res.deduplicated ? "review đã có trong hàng đợi" : "đã xếp hàng review", { jobId, trigger: input.trigger });
    return { status: res.deduplicated ? "duplicate" : "queued", jobId: res.id };
  };
}
export type RequestReview = ReturnType<typeof createRequestReview>;
