import type { RunActivityEntry, RunDetailDto } from "@mrd/contracts";
import { Check, Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtDur, fmtMs } from "../../kernel/format.js";
import { STAGES, stageLabel } from "../../kernel/stages.js";
import { clock, since, stageState, useTick } from "./strip.js";

/** Dải trạng thái luôn hiện ở đầu panel: đang làm gì, ở bước mấy, bao lâu, tốn bao nhiêu; lỗi thì có nút thử lại. */
export function PanelStatus({ r, entries, onRetry, retrying, retried, wide, onToggleWide }: {
  r: RunDetailDto; entries: RunActivityEntry[]; onRetry: () => void; retrying: boolean; retried: boolean; wide: boolean; onToggleWide: () => void;
}) {
  const live = r.status === "queued" || r.status === "running";
  useTick(live);
  const idx = Math.max(0, STAGES.findIndex((s) => s.id === r.stage));
  const doneCount = STAGES.filter((s) => stageState(r, s.id) === "done").length;
  const pct = r.status === "succeeded" ? 100 : Math.round((doneCount / STAGES.length) * 100);
  const last = entries[entries.length - 1];
  const elapsed = live ? since(r.createdAt) : null;
  const variant = r.status === "failed" ? "danger" : r.status === "succeeded" ? "success" : r.status === "running" ? "info" : "secondary";
  const label = r.status === "failed" ? "Lỗi" : r.status === "running" ? `Đang chạy · bước ${idx + 1}/${STAGES.length}` : r.status === "succeeded" ? "Hoàn tất" : r.status === "skipped" ? "Bỏ qua" : "Đang chờ";
  return (
    <div className="border-b bg-card px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Badge variant={variant}>{live && <Loader2 className="size-3 animate-spin" aria-hidden="true" />}{label}</Badge>
        <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground tabular-nums">
          {r.status === "succeeded" ? `${fmtDur(r.durationMs)}${r.costUsd != null ? ` · $${r.costUsd.toFixed(2)}` : ""}${r.model ? ` · ${r.model}` : ""}` : live ? `${stageLabel(r.stage)} · ${clock(elapsed ?? 0)}${last ? ` · ${last.message.slice(0, 48)}` : ""}` : (r.error ?? "").slice(0, 80)}
        </span>
        <Button size="sm" variant="ghost" onClick={onToggleWide} aria-pressed={wide} aria-label={wide ? "Thu nhỏ panel" : "Mở rộng panel"}>{wide ? "Thu nhỏ" : "Mở rộng"}</Button>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className={cn("h-full transition-all", r.status === "failed" ? "bg-danger" : r.status === "succeeded" ? "bg-success" : "bg-primary")} style={{ width: `${pct}%` }} /></div>
      {r.status === "failed" && (
        <div role="alert" className="mt-2.5 flex flex-wrap items-center gap-3 rounded-md bg-danger-bg/50 px-3 py-2 text-[13px] text-danger-fg">
          <span className="min-w-0 flex-1 break-words">{r.error ?? "Bước này đã lỗi."}</span>
          <Button size="sm" variant="outline" disabled={retrying} onClick={onRetry}>Thử lại</Button>{retried && <span className="text-xs text-muted-foreground">Đã xếp hàng lại.</span>}
        </div>
      )}
    </div>
  );
}

const STATE_ICON = {
  done: <span className="flex size-6 flex-none items-center justify-center rounded-full bg-success-bg text-success-fg"><Check className="size-3.5" aria-hidden="true" /></span>,
  failed: <span className="flex size-6 flex-none items-center justify-center rounded-full bg-danger-bg text-danger-fg"><X className="size-3.5" aria-hidden="true" /></span>,
  running: <span className="flex size-6 flex-none items-center justify-center rounded-full bg-info-bg text-info-fg ring-4 ring-info-bg/70"><Loader2 className="size-3.5 animate-spin" aria-hidden="true" /></span>,
  pending: <span className="flex size-6 flex-none items-center justify-center rounded-full bg-secondary text-muted-foreground"><span className="size-1.5 rounded-full bg-muted-foreground/50" /></span>,
} as const;

/** Tab "Tiến trình": từng bước của pipeline với trạng thái, thời gian và vài dòng gần nhất của bước đó; bấm để xem log đầy đủ. */
export function ProgressTab({ r, entries, onOpenLog }: { r: RunDetailDto; entries: RunActivityEntry[]; onOpenLog: (stage: string) => void }) {
  const live = r.status === "queued" || r.status === "running";
  useTick(live);
  const startedAt = (id: string) => (id === "queue" ? r.createdAt : [...entries].reverse().find((e) => e.stage === id && e.message.startsWith("Bắt đầu"))?.at);
  return (
    <ol className="flex flex-col gap-2.5" aria-label="Các bước review">
      {STAGES.map((st, i) => {
        const s = stageState(r, st.id);
        const ms = r.stageTimings[st.id];
        const started = startedAt(st.id);
        const time = s === "pending" ? "—" : s === "running" ? (started ? clock(since(started)) : "…") : ms != null ? fmtMs(ms) : "—";
        const lines = entries.filter((e) => e.stage === st.id && !/^(Bắt đầu|Xong):/.test(e.message)).slice(-2);
        return (
          <li key={st.id} className={cn("rounded-xl border bg-card p-3.5", s === "running" && "border-primary/60 shadow-[0_0_0_3px_var(--info-bg)]", s === "pending" && "bg-muted/40")}>
            <div className="flex items-center gap-3">
              {STATE_ICON[s]}
              <div className="min-w-0 flex-1"><div className={cn("text-sm", s === "pending" ? "text-muted-foreground" : "font-semibold")}>{i + 1} · {st.label}</div></div>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">{time}</span>
              {s !== "pending" && <Button size="sm" variant="ghost" onClick={() => onOpenLog(st.id)} aria-label={`Xem log bước ${st.label}`}>Log</Button>}
            </div>
            {lines.length > 0 && <ul className="ml-9 mt-2 flex flex-col gap-0.5 text-[13px] text-muted-foreground">{lines.map((e, j) => <li key={j} className="truncate" title={e.message}>{e.message}</li>)}</ul>}
          </li>
        );
      })}
    </ol>
  );
}
