import type { Finding, RawReview, Rubric } from "@mrd/contracts";

/** Ảnh dán vào chat (base64, không kèm tiền tố data:). */
/** Cho agent chat công cụ: đọc repo (Read/Grep/Glob trong workdir) và các tool MCP do app cung cấp. */
export type ChatStep =
  | { kind: "thinking"; text: string }
  | { kind: "tool"; id: string; name: string; input: Record<string, unknown>; output?: string; error?: boolean };
export interface ChatTools { mcpUrl: string; mcpName: string }
export interface ChatImage { mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp"; data: string }

export type ProviderId = "claude-cli" | "codex-cli" | "openai-compatible";

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
  staticFindings: Finding[];
  /** Bài học đã duyệt của repo (sổ tay của agent) cần áp dụng thêm khi review. */
  notebook?: string[];
  /** Nhận hoạt động của AI theo thời gian thực (đọc file nào, đang suy luận…). */
  onActivity?: (a: ActivityEvent) => void;
}

export interface ActivityEvent { kind: "tool" | "ai"; message: string }

export interface ReviewUsage {
  provider: ProviderId;
  model: string;
  costUsd: number | null;
  durationMs: number;
}

export interface ReviewResponse {
  review: RawReview;
  usage: ReviewUsage;
}

/** Hợp đồng cho từng provider: nhận prompt đã dựng, trả văn bản JSON thô. */
export interface Provider {
  readonly id: ProviderId;
  readonly agentic: boolean;
  /** Hỏi đáp tự do, không công cụ (tuỳ chọn). */
  ask?(input: { model?: string; system: string; user: string; workdir: string; images?: ChatImage[]; tools?: ChatTools; onStep?: (steps: ChatStep[]) => void }): Promise<{ text: string; costUsd: number | null; steps?: ChatStep[] }>;
  run(input: { model?: string; system: string; user: string; workdir: string; maxBudgetUsd?: number; onActivity?: (a: ActivityEvent) => void }): Promise<{ text: string; model: string; costUsd: number | null }>;
}
