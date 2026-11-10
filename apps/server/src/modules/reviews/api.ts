import type { Clock } from "../../kernel/clock.js";
import { systemClock } from "../../kernel/clock.js";
import type { Db } from "../../kernel/db.js";
import { ModuleError } from "../../kernel/errors.js";
import type { EventBus } from "../../kernel/event-bus.js";
import type { MrDto, MrFact, MrSnapshot, RunDetail, RunFilter, RunListItem, RunResult, RunSummary, StartRunInput } from "./domain/types.js";
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
  setStage(runId: string, stage: string, timings?: Record<string, number>): Promise<void>;
  completeRun(runId: string, result: RunResult): Promise<void>;
  failRun(runId: string, error: string): Promise<void>;

  /** Run đã có (đang chạy/đã xong) cho đúng commit này của MR: dùng để khử trùng review. */
  findRunByHead(mrId: string, headSha: string): Promise<RunSummary | null>;
  latestSucceeded(mrId: string): Promise<RunDetail | null>;
  getRun(id: string): Promise<RunDetail>;
  listRuns(filter: RunFilter): Promise<{ items: RunListItem[]; total: number }>;
  setFindingFeedback(findingId: string, feedback: "agree" | "disagree" | "fixed" | null): Promise<void>;

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
    startRun: (i) => repo.startRun(i),
    setStage: (id, stage, t) => repo.setStage(id, stage, t),
    async completeRun(runId, result) {
      const { mrId } = await repo.completeRun(runId, result, clock.now());
      deps.events.publish("reviews.run.completed", { runId, mrId, score: result.score, grade: result.grade });
    },
    async failRun(runId, error) {
      const { mrId } = await repo.failRun(runId, error, clock.now());
      deps.events.publish("reviews.run.failed", { runId, mrId, error: error.slice(0, 300) });
    },
    findRunByHead: (mrId, sha) => repo.findRunByHead(mrId, sha),
    latestSucceeded: (mrId) => repo.latestSucceeded(mrId),
    async getRun(id) {
      const r = await repo.getRun(id);
      if (!r) throw new ModuleError("reviews", "not_found", `Không có lần review ${id}`);
      return r;
    },
    listRuns: (f) => repo.listRuns(f),
    setFindingFeedback: (id, fb) => repo.setFeedback(id, fb),
    facts: (range) => repo.facts(range.from, range.to),
  };
}
