import type { LessonDto, LessonKind, RepoDto } from "@mrd/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Empty, ErrorBox, Loading } from "../../kernel/page.js";
import { addMemory, approveMemory, deleteMemory, listMemory, rejectMemory, updateMemory } from "./api.js";

const KINDS: { id: LessonKind; label: string; hint: string }[] = [
  { id: "conv", label: "Quy ước", hint: "Cách team làm việc, ví dụ: luôn dùng zod ở biên API" },
  { id: "arch", label: "Kiến trúc", hint: "Ràng buộc/thiết kế cần giữ, ví dụ: module không import nhau" },
  { id: "skip", label: "Bỏ qua", hint: "Thứ AI không cần báo, ví dụ: file sinh tự động" },
  { id: "term", label: "Thuật ngữ", hint: "Từ riêng của dự án để AI hiểu đúng" },
];
const BUDGET_CHARS = 16_000; // ≈ 4k token

/** Bộ nhớ của repo: kiến thức bền, chỉ mục đã được người duyệt mới nạp cho AI mỗi lần review (harness của repo vẫn thắng nếu mâu thuẫn). */
export function MemoryTab({ repo }: { repo: RepoDto }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["memory", repo.id], queryFn: () => listMemory(repo.id) });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["memory", repo.id] });
  const [text, setText] = useState("");
  const [kind, setKind] = useState<LessonKind>("conv");
  const [paths, setPaths] = useState("");
  const add = useMutation({ mutationFn: () => addMemory(repo.id, { text, kind, paths }), onSuccess: () => { setText(""); setPaths(""); refresh(); } });
  const act = useMutation({
    mutationFn: async (a: { id: string; op: "ok" | "no" | "del" | "kind"; kind?: LessonKind }) => {
      if (a.op === "ok") await approveMemory(a.id); else if (a.op === "no") await rejectMemory(a.id);
      else if (a.op === "kind") await updateMemory(a.id, { kind: a.kind! }); else await deleteMemory(a.id);
    }, onSuccess: refresh,
  });
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const all = q.data ?? [];
  const proposed = all.filter((l) => l.status === "proposed");
  const active = all.filter((l) => l.status === "active");
  const used = active.reduce((s, l) => s + l.text.length + l.paths.length + 12, 0);
  const pct = Math.min(100, Math.round((used / BUDGET_CHARS) * 100));
  const Row = ({ l, pending }: { l: LessonDto; pending?: boolean }) => (
    <li className="flex items-start gap-3 border-t py-2.5 first:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Loại" value={l.kind} onChange={(e) => act.mutate({ id: l.id, op: "kind", kind: e.target.value as LessonKind })} className="h-6 rounded border bg-transparent px-1 text-xs">
            {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
          {l.paths && <span className="rounded bg-muted px-1.5 font-mono text-[11px]">{l.paths}</span>}
          <span className="text-[11px] text-muted-foreground">{l.source === "agent" ? "AI đề xuất" : l.source === "feedback" ? "từ phản hồi" : "người thêm"}</span>
        </div>
        <p className="mt-1 break-words text-[13.5px]">{l.text}</p>
      </div>
      {pending && <Button size="icon-sm" variant="outline" aria-label="Duyệt" onClick={() => act.mutate({ id: l.id, op: "ok" })}><Check /></Button>}
      {pending && <Button size="icon-sm" variant="ghost" aria-label="Từ chối" onClick={() => act.mutate({ id: l.id, op: "no" })}><X /></Button>}
      {!pending && <Button size="icon-sm" variant="ghost" aria-label="Xoá" onClick={() => act.mutate({ id: l.id, op: "del" })}><Trash2 /></Button>}
    </li>
  );
  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-2 p-5">
        <div className="flex items-baseline justify-between gap-3"><h3 className="text-[15px] font-semibold">Bộ nhớ của repo</h3><span className="text-xs tabular-nums text-muted-foreground">~{Math.round(used / 4)} / 4000 token</span></div>
        <p className="text-[13px] text-muted-foreground">Kiến thức bền AI sẽ nạp mỗi lần review repo này, không phải học lại từ đầu. Chỉ mục đã duyệt mới được nạp; nếu mâu thuẫn với harness của repo (AGENTS.md…) thì harness thắng.</p>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className={cn("h-full", pct > 90 ? "bg-danger" : "bg-primary")} style={{ width: `${pct}%` }} /></div>
      </Card>

      {proposed.length > 0 && (
        <Card className="gap-1 border-warning p-5">
          <div className="flex items-center gap-2"><h3 className="text-[15px] font-semibold">AI đề xuất</h3><Badge variant="warning">{proposed.length} chờ duyệt</Badge></div>
          <ul>{proposed.map((l) => <Row key={l.id} l={l} pending />)}</ul>
        </Card>
      )}

      <Card className="gap-3 p-5">
        <h3 className="text-[15px] font-semibold">Thêm vào bộ nhớ</h3>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Loại">
          {KINDS.map((k) => <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(k.id)} title={k.hint} className={cn("h-7 rounded-full border px-3 text-[12.5px] font-medium", kind === k.id ? "border-primary bg-info-bg text-info-fg" : "text-muted-foreground")}>{k.label}</button>)}
        </div>
        <p className="text-xs text-muted-foreground">{KINDS.find((k) => k.id === kind)!.hint}</p>
        <textarea aria-label="Nội dung" rows={2} maxLength={400} value={text} onChange={(e) => setText(e.target.value)} placeholder="Một câu ngắn, rõ, mệnh lệnh…" className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        <input aria-label="Phạm vi đường dẫn" value={paths} onChange={(e) => setPaths(e.target.value)} placeholder="Phạm vi (tuỳ chọn), ví dụ: apps/server/**, **/*.sql — trống = mọi MR" className="h-9 w-full rounded-md border border-input bg-transparent px-3 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        <div className="flex items-center gap-3"><Button disabled={text.trim().length < 8 || add.isPending} onClick={() => add.mutate()}>Thêm</Button>{add.error && <span className="text-xs text-danger-fg">{String(add.error.message)}</span>}</div>
      </Card>

      <Card className="gap-1 p-5">
        <h3 className="text-[15px] font-semibold">Đang áp dụng ({active.length})</h3>
        {active.length ? <ul>{active.map((l) => <Row key={l.id} l={l} />)}</ul> : <Empty>Chưa có mục nào. Thêm ở trên hoặc dạy AI qua chat khi review ("nhớ: …").</Empty>}
        <p className="mt-1 text-[11px] text-muted-foreground">Loại: {KINDS.map((k) => `${k.label} ${active.filter((l) => l.kind === k.id).length}`).join(" · ")}</p>
      </Card>
    </div>
  );
}
