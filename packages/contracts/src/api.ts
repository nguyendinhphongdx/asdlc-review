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
  /** Độ phủ harness của repo tại thời điểm review (null với review cũ). */
  harnessReport: import("./framework.js").HarnessReportDto | null;
  /** Checklist theo rule của framework (rỗng với review cũ). */
  /** Harness đã nạp: từng file, kích thước, nạp đủ hay không (null với review cũ). */
  harnessLoad: import("./review.js").HarnessLoadDto | null;
  /** Nhật ký hoạt động của lần review (rỗng với review cũ). */
  activity: import("./events.js").RunActivityEntry[];
  ruleChecks: import("./review.js").RuleCheckDto[];
  /** "Đánh giá tổng quan" theo khung framework (rỗng với review cũ hoặc framework tắt). */
  overview: import("./review.js").OverviewSectionDto[];
  /** Mô tả MR + kiểm tra tài liệu theo chuẩn (null với review cũ). */
  mrDescription: import("./review.js").MrDescriptionDto | null;
  /** Bộ nhớ/ghi chú/vòng trước đã nạp cho AI (null với review cũ). */
  aiContext: import("./review.js").AiContextDto | null;
  /** Danh sách file đổi và trạng thái được review (rỗng với review cũ). */
  files: import("./review.js").FileReviewDto[];
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
  /** Model riêng của repo; null = theo cài đặt chung của provider. */
  model: string | null;
  enabled: boolean;
  autoReview: boolean;
  /** null = theo cài đặt chung. */
  skipDrafts: boolean | null;
  /** Nhánh đích (phân tách dấu phẩy, hỗ trợ *) mà repo tự review; null = mọi nhánh. */
  targetBranches: string | null;
  /** null = theo framework. */
  publishComments: boolean | null;
  diffBudgetChars: number | null;
  lastPolledAt: string | null;
  /** Tóm tắt webhook (null nếu chưa có dữ liệu). */
  webhook?: { status: import("./connection.js").WebhookStatus; lastEventAt: string | null };
}

export interface SettingsDto {
  reviewProvider: "claude-cli" | "codex-cli" | "gemini-api" | "openai-compatible";
  defaultFramework: string;
  claudeModel: string;
  codexModel: string;
  geminiModel: string;
  openaiModel: string;
  chatModel: string;
  passScore: number;
  /** Bỏ qua MR nháp (Draft/WIP) khi review tự động. */
  skipDrafts: boolean;
  /** Ngân sách ký tự cho diff gửi AI; file ưu tiên thấp bị bỏ qua khi vượt. */
  diffBudgetChars: number;
  /** Trần chi phí (USD) mỗi lần review bằng Claude CLI; 0 = không giới hạn. */
  maxBudgetUsd: number;
  /** Thư mục lưu repo clone + thư mục làm việc tạm; rỗng = mặc định trong thư mục dữ liệu của app. */
  workDir: string;
  /** polling = app tự quét GitLab định kỳ; webhook = GitLab gọi về (cần địa chỉ công khai); manual = chỉ review khi bấm. */
  triggerMode: "polling" | "webhook" | "manual";
  /** Chu kỳ quét (phút) khi triggerMode = polling. */
  pollIntervalMin: number;
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
  kind: import("./framework.js").FrameworkKind;
  baseId: string | null;
  categories: { id: string; name: string; weight: number; criteria: number }[];
  ruleCount: number;
  /** Số repo đang dùng (null = chưa tính). */
  repoCount: number;
  updatedAt: string | null;
}

export type RubricDto = Rubric;

export interface HealthDto {
  ok: boolean;
  /** Phiên bản app (rỗng khi chạy server thuần, không qua vỏ desktop). */
  version: string;
  queue: "bullmq" | "memory" | "sqlite";
  gitlab: { configured: boolean; webhook: boolean };
  github: { configured: boolean; webhook: boolean };
}

export type RequestReviewResultDto =
  /** `queued`: đã tạo run ở trạng thái chờ. `duplicate`: MR này đang có run chờ/chạy ở đúng commit, trả về run đó. */
  | { status: "queued" | "duplicate"; jobId: string; runId: string }
  | { status: "already_reviewed"; runId: string }
  | { status: "skipped"; reason: string };
