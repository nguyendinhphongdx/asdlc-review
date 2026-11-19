import type { OverviewBlock } from "@mrd/contracts";
import type { Clock } from "../../kernel/clock.js";
import { systemClock } from "../../kernel/clock.js";
import type { Db } from "../../kernel/db.js";
import { ModuleError } from "../../kernel/errors.js";
import type { EventBus } from "../../kernel/event-bus.js";
import type { MrDto, MrFact, MrSnapshot, RunDetail, RunFilter, RunListItem, RunResult, RunSummary, StartRunInput, RuleStats, UsageRunRow } from "./domain/types.js";
import { ReviewRepository } from "./infra/repository.js";

export interface ReviewsDeps {
  db: Db;
  events: EventBus;
  clock?: Clock;
}

export interface ReviewsApi {
  upsertMr(snapshot: MrSnapshot): Promise<MrDto>;
  getMr(id: string): Promise<MrDto>;
  findMr(repositoryId: string, iid: number): Promise<MrDto | null>;
  listMrs(filter: { repositoryId?: string; memberId?: string; state?: string; limit?: number; offset?: number }): Promise<{ items: MrDto[]; total: number }>;

  startRun(input: StartRunInput): Promise<{ runId: string; round: number }>;
  /** Tạo run ở trạng thái `queued` ngay lúc xếp hàng, để UI thấy được trước khi worker nhận việc. */
  queueRun(input: StartRunInput): Promise<{ runId: string; round: number }>;
  /** Worker bắt đầu chạy run đã xếp hàng (cũng dùng khi thử lại run lỗi). Trả thời gian đã chờ trong hàng đợi. */
  beginRun(runId: string, provider?: string | null): Promise<{ waitedMs: number }>;
  /** Ghi provider thực tế dùng cho run (biết sau khi nạp cấu hình repo, tức sau khi nhận việc). */
  setProvider(runId: string, provider: string): Promise<void>;
  /** Cache T2: mô tả thiết kế hiện tại của khu vực tại một base commit. */
  getDesignMap(repoId: string, baseSha: string, areaId: string): Promise<string | null>;
  saveDesignMap(repoId: string, baseSha: string, areaId: string, text: string): Promise<void>;
  setStage(runId: string, stage: string, timings?: Record<string, number>): Promise<void>;
  completeRun(runId: string, result: RunResult): Promise<void>;
  failRun(runId: string, error: string, activity?: unknown[]): Promise<void>;

  /** Run đã có (đang chạy/đã xong) cho đúng commit này của MR: dùng để khử trùng review. */
  findRunByHead(mrId: string, headSha: string): Promise<RunSummary | null>;
  /** Run mới nhất của đúng commit này, bất kể trạng thái (để biết lần trước đã lỗi). */
  latestRunByHead(mrId: string, headSha: string): Promise<RunSummary | null>;
  /** Lưu nhật ký tiến trình khi run còn chạy (để không mất khi app dừng đột ngột). */
  saveActivity(runId: string, activity: unknown[]): Promise<void>;
  /** Đánh dấu lỗi các run kẹt: `running` (khi khởi động) hoặc quá hạn. Trả số run đã xử lý. */
  failStale(opts: { olderThanMs: number; statuses: ("running" | "queued")[]; reason: string }): Promise<number>;
  latestSucceeded(mrId: string): Promise<RunDetail | null>;
  getRun(id: string): Promise<RunDetail>;
  /** Thêm một khối sơ đồ vào tổng quan của lần review hoàn tất gần nhất của MR (do agent chat tạo theo yêu cầu). Trả null nếu MR chưa có review. */
  appendBlock(mrId: string, block: OverviewBlock): Promise<{ runId: string; total: number } | null>;
  /** Ghi link comment tổng hợp sau khi người dùng đăng tay. */
  setCommentUrl(runId: string, url: string | null): Promise<void>;
  listRuns(filter: RunFilter): Promise<{ items: RunListItem[]; total: number }>;
  setFindingFeedback(findingId: string, feedback: "agree" | "disagree" | "fixed" | null): Promise<void>;

  /** Mọi run đã kết thúc (thành công/lỗi) trong khoảng, kèm chi phí/token — cho thống kê usage. */
  usageRows(range: { from: Date; to: Date }): Promise<UsageRunRow[]>;
  /** Số finding theo rule + phản hồi của người dùng trên các run thành công gần nhất dùng framework này. */
  ruleStats(frameworkId: string, limitRuns?: number): Promise<RuleStats>;

  /** Dữ kiện thô cho phân tích (module khác tự tính metric). */
  facts(range: { from: Date; to: Date }): Promise<MrFact[]>;
}

export function createReviewsModule(deps: ReviewsDeps): ReviewsApi {
  const repo = new ReviewRepository(deps.db);
  const clock = deps.clock ?? systemClock;
  return {
    upsertMr: (s) => repo.upsertMr(s),
    async getMr(id) {
      const m = await repo.getMr(id);
      if (!m) throw new ModuleError("reviews", "not_found", `Không có MR ${id}`);
      return m;
    },
    findMr: (repositoryId, iid) => repo.findMr(repositoryId, iid),
    listMrs: (f) => repo.listMrs(f),
    async startRun(i) {
      const r = await repo.startRun(i);
      deps.events.publish("reviews.run.status", { runId: r.runId, mrId: i.mrId, status: "running", stage: "start" });
      return r;
    },
    async queueRun(i) {
      const r = await repo.startRun(i, "queued");
      deps.events.publish("reviews.run.status", { runId: r.runId, mrId: i.mrId, status: "queued", stage: "queue" });
      return r;
    },
    async beginRun(runId, provider) {
      const { mrId, waitedMs } = await repo.beginRun(runId, provider ?? null, clock.now());
      deps.events.publish("reviews.run.status", { runId, mrId, status: "running", stage: "start" });
      return { waitedMs };
    },
    setProvider: (id, provider) => repo.setProvider(id, provider),
    getDesignMap: (repoId, baseSha, areaId) => repo.getDesignMap(repoId, baseSha, areaId),
    saveDesignMap: (repoId, baseSha, areaId, text) => repo.saveDesignMap(repoId, baseSha, areaId, text),
    async setStage(id, stage, t) {
      const { mrId } = await repo.setStage(id, stage, t);
      deps.events.publish("reviews.run.status", { runId: id, mrId, status: "running", stage });
    },
    async completeRun(runId, result) {
      const { mrId } = await repo.completeRun(runId, result, clock.now());
      deps.events.publish("reviews.run.completed", { runId, mrId, score: result.score, grade: result.grade });
    },
    async failRun(runId, error, activity) {
      const { mrId } = await repo.failRun(runId, error, clock.now(), activity);
      deps.events.publish("reviews.run.failed", { runId, mrId, error: error.slice(0, 300) });
    },
    findRunByHead: (mrId, sha) => repo.findRunByHead(mrId, sha),
    latestRunByHead: (mrId, sha) => repo.latestRunByHead(mrId, sha),
    saveActivity: (runId, activity) => repo.saveActivity(runId, activity),
    failStale: (o) => repo.failStale(o, clock.now()),
    latestSucceeded: (mrId) => repo.latestSucceeded(mrId),
    async getRun(id) {
      const r = await repo.getRun(id);
      if (!r) throw new ModuleError("reviews", "not_found", `Không có lần review ${id}`);
      return r;
    },
    async appendBlock(mrId, block) {
      const run = await repo.latestSucceeded(mrId);
      if (!run) return null;
      const all = await repo.appendBlock(run.id, block);
      return { runId: run.id, total: all.length };
    },
    setCommentUrl: (id, url) => repo.setCommentUrl(id, url),
    listRuns: (f) => repo.listRuns(f),
    setFindingFeedback: (id, fb) => repo.setFeedback(id, fb),
    usageRows: (r) => repo.usageRows(r.from, r.to),
    ruleStats: (id, n = 50) => repo.ruleStats(id, n),
    facts: (range) => repo.facts(range.from, range.to),
  };
}
