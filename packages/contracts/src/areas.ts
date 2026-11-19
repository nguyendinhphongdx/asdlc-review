/**
 * Khu vực thay đổi (T0, tất định): MR được gom theo module/thư mục để review từng phần rồi ghép lại.
 * Xem docs/PLAN-REVIEW-V2.md mục T0/T4.
 */
export type FileRole = "logic" | "test" | "docs" | "config" | "migration" | "generated";

export interface AreaFileDto { path: string; additions: number; deletions: number; role: FileRole }

export interface ChangeAreaDto {
  /** Khoá ổn định theo đường dẫn (dùng làm cache key và id khối UI). */
  id: string;
  label: string;
  files: AreaFileDto[];
  additions: number;
  deletions: number;
  /** 0..1: chạm auth/tiền/dữ liệu/migration, cỡ thay đổi, thiếu test. */
  risk: number;
  riskReasons: string[];
  /** Đổi code logic mà không có test đi kèm trong khu vực. */
  noTests: boolean;
  /** Khu vực khác mà code ở đây import tới (suy từ dòng import thêm vào trong diff). */
  dependsOn: string[];
}

/** Kết quả đánh giá thiết kế toàn MR (T3). */
export type DesignVerdict = "accept" | "conditional" | "rework";
export interface DesignConcernDto { area: string | null; severity: "info" | "minor" | "major"; text: string }
export interface DesignReviewDto {
  verdict: DesignVerdict;
  summary: string;
  concerns: DesignConcernDto[];
  /** Khu vực cần soi kỹ ở T4 (nhãn khu vực). */
  focus: string[];
  /** Gợi ý tách MR (rỗng nếu không cần). */
  splitSuggestion: string;
}
/** Mô tả thiết kế hiện tại của một khu vực (T2), đọc từ code gốc ở base. */
export interface DesignMapDto { area: string; text: string; cached: boolean }

/** Lượt review của một khu vực (T4) để UI hiển thị tiến độ/kết quả từng phần. */
export interface AreaPassDto { area: string; files: number; findings: number; costUsd: number | null; omitted: string[] }

/** Báo cáo khu vực của một lần review: bản đồ T0 (luôn có), lượt T2/T3/T4 khi MR được chia nhỏ. */
export interface AreaReportDto {
  split: boolean;
  /** Vì sao chia/không chia (hiện cho người dùng). */
  reason: string;
  areas: ChangeAreaDto[];
  passes: AreaPassDto[];
  design: DesignReviewDto | null;
  maps: DesignMapDto[];
}
