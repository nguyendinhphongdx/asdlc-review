import type { RunListItemDto } from "@mrd/contracts";
import { initials } from "@/components/ui/avatar";
import { GlassCard, Eyebrow } from "./stage.js";
import { fmtScore } from "../../kernel/format.js";

function ago(iso: string | null): string {
  if (!iso) return "";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} giờ trước` : `${Math.round(h / 24)} ngày trước`;
}
const GRADE_DOT: Record<string, string> = { A: "#34d399", B: "#a3e635", C: "#fbbf24", D: "#fb923c", F: "#f87171" };
const text = (r: RunListItemDto) => `${r.grade ?? "–"} · ${fmtScore(r.score)} ở !${r.mr.iid}`;

export function Ticker({ runs }: { runs: RunListItemDto[] }) {
  if (!runs.length) return null;
  return (
    <div className="relative flex gap-2.5 overflow-hidden px-6 pb-1.5" aria-label="Review mới nhất">
      {runs.slice(0, 4).map((r) => (
        <GlassCard key={r.id} className="inline-flex shrink-0 items-center gap-2 px-3 py-1.5 text-xs text-white">
          <span className="flex size-[22px] items-center justify-center rounded-full bg-[#1c2457] text-[9px] font-bold">{initials(r.mr.authorUsername)}</span>
          <b>@{r.mr.authorUsername}</b><span className="text-white/60">đạt {text(r)}</span>
        </GlassCard>
      ))}
    </div>
  );
}

export function ActivityFeed({ runs }: { runs: RunListItemDto[] }) {
  return (
    <GlassCard className="px-4 pb-1 pt-2.5">
      <Eyebrow className="pb-1 pt-1">Hoạt động gần đây</Eyebrow>
      {runs.length === 0 && <p className="py-4 text-sm text-white/50">Chưa có review nào.</p>}
      {runs.slice(0, 6).map((r) => (
        <div key={r.id} className="flex items-start gap-2.5 border-b border-white/10 py-2.5 last:border-0">
          <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold" style={{ background: "radial-gradient(circle at 30% 25%, #2b3590, #111743)" }}>{initials(r.mr.authorUsername)}</span>
          <div className="min-w-0 flex-1"><div className="text-[13px]"><b>@{r.mr.authorUsername}</b> <span className="text-white/65">đạt <b className="text-white">{text(r)}</b></span></div><div className="mt-0.5 text-[11px] text-white/40">{ago(r.finishedAt ?? r.createdAt)}</div></div>
          <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ background: GRADE_DOT[r.grade ?? ""] ?? "#94a3b8" }} aria-hidden="true" />
        </div>
      ))}
    </GlassCard>
  );
}
