import type { FrameworkCategoryDto, FrameworkRuleDto, Severity } from "@mrd/contracts";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field, Modal } from "../../kernel/modal.js";
import { RULE_ID, SEVERITIES } from "./draft.js";

export type RuleDraft = Omit<FrameworkRuleDto, "locked">;
const TEXTAREA = "min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";

/** Thêm/sửa rule tự viết. `editing` null = thêm mới. Mã rule không đổi được khi sửa. */
export function RuleDialog({ editing, categoryId, categories, onSave, onClose }: { editing: RuleDraft | null; categoryId: string; categories: FrameworkCategoryDto[]; onSave: (rule: RuleDraft, categoryId: string) => void; onClose: () => void }) {
  const [id, setId] = useState(editing?.id ?? "");
  const [title, setTitle] = useState(editing?.title ?? "");
  const [check, setCheck] = useState(editing?.check ?? "");
  const [why, setWhy] = useState(editing?.why ?? "");
  const [sev, setSev] = useState<Severity>(editing?.defaultSeverity ?? "major");
  const [cat, setCat] = useState(categoryId);
  const [tried, setTried] = useState(false);
  const taken = categories.some((c) => c.criteria.some((r) => r.id === id.trim() && r.id !== editing?.id));
  const errs = {
    id: !RULE_ID.test(id.trim()) ? "Mã gồm chữ, số, - _ (2–24 ký tự), vd ACM-02" : taken ? `Mã ${id.trim()} đã tồn tại. Dùng mã khác, vd ${id.trim()}-2` : null,
    title: title.trim() ? null : "Nhập tên rule",
    check: check.trim() ? null : "Nhập câu kiểm tra để AI biết cần soi gì",
  };
  const submit = () => {
    setTried(true);
    if (errs.id || errs.title || errs.check) return;
    onSave({ id: id.trim(), title: title.trim(), check: check.trim(), why: why.trim(), defaultSeverity: sev, enabled: editing?.enabled ?? true }, cat);
  };
  const e = (k: keyof typeof errs) => (tried || (k === "id" && id.length > 0) ? errs[k] : null);
  return (
    <Modal title={editing ? `Sửa rule ${editing.id}` : "Thêm rule tự viết"} description="Rule được AI dùng làm tiêu chí review và đưa vào điểm của hạng mục." onClose={onClose}
      footer={<><Button type="button" variant="outline" onClick={onClose}>Huỷ</Button><Button type="button" onClick={submit}>{editing ? "Cập nhật rule" : "Thêm rule"}</Button></>}>
      <form className="flex flex-col gap-4" onSubmit={(ev) => { ev.preventDefault(); submit(); }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mã rule" htmlFor="rule-id" error={e("id")}><Input id="rule-id" className="font-mono" value={id} disabled={!!editing} aria-invalid={!!e("id")} aria-describedby={e("id") ? "rule-id-err" : undefined} onChange={(ev) => setId(ev.target.value)} placeholder="ACM-02" /></Field>
          <Field label="Mức độ" htmlFor="rule-sev"><Select id="rule-sev" value={sev} onChange={(ev) => setSev(ev.target.value as Severity)}>{SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}</Select></Field>
        </div>
        <Field label="Tên rule" htmlFor="rule-title" error={e("title")}><Input id="rule-title" value={title} aria-invalid={!!e("title")} aria-describedby={e("title") ? "rule-title-err" : undefined} maxLength={200} onChange={(ev) => setTitle(ev.target.value)} /></Field>
        <Field label="Câu kiểm tra" htmlFor="rule-check" error={e("check")} hint="Mô tả điều AI cần tìm trong diff."><textarea id="rule-check" className={TEXTAREA} value={check} aria-invalid={!!e("check")} aria-describedby={e("check") ? "rule-check-err" : "rule-check-hint"} maxLength={2000} onChange={(ev) => setCheck(ev.target.value)} /></Field>
        <Field label="Câu hỏi cho tác giả" htmlFor="rule-why" hint="Tuỳ chọn. Câu hỏi AI nêu khi phát hiện vi phạm."><textarea id="rule-why" className={TEXTAREA} value={why} aria-describedby="rule-why-hint" maxLength={1000} onChange={(ev) => setWhy(ev.target.value)} /></Field>
        <Field label="Hạng mục" htmlFor="rule-cat"><Select id="rule-cat" value={cat} onChange={(ev) => setCat(ev.target.value)}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}
