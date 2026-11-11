import type { Finding, RawReview, Rubric } from "@mrd/contracts";

export type ProviderId = "claude-cli" | "codex-cli" | "openai-compatible";

export interface ReviewHarnessFile {
  path: string;
  kind: string;
  content: string;
  truncated: boolean;
}

export interface ReviewRequest {
  provider: ProviderId;
  /** Thư mục checkout của head commit (agent CLI chạy ở đây, chỉ đọc). */
  workdir: string;
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
  ask?(input: { system: string; user: string; workdir: string }): Promise<{ text: string; costUsd: number | null }>;
  run(input: { system: string; user: string; workdir: string; onActivity?: (a: ActivityEvent) => void }): Promise<{ text: string; model: string; costUsd: number | null }>;
}
