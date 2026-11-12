import type { FrameworkChangeDto, FrameworkEditInput } from "@mrd/contracts";
import { SEVERITY_RANK } from "@mrd/contracts";
import type { FrameworkFile } from "./schema.js";

const ID = /^[A-Za-z0-9_-]{2,24}$/;

/** Kiểm tra nội dung chỉnh sửa so với phiên bản hiện tại (nguồn cờ `locked`). Trả danh sách lỗi đọc được. */
export function validateEdit(current: FrameworkFile, edit: FrameworkEditInput): string[] {
  const errors: string[] = [];
  if (!edit.name.trim()) errors.push("Tên framework không được để trống");
  if (!edit.categories.length) errors.push("Cần ít nhất một hạng mục");
  const catIds = new Set<string>();
  const ruleIds = new Set<string>();
  for (const c of edit.categories) {
    if (!ID.test(c.id)) errors.push(`Hạng mục "${c.id}": id chỉ gồm chữ, số, - _ (2–24 ký tự)`);
    if (catIds.has(c.id)) errors.push(`Hạng mục "${c.id}" bị trùng`);
    catIds.add(c.id);
    if (!(c.weight >= 0)) errors.push(`Hạng mục "${c.name}": trọng số không hợp lệ`);
    for (const r of c.criteria) {
      if (!ID.test(r.id)) errors.push(`Rule "${r.id}": mã chỉ gồm chữ, số, - _ (2–24 ký tự)`);
      if (ruleIds.has(r.id)) errors.push(`Mã rule ${r.id} đã tồn tại. Dùng mã khác, vd ACM-02`);
      ruleIds.add(r.id);
      if (!r.title.trim()) errors.push(`Rule ${r.id}: thiếu tên`);
      if (!r.check.trim()) errors.push(`Rule ${r.id}: thiếu câu kiểm tra`);
    }
  }
  if (!edit.categories.some((c) => c.weight > 0 && c.criteria.some((r) => r.enabled))) errors.push("Cần ít nhất một hạng mục có trọng số > 0 và có rule bật");
  for (const g of edit.gates) {
    if (!(g.capTotal >= 0 && g.capTotal <= 100)) errors.push(`Gate ${g.id}: trần phải từ 0 đến 100`);
    for (const id of g.when.ruleIds ?? []) if (!ruleIds.has(id)) errors.push(`Gate ${g.id}: rule "${id}" không tồn tại`);
    if (g.when.category && !catIds.has(g.when.category)) errors.push(`Gate ${g.id}: hạng mục "${g.when.category}" không tồn tại`);
  }
  const grades = [...edit.grades].sort((a, b) => b.min - a.min);
  if (!grades.length || grades[grades.length - 1]!.min !== 0) errors.push("Xếp loại thấp nhất phải bắt đầu từ 0");
  if (new Set(grades.map((g) => g.min)).size !== grades.length) errors.push("Các ngưỡng xếp loại không được trùng nhau");

  // Quy tắc bảo mật nền.
  const sevIn = new Map(edit.categories.flatMap((c) => c.criteria.map((r) => [r.id, r] as const)));
  for (const c of current.categories) {
    for (const r of c.criteria) {
      if (!r.locked) continue;
      const e = sevIn.get(r.id);
      if (!e) errors.push(`${r.id} là rule bảo mật bắt buộc, không được xoá`);
      else {
        if (!e.enabled) errors.push(`${r.id} là rule bảo mật bắt buộc, không được tắt`);
        if (SEVERITY_RANK[e.defaultSeverity] < SEVERITY_RANK[r.defaultSeverity]) errors.push(`${r.id}: không được hạ mức độ xuống dưới ${r.defaultSeverity}`);
      }
    }
  }
  for (const g of current.gates) {
    if (!g.locked) continue;
    const e = edit.gates.find((x) => x.id === g.id);
    if (!e) errors.push(`Gate ${g.id} là gate bảo mật bắt buộc, không được xoá`);
    else if (e.capTotal > g.capTotal) errors.push(`Gate ${g.id}: không được nới trần cao hơn ${g.capTotal}`);
  }
  return errors;
}

/** Ghép nội dung chỉnh sửa vào bản hiện tại, giữ cờ `locked` do server quản. */
export function applyEdit(current: FrameworkFile, edit: FrameworkEditInput): FrameworkFile {
  const lockedRules = new Set(current.categories.flatMap((c) => c.criteria.filter((r) => r.locked).map((r) => r.id)));
  const lockedGates = new Set(current.gates.filter((g) => g.locked).map((g) => g.id));
  return {
    ...current,
    name: edit.name.trim(),
    language: edit.language ?? current.language,
    severity: edit.severity,
    sizeBaseline: edit.sizeBaseline,
    publish: edit.publish ?? current.publish,
    overview: edit.overview ?? current.overview,
    mrDescription: edit.mrDescription ?? current.mrDescription,
    grades: edit.grades,
    gates: edit.gates.map((g) => ({ ...g, locked: lockedGates.has(g.id) })),
    categories: edit.categories.map((c) => ({
      id: c.id, name: c.name.trim(), weight: c.weight,
      criteria: c.criteria.map((r) => ({ id: r.id, title: r.title.trim(), check: r.check.trim(), why: r.why.trim(), defaultSeverity: r.defaultSeverity, enabled: r.enabled, locked: lockedRules.has(r.id) })),
    })),
  };
}

/** So sánh hai framework thành danh sách thay đổi phẳng (để hiển thị diff). */
export function diffFrameworks(a: FrameworkFile, b: FrameworkFile): FrameworkChangeDto[] {
  const out: FrameworkChangeDto[] = [];
  const push = (path: string, from: unknown, to: unknown) => {
    if (JSON.stringify(from) !== JSON.stringify(to)) out.push({ path, from: from === undefined ? null : String(from), to: to === undefined ? null : String(to) });
  };
  push("name", a.name, b.name);
  push("sizeBaseline", a.sizeBaseline, b.sizeBaseline);
  push("publish.comments", a.publish?.comments, b.publish?.comments);
  push("publish.inlineMinSeverity", a.publish?.inlineMinSeverity, b.publish?.inlineMinSeverity);
  push("publish.maxInline", a.publish?.maxInline, b.publish?.maxInline);
  push("overview.guide", a.overview?.guide, b.overview?.guide);
  const ao = new Map((a.overview?.sections ?? []).map((s) => [s.id, s]));
  for (const s of b.overview?.sections ?? []) {
    const o = ao.get(s.id);
    push(`overview.${s.id}.enabled`, o?.enabled, s.enabled);
    push(`overview.${s.id}.kind`, o?.kind, s.kind);
    push(`overview.${s.id}.guide`, o?.guide, s.guide);
    push(`overview.${s.id}.maxWords`, o?.maxWords, s.maxWords);
  }
  for (const s of a.overview?.sections ?? []) if (!(b.overview?.sections ?? []).some((x) => x.id === s.id)) push(`overview.${s.id}`, s.title, undefined);
  push("mrDescription", a.mrDescription, b.mrDescription);
  for (const [k, v] of Object.entries(b.severity)) push(`severity.${k}.deduction`, (a.severity as Record<string, { deduction: number }>)[k]?.deduction, v.deduction);
  for (const g of b.grades) push(`grade.${g.grade}.min`, a.grades.find((x) => x.grade === g.grade)?.min, g.min);
  const ag = new Map(a.gates.map((g) => [g.id, g]));
  for (const g of b.gates) push(`gate.${g.id}.capTotal`, ag.get(g.id)?.capTotal, g.capTotal);
  for (const g of a.gates) if (!b.gates.some((x) => x.id === g.id)) push(`gate.${g.id}`, g.capTotal, undefined);
  const ac = new Map(a.categories.map((c) => [c.id, c]));
  for (const c of b.categories) {
    const o = ac.get(c.id);
    push(`${c.id}.weight`, o?.weight, c.weight);
    const or = new Map((o?.criteria ?? []).map((r) => [r.id, r]));
    for (const r of c.criteria) {
      const x = or.get(r.id);
      if (!x) { out.push({ path: `rule ${r.id} (${r.defaultSeverity}) — ${r.title}`, from: null, to: "thêm mới" }); continue; }
      push(`${r.id}.enabled`, x.enabled, r.enabled);
      push(`${r.id}.severity`, x.defaultSeverity, r.defaultSeverity);
      push(`${r.id}.title`, x.title, r.title);
      push(`${r.id}.check`, x.check, r.check);
    }
    for (const x of o?.criteria ?? []) if (!c.criteria.some((r) => r.id === x.id)) out.push({ path: `rule ${x.id}`, from: x.title, to: null });
  }
  return out;
}
