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
  status: "pending" | "queued" | "running" | "failed";
  runId?: string;
  /** Giai đoạn hiện tại của run đang chờ/chạy (queue | clone | … | publish). */
  stage?: string;
  /** Lý do lỗi của lần review gần nhất ở commit này (status = failed). */
  error?: string;
}
export interface InboxDto {
  items: InboxItemDto[];
  /** Lần poll gần nhất (null nếu chưa poll từ lúc khởi động). */
  polledAt: string | null;
  /** Poller tự chạy và tự xếp hàng review cho repo bật tự động. */
  autoPolling: boolean;
  errors: { repo: string; message: string }[];
  /** GitLab đã có token chưa (chưa có thì poller không làm gì). */
  connected: boolean;
  /** Số repo đã thêm và đang bật / số repo poll thành công ở lần gần nhất. */
  repos: { enabled: number; polled: number };
  /** Tổng MR đang mở thấy được ở lần poll gần nhất (kể cả MR đã review). */
  openMrs: number;
}
