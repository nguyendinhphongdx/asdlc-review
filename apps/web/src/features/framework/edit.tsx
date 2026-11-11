import type { FrameworkDetailDto, FrameworkGateDto, FrameworkRuleDto, Severity } from "@mrd/contracts";
import { useMutation } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Field, Modal, Switch } from "../../kernel/modal.js";
import { updateFramework } from "./api.js";
import { allowedSeverities, countChanges, SEVERITIES, toDraft, toInput, validateDraft, type Draft } from "./draft.js";
import { RuleDialog, type RuleDraft } from "./rule-dialog.js";
import { LockedBadge } from "./view.js";

const num = (raw: string) => (raw.trim() === "" ? 0 : Number(raw));
const NUM = "w-20 text-right tabular-nums";

function SaveDialog({ d, draft, repoCount, changes, onClose, onSaved }: { d: FrameworkDetailDto; draft: Draft; repoCount: number; changes: number; onClose: () => void; onSaved: (n: FrameworkDetailDto) => void }) {
  const [note, setNote] = useState("");
  const save = useMutation({ mutationFn: () => updateFramework(d.id, toInput(draft, note)), onSuccess: onSaved });
  const next = (Number(d.version) || 0) + 1;
  // Server trả lỗi hợp lệ hoá dạng "lỗi 1; lỗi 2": tách ra thành danh sách.
  const errors = save.error instanceof Error ? save.error.message.split("; ").filter(Boolean) : [];
  return (
    <Modal title="Lưu thay đổi?" description={`${changes} thay đổi sẽ tạo phiên bản v${next} của "${draft.name}".`} onClose={save.isPending ? () => undefined : onClose}
      footer={<><Button type="button" variant="outline" disabled={save.isPending} onClick={onClose}>Quay lại chỉnh</Button><Button type="button" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Đang lưu…" : `Lưu phiên bản v${next}`}</Button></>}>
      <div className="flex flex-col gap-3 text-sm">
        <p><b>{repoCount} repo</b> đang dùng framework này sẽ áp dụng bản mới từ lần review kế tiếp.</p>
        <p className="text-muted-foreground">Review đã chấm trước đó giữ nguyên điểm, không bị tính lại. Có thể khôi phục phiên bản cũ trong tab Phiên bản.</p>
        <Field label="Ghi chú phiên bản" htmlFor="save-note" hint="Tuỳ chọn, tối đa 200 ký tự. Ví dụ: nâng ACM-01 lên critical."><Input id="save-note" aria-describedby="save-note-hint" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !save.isPending) save.mutate(); }} /></Field>
        {errors.length > 0 && (
          <div role="alert" className="rounded-lg border border-danger bg-danger-bg px-4 py-3 text-[13px] text-danger-fg">
            <div className="font-semibold">Không lưu được, cần sửa:</div>
            <ul className="mt-1 list-disc pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Chế độ chỉnh sửa bản custom. `onDirty` báo số thay đổi chưa lưu cho trang (chặn rời trang). */
export function FrameworkEditor({ detail, repoCount, onCancel, onSaved, onDirty }: { detail: FrameworkDetailDto; repoCount: number; onCancel: () => void; onSaved: (d: FrameworkDetailDto) => void; onDirty: (n: number) => void }) {
  const original = useMemo(() => toDraft(detail), [detail]);
  const [draft, setDraft] = useState<Draft>(original);
  const [openCat, setOpenCat] = useState<string | null>(original.categories[0]?.id ?? null);
  const [ruleDlg, setRuleDlg] = useState<{ rule: RuleDraft | null; cat: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const changes = useMemo(() => countChanges(original, draft), [original, draft]);
  const errors = useMemo(() => validateDraft(draft), [draft]);
  useEffect(() => { onDirty(changes); return () => onDirty(0); }, [changes, onDirty]);
  useEffect(() => {
    if (!changes) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [changes]);

  const origRules = useMemo(() => new Map(original.categories.flatMap((c) => c.criteria.map((r) => [r.id, r] as const))), [original]);
  const origGates = useMemo(() => new Map(original.gates.map((g) => [g.id, g])), [original]);
  const total = draft.categories.reduce((s, c) => s + (c.weight || 0), 0);
  const patchRule = (cid: string, rid: string, p: Partial<FrameworkRuleDto>) => setDraft((d) => ({ ...d, categories: d.categories.map((c) => (c.id === cid ? { ...c, criteria: c.criteria.map((r) => (r.id === rid ? { ...r, ...p } : r)) } : c)) }));
  const saveRule = (r: RuleDraft, cid: string) => {
    const rule = { ...r, locked: false };
    setDraft((d) => ({
      ...d,
      categories: d.categories.map((c) => {
        if (c.id !== cid) return { ...c, criteria: c.criteria.filter((x) => x.id !== r.id) };
        return { ...c, criteria: c.criteria.some((x) => x.id === r.id) ? c.criteria.map((x) => (x.id === r.id ? rule : x)) : [...c.criteria, rule] };
      }),
    }));
    setOpenCat(cid);
    setRuleDlg(null);
  };
  const delRule = (cid: string, rid: string) => setDraft((d) => ({ ...d, categories: d.categories.map((c) => (c.id === cid ? { ...c, criteria: c.criteria.filter((r) => r.id !== rid) } : c)) }));
  const patchGate = (id: string, p: Partial<FrameworkGateDto>) => setDraft((d) => ({ ...d, gates: d.gates.map((g) => (g.id === id ? { ...g, ...p } : g)) }));

  return (
    <>
      <div className="sticky top-0 z-10 -mx-1 bg-background px-1 py-1">
      <div role="status" className={cn("flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-sm", changes ? "border-warning bg-warning-bg text-warning-fg" : "bg-card text-muted-foreground")}>
        <TriangleAlert className={cn("size-4 shrink-0", !changes && "hidden")} aria-hidden="true" />
        <span className="min-w-0 flex-1 font-medium">{changes ? `${changes} thay đổi chưa lưu` : "Đang chỉnh sửa. Chưa có thay đổi."}</span>
        <Button type="button" variant="outline" size="sm" onClick={() => { if (!changes || confirm("Bỏ toàn bộ thay đổi chưa lưu?")) onCancel(); }}>{changes ? "Huỷ thay đổi" : "Thoát"}</Button>
        <Button type="button" size="sm" disabled={!changes || errors.length > 0} onClick={() => setSaving(true)}>Lưu…</Button>
      </div>
      </div>
      {errors.length > 0 && (
        <div role="alert" className="rounded-lg border border-danger bg-danger-bg px-4 py-3 text-[13px] text-danger-fg">
          <div className="font-semibold">Chưa thể lưu:</div>
          <ul className="mt-1 list-disc pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}

      <Card><CardContent className="pt-5"><Field label="Tên framework" htmlFor="fw-name"><Input id="fw-name" maxLength={120} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field></CardContent></Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-baseline justify-between gap-2"><div><CardTitle>Hạng mục và rule</CardTitle><CardDescription>Trọng số quyết định phần đóng góp vào điểm tổng. Rule khoá là quy tắc bảo mật nền.</CardDescription></div><Badge variant="secondary" className="tabular-nums">Tổng trọng số {total}</Badge></CardHeader>
        <CardContent className="flex flex-col gap-2">
          {draft.categories.map((c) => {
            const isOpen = openCat === c.id;
            return (
              <div key={c.id} className="rounded-lg border">
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <button type="button" aria-expanded={isOpen} aria-controls={`cat-${c.id}`} onClick={() => setOpenCat(isOpen ? null : c.id)} className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {isOpen ? <ChevronDown className="size-4 shrink-0" aria-hidden="true" /> : <ChevronRight className="size-4 shrink-0" aria-hidden="true" />}<span className="truncate">{c.name}</span><span className="text-xs font-normal text-muted-foreground">{c.criteria.filter((r) => r.enabled).length}/{c.criteria.length} rule bật</span>
                  </button>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">Trọng số<Input aria-label={`Trọng số ${c.name}`} type="number" min={0} max={1000} className={NUM} value={c.weight} onChange={(e) => setDraft({ ...draft, categories: draft.categories.map((x) => (x.id === c.id ? { ...x, weight: num(e.target.value) } : x)) })} /></label>
                </div>
                {isOpen && (
                  <div id={`cat-${c.id}`} className="border-t">
                    <ul className="divide-y">
                      {c.criteria.map((r) => {
                        const o = origRules.get(r.id);
                        return (
                          <li key={r.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3", !r.enabled && "bg-muted/40")}>
                            <Switch checked={r.enabled} disabled={r.locked} label={`${r.locked ? "Bắt buộc bật" : r.enabled ? "Tắt" : "Bật"} rule ${r.id}`} onChange={(v) => patchRule(c.id, r.id, { enabled: v })} />
                            <div className="min-w-0 flex-[1_1_220px]"><div className="flex flex-wrap items-center gap-2"><code className="font-mono text-xs text-muted-foreground">{r.id}</code><span className={cn("text-sm font-medium", !r.enabled && "text-muted-foreground line-through")}>{r.title}</span>{r.locked && <LockedBadge />}{!o && <Badge variant="info">Mới</Badge>}</div>
                              {r.locked && <p className="mt-0.5 text-xs text-muted-foreground">Không thể tắt hoặc hạ mức độ xuống dưới {o?.defaultSeverity}.</p>}</div>
                            <Select aria-label={`Mức độ ${r.id}`} className="h-8 w-28 text-xs" value={r.defaultSeverity} onChange={(e) => patchRule(c.id, r.id, { defaultSeverity: e.target.value as Severity })}>
                              {allowedSeverities(o).map((s) => <option key={s} value={s}>{s}</option>)}
                            </Select>
                            {!r.locked && (
                              <span className="flex gap-1">
                                <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={`Sửa rule ${r.id}`} onClick={() => setRuleDlg({ rule: { id: r.id, title: r.title, check: r.check, why: r.why, defaultSeverity: r.defaultSeverity, enabled: r.enabled }, cat: c.id })}><Pencil /></Button>
                                <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={`Xoá rule ${r.id}`} onClick={() => { if (!o || confirm(`Xoá rule ${r.id} khỏi bản chỉnh sửa này?`)) delRule(c.id, r.id); }}><Trash2 /></Button>
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    <div className="border-t px-4 py-2.5"><Button type="button" variant="outline" size="sm" onClick={() => setRuleDlg({ rule: null, cat: c.id })}><Plus />Thêm rule tự viết</Button></div>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Gate chặn điểm</CardTitle><CardDescription>Khi điều kiện xảy ra, điểm tổng không vượt quá trần. Gate khoá chỉ được siết (hạ trần), không nới.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-2">
          {draft.gates.map((g) => {
            const max = g.locked ? (origGates.get(g.id)?.capTotal ?? 100) : 100;
            return (
              <div key={g.id} className="flex flex-wrap items-center gap-3 rounded-lg border px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-[1_1_240px]"><div className="flex flex-wrap items-center gap-2"><code className="font-mono text-xs text-muted-foreground">{g.id}</code>{g.locked && <LockedBadge />}</div><p className="text-muted-foreground">{g.reason}</p></div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">Trần<Input aria-label={`Trần gate ${g.id}`} type="number" min={0} max={max} className={NUM} value={g.capTotal} onChange={(e) => patchGate(g.id, { capTotal: Math.min(num(e.target.value), max) })} /></label>
                {g.locked && <span className="w-full text-xs text-muted-foreground sm:w-auto">Tối đa {max}</span>}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Điểm trừ theo mức độ</CardTitle><CardDescription>Điểm trừ trên 100 của hạng mục cho mỗi finding.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {SEVERITIES.map((s) => (
              <label key={s} className="flex items-center justify-between gap-3 text-sm"><span className="capitalize">{s}</span><Input aria-label={`Điểm trừ ${s}`} type="number" min={0} max={100} className={NUM} value={draft.severity[s].deduction} onChange={(e) => setDraft({ ...draft, severity: { ...draft.severity, [s]: { ...draft.severity[s], deduction: num(e.target.value) } } })} /></label>
            ))}
            <label className="mt-2 flex items-center justify-between gap-3 border-t pt-3 text-sm"><span>Chuẩn kích thước MR (dòng)<span className="block text-xs text-muted-foreground">Chia điểm trừ minor/nit cho √(dòng/chuẩn)</span></span><Input aria-label="Chuẩn kích thước MR" type="number" min={1} className="w-24 text-right tabular-nums" value={draft.sizeBaseline} onChange={(e) => setDraft({ ...draft, sizeBaseline: num(e.target.value) })} /></label>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Ngưỡng xếp loại</CardTitle><CardDescription>Điểm tối thiểu cho từng hạng. Hạng thấp nhất phải bắt đầu từ 0.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {draft.grades.map((g) => (
              <label key={g.grade} className="flex items-center justify-between gap-3 text-sm"><span className="font-semibold">{g.grade}</span><span className="flex items-center gap-2 text-muted-foreground">≥<Input aria-label={`Ngưỡng ${g.grade}`} type="number" min={0} max={100} className={NUM} value={g.min} onChange={(e) => setDraft({ ...draft, grades: draft.grades.map((x) => (x.grade === g.grade ? { ...x, min: num(e.target.value) } : x)) })} /></span></label>
            ))}
          </CardContent>
        </Card>
      </div>

      {ruleDlg && <RuleDialog editing={ruleDlg.rule} categoryId={ruleDlg.cat} categories={draft.categories} onSave={saveRule} onClose={() => setRuleDlg(null)} />}
      {saving && <SaveDialog d={detail} draft={draft} repoCount={repoCount} changes={changes} onClose={() => setSaving(false)} onSaved={onSaved} />}
    </>
  );
}
