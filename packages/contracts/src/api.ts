/** DTO của REST API (ngày giờ ở dạng chuỗi ISO). Dùng chung giữa server và web. */
import type { Rubric } from "./rubric.js";

export interface RunSummaryDto {
  id: string;
  mergeRequestId: string;
  round: number;
  status: "queued" | "running" | "succeeded" | "failed" | "skipped";
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
  createdAt: string;
  finishedAt: string | null;
}

export interface MrDto {
  id: string;
  repositoryId: string;
  iid: number;
  title: string;
  description: string;
  webUrl: string;
  sourceBranch: string;
  targetBranch: string;
  authorUsername: string;
  memberId: string | null;
  state: "opened" | "merged" | "closed";
  draft: boolean;
  openedAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  firstReviewAt: string | null;
  firstScore: number | null;
  latestScore: number | null;
  reviewCount: number;
}

export interface RunListItemDto extends RunSummaryDto {
  mr: Pick<MrDto, "id" | "iid" | "title" | "webUrl" | "authorUsername" | "memberId" | "repositoryId">;
  findingCounts: Record<string, number>;
}

export interface FindingDto {
  id: string;
  source: "ai" | "static";
  category: string;
  ruleId: string | null;
  severity: string;
  kind: string;
  title: string;
  file: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  why: string;
  evidence: string | null;
  suggestion: string | null;
  question: string | null;
  confidence: number;
  deduction: number;
  fingerprint: string;
  feedback: string | null;
}

export interface RunDetailDto extends RunSummaryDto {
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
  /** File bị bỏ qua vì diff vượt ngân sách (review một phần nếu khác rỗng). */
  omittedFiles: string[];
  findings: FindingDto[];
  categoryScores: { category: string; name: string; weight: number; score: number; deduction: number; findings: number }[];
}

export interface Paged<T> {
  items: T[];
  total: number;
}

export interface MemberDto {
  id: string;
  displayName: string;
  email: string | null;
  team: string | null;
  role: string | null;
  active: boolean;
  identities: { platform: string; username: string }[];
}

export interface RepoDto {
  id: string;
  platform: string;
  fullPath: string;
  webUrl: string;
  defaultBranch: string | null;
  frameworkId: string | null;
  provider: string | null;
  enabled: boolean;
  autoReview: boolean;
  lastPolledAt: string | null;
  /** Tóm tắt webhook (null nếu chưa có dữ liệu). */
  webhook?: { status: import("./connection.js").WebhookStatus; lastEventAt: string | null };
}

export interface SettingsDto {
  reviewProvider: "claude-cli" | "codex-cli" | "openai-compatible";
  defaultFramework: string;
  publishComments: boolean;
  inlineMinSeverity: "blocker" | "critical" | "major" | "minor" | "nit";
  maxInlineComments: number;
  passScore: number;
  /** Bỏ qua MR nháp (Draft/WIP) khi review tự động. */
  skipDrafts: boolean;
  /** Ngân sách ký tự cho diff gửi AI; file ưu tiên thấp bị bỏ qua khi vượt. */
  diffBudgetChars: number;
}

export interface ProviderInfoDto {
  id: string;
  label: string;
  agentic: boolean;
  model: string;
  available: boolean;
}

export interface FrameworkInfoDto {
  id: string;
  name: string;
  version: string;
  categories: { id: string; name: string; weight: number; criteria: number }[];
}

export type RubricDto = Rubric;

export interface HealthDto {
  ok: boolean;
  queue: "bullmq" | "memory";
  gitlab: { configured: boolean; webhook: boolean };
  github: { configured: boolean; webhook: boolean };
}

export type RequestReviewResultDto =
  | { status: "queued" | "duplicate"; jobId: string }
  | { status: "already_reviewed"; runId: string }
  | { status: "skipped"; reason: string };
