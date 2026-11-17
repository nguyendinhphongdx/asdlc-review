import type { Finding, MrKind, OverviewBlock, ProviderInfoDto, RawReview, Rubric } from "@mrd/contracts";

/** Ảnh dán vào chat (base64, không kèm tiền tố data:). */
/** Cho agent chat công cụ: đọc repo (Read/Grep/Glob trong workdir) và các tool MCP do app cung cấp. */
export type ChatStep =
  | { kind: "thinking"; text: string }
  | { kind: "tool"; id: string; name: string; input: Record<string, unknown>; output?: string; error?: boolean };
export interface ChatTools { mcpUrl: string; mcpName: string }
export interface ChatImage { mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp"; data: string }

/** Id provider là chuỗi mở: thêm provider mới = thêm một mô tả + một file chạy, không sửa kiểu này. */
export type ProviderId = string;

/** Phần tĩnh trong mô tả provider; `available` và `defaultModel` do module ghép lúc chạy. */
export type ProviderDescriptor = Omit<ProviderInfoDto, "available" | "defaultModel">;

export interface ReviewHarnessFile {
  path: string;
  kind: string;
  content: string;
  truncated: boolean;
}

export interface ReviewRequest {
  provider: ProviderId;
  /** Model dùng cho lần này ("" / bỏ trống = mặc định của provider). */
  model?: string;
  /** Thư mục checkout của head commit (agent CLI chạy ở đây, chỉ đọc). */
  workdir: string;
  /** Trần chi phí (USD) cho lần này, hiện chỉ Claude CLI hỗ trợ; 0/bỏ trống = không giới hạn. */
  maxBudgetUsd?: number;
  mr: { iid: number; title: string; description: string; author: string; sourceBranch: string; targetBranch: string; webUrl: string };
  rubric: Rubric;
  harness: { files: ReviewHarnessFile[]; tree: string; discovered: string[] };
  diff: string;
  omittedFiles: string[];
  stats: { filesChanged: number; additions: number; deletions: number };
  /** Loại MR do T0 gắn nhãn; quyết định có yêu cầu AI vẽ sơ đồ hay không. */
  mrKind?: MrKind;
  /** File đổi (để kiểm bằng chứng của sơ đồ có thật). */
  changedFiles?: string[];
  staticFindings: Finding[];
  /** Bài học đã duyệt của repo (sổ tay của agent) cần áp dụng thêm khi review. */
  notebook?: string[];
  /** Ghi chú của người cho AI về MR này (tác giả/người review). */
  notes?: { author: string; text: string }[];
  /** Kết quả vòng review trước (nếu có) để AI kiểm tra lại thay vì bắt đầu từ đầu. */
  previousRound?: { round: number; findings: { title: string; file: string | null; line: number | null; severity: string; status: "fixed" | "dismissed" | "open" }[] };
  /** Nhận hoạt động của AI theo thời gian thực (đọc file nào, đang suy luận…). */
  onActivity?: (a: ActivityEvent) => void;
}

export interface ActivityEvent { kind: "tool" | "ai"; message: string }

/** Token đã dùng (nếu provider báo). */
export interface TokenUsage { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }

export interface ReviewUsage {
  tokens?: TokenUsage;
  provider: ProviderId;
  model: string;
  costUsd: number | null;
  durationMs: number;
}

export interface ReviewResponse {
  review: RawReview;
  /** Sơ đồ tổng quan đã làm sạch (bằng chứng có thật, cỡ giới hạn); rỗng khi loại MR không cần. */
  blocks: OverviewBlock[];
  usage: ReviewUsage;
}

/** Hợp đồng cho từng provider: nhận prompt đã dựng, trả văn bản JSON thô. */
export interface Provider {
  readonly descriptor: ProviderDescriptor;
  /** Hỏi đáp tự do, không công cụ (tuỳ chọn). */
  ask?(input: { model?: string; system: string; user: string; workdir: string; images?: ChatImage[]; tools?: ChatTools; onStep?: (steps: ChatStep[]) => void }): Promise<{ text: string; costUsd: number | null; steps?: ChatStep[] }>;
  run(input: { model?: string; system: string; user: string; workdir: string; maxBudgetUsd?: number; onActivity?: (a: ActivityEvent) => void }): Promise<{ text: string; model: string; costUsd: number | null; tokens?: TokenUsage }>;
}
