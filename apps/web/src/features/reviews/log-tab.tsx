import type { RunActivityEntry, RunDetailDto } from "@mrd/contracts";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Loader2, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fmtMs } from "../../kernel/format.js";
import { STAGES } from "../../kernel/stages.js";
import { TASK_LABEL } from "../../kernel/usage-task.js";
import { getRunUsage } from "./api.js";
import { CommentEditor } from "./comment-editor.js";
import { StageLog } from "./live-log.js";
import { clock, since, stageState, useTick } from "./strip.js";

const COLORS = ["bg-muted-foreground/60", "bg-chart-2", "bg-chart-5", "bg-chart-1", "bg-chart-3", "bg-chart-4", "bg-primary", "bg-chart-2"];

const usd = (n: number) => (n >= 10 ? `$${n.toFixed(1)}` : `$${n.toFixed(2)}`);
const num = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));

/** Chi phí/token theo từng lần gọi AI của run (gồm cả chat), gộp theo loại việc; bấm mở xem từng lần. */
function UsageByTask({ runId, live }: { runId: string; live: boolean }) {
  const q = useQuery({ queryKey: ["run-usage", runId], queryFn: () => getRunUsage(runId), refetchInterval: live ? 4000 : false });
  const rows = q.data ?? [];
  if (!rows.length) return <Card className="gap-1 p-5"><h2 className="text-[15px] font-semibold">Chi phí theo việc</h2><p className="text-[13px] text-muted-foreground">{q.isLoading ? "Đang tải…" : "Lần review này chưa có số liệu theo việc (chỉ có từ các review chạy sau khi tính năng này ra đời)."}</p></Card>;
  const by = new Map<string, { cost: number; calls: number; tok: number; items: typeof rows }>();
  for (const e of rows) {
    const s = by.get(e.kind) ?? { cost: 0, calls: 0, tok: 0, items: [] };
    s.cost += e.costUsd ?? 0; s.calls++; s.tok += e.inputTokens + e.outputTokens + e.cacheReadTokens + e.cacheWriteTokens; s.items.push(e);
    by.set(e.kind, s);
  }
  const total = rows.reduce((a, e) => a + (e.costUsd ?? 0), 0);
  const totalTok = [...by.values()].reduce((a, s) => a + s.tok, 0);
  return (
    <Card className="gap-3 p-5">
      <div className="flex items-baseline justify-between"><h2 className="text-[15px] font-semibold">Chi phí theo việc</h2><span className="text-[13px] tabular-nums text-muted-foreground">{rows.length} lần gọi AI · {usd(total)} · {num(totalTok)} token</span></div>
      <div className="overflow-x-auto"><div className="min-w-[560px]">
        {[...by.entries()].map(([kind, s]) => {
          const meta = TASK_LABEL[kind as keyof typeof TASK_LABEL];
          const share = total > 0 ? s.cost / total : s.tok / Math.max(1, totalTok);
          return (
            <details key={kind} className="group border-t first:border-0">
              <summary className="grid cursor-pointer list-none grid-cols-[1.6fr_0.5fr_0.7fr_0.9fr_1fr] items-center gap-3 py-2 text-[13.5px]" title={meta?.hint}>
                <span className="flex items-center gap-1.5 font-medium"><ChevronDown className="size-3.5 -rotate-90 text-muted-foreground transition-transform group-open:rotate-0" aria-hidden="true" />{meta?.label ?? kind}</span>
                <span className="tabular-nums text-muted-foreground">{s.calls} lần</span>
                <span className="tabular-nums">{total > 0 ? usd(s.cost) : "–"}</span>
                <span className="tabular-nums text-muted-foreground">{num(s.tok)} token</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true"><span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(2, Math.round(share * 100))}%` }} /></span>
              </summary>
              <ul className="mb-2 ml-5 flex flex-col gap-1 border-l pl-3 text-xs text-muted-foreground">
                {s.items.map((e) => (
                  <li key={e.id} className="flex flex-wrap gap-x-3 tabular-nums"><span className="min-w-0 flex-1 truncate" title={e.label}>{e.label || "—"}</span><span>vào {num(e.inputTokens)}</span><span>ra {num(e.outputTokens)}</span><span>cache {num(e.cacheReadTokens + e.cacheWriteTokens)}</span><span className="w-14 text-right">{e.costUsd != null ? usd(e.costUsd) : "–"}</span></li>
                ))}
              </ul>
            </details>
          );
        })}
      </div></div>
    </Card>
  );
}

/** Tab "Nhật ký": thời gian theo bước + log chi tiết từng bước (bước đang chạy cập nhật trực tiếp). */
export function LogTab({ r, entries, open, onOpen }: { r: RunDetailDto; entries: RunActivityEntry[]; open: string; onOpen: (id: string) => void }) {
  const live = r.status === "queued" || r.status === "running";
  useTick(live);
  const [level, setLevel] = useState<"all" | "warn">("all");
  const startedAt = (id: string) => (id === "queue" ? r.createdAt : [...entries].reverse().find((e) => e.stage === id && e.message.startsWith("Bắt đầu"))?.at);
  const ms = (id: string) => {
    const s = stageState(r, id);
    if (s === "running") { const t = startedAt(id); return t ? since(t) * 1000 : 0; }
    return r.stageTimings[id] ?? 0;
  };
  const rows = STAGES.map((st, i) => ({ ...st, ms: ms(st.id), color: COLORS[i % COLORS.length]!, state: stageState(r, st.id) }));
  const total = rows.reduce((a, x) => a + x.ms, 0);
  const copy = () => void navigator.clipboard?.writeText(entries.map((e) => `${new Date(e.at).toISOString()} [${e.stage}] ${e.level}: ${e.message}`).join("\n"));

  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-3 p-5">
        <div className="flex items-baseline justify-between"><h2 className="text-[15px] font-semibold">Thời gian theo bước</h2><span className="text-[13px] tabular-nums text-muted-foreground">Tổng {total ? fmtMs(total) : "—"}</span></div>
        <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-full bg-muted" role="img" aria-label="Tỉ lệ thời gian từng bước">
          {rows.filter((x) => x.ms > 0).map((x) => <span key={x.id} className={cn("h-full", x.color)} style={{ width: `${(x.ms / total) * 100}%` }} />)}
        </div>
        <div className="overflow-x-auto"><div className="min-w-[480px]">
          {rows.map((x) => (
            <div key={x.id} className="grid grid-cols-[18px_1.4fr_0.8fr_0.6fr] items-center gap-3 border-t py-2 text-[13.5px] first:border-0">
              <span className={cn("size-3 rounded", x.color)} /><span className="font-medium">{x.label}</span>
              <span className="tabular-nums">{x.ms ? fmtMs(x.ms) : "—"}</span>
              <span className="tabular-nums text-muted-foreground">{x.ms && total ? `${Math.round((x.ms / total) * 100)}%` : "—"}</span>
            </div>
          ))}
        </div></div>
      </Card>

      <UsageByTask runId={r.id} live={live} />

      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <h2 className="text-[15px] font-semibold">Log chi tiết</h2>
            {live && <span className="inline-flex items-center gap-1.5 rounded-full bg-info-bg px-2.5 py-0.5 text-xs font-semibold text-info-fg"><span className="size-[7px] animate-pulse rounded-full bg-primary" />LIVE · tự cuộn theo dòng mới</span>}
          </div>
          <div className="flex items-center gap-2" role="group" aria-label="Mức log">
            {(["all", "warn"] as const).map((k) => (
              <button key={k} type="button" aria-pressed={level === k} onClick={() => setLevel(k)} className={cn("h-7 rounded-full border px-3 text-[12.5px] font-medium", level === k ? "border-primary bg-info-bg text-info-fg" : "text-muted-foreground")}>{k === "all" ? "Tất cả" : "Cảnh báo"}</button>
            ))}
            <button type="button" onClick={copy} className="h-7 rounded-md border px-3 text-[12.5px] font-medium hover:bg-muted">Sao chép</button>
          </div>
        </div>
        {rows.map((x) => {
          const all = entries.filter((e) => e.stage === x.id);
          const warns = all.filter((e) => e.level === "warn").length;
          const shown = level === "warn" ? all.filter((e) => e.level === "warn") : all;
          const isOpen = open === x.id;
          return (
            <div key={x.id} className="border-t">
              <button type="button" aria-expanded={isOpen} onClick={() => onOpen(isOpen ? "" : x.id)} className="flex w-full items-center gap-3 px-5 py-3 text-left outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring">
                <span className={cn("flex size-[22px] flex-none items-center justify-center rounded-full text-[11px] font-bold", x.state === "done" && "bg-success-bg text-success-fg", x.state === "failed" && "bg-danger-bg text-danger-fg", x.state === "running" && "bg-info-bg text-info-fg", x.state === "pending" && "bg-secondary text-muted-foreground")}>
                  {x.state === "done" ? <Check className="size-3" aria-hidden="true" /> : x.state === "failed" ? <X className="size-3" aria-hidden="true" /> : x.state === "running" ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : STAGES.findIndex((s) => s.id === x.id) + 1}
                </span>
                <span className="flex-1 text-sm font-medium">{x.label}</span>
                {x.state === "running" && <Badge variant="info">đang chạy {clock(Math.round(x.ms / 1000))}</Badge>}
                {warns > 0 && <Badge variant="warning">{warns} cảnh báo</Badge>}
                <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">{x.ms ? fmtMs(x.ms) : "—"}</span>
                <span className="w-16 text-right text-xs text-muted-foreground">{shown.length} dòng</span>
                <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", !isOpen && "-rotate-90")} aria-hidden="true" />
              </button>
              {isOpen && <div className="px-5 pb-4">{x.state === "pending" ? <p className="text-xs text-muted-foreground">Chưa chạy.</p> : <StageLog entries={shown} live={x.state === "running"} />}{x.id === "publish" && x.state === "done" && r.commentDraft && <CommentEditor runId={r.id} draft={r.commentDraft} commentUrl={r.commentUrl} />}</div>}
            </div>
          );
        })}
      </Card>
    </div>
  );
}
