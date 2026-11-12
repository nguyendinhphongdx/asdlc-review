import type { Severity } from "./finding.js";

export type Grade = "A" | "B" | "C" | "D" | "F";
export type Verdict = "approve" | "comment" | "request_changes";

export interface RubricCriterion {
  id: string;
  title: string;
  check: string;
  why: string;
  defaultSeverity: Severity;
}

export interface RubricCategory {
  id: string;
  name: string;
  weight: number;
  criteria: RubricCriterion[];
}

export interface RubricGate {
  id: string;
  when: { ruleIds?: string[]; category?: string; minSeverity?: Severity; /** Số finding tối thiểu thoả điều kiện (mặc định 1). */ minCount?: number };
  capTotal: number;
  reason: string;
}

/** Chính sách đăng comment lên MR. Thuộc framework (không phải cài đặt app); `.asdlc.yml` của repo không đổi được. */
export interface PublishPolicy {
  /** Tự đăng comment tổng + inline lên MR. Mặc định tắt: chỉ chấm điểm, xem trên dashboard. */
  comments: boolean;
  inlineMinSeverity: Severity;
  maxInline: number;
}

export type OverviewKind = "text" | "bullets" | "verdict";
/** Một mục của phần "Đánh giá tổng quan": framework quyết định có mục nào, thứ tự, AI được hướng dẫn viết gì. */
export interface OverviewSectionSpec { id: string; title: string; enabled: boolean; kind: OverviewKind; maxWords: number; guide: string; /** Chỉ dùng với kind "verdict": các nhãn AI được chọn (nhãn đầu = tốt nhất). */ verdicts: string[] }
export interface OverviewSpec { /** Hướng dẫn chung: góc nhìn, giọng văn, điều cấm. */ guide: string; sections: OverviewSectionSpec[] }
/** Một loại tài liệu mà mô tả MR cần đính kèm theo chuẩn của framework. */
export interface MrDocSpec { kind: string; required: boolean; /** Biểu thức chính quy (không phân biệt hoa thường) khớp với link/chữ trong mô tả MR. */ pattern: string; hint: string }
export interface MrDescriptionSpec { docs: MrDocSpec[]; /** Điểm trừ cho mỗi loại tài liệu bắt buộc bị thiếu (0 = không trừ). */ penalty: number }

/** Bộ tiêu chí đã áp cấu hình repo: đầu vào chung cho framework → reviewer → scoring. */
export interface Rubric {
  id: string;
  name: string;
  version: string;
  language: string;
  severity: Record<Severity, { deduction: number; label: string; description: string }>;
  gates: RubricGate[];
  grades: { grade: Grade; min: number }[];
  sizeBaseline: number;
  categories: RubricCategory[];
  repoNotes?: string;
  publish: PublishPolicy;
  overview?: OverviewSpec;
  mrDescription?: MrDescriptionSpec;
}

export interface CategoryScoreResult {
  category: string;
  name: string;
  weight: number;
  score: number;
  deduction: number;
  findings: number;
}

export interface ScoreResult {
  total: number;
  rawTotal: number;
  grade: Grade;
  verdict: Verdict;
  gates: { id: string; reason: string; cap: number }[];
  categories: CategoryScoreResult[];
  /** deduction theo từng finding, cùng thứ tự đầu vào */
  deductions: number[];
}
