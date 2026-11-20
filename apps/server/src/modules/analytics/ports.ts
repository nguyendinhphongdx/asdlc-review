import type { UsageTaskKind } from "@mrd/contracts";
/** Dữ kiện thô một MR trong khoảng thời gian (analytics tự định nghĩa thứ nó cần; adapter ở app/ lo phần nối). */
export interface RunFact {
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
}

export interface MrFactRow {
  mrId: string;
  repositoryId: string;
  iid: number;
  title: string;
  authorUsername: string;
  memberId: string | null;
  state: string;
  openedAt: Date;
  mergedAt: Date | null;
  runs: RunFact[];
}

export interface MemberRef {
  id: string;
  name: string;
  usernames: string[];
  active: boolean;
}

export interface RunFactsSource {
  facts(range: { from: Date; to: Date }): Promise<MrFactRow[]>;
}
export interface MemberDirectory {
  list(): Promise<MemberRef[]>;
}
export interface Params {
  passScore(): Promise<number>;
}

/** Một run (mọi trạng thái) với chi phí/token để thống kê usage. */
export interface UsageRow {
  runId: string; mrId: string; iid: number; title: string; repositoryId: string; repoName: string; createdAt: Date; status: string;
  provider: string | null; model: string | null; frameworkId: string | null; costUsd: number | null; durationMs: number | null; score: number | null;
  inputTokens: number | null; outputTokens: number | null; cacheReadTokens: number | null; cacheWriteTokens: number | null;
}
/** Một lần gọi AI (review/T2/T3/khu vực/chat) để biết token đi vào việc nào. */
export interface UsageTask {
  runId: string; mrId: string; repositoryId: string; frameworkId: string | null; kind: UsageTaskKind; createdAt: Date;
  provider: string | null; model: string | null; costUsd: number | null;
  inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number;
}
export interface UsageSource {
  rows(range: { from: Date; to: Date }): Promise<UsageRow[]>;
  tasks(range: { from: Date; to: Date }): Promise<UsageTask[]>;
}
