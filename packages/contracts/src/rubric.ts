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
  when: { ruleIds?: string[]; category?: string; minSeverity?: Severity };
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
