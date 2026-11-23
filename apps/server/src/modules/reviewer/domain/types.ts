import type { ChangeAreaDto, DesignReviewDto, Finding, MrKind, OverviewBlock, ProviderInfoDto, RawReview, Rubric } from "@mrd/contracts";

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
  /** Loại bị khoá theo file (docs/test/deps/config): AI không được đổi. */
  mrKindLocked?: boolean;
  /** Lý do T0 chọn loại gợi ý (đưa vào prompt). */
  mrKindReasons?: string[];
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
  /** Huỷ lượt review (người dùng bấm Dừng): kill tiến trình AI đang chạy. */
  signal?: AbortSignal;
  /**
   * Lượt T4: chỉ review MỘT khu vực của MR lớn. `diff` là phần diff của khu vực; không trả overview/sơ đồ/checklist
   * (lượt tổng hợp cuối lo). `designMap` là mô tả thiết kế hiện tại (T2), `designFocus` là trọng tâm do T3 giao.
   */
  focus?: { label: string; files: string[]; others: { label: string; files: number }[]; designMap?: string; designFocus?: string; chunk?: { index: number; total: number } };
  /**
   * Lượt tổng hợp của MR đã review theo khu vực: `diff` chỉ là bản tóm lược (file, số dòng, hunk), finding các khu vực
   * đã nằm trong `staticFindings`. Thêm bản đồ khu vực, thiết kế hiện tại (T2) và đánh giá thiết kế (T3).
   */
  synthesis?: { areas: ChangeAreaDto[]; designMaps: { area: string; text: string }[]; design?: DesignReviewDto | null };
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
  /** Số khối thô AI trả trước khi làm sạch (để giải thích vì sao sơ đồ trống). */
  blocksRaw?: number;
  /** Loại MR cuối cùng (sau khi AI xác nhận/đổi), cùng lý do AI nêu. */
  mrKind?: MrKind;
  mrKindChanged?: boolean;
  mrKindReason?: string | undefined;
  usage: ReviewUsage;
}

/** T2: yêu cầu mô tả thiết kế hiện tại của một khu vực. */
export interface UnderstandRequest {
  provider: ProviderId; model?: string; workdir: string; maxBudgetUsd?: number; language: string;
  mr: { title: string; description: string };
  area: { label: string; files: string[] };
  diff: string;
  harnessText?: string;
  onActivity?: (a: ActivityEvent) => void;
  signal?: AbortSignal;
}
/** T3: yêu cầu đánh giá thiết kế toàn MR. */
export interface DesignRequest {
  provider: ProviderId; model?: string; workdir: string; maxBudgetUsd?: number; language: string;
  mr: { title: string; description: string };
  areas: ChangeAreaDto[];
  designMaps: { area: string; text: string }[];
  digest: string;
  harnessText?: string;
  onActivity?: (a: ActivityEvent) => void;
  signal?: AbortSignal;
}

/** Hợp đồng cho từng provider: nhận prompt đã dựng, trả văn bản JSON thô. */
export interface Provider {
  readonly descriptor: ProviderDescriptor;
  /** Hỏi đáp tự do, không công cụ (tuỳ chọn). */
  ask?(input: { model?: string; system: string; user: string; workdir: string; images?: ChatImage[]; tools?: ChatTools; onStep?: (steps: ChatStep[]) => void }): Promise<{ text: string; costUsd: number | null; steps?: ChatStep[]; tokens?: TokenUsage }>;
  run(input: { model?: string; system: string; user: string; workdir: string; maxBudgetUsd?: number; onActivity?: (a: ActivityEvent) => void; /** Huỷ lượt gọi (kill tiến trình CLI). */ signal?: AbortSignal; /** JSON schema của đầu ra; mặc định là schema review. */ schema?: object }): Promise<{ text: string; model: string; costUsd: number | null; tokens?: TokenUsage }>;
}
