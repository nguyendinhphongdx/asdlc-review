/** Trang Usage: chi phí & token của các lượt review AI. */
export interface UsageFilterDto {
  repoIds?: string[];
  providers?: string[];
  models?: string[];
  frameworks?: string[];
  status?: "all" | "succeeded" | "failed";
}

export interface UsageTokensDto { input: number; output: number; cacheRead: number; cacheWrite: number }

export interface UsageTotalsDto {
  costUsd: number;
  runs: number;
  /** Số run có chi phí (provider báo tiền). Provider khác (Gemini/OpenAI/Codex) chỉ có token. */
  runsWithCost: number;
  failedRuns: number;
  failedCostUsd: number;
  tokens: UsageTokensDto;
  avgCostUsd: number | null;
  avgDurationMs: number | null;
  /** cacheRead / (input + cacheRead + cacheWrite): tỉ lệ prompt được cache. */
  cacheHitRate: number | null;
  /** Ngoại suy chi phí 30 ngày từ tốc độ chi tiêu của khoảng đang xem. */
  projectedMonthUsd: number;
  /** Chi phí của khoảng liền trước có cùng độ dài (để so sánh). */
  prevCostUsd: number;
  prevRuns: number;
}

/** `models[model] = [chi phí, token, số run]` để xếp chồng theo model. */
export interface UsageDayDto { date: string; costUsd: number; runs: number; failed: number; input: number; output: number; cache: number; models: Record<string, [number, number, number]> }
export interface UsageSliceDto { key: string; label: string; costUsd: number; runs: number; tokens: number }
export interface UsageRunDto { runId: string; mrId: string; iid: number; title: string; repo: string; at: string; provider: string | null; model: string | null; status: string; costUsd: number | null; tokens: number; durationMs: number | null; score: number | null }
export interface UsageBucketDto { label: string; runs: number }

export interface UsageOptionsDto {
  repos: { id: string; name: string }[];
  providers: string[];
  models: string[];
  frameworks: string[];
}

export interface UsageReportDto {
  range: { from: string; to: string };
  totals: UsageTotalsDto;
  byDay: UsageDayDto[];
  byRepo: UsageSliceDto[];
  byModel: UsageSliceDto[];
  byProvider: UsageSliceDto[];
  byFramework: UsageSliceDto[];
  /** Số run theo thứ (0 = Chủ nhật) × giờ trong ngày. */
  heat: number[][];
  /** Phân bố chi phí mỗi run. */
  costBuckets: UsageBucketDto[];
  topRuns: UsageRunDto[];
  options: UsageOptionsDto;
}
