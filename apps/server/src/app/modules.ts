import type { AnalysisApi } from "../modules/analysis/index.js";
import type { AnalyticsApi } from "../modules/analytics/index.js";
import type { FrameworkApi } from "../modules/framework/index.js";
import type { HarnessApi } from "../modules/harness/index.js";
import type { IdentityApi } from "../modules/identity/index.js";
import type { PublisherApi } from "../modules/publisher/index.js";
import type { QueueApi } from "../modules/queue/index.js";
import type { ReposApi } from "../modules/repos/index.js";
import type { ReviewerApi } from "../modules/reviewer/index.js";
import type { ReviewsApi } from "../modules/reviews/index.js";
import type { ScmApi } from "../modules/scm/index.js";
import type { ScoringApi } from "../modules/scoring/index.js";
import type { SettingsApi } from "../modules/settings/index.js";
import type { WorkspaceApi } from "../modules/workspace/index.js";

/** Tập module mà workflow được phép dùng. Chỉ `app/` biết nhiều module cùng lúc. */
export interface Modules {
  scm: ScmApi;
  workspace: WorkspaceApi;
  harness: HarnessApi;
  framework: FrameworkApi;
  analysis: AnalysisApi;
  reviewer: ReviewerApi;
  scoring: ScoringApi;
  publisher: PublisherApi;
  queue: QueueApi;
  identity: IdentityApi;
  repos: ReposApi;
  reviews: ReviewsApi;
  analytics: AnalyticsApi;
  settings: SettingsApi;
}

export interface AppSettings {
  publicUrl: string;
  contextBudgetChars: number;
  diffBudgetChars: number;
  botMention: string;
}
