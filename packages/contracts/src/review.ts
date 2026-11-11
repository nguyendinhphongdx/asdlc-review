import { z } from "zod";
import { FindingSchema, type Finding } from "./finding.js";
import type { ScoreResult } from "./rubric.js";

/** Hợp đồng đầu ra mà mọi provider AI phải trả về. */
export const RawReviewSchema = z.object({
  summary: z.string(),
  intent: z.string().default(""),
  findings: z.array(FindingSchema).default([]),
  strengths: z.array(z.string()).default([]),
  harnessUsed: z.array(z.string()).default([]),
});
export type RawReview = z.infer<typeof RawReviewSchema>;

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
