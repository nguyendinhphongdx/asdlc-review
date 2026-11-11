import { useQuery } from "@tanstack/react-query";
import type { LeaderboardRow } from "@mrd/contracts";
import { Trophy } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { fmtHours, fmtScore } from "../../kernel/format.js";
import { useRange } from "../../kernel/range.js";
import { Empty, ErrorBox, Loading, PageHeader } from "../../kernel/page.js";
import { ActivityFeed, Ticker } from "./activity.js";
import { getLeaderboard, getRecentRuns } from "./api.js";
import { PodiumSlot } from "./podium.js";
import { RankTable } from "./rank-table.js";
import { Eyebrow, GlassCard, Sparkles, Spotlights } from "./stage.js";

const PERIODS = [{ d: 7, l: "7 ngày" }, { d: 30, l: "30 ngày" }, { d: 90, l: "90 ngày" }];

function Period() {
  const { days, setDays } = useRange();
  return (
    <div role="group" aria-label="Kỳ xếp hạng" className="mx-auto flex rounded-xl border border-white/10 bg-black/30 p-1">
      {PERIODS.map((p) => (
        <button key={p.d} type="button" onClick={() => setDays(p.d)} aria-pressed={days === p.d}
          className={cn("rounded-lg px-5 py-1.5 text-sm font-semibold transition-colors", days === p.d ? "text-white shadow-[0_0_18px_#6366f166]" : "text-white/60 hover:text-white")}
          style={days === p.d ? { background: "linear-gradient(180deg, #818cf8, #6366f1)" } : undefined}>{p.l}</button>
      ))}
    </div>
  );
}

/** Danh hiệu rút ra từ chính số liệu của top 3. */
function titles(top: LeaderboardRow[]): string[] {
  const fastest = top.reduce((b, r, i) => ((r.improvement ?? -Infinity) > (top[b]!.improvement ?? -Infinity) ? i : b), 0);
  const fewest = top.reduce((b, r, i) => (r.avgReviewRounds < top[b]!.avgReviewRounds ? i : b), 0);
  return top.map((_, i) => (i === 0 ? "Quán quân" : i === fastest ? "Tăng tốc nhanh" : i === fewest ? "Ít vòng review nhất" : `Hạng ${i + 1}`));
}

export function LeaderboardPage() {
  const { days } = useRange();
  const q = useQuery({ queryKey: ["leaderboard", days], queryFn: () => getLeaderboard(days) });
  const runs = useQuery({ queryKey: ["leaderboard-runs"], queryFn: () => getRecentRuns(8) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const rows = q.data ?? [];
  if (!rows.length) return <><PageHeader title="Bảng xếp hạng" /><Empty>Chưa có dữ liệu trong kỳ này</Empty></>;
  const top = rows.slice(0, 3);
  const rest = rows.slice(3);
  const max = Math.max(...rows.map((r) => r.rankScore ?? 0), 1);
  const names = titles(top);
  const order = [1, 0, 2].map((i) => (top[i] ? { row: top[i]!, place: i as 0 | 1 | 2, title: names[i]! } : null));
  const recent = runs.data?.items ?? [];
  const teamAvg = rows.reduce((s, r) => s + (r.rankScore ?? 0), 0) / rows.length;
  const totalMr = rows.reduce((s, r) => s + r.mrCount, 0);
  return (
    <>
      <PageHeader title="Bảng xếp hạng" description="Xếp theo điểm lần review đầu, chuẩn hoá Bayesian để công bằng với người ít MR." />
      <section aria-label="Bảng xếp hạng" className="relative isolate overflow-hidden rounded-[18px] border border-white/10 text-white shadow-2xl"
        style={{ background: "radial-gradient(70% 55% at 38% 22%, #2a3382 0%, #141a55 38%, #070a1f 100%)" }}>
        <Sparkles /><Spotlights />
        <div className="relative flex flex-wrap items-center gap-3 px-6 pb-3.5 pt-5">
          <div><Eyebrow>Bảng xếp hạng</Eyebrow><div className="mt-0.5 text-xl font-extrabold tracking-tight">Ai đang dẫn đầu?</div></div>
          <Period />
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold"><Trophy className="size-3.5 text-amber-400" />{rows.length} thành viên · {totalMr} MR</span>
        </div>
        <Ticker runs={recent} />
        <div className="relative grid gap-5 px-6 pb-6 pt-3 lg:grid-cols-[minmax(0,1fr)_290px]">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="relative px-3 pt-4">
              <div aria-hidden="true" className="anim-spin pointer-events-none absolute left-1/2 top-[-40px] -z-0 size-[560px] -translate-x-1/2"
                style={{ background: "repeating-conic-gradient(from 0deg, rgb(255 255 255 / .08) 0deg 6deg, transparent 6deg 14deg)", WebkitMaskImage: "radial-gradient(circle, #000 6%, transparent 66%)", maskImage: "radial-gradient(circle, #000 6%, transparent 66%)" }} />
              <div className="relative flex items-end justify-center">
                {order.map((s, i) => (s ? <PodiumSlot key={s.row.name + i} row={s.row} place={s.place} title={s.title} /> : <div key={i} className="flex-1" />))}
              </div>
              <div aria-hidden="true" className="-mt-1 mx-[8%] h-6 rounded-[50%] blur-[6px]" style={{ background: "radial-gradient(ellipse at center, rgb(251 191 36 / .35), rgb(99 102 241 / .2) 45%, transparent 70%)" }} />
            </div>
            {rest.length > 0 && <GlassCard className="mt-2 pt-1.5"><RankTable rows={rest} start={4} max={max} /></GlassCard>}
          </div>
          <aside className="flex flex-col gap-3.5">
            <GlassCard className="p-4"><Eyebrow>Kỳ xếp hạng</Eyebrow><div className="mt-1.5 flex items-baseline gap-2"><span className="text-3xl font-extrabold tabular-nums">{days}</span><span className="text-white/60">ngày gần nhất</span></div><div className="mt-2 text-xs text-white/50">Từ {new Date(Date.now() - days * 864e5).toLocaleDateString("vi-VN")} đến nay</div></GlassCard>
            <GlassCard className="p-4"><Eyebrow>Điểm trung bình team</Eyebrow><div className="mt-1.5 text-3xl font-extrabold tabular-nums">{fmtScore(teamAvg)}</div><div className="mt-2 text-xs text-white/50">Trung bình điểm xếp hạng của {rows.length} thành viên</div></GlassCard>
            <ActivityFeed runs={recent} />
          </aside>
        </div>
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
