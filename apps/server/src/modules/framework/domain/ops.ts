import type { FrameworkEditInput, FrameworkOp } from "@mrd/contracts";

/**
 * Áp danh sách thay đổi nhỏ lên nội dung chỉnh sửa. Thuần túy, không kiểm tra luật bảo mật
 * (việc đó do `validateEdit` làm); chỉ báo lỗi cấu trúc (mã không tồn tại/đã có).
 */
export function applyOps(base: FrameworkEditInput, ops: FrameworkOp[]): { edit: FrameworkEditInput; errors: string[] } {
  const edit: FrameworkEditInput = structuredClone(base);
  const errors: string[] = [];
  const findRule = (id: string) => {
    for (const c of edit.categories) {
      const i = c.criteria.findIndex((r) => r.id === id);
      if (i >= 0) return { c, i, r: c.criteria[i]! };
    }
    return null;
  };
  for (const o of ops) {
    switch (o.op) {
      case "add_rule": {
        const c = edit.categories.find((x) => x.id === o.category);
        if (!c) { errors.push(`Không có hạng mục "${o.category}" để thêm rule ${o.id}`); break; }
        if (findRule(o.id)) { errors.push(`Mã rule ${o.id} đã tồn tại`); break; }
        c.criteria.push({ id: o.id, title: o.title, check: o.check, why: o.why ?? "", defaultSeverity: o.severity, enabled: o.enabled ?? true });
        break;
      }
      case "update_rule": {
        const f = findRule(o.id);
        if (!f) { errors.push(`Không có rule ${o.id}`); break; }
        const { op: _o, id: _i, category, ...patch } = o;
        const next = { ...f.r, ...(patch.title !== undefined ? { title: patch.title } : {}), ...(patch.check !== undefined ? { check: patch.check } : {}), ...(patch.why !== undefined ? { why: patch.why } : {}), ...(patch.severity !== undefined ? { defaultSeverity: patch.severity } : {}), ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}) };
        if (category && category !== f.c.id) {
          const to = edit.categories.find((x) => x.id === category);
          if (!to) { errors.push(`Không có hạng mục "${category}" để chuyển rule ${o.id}`); break; }
          f.c.criteria.splice(f.i, 1);
          to.criteria.push(next);
        } else f.c.criteria[f.i] = next;
        break;
      }
      case "remove_rule": {
        const f = findRule(o.id);
        if (!f) { errors.push(`Không có rule ${o.id}`); break; }
        f.c.criteria.splice(f.i, 1);
        break;
      }
      case "add_category":
        if (edit.categories.some((c) => c.id === o.id)) errors.push(`Hạng mục "${o.id}" đã tồn tại`);
        else edit.categories.push({ id: o.id, name: o.name, weight: o.weight, criteria: [] });
        break;
      case "update_category": {
        const c = edit.categories.find((x) => x.id === o.id);
        if (!c) { errors.push(`Không có hạng mục "${o.id}"`); break; }
        if (o.name !== undefined) c.name = o.name;
        if (o.weight !== undefined) c.weight = o.weight;
        break;
      }
      case "remove_category": {
        const i = edit.categories.findIndex((x) => x.id === o.id);
        if (i < 0) { errors.push(`Không có hạng mục "${o.id}"`); break; }
        edit.categories.splice(i, 1);
        break;
      }
      case "set_deduction":
        if (!edit.severity[o.severity]) errors.push(`Mức "${o.severity}" không hợp lệ`);
        else edit.severity[o.severity] = { ...edit.severity[o.severity], deduction: o.deduction };
        break;
      case "set_gate_cap": {
        const g = edit.gates.find((x) => x.id === o.id);
        if (!g) errors.push(`Không có gate ${o.id}`);
        else g.capTotal = o.capTotal;
        break;
      }
      case "set_grade_min": {
        const g = edit.grades.find((x) => x.grade === o.grade);
        if (!g) errors.push(`Không có xếp loại ${o.grade}`);
        else g.min = o.min;
        break;
      }
    }
  }
  return { edit, errors };
}
