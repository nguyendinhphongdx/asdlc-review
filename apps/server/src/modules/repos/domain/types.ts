export interface RepoDto {
  id: string;
  platform: string;
  fullPath: string;
  webUrl: string;
  defaultBranch: string | null;
  frameworkId: string | null;
  provider: string | null;
  model: string | null;
  enabled: boolean;
  autoReview: boolean;
  skipDrafts: boolean | null;
  targetBranches: string | null;
  publishComments: boolean | null;
  diffBudgetChars: number | null;
  lastPolledAt: Date | null;
}
export interface RegisterRepoInput {
  platform: string;
  fullPath: string;
  webUrl: string;
  defaultBranch?: string | null;
}
export interface RepoPatch {
  frameworkId?: string | null;
  provider?: string | null;
  model?: string | null;
  enabled?: boolean;
  autoReview?: boolean;
  skipDrafts?: boolean | null;
  targetBranches?: string | null;
  publishComments?: boolean | null;
  diffBudgetChars?: number | null;
}

export type WebhookResult = "accepted" | "rejected" | "ignored" | "skipped";
export interface WebhookEventInput {
  event: string;
  result: WebhookResult;
  detail?: string | null;
}
export interface WebhookEventRow {
  id: string;
  at: Date;
  event: string;
  result: WebhookResult;
  detail: string | null;
}
export interface WebhookSummary {
  status: "ok" | "none" | "bad";
  lastEventAt: Date | null;
  rejectedCount: number;
  events: WebhookEventRow[];
}
