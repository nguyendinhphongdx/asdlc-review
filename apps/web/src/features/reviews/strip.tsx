import type { RunActivityEntry, RunDetailDto } from "@mrd/contracts";
import { Check, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, GradeBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtDur, fmtMs } from "../../kernel/format.js";
import { STAGES, stageLabel } from "../../kernel/stages.js";

export type StageState = "done" | "failed" | "running" | "pending";

/** Đồng hồ 1 giây/lần khi `on`, để số giây "đã chờ/đang chạy" nhích theo thời gian thực. */
export function useTick(on: boolean) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => set((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [on]);
}
export const since = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
export const clock = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}p${String(s % 60).padStart(2, "0")}s` : `${s}s`);

/** Trạng thái từng bước của pipeline, suy ra từ run. */
export function stageState(r: RunDetailDto, id: string): StageState {
  if (r.status === "failed" && r.stage === id) return "failed";
  if ((r.status === "running" || r.status === "queued") && r.stage === id) return "running";
  if (id === "queue" && !(r.status === "queued" || (r.status === "failed" && r.stage === "queue"))) return "done";
  if (r.stageTimings[id] != null) return "done";
  if (r.status === "succeeded") return "done";
  return "pending";
}

/** Bước hợp lệ nên mở khi bấm "Xem log": đang chạy/lỗi thì chính bước đó, xong thì bước đầu tiên có cảnh báo (không có thì bước AI). */
export function defaultLogStage(r: RunDetailDto, entries: RunActivityEntry[]): string {
  if ((r.status === "running" || r.status === "queued" || r.status === "failed") && STAGES.some((s) => s.id === r.stage)) return r.stage!;
  return entries.find((e) => e.level === "warn")?.stage ?? "review";
}

const GRADE_TONE = "border-warning";

/** Thanh tiến trình gọn, luôn nằm trên cùng trang review: trạng thái, 8 bước (bấm vào để xem log bước đó), điểm và chi phí. */
export function ProgressStrip({ r, entries, onPickStage, onRetry, retrying, retried }: {
  r: RunDetailDto; entries: RunActivityEntry[]; onPickStage: (id: string) => void;
  onRetry: () => void; retrying: boolean; retried: boolean;
}) {
  const live = r.status === "queued" || r.status === "running";
  useTick(live);
  const last = entries[entries.length - 1];
  const known = STAGES.some((x) => x.id === r.stage);
  const startedAt = (id: string) => (id === "queue" ? r.createdAt : [...entries].reverse().find((e) => e.stage === id && e.message.startsWith("Bắt đầu"))?.at);
  const title = r.status === "failed" ? `Lỗi${known ? ` · ${stageLabel(r.stage)}` : ""}` : r.status === "running" ? `Đang chạy${known ? ` · ${stageLabel(r.stage)}` : ""}` : r.status === "succeeded" ? "Hoàn tất" : r.status === "skipped" ? "Bỏ qua" : "Đang chờ · hàng đợi";
  const sub = r.status === "succeeded" ? `Tổng ${fmtDur(r.durationMs)}` : live ? (last ? `${last.message.slice(0, 60)}${last.message.length > 60 ? "…" : ""}` : "Chưa có tín hiệu từ worker") : (r.error ?? "").slice(0, 80);
  const doneCount = STAGES.filter((s) => stageState(r, s.id) === "done").length;
  const pct = r.status === "succeeded" ? 100 : Math.round((doneCount / STAGES.length) * 100);
  const variant = r.status === "failed" ? "danger" : r.status === "succeeded" ? "success" : r.status === "running" ? "info" : "secondary";
  const ring = r.score == null ? "" : r.score >= 85 ? "border-success" : r.score >= 60 ? "border-warning" : "border-danger";

  return (
    <section aria-label="Tiến trình review" className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-3.5">
        <div className="flex min-w-[190px] items-center gap-3">
          <span className={cn("flex size-9 flex-none items-center justify-center rounded-full", r.status === "succeeded" && "bg-success-bg text-success-fg", r.status === "failed" && "bg-danger-bg text-danger-fg", live && "bg-info-bg text-info-fg", r.status === "skipped" && "bg-secondary text-muted-foreground")}>
            {r.status === "succeeded" ? <Check className="size-[18px]" aria-hidden="true" /> : r.status === "failed" ? <X className="size-[18px]" aria-hidden="true" /> : <Loader2 className={cn("size-[18px]", live && "animate-spin")} aria-hidden="true" />}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold">{title}<Badge variant={variant} className="sr-only">{title}</Badge></div>
            <div className="max-w-[260px] truncate text-xs tabular-nums text-muted-foreground" title={sub}>{sub}</div>
          </div>
        </div>

        <ol className="flex min-w-[420px] flex-[1_1_460px]">
          {STAGES.map((st, i) => {
            const s = stageState(r, st.id);
            const ms = r.stageTimings[st.id];
            const started = startedAt(st.id);
            const time = s === "pending" ? "—" : s === "running" ? (started ? clock(since(started)) : "…") : ms != null ? fmtMs(ms) : "—";
            return (
              <li key={st.id} className="relative flex min-w-0 flex-1 flex-col items-center">
                {i > 0 && <span aria-hidden="true" className={cn("absolute left-[-50%] top-[10px] h-0.5 w-full rounded", s === "pending" ? "bg-border" : s === "running" ? "bg-primary/40" : "bg-success/45")} />}
                <button type="button" onClick={() => onPickStage(st.id)} aria-label={`Xem log bước ${st.label}`} className="relative flex w-full flex-col items-center gap-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className={cn("relative flex size-[22px] items-center justify-center rounded-full", s === "done" && "bg-success-bg text-success-fg", s === "failed" && "bg-danger-bg text-danger-fg", s === "running" && "bg-info-bg text-info-fg ring-4 ring-info-bg/70", s === "pending" && "bg-secondary text-muted-foreground")}>
                    {s === "done" ? <Check className="size-3" aria-hidden="true" /> : s === "failed" ? <X className="size-3" aria-hidden="true" /> : s === "running" ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : <span className="text-[10px] font-semibold">{i + 1}</span>}
                  </span>
                  <span className={cn("max-w-full truncate text-xs", s === "running" ? "font-semibold" : "font-medium", s === "pending" && "text-muted-foreground")}>{st.label}</span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">{time}</span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="flex items-center gap-4">
          {r.score != null && (
            <div className="flex items-center gap-2.5">
              <span className={cn("flex size-11 items-center justify-center rounded-full border-4 text-[15px] font-bold tabular-nums", ring || GRADE_TONE)}>{Math.round(r.score)}</span>
              <div className="flex flex-col gap-0.5"><GradeBadge grade={r.grade} /></div>
            </div>
          )}
          <div className="text-right text-xs leading-5 text-muted-foreground">
            {r.model && <div className="font-mono">{r.model}</div>}
            <div className="tabular-nums">{r.costUsd != null ? `$${r.costUsd.toFixed(2)}` : ""}</div>
          </div>
        </div>
      </div>
      <div className="h-[3px] bg-muted" aria-hidden="true"><div className={cn("h-full transition-all", r.status === "failed" ? "bg-danger" : r.status === "succeeded" ? "bg-success" : "bg-primary")} style={{ width: `${pct}%` }} /></div>
      {r.status === "failed" && (
        <div role="alert" className="flex flex-wrap items-center gap-3 border-t bg-danger-bg/40 px-5 py-2.5 text-[13px] text-danger-fg">
          <span className="min-w-0 flex-1 break-words">{r.error ?? "Stage này đã lỗi."}</span>
          <Button size="sm" variant="outline" disabled={retrying} onClick={onRetry}>Thử lại</Button>{retried && <span className="text-xs text-muted-foreground">Đã xếp hàng lại.</span>}
        </div>
      )}
      {r.status === "skipped" && <p className="border-t px-5 py-2.5 text-[13px] text-muted-foreground">{r.error ?? "Lần review này bị bỏ qua."}</p>}
    </section>
  );
}
