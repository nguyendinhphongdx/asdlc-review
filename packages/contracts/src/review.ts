import { z } from "zod";
import { FindingSchema, type Finding } from "./finding.js";
import type { ScoreResult } from "./rubric.js";

/** Kết quả AI tự khai cho từng rule của rubric (checklist). "unchecked" do code gán cho rule AI không nhắc tới. */
export const RuleCheckSchema = z.object({ ruleId: z.string(), status: z.enum(["pass", "fail", "na"]), note: z.string().default("") });
export type RuleCheck = z.infer<typeof RuleCheckSchema>;

/** Hợp đồng đầu ra mà mọi provider AI phải trả về. */
export const RawReviewSchema = z.object({
  summary: z.string(),
  intent: z.string().default(""),
  findings: z.array(FindingSchema).default([]),
  strengths: z.array(z.string()).default([]),
  harnessUsed: z.array(z.string()).default([]),
  checks: z.array(RuleCheckSchema).default([]),
});
export type RawReview = z.infer<typeof RawReviewSchema>;

export interface RuleCheckDto {
  ruleId: string;
  category: string;
  categoryName: string;
  title: string;
  /** Mức độ mặc định của rule trong framework. */
  severity: import("./finding.js").Severity;
  /** pass/fail/na do AI khai (fail luôn khớp finding); unchecked = AI không báo cáo rule này. */
  status: "pass" | "fail" | "na" | "unchecked";
  note: string;
}
export interface HarnessLoadItemDto {
  path: string;
  kind: string;
  size: number;
  /** Số ký tự đã nạp (0 nếu không nạp). */
  chars: number;
  loaded: boolean;
  truncated: boolean;
  reason?: string;
  /** File dẫn tới file này (tìm thấy qua liên kết, không phụ thuộc vị trí). */
  via?: string;
  /** AI nêu file này trong harnessUsed (đã tham chiếu khi review). */
  cited: boolean;
}
export interface HarnessLoadDto { items: HarnessLoadItemDto[]; totalRepoFiles: number; loadedChars: number }
export interface FileReviewDto {
  path: string;
  additions: number;
  deletions: number;
  binary: boolean;
  /** false = file bị bỏ qua khỏi diff gửi AI (vượt ngân sách). */
  reviewed: boolean;
}

export type Platform = "gitlab" | "github";
export type ReviewTrigger = "webhook" | "comment" | "manual" | "chat" | "poll";
export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "skipped";

export interface ReviewJobData {
  platform: Platform;
  projectPath: string;
  iid: number;
  trigger: ReviewTrigger;
  triggeredBy?: string;
  force?: boolean;
  /** Run đã tạo sẵn (status queued) lúc xếp hàng: worker nhận lại đúng run này thay vì tạo run mới. */
  runId?: string;
  mrId?: string;
}

export interface MrSummaryDto {
  title: string;
  iid: number;
  webUrl: string;
  author: string;
  sourceBranch: string;
  targetBranch: string;
  headSha: string;
}

/** Dữ liệu publisher cần để dựng comment. */
export interface ReviewReport {
  mr: MrSummaryDto;
  score: ScoreResult;
  summary: string;
  intent: string;
  strengths: string[];
  findings: (Finding & { deduction: number })[];
  stats: { filesChanged: number; additions: number; deletions: number; durationSec: number };
  harnessFiles: string[];
  frameworkLabel: string;
  provider: string;
  dashboardUrl?: string;
  language: string;
  /** File bị bỏ qua vì diff vượt ngân sách (review một phần). */
  omittedFiles?: string[];
}
