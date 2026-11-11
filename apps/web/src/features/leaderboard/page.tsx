import { useQuery } from "@tanstack/react-query";
import type { LeaderboardRow } from "@mrd/contracts";
import { ArrowUp, ArrowDown, Crown, ShieldAlert, Sparkles, Trophy } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCountUp } from "@/hooks/use-count-up";
import { cn } from "@/lib/utils";
import { fmtHours, fmtScore } from "../../kernel/format.js";
import { useRange } from "../../kernel/range.js";
import { Empty, ErrorBox, Loading, PageHeader } from "../../kernel/page.js";
import { getLeaderboard } from "./api.js";

/** Mỗi hạng: vương miện + màu huy chương + chiều cao bục + chữ nổi trên bục. */
const PLACES = [
  { ord: "1st", color: "#fbbf24", glow: "rgb(251 191 36 / 0.45)", height: 230, crown: "size-14", avatar: "size-24 text-3xl" },
  { ord: "2nd", color: "#cbd5e1", glow: "rgb(203 213 225 / 0.3)", height: 178, crown: "size-11", avatar: "size-20 text-2xl" },
  { ord: "3rd", color: "#d98b52", glow: "rgb(217 139 82 / 0.3)", height: 146, crown: "size-11", avatar: "size-20 text-2xl" },
] as const;
const PERIODS = [{ d: 7, l: "7 ngày" }, { d: 30, l: "30 ngày" }, { d: 90, l: "90 ngày" }];

function Podium({ row, place }: { row: LeaderboardRow; place: 0 | 1 | 2 }) {
  const m = PLACES[place];
  const delay = place === 0 ? 0.45 : place === 1 ? 0.2 : 0;
  const score = useCountUp(row.rankScore ?? 0, 1400, delay * 1000 + 300);
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center">
      <div className="anim-pop flex flex-col items-center" style={{ animationDelay: `${delay + 0.35}s` }}>
        <Crown className={cn("anim-float", m.crown)} style={{ color: m.color, filter: `drop-shadow(0 0 14px ${m.glow})` }} fill="currentColor" strokeWidth={1.5} aria-label={`Hạng ${place + 1}`} />
        <div className="relative mt-1">
          <span className={cn("flex items-center justify-center rounded-full p-[3px]", place === 0 && "anim-glow")} style={{ background: `linear-gradient(160deg, ${m.color}, color-mix(in oklab, ${m.color} 30%, #0b1030))` }}>
            <Avatar name={row.name} className={cn("bg-[#141a3d] font-bold text-white", m.avatar)} />
          </span>
          <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-md bg-primary px-1.5 text-[11px] font-bold leading-5 text-primary-foreground tabular-nums shadow">{row.mrCount}</span>
        </div>
        <div className="mt-4 max-w-full truncate px-1 text-lg font-bold text-white">@{row.usernames[0] ?? row.name}</div>
        <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-sm font-semibold tabular-nums text-white">
          <Trophy className="size-3.5" style={{ color: m.color }} />{score.toFixed(1)}
        </div>
      </div>
      <div className="anim-rise relative mt-5 w-full overflow-hidden rounded-t-2xl border border-b-0 border-white/10"
        style={{ height: m.height, animationDelay: `${delay}s`, background: "linear-gradient(180deg, #1c2457 0%, #121842 40%, #0b1030 100%)", boxShadow: `inset 0 1px 0 rgb(255 255 255 / 0.18), 0 -10px 40px -18px ${m.glow}` }}>
        <span className="anim-shine absolute inset-0 overflow-hidden" />
        <span aria-hidden="true" className="absolute inset-x-0 top-3 select-none text-center text-[88px] font-black italic leading-none tracking-tight"
          style={{ color: "transparent", WebkitTextStroke: `2px color-mix(in oklab, ${m.color} 28%, transparent)`, background: `linear-gradient(180deg, color-mix(in oklab, ${m.color} 30%, transparent), transparent 85%)`, WebkitBackgroundClip: "text", backgroundClip: "text" }}>{m.ord}</span>
      </div>
    </div>
  );
}

function Period() {
  const { days, setDays } = useRange();
  return (
    <div role="group" aria-label="Kỳ xếp hạng" className="mx-auto flex w-fit rounded-xl border border-white/10 bg-black/30 p-1">
      {PERIODS.map((p) => (
        <button key={p.d} type="button" onClick={() => setDays(p.d)} aria-pressed={days === p.d}
          className={cn("rounded-lg px-5 py-1.5 text-sm font-semibold transition-colors", days === p.d ? "bg-primary text-primary-foreground shadow" : "text-white/60 hover:text-white")}>{p.l}</button>
      ))}
    </div>
  );
}

function RankTable({ rows, start, max }: { rows: LeaderboardRow[]; start: number; max: number }) {
  return (
    <div className="overflow-x-auto px-2 pb-4 sm:px-6">
      <table className="w-full min-w-[640px] border-separate border-spacing-y-1.5 text-sm text-white">
        <thead>
          <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-white/45">
            <th className="px-4 py-2">Hạng</th><th className="px-4 py-2">Thành viên</th><th className="px-4 py-2">Điểm</th><th className="px-4 py-2">Hoạt động</th><th className="px-4 py-2">Tình trạng</th><th className="px-4 py-2 text-right">Cải thiện</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const up = (r.improvement ?? 0) >= 0;
            return (
              <tr key={r.memberId ?? r.name} className="anim-slide bg-white/[0.04] transition-colors hover:bg-white/[0.08]" style={{ animationDelay: `${1.1 + i * 0.07}s` }}>
                <td className="rounded-l-xl px-4 py-3"><span className="inline-flex items-center gap-2 font-semibold tabular-nums text-white/70"><Trophy className="size-4 text-white/35" />{start + i}</span></td>
                <td className="px-4 py-3"><span className="inline-flex items-center gap-2.5"><Avatar name={r.name} className="size-8 bg-[#1c2457] text-xs text-white" /><span className="font-medium">@{r.usernames[0] ?? r.name}</span></span></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3"><span className="w-10 font-semibold tabular-nums">{fmtScore(r.rankScore)}</span>
                    <span className="h-1.5 w-28 overflow-hidden rounded-full bg-white/10"><span className="anim-bar block h-full rounded-full bg-primary" style={{ width: `${max ? ((r.rankScore ?? 0) / max) * 100 : 0}%`, animationDelay: `${1.2 + i * 0.07}s` }} /></span></div>
                </td>
                <td className="px-4 py-3 tabular-nums text-white/60">{r.mrCount} MR · {r.runCount} lần</td>
                <td className="px-4 py-3">
                  <span className="inline-flex gap-1.5">
                    {r.secretLeaks > 0 && <Badge variant="danger"><ShieldAlert className="size-3" />{r.secretLeaks} secret</Badge>}
                    {r.blockers > 0 && <Badge variant="blocker">{r.blockers} blocker</Badge>}
                    {r.secretLeaks === 0 && r.blockers === 0 && <Badge variant="success"><Sparkles className="size-3" />Sạch</Badge>}
                  </span>
                </td>
                <td className="rounded-r-xl px-4 py-3 text-right">
                  <span className={cn("inline-flex items-center gap-1.5 font-bold tabular-nums", up ? "text-emerald-400" : "text-red-400")}>
                    <span className={cn("flex size-5 items-center justify-center rounded-full", up ? "bg-emerald-400/20" : "bg-red-400/20")}>{up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}</span>
                    {up ? "+" : ""}{fmtScore(r.improvement)}
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

export function LeaderboardPage() {
  const { days } = useRange();
  const q = useQuery({ queryKey: ["leaderboard", days], queryFn: () => getLeaderboard(days) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const rows = q.data ?? [];
  if (!rows.length) return <><PageHeader title="Bảng xếp hạng" /><Empty>Chưa có dữ liệu trong kỳ này</Empty></>;
  const top = rows.slice(0, 3);
  const rest = rows.slice(3);
  const max = Math.max(...rows.map((r) => r.rankScore ?? 0), 1);
  const order = [top[1], top[0], top[2]].map((r, i) => (r ? { r, place: ([1, 0, 2] as const)[i]! } : null));
  return (
    <>
      <PageHeader title="Bảng xếp hạng" description="Xếp theo điểm lần review đầu, chuẩn hoá Bayesian để công bằng với người ít MR." />

      <section aria-label="Bảng xếp hạng" className="relative isolate overflow-hidden rounded-2xl border border-white/10 text-white shadow-xl"
        style={{ background: "radial-gradient(90% 70% at 50% 18%, #232b6b 0%, #121842 45%, #070a1f 100%)" }}>
        <div className="relative px-4 pt-6 sm:px-8"><Period /></div>

        <div className="relative mx-auto mt-6 max-w-3xl px-4 pt-6 sm:px-8">
          <div aria-hidden="true" className="anim-spin pointer-events-none absolute left-1/2 top-[-30px] -z-10 size-[620px] -translate-x-1/2"
            style={{ background: "repeating-conic-gradient(from 0deg, rgb(255 255 255 / 0.09) 0deg 7deg, transparent 7deg 16deg)", WebkitMaskImage: "radial-gradient(circle, #000 8%, transparent 68%)", maskImage: "radial-gradient(circle, #000 8%, transparent 68%)" }} />
          <div className="flex items-end justify-center gap-0">
            {order.map((s, i) => (s ? <Podium key={s.r.name + i} row={s.r} place={s.place} /> : <div key={i} className="flex-1" />))}
          </div>
        </div>

        {rest.length > 0 && (
          <div className="relative border-t border-white/10 bg-[#0a0e2a]/80 pt-4 backdrop-blur-sm"><RankTable rows={rest} start={4} max={max} /></div>
        )}
      </section>

      <details className="group rounded-xl border bg-card shadow-sm">
        <summary className="cursor-pointer select-none px-5 py-3.5 text-sm font-medium">Bảng số liệu đầy đủ</summary>
        <Table>
          <TableHeader><TableRow className="hover:bg-transparent"><TableHead>#</TableHead><TableHead>Thành viên</TableHead><TableHead>MR</TableHead><TableHead>Lần đầu</TableHead><TableHead>Điểm cuối</TableHead><TableHead>Cải thiện</TableHead><TableHead>Xếp hạng</TableHead><TableHead>Blocker</TableHead><TableHead>Bảo mật</TableHead><TableHead>Secret</TableHead><TableHead>Convention</TableHead><TableHead>Vòng TB</TableHead><TableHead>Lead time</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={r.memberId ?? r.name} className="tabular-nums">
                <TableCell className="font-semibold">{i + 1}</TableCell><TableCell className="font-medium">{r.name}</TableCell><TableCell>{r.mrCount}</TableCell>
                <TableCell>{fmtScore(r.avgFirstScore)}</TableCell><TableCell>{fmtScore(r.avgFinalScore)}</TableCell>
                <TableCell className={(r.improvement ?? 0) >= 0 ? "text-success-fg" : "text-danger-fg"}>{fmtScore(r.improvement)}</TableCell>
                <TableCell className="font-bold">{fmtScore(r.rankScore)}</TableCell>
                <TableCell>{r.blockers}</TableCell><TableCell>{r.securityIssues}</TableCell><TableCell>{r.secretLeaks}</TableCell><TableCell>{r.conventionViolations}</TableCell>
                <TableCell>{fmtScore(r.avgReviewRounds)}</TableCell><TableCell>{fmtHours(r.avgLeadTimeHours)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="border-t px-5 py-3 text-[13px] text-muted-foreground">Xếp hạng = trung bình Bayesian của điểm lần đầu, (C·m + Σs) / (C + n), C = 5, m = điểm trung bình toàn team.</p>
      </details>
    </>
  );
}
