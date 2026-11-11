import type { HarnessReportDto } from "@mrd/contracts";
import type { Grade, RunStatus, ReviewTrigger, Verdict } from "@mrd/contracts";

export interface MrSnapshot {
  repositoryId: string;
  iid: number;
  title: string;
  description: string;
  webUrl: string;
  sourceBranch: string;
  targetBranch: string;
  authorUsername: string;
  memberId?: string | null;
  state: "opened" | "merged" | "closed";
  draft: boolean;
  openedAt: Date;
  mergedAt?: Date | null;
  closedAt?: Date | null;
}

export interface MrDto extends Omit<MrSnapshot, "memberId" | "mergedAt" | "closedAt"> {
  id: string;
  memberId: string | null;
  mergedAt: Date | null;
  closedAt: Date | null;
  firstReviewAt: Date | null;
  firstScore: number | null;
  latestScore: number | null;
  reviewCount: number;
}

export interface StartRunInput {
  mrId: string;
  trigger: ReviewTrigger;
  triggeredBy?: string | null;
  headSha: string;
  baseSha?: string | null;
  provider?: string | null;
  frameworkId?: string | null;
  frameworkVersion?: string | null;
  commits?: number;
}

export interface FindingRecord {
  source: "ai" | "static";
  category: string;
  ruleId?: string | null;
  severity: string;
  kind: string;
  title: string;
  file?: string | null;
  lineStart?: number | null;
  lineEnd?: number | null;
  why: string;
  evidence?: string | null;
  suggestion?: string | null;
  question?: string | null;
  confidence: number;
  deduction: number;
}

export interface FindingDto extends FindingRecord {
  id: string;
  fingerprint: string;
  feedback: string | null;
}

export interface CategoryScoreRecord {
  category: string;
  name: string;
  weight: number;
  score: number;
  deduction: number;
  findings: number;
}

export interface RunResult {
  score: number;
  rawScore: number;
  grade: Grade;
  verdict: Verdict;
  gates: { id: string; reason: string; cap: number }[];
  summary: string;
  intent: string;
  strengths: string[];
  harnessFiles: string[];
  filesChanged: number;
  additions: number;
  deletions: number;
  durationMs: number;
  costUsd?: number | null;
  model?: string | null;
  commentUrl?: string | null;
  stageTimings?: Record<string, number>;
  omittedFiles?: string[];
  frameworkId?: string | null;
  frameworkVersion?: string | null;
  harnessReport?: unknown;
  findings: FindingRecord[];
  categoryScores: CategoryScoreRecord[];
}

export interface RunSummary {
  id: string;
  mergeRequestId: string;
  round: number;
  status: RunStatus;
  stage: string | null;
  trigger: string;
  triggeredBy: string | null;
  headSha: string;
  provider: string | null;
  model: string | null;
  score: number | null;
  grade: string | null;
  verdict: string | null;
  filesChanged: number;
  additions: number;
  deletions: number;
  durationMs: number | null;
  costUsd: number | null;
  error: string | null;
  createdAt: Date;
  finishedAt: Date | null;
}

export interface RunListItem extends RunSummary {
  mr: { id: string; iid: number; title: string; webUrl: string; authorUsername: string; memberId: string | null; repositoryId: string };
  findingCounts: Record<string, number>;
}

export interface RunDetail extends RunSummary {
  mr: MrDto;
  frameworkId: string | null;
  frameworkVersion: string | null;
  baseSha: string | null;
  rawScore: number | null;
  gates: { id: string; reason: string; cap: number }[];
  summary: string | null;
  intent: string | null;
  strengths: string[];
  harnessFiles: string[];
  commits: number;
  commentUrl: string | null;
  stageTimings: Record<string, number>;
  omittedFiles: string[];
  harnessReport: HarnessReportDto | null;
  findings: FindingDto[];
  categoryScores: CategoryScoreRecord[];
}

export interface RunFilter {
  repositoryId?: string;
  memberId?: string;
  mrId?: string;
  status?: string;
  minScore?: number;
  maxScore?: number;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

/** Dữ liệu thô cho phân tích: mỗi MR kèm các run thành công trong khoảng thời gian. */
export interface MrFact {
  mrId: string;
  repositoryId: string;
  iid: number;
  title: string;
  authorUsername: string;
  memberId: string | null;
  state: string;
  openedAt: Date;
  mergedAt: Date | null;
  firstScore: number | null;
  runs: {
    id: string;
    round: number;
    createdAt: Date;
    score: number | null;
    grade: string | null;
    filesChanged: number;
    additions: number;
    deletions: number;
    durationMs: number | null;
    costUsd: number | null;
    findings: { category: string; ruleId: string | null; severity: string; kind: string; title: string }[];
  }[];
}
