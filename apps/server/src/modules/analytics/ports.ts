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
