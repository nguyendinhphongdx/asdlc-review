/** Hộp MR chờ review: MR đang mở do poller kéo về (chưa review ở commit hiện tại). */
export interface InboxItemDto {
  repoId: string;
  repoPath: string;
  iid: number;
  title: string;
  authorUsername: string;
  webUrl: string;
  sourceBranch: string;
  targetBranch: string;
  draft: boolean;
  updatedAt: string;
  headSha: string;
  /** pending = chưa có lần review nào cho commit này. */
  status: "pending" | "queued" | "running";
  runId?: string;
}
export interface InboxDto {
  items: InboxItemDto[];
  /** Lần poll gần nhất (null nếu chưa poll từ lúc khởi động). */
  polledAt: string | null;
  /** Poller tự chạy và tự xếp hàng review cho repo bật tự động. */
  autoPolling: boolean;
  errors: { repo: string; message: string }[];
}
