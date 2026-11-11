import type { Severity } from "./finding.js";
import type { Grade } from "./rubric.js";

/** Hợp đồng API framework (M1). */

/** default = bản mặc định hệ thống; template = mẫu dựng sẵn (chỉ đọc); custom = bản fork có thể sửa. */
export type FrameworkKind = "default" | "template" | "custom";

export interface FrameworkRuleDto {
  id: string;
  title: string;
  check: string;
  why: string;
  defaultSeverity: Severity;
  enabled: boolean;
  /** Rule/gate bảo mật nền: không thể tắt hay hạ mức độ. */
  locked: boolean;
}

export interface FrameworkCategoryDto {
  id: string;
  name: string;
  weight: number;
  criteria: FrameworkRuleDto[];
}

export interface FrameworkGateDto {
  id: string;
  reason: string;
  capTotal: number;
  when: { ruleIds?: string[]; category?: string; minSeverity?: Severity };
  locked: boolean;
}

export interface FrameworkVersionDto {
  version: number;
  note: string;
  author: string;
  createdAt: string;
}

export interface FrameworkDetailDto {
  id: string;
  name: string;
  version: string;
  kind: FrameworkKind;
  baseId: string | null;
  readOnly: boolean;
  language: string;
  severity: Record<Severity, { deduction: number; label: string; description: string }>;
  gates: FrameworkGateDto[];
  grades: { grade: Grade; min: number }[];
  sizeBaseline: number;
  categories: FrameworkCategoryDto[];
  /** Lịch sử (mới nhất trước); rỗng với bản chỉ đọc. */
  versions: FrameworkVersionDto[];
}

/** Nội dung gửi lên khi lưu bản chỉnh sửa. Cờ `locked` do server giữ, client không đổi được. */
export interface FrameworkEditInput {
  name: string;
  language?: string;
  severity: FrameworkDetailDto["severity"];
  gates: { id: string; reason: string; capTotal: number; when: FrameworkGateDto["when"] }[];
  grades: { grade: Grade; min: number }[];
  sizeBaseline: number;
  categories: { id: string; name: string; weight: number; criteria: Omit<FrameworkRuleDto, "locked">[] }[];
  note?: string;
}

export interface ForkFrameworkInput {
  baseId: string;
  name: string;
}

export interface FrameworkChangeDto {
  path: string;
  from: string | null;
  to: string | null;
}

export interface ConfigPreviewInput {
  yaml: string;
  frameworkId?: string;
}
export interface ConfigPreviewDto {
  valid: boolean;
  errors: string[];
  /** Mô tả những gì `.asdlc.yml` thay đổi so với framework nền. */
  changes: string[];
  docs: string[];
  ignore: string[];
}

export type HarnessItemStatus = "ok" | "partial" | "missing";
export interface HarnessItemDto {
  id: string;
  label: string;
  status: HarnessItemStatus;
  points: number;
  max: number;
  detail: string;
  hint?: string;
}
/** Độ phủ harness: tính tất định bằng code (không dùng AI), chỉ để gợi ý. */
export interface HarnessReportDto {
  score: number;
  level: "good" | "fair" | "poor";
  items: HarnessItemDto[];
  repoConfig: { present: boolean; valid: boolean; error?: string };
  scannedAt: string;
}
