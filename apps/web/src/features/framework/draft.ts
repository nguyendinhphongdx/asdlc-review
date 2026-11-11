import type { PublishPolicy, FrameworkCategoryDto, FrameworkDetailDto, FrameworkEditInput, FrameworkGateDto, FrameworkRuleDto, Grade, Severity } from "@mrd/contracts";
import { SEVERITY_RANK } from "@mrd/contracts";

/** Bản nháp đang chỉnh: cùng hình dạng với phần nội dung của FrameworkDetailDto (giữ cờ locked để khoá UI; server vẫn kiểm lại). */
export interface Draft {
  name: string;
  severity: FrameworkDetailDto["severity"];
  gates: FrameworkGateDto[];
  grades: { grade: Grade; min: number }[];
  sizeBaseline: number;
  publish: PublishPolicy;
  categories: FrameworkCategoryDto[];
}

export const SEVERITIES: Severity[] = ["blocker", "critical", "major", "minor", "nit"];
export const RULE_ID = /^[A-Za-z0-9_-]{2,24}$/;

export const toDraft = (d: FrameworkDetailDto): Draft => structuredClone({ name: d.name, severity: d.severity, gates: d.gates, grades: d.grades, sizeBaseline: d.sizeBaseline, publish: d.publish, categories: d.categories });

export const toInput = (d: Draft, note: string): FrameworkEditInput => ({
  name: d.name.trim(),
  severity: d.severity,
  gates: d.gates.map((g) => ({ id: g.id, reason: g.reason, capTotal: g.capTotal, when: g.when })),
  grades: d.grades,
  sizeBaseline: d.sizeBaseline,
  publish: d.publish,
  categories: d.categories.map((c) => ({ id: c.id, name: c.name, weight: c.weight, criteria: c.criteria.map(({ locked: _l, ...r }) => r) })),
  ...(note.trim() ? { note: note.trim() } : {}),
});

/** Làm phẳng để đếm số thay đổi chưa lưu so với bản gốc. */
function flatten(d: Draft): Map<string, string> {
  const m = new Map<string, string>();
  m.set("Tên framework", d.name);
  m.set("Chuẩn kích thước MR", String(d.sizeBaseline));
  m.set("Đăng comment", JSON.stringify(d.publish));
  for (const k of SEVERITIES) m.set(`Điểm trừ ${k}`, String(d.severity[k].deduction));
  for (const g of d.grades) m.set(`Ngưỡng xếp loại ${g.grade}`, String(g.min));
  for (const g of d.gates) m.set(`Trần gate ${g.id}`, String(g.capTotal));
  for (const c of d.categories) {
    m.set(`Trọng số ${c.name}`, String(c.weight));
    for (const r of c.criteria) m.set(`Rule ${r.id}`, JSON.stringify([c.id, r.title, r.check, r.why, r.defaultSeverity, r.enabled]));
  }
  return m;
}
export function countChanges(a: Draft, b: Draft): number {
  const x = flatten(a), y = flatten(b);
  let n = 0;
  for (const k of new Set([...x.keys(), ...y.keys()])) if (x.get(k) !== y.get(k)) n++;
  return n;
}

/** Hợp lệ hoá cơ bản phía client; server vẫn là nguồn chân lý. */
export function validateDraft(d: Draft): string[] {
  const errs: string[] = [];
  if (!d.name.trim()) errs.push("Tên framework không được để trống");
  const ids = new Set<string>();
  for (const c of d.categories) {
    if (!(c.weight >= 0)) errs.push(`Hạng mục "${c.name}": trọng số không hợp lệ`);
    for (const r of c.criteria) { if (ids.has(r.id)) errs.push(`Mã rule ${r.id} bị trùng`); ids.add(r.id); }
  }
  if (!d.categories.some((c) => c.weight > 0 && c.criteria.some((r) => r.enabled))) errs.push("Cần ít nhất một hạng mục có trọng số > 0 và có rule bật");
  for (const g of d.gates) if (!(g.capTotal >= 0 && g.capTotal <= 100)) errs.push(`Gate ${g.id}: trần phải từ 0 đến 100`);
  const mins = d.grades.map((g) => g.min);
  if (new Set(mins).size !== mins.length) errs.push("Các ngưỡng xếp loại không được trùng nhau");
  if (Math.min(...mins) !== 0) errs.push("Xếp loại thấp nhất phải bắt đầu từ 0");
  if (!(d.sizeBaseline >= 1)) errs.push("Chuẩn kích thước MR phải ≥ 1");
  return errs;
}

export const allowedSeverities = (orig: FrameworkRuleDto | undefined): Severity[] =>
  orig?.locked ? SEVERITIES.filter((s) => SEVERITY_RANK[s] >= SEVERITY_RANK[orig.defaultSeverity]) : SEVERITIES;
