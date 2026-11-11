/** Hợp đồng API kết nối nền tảng (M0). Token KHÔNG bao giờ nằm trong bất kỳ DTO nào. */

export interface ConnectionStatusDto {
  gitlab: {
    baseUrl: string;
    tokenSet: boolean;
    /** 4 ký tự cuối của token, vd "Xk9f"; null nếu chưa có. */
    tokenHint: string | null;
    /** Nguồn token đang dùng: lưu trong DB (UI), biến môi trường, hoặc chưa có. */
    source: "db" | "env" | "none";
  };
  webhook: { url: string; secretSet: boolean };
  /** Khoá mã hoá đã sẵn sàng (nếu false thì không thể lưu token từ UI). */
  canStoreSecrets: boolean;
}

export interface SaveGitlabConnectionInput {
  baseUrl: string;
  /** Bỏ trống = giữ token hiện tại. */
  token?: string;
}

export type ConnectionErrorCode = "not_configured" | "unreachable" | "unauthorized" | "missing_scope" | "expired" | "no_projects" | "unknown";

export interface ConnectionTestDto {
  ok: boolean;
  checkedAt: string;
  error?: { code: ConnectionErrorCode; message: string; hint?: string };
  user?: { username: string; name: string };
  scopes?: string[];
  expiresAt?: string | null;
  /** Số repo token truy cập được (membership). */
  projectCount?: number;
  llm: { provider: string; label: string; available: boolean; detail?: string };
}

export interface WebhookSecretDto {
  secret: string;
}

export interface RepoCheckDto {
  ok: boolean;
  fullPath?: string;
  webUrl?: string;
  defaultBranch?: string | null;
  /** Token có đủ quyền Maintainer để tạo webhook tự động. */
  canCreateWebhook?: boolean;
  error?: string;
}

export type WebhookResult = "accepted" | "rejected" | "ignored" | "skipped";
export interface WebhookEventDto {
  id: string;
  at: string;
  /** Mô tả ngắn: "Merge request · update", "Note · /review"... */
  event: string;
  result: WebhookResult;
  /** Lý do: "Secret không khớp", "MR nháp (Draft)", "!87 — lệnh chat"... */
  detail: string | null;
}

/** ok = đã nhận sự kiện hợp lệ; none = chưa nhận gì; bad = sự kiện gần nhất bị từ chối (sai secret). */
export type WebhookStatus = "ok" | "none" | "bad";
export interface RepoWebhookDto {
  status: WebhookStatus;
  lastEventAt: string | null;
  rejectedCount: number;
  events: WebhookEventDto[];
}

/** Duyệt repo/MR của tài khoản đã kết nối (không cần dán link). */
export interface DiscoverProjectDto {
  path: string;
  name: string;
  webUrl: string;
  lastActivityAt: string | null;
  /** Đã thêm vào hệ thống chưa. */
  registered: boolean;
}
export interface DiscoverMrDto {
  iid: number;
  title: string;
  authorUsername: string;
  webUrl: string;
  sourceBranch: string;
  targetBranch: string;
  state: "opened" | "merged" | "closed";
  draft: boolean;
  updatedAt: string;
}
