import type { MrDescriptionSpec, OverviewKind, OverviewSectionSpec, OverviewSpec } from "@mrd/contracts";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Switch } from "../../kernel/modal.js";

const KIND_LABEL: Record<OverviewKind, string> = { text: "Đoạn văn", bullets: "Gạch đầu dòng", verdict: "Nhãn + giải thích" };
const TEXTAREA = "w-full rounded-md border bg-transparent px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Xem khung "Đánh giá tổng quan" (chỉ đọc). */
/** Mức độ finding khi thiếu tài liệu bắt buộc; lưu dưới dạng số `penalty` (0 tắt, 1 nit, 3 minor, 8 major) để tương thích bản cũ. */
const MISSING_LEVELS = [{ value: 0, label: "Chỉ cảnh báo" }, { value: 1, label: "nit" }, { value: 3, label: "minor" }, { value: 8, label: "major" }];
const levelOf = (p: number) => (p >= 8 ? 8 : p >= 3 ? 3 : p > 0 ? 1 : 0);

export function OverviewView({ overview, mrDescription }: { overview: OverviewSpec; mrDescription: MrDescriptionSpec }) {
  return (
    <>
      <Card>
        <CardHeader><CardTitle>Đánh giá tổng quan</CardTitle><CardDescription>Khung của phần “Đánh giá tổng quan” trên trang review: mục nào có, thứ tự và AI được hướng dẫn viết gì. Code lõi chỉ dựng đúng theo đây.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div><div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hướng dẫn chung cho AI</div><p className="whitespace-pre-wrap text-sm leading-relaxed">{overview.guide || "(trống)"}</p></div>
          <ol className="flex flex-col">
            {overview.sections.map((s, i) => (
              <li key={s.id} className={`flex gap-3 border-t py-3 ${s.enabled ? "" : "opacity-55"}`}>
                <span className="mt-0.5 flex size-[22px] flex-none items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">{s.title}</span><code className="font-mono text-xs text-muted-foreground">{s.id}</code><Badge variant="secondary">{KIND_LABEL[s.kind]}</Badge><span className="text-xs text-muted-foreground">≤ {s.maxWords} từ</span>{!s.enabled && <Badge>Đang tắt</Badge>}</div>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{s.guide}</p>
                  {s.kind === "verdict" && s.verdicts.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1.5">{s.verdicts.map((v) => <Badge key={v} variant="info">{v}</Badge>)}</div>}
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
      <MrDescriptionView spec={mrDescription} />
    </>
  );
}

function MrDescriptionView({ spec }: { spec: MrDescriptionSpec }) {
  return (
    <Card>
      <CardHeader><CardTitle>Chuẩn mô tả MR</CardTitle><CardDescription>Tài liệu cần gắn trong mô tả MR. Kết quả hiện ở khối “Mô tả MR” trên trang review.{spec.penalty > 0 ? ` Thiếu mục bắt buộc thành finding mức ${MISSING_LEVELS.find((l) => l.value === levelOf(spec.penalty))?.label ?? "minor"}.` : " Hiện không tính vào điểm."}</CardDescription></CardHeader>
      <CardContent className="flex flex-col">
        {spec.docs.length === 0 && <p className="text-sm text-muted-foreground">Chưa khai báo loại tài liệu nào.</p>}
        {spec.docs.map((d) => (
          <div key={d.kind} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t py-2.5 text-sm first:border-0">
            <span className="w-40 font-medium">{d.kind}</span><Badge variant={d.required ? "info" : "secondary"}>{d.required ? "Bắt buộc" : "Khuyến nghị"}</Badge>
            <code className="min-w-0 flex-1 break-all font-mono text-xs text-muted-foreground">{d.pattern}</code>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

const move = <T,>(arr: T[], i: number, d: -1 | 1): T[] => {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const n = [...arr];
  [n[i], n[j]] = [n[j]!, n[i]!];
  return n;
};
const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "muc";

/** Sửa khung "Đánh giá tổng quan" + chuẩn mô tả MR. */
export function OverviewEditor({ overview, mrDescription, onOverview, onMrDescription }: { overview: OverviewSpec; mrDescription: MrDescriptionSpec; onOverview: (o: OverviewSpec) => void; onMrDescription: (m: MrDescriptionSpec) => void }) {
  const patch = (i: number, p: Partial<OverviewSectionSpec>) => onOverview({ ...overview, sections: overview.sections.map((s, k) => (k === i ? { ...s, ...p } : s)) });
  const add = () => {
    let id = "muc", n = 1;
    while (overview.sections.some((s) => s.id === id)) id = `muc-${++n}`;
    onOverview({ ...overview, sections: [...overview.sections, { id, title: "Mục mới", enabled: true, kind: "text", maxWords: 80, guide: "", verdicts: [] }] });
  };
  return (
    <>
      <Card>
        <CardHeader className="flex-row flex-wrap items-baseline justify-between gap-2"><div><CardTitle>Đánh giá tổng quan</CardTitle><CardDescription>Quyết định mục nào AI phải viết ở đầu trang review, theo thứ tự này, và hướng dẫn riêng cho từng mục.</CardDescription></div><Button type="button" size="sm" variant="outline" onClick={add}><Plus />Thêm mục</Button></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium">Hướng dẫn chung cho AI
            <textarea aria-label="Hướng dẫn chung cho AI" rows={4} maxLength={4000} className={TEXTAREA} value={overview.guide} onChange={(e) => onOverview({ ...overview, guide: e.target.value })} />
            <span className="text-xs font-normal text-muted-foreground">Góc nhìn, giọng văn, điều cấm. Áp dụng cho mọi mục bên dưới.</span>
          </label>
          {overview.sections.map((s, i) => (
            <div key={s.id + i} className="flex flex-col gap-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex size-[22px] items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">{i + 1}</span>
                <Input aria-label={`Tiêu đề mục ${i + 1}`} maxLength={120} className="min-w-[200px] flex-1" value={s.title} onChange={(e) => patch(i, { title: e.target.value })} onBlur={() => { if (!/^[a-z0-9-]{1,40}$/.test(s.id) || s.id === "muc") patch(i, { id: overview.sections.some((x, k) => k !== i && x.id === slug(s.title)) ? s.id : slug(s.title) }); }} />
                <code className="font-mono text-xs text-muted-foreground">{s.id}</code>
                <Switch checked={s.enabled} onChange={(v) => patch(i, { enabled: v })} label={`Bật mục ${s.title}`} />
                <Button type="button" size="icon-sm" variant="ghost" aria-label="Lên" disabled={i === 0} onClick={() => onOverview({ ...overview, sections: move(overview.sections, i, -1) })}><ArrowUp /></Button>
                <Button type="button" size="icon-sm" variant="ghost" aria-label="Xuống" disabled={i === overview.sections.length - 1} onClick={() => onOverview({ ...overview, sections: move(overview.sections, i, 1) })}><ArrowDown /></Button>
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`Xoá mục ${s.title}`} onClick={() => onOverview({ ...overview, sections: overview.sections.filter((_, k) => k !== i) })}><Trash2 /></Button>
              </div>
              <label className="flex flex-col gap-1.5 text-sm font-medium">Hướng dẫn cho AI viết mục này
                <textarea aria-label={`Hướng dẫn mục ${s.title}`} rows={3} maxLength={2000} className={TEXTAREA} value={s.guide} onChange={(e) => patch(i, { guide: e.target.value })} />
              </label>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <label className="flex items-center gap-2">Dạng hiển thị<Select aria-label={`Dạng mục ${s.title}`} value={s.kind} onChange={(e) => patch(i, { kind: e.target.value as OverviewKind })}>{(Object.keys(KIND_LABEL) as OverviewKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</Select></label>
                <label className="flex items-center gap-2">Tối đa<Input aria-label={`Số từ tối đa mục ${s.title}`} type="number" min={20} max={400} className="w-20 text-right tabular-nums" value={s.maxWords} onChange={(e) => patch(i, { maxWords: Math.min(400, Math.max(20, Number(e.target.value) || 20)) })} />từ</label>
                {s.kind === "verdict" && <label className="flex min-w-[260px] flex-1 items-center gap-2">Nhãn kết luận<Input aria-label={`Nhãn kết luận mục ${s.title}`} placeholder="Không | Có, đáng thử trước | Có, nên làm thay" value={s.verdicts.join(" | ")} onChange={(e) => patch(i, { verdicts: e.target.value.split("|").map((x) => x.trim()).filter(Boolean).slice(0, 8) })} /></label>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-baseline justify-between gap-2"><div><CardTitle>Chuẩn mô tả MR</CardTitle><CardDescription>Loại tài liệu cần gắn trong mô tả MR. “Cách nhận diện” là biểu thức chính quy (không phân biệt hoa thường).</CardDescription></div>
          <Button type="button" size="sm" variant="outline" onClick={() => onMrDescription({ ...mrDescription, docs: [...mrDescription.docs, { kind: "Tài liệu mới", required: false, pattern: "", hint: "" }] })}><Plus />Thêm loại</Button></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <label className="flex items-center justify-between gap-3 text-sm"><span>Khi thiếu tài liệu bắt buộc<span className="block text-xs text-muted-foreground">Tạo một finding ở mức này và chấm như finding thường; “Chỉ cảnh báo” thì không trừ điểm.</span></span>
            <select aria-label="Mức độ khi thiếu tài liệu" className="h-9 rounded-md border border-input bg-transparent px-2 text-sm" value={levelOf(mrDescription.penalty)} onChange={(e) => onMrDescription({ ...mrDescription, penalty: Number(e.target.value) })}>
              {MISSING_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select></label>
          {mrDescription.docs.map((d, i) => {
            const patchDoc = (p: Partial<typeof d>) => onMrDescription({ ...mrDescription, docs: mrDescription.docs.map((x, k) => (k === i ? { ...x, ...p } : x)) });
            let bad = false;
            try { new RegExp(d.pattern, "i"); } catch { bad = true; }
            return (
              <div key={i} className="grid gap-2 rounded-lg border p-3 md:grid-cols-[180px_130px_minmax(0,1fr)_auto]">
                <Input aria-label="Loại tài liệu" maxLength={60} value={d.kind} onChange={(e) => patchDoc({ kind: e.target.value })} />
                <Select aria-label="Mức" value={d.required ? "req" : "rec"} onChange={(e) => patchDoc({ required: e.target.value === "req" })}><option value="req">Bắt buộc</option><option value="rec">Khuyến nghị</option></Select>
                <Input aria-label="Cách nhận diện" aria-invalid={bad} placeholder="vd: (jira|linear)\S+|[A-Z]+-\d+" className="font-mono text-xs" value={d.pattern} onChange={(e) => patchDoc({ pattern: e.target.value })} />
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`Xoá ${d.kind}`} onClick={() => onMrDescription({ ...mrDescription, docs: mrDescription.docs.filter((_, k) => k !== i) })}><Trash2 /></Button>
                <Input aria-label="Gợi ý khi thiếu" placeholder="Gợi ý hiện khi MR thiếu tài liệu này" className="md:col-span-3" maxLength={200} value={d.hint} onChange={(e) => patchDoc({ hint: e.target.value })} />
                {bad && <p role="alert" className="text-xs text-danger-fg md:col-span-4">Biểu thức không hợp lệ, sẽ bị coi như không khớp.</p>}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </>
  );
}
