import type { LeaderboardRow } from "@mrd/contracts";
import { ArrowDown, ArrowUp, ShieldAlert, Sparkles } from "lucide-react";
import { initials } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fmtScore } from "../../kernel/format.js";

export function RankTable({ rows, start, max }: { rows: LeaderboardRow[]; start: number; max: number }) {
  const th = "px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-white/45 whitespace-nowrap";
  return (
    <div className="overflow-x-auto px-5 pb-5 pt-1">
      <table className="w-full min-w-[500px] border-separate border-spacing-y-1.5 text-sm text-white">
        <thead><tr><th className={th}>Hạng</th><th className={th}>Thành viên</th><th className={th}>Điểm</th><th className={th}>Lần đầu → cuối</th><th className={th}>Tình trạng</th><th className={cn(th, "text-right")}>Cải thiện</th></tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const imp = r.improvement ?? 0;
            const up = imp >= 0;
            const cell = "bg-white/[0.04] px-2.5 py-3 group-hover:bg-white/[0.08]";
            return (
              <tr key={r.memberId ?? r.name} className="anim-slide group" style={{ animationDelay: `${1.1 + i * 0.07}s` }}>
                <td className={cn(cell, "rounded-l-xl")}><span className="flex size-7 items-center justify-center rounded-lg bg-white/10 font-extrabold tabular-nums">{start + i}</span></td>
                <td className={cell}>
                  <span className="inline-flex items-center gap-2.5 whitespace-nowrap">
                    <span className="flex size-[34px] items-center justify-center rounded-full text-xs font-bold" style={{ background: "radial-gradient(circle at 30% 25%, #2b3590, #111743)" }}>{initials(r.name)}</span>
                    <span><b>@{r.usernames[0] ?? r.name}</b><br /><span className="text-xs text-white/50">{r.mrCount} MR · {r.runCount} lần</span></span>
                  </span>
                </td>
                <td className={cell}>
                  <span className="inline-flex items-center gap-2.5"><b className="w-10 text-[15px] tabular-nums">{fmtScore(r.rankScore)}</b>
                    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10"><span className="anim-bar block h-full rounded-full" style={{ width: `${max ? ((r.rankScore ?? 0) / max) * 100 : 0}%`, background: "linear-gradient(90deg, #6366f1, #a78bfa)", animationDelay: `${1.2 + i * 0.07}s` }} /></span></span>
                </td>
                <td className={cn(cell, "whitespace-nowrap tabular-nums text-white/70")}>{fmtScore(r.avgFirstScore)} → {fmtScore(r.avgFinalScore)}</td>
                <td className={cell}>
                  <span className="inline-flex gap-1.5">
                    {r.secretLeaks > 0 && <Badge variant="danger"><ShieldAlert className="size-3" />{r.secretLeaks} secret</Badge>}
                    {r.blockers > 0 && <Badge variant="blocker">{r.blockers} blocker</Badge>}
                    {r.secretLeaks === 0 && r.blockers === 0 && <Badge variant="success"><Sparkles className="size-3" />Sạch</Badge>}
                  </span>
                </td>
                <td className={cn(cell, "rounded-r-xl text-right")}>
                  <span className={cn("inline-flex items-center gap-1.5 font-bold tabular-nums", up ? "text-emerald-400" : "text-red-400")}>
                    <span className={cn("flex size-5 items-center justify-center rounded-full", up ? "bg-emerald-400/20" : "bg-red-400/20")}>{up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}</span>
                    {up ? "+" : "−"}{fmtScore(Math.abs(imp))}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
