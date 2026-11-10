import type { RunStatus } from "@mrd/contracts";
import type { MrDto, RunSummary } from "../domain/types.js";

export const parse = <T>(v: string | null | undefined, fallback: T): T => {
  if (!v) return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
};

export const toMrDto = (m: {
  id: string; repositoryId: string; iid: number; title: string; description: string; webUrl: string; sourceBranch: string; targetBranch: string;
  authorUsername: string; memberId: string | null; state: string; draft: boolean; openedAt: Date; mergedAt: Date | null; closedAt: Date | null;
  firstReviewAt: Date | null; firstScore: number | null; latestScore: number | null; reviewCount: number;
}): MrDto => ({ ...m, state: m.state as MrDto["state"] });

export const toRunSummary = (r: {
  id: string; mergeRequestId: string; round: number; status: string; stage: string | null; trigger: string; triggeredBy: string | null; headSha: string;
  provider: string | null; model: string | null; score: number | null; grade: string | null; verdict: string | null; filesChanged: number; additions: number;
  deletions: number; durationMs: number | null; costUsd: number | null; error: string | null; createdAt: Date; finishedAt: Date | null;
}): RunSummary => ({
  id: r.id, mergeRequestId: r.mergeRequestId, round: r.round, status: r.status as RunStatus, stage: r.stage, trigger: r.trigger, triggeredBy: r.triggeredBy,
  headSha: r.headSha, provider: r.provider, model: r.model, score: r.score, grade: r.grade, verdict: r.verdict, filesChanged: r.filesChanged,
  additions: r.additions, deletions: r.deletions, durationMs: r.durationMs, costUsd: r.costUsd, error: r.error, createdAt: r.createdAt, finishedAt: r.finishedAt,
});
