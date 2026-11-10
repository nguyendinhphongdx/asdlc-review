import { useQuery } from "@tanstack/react-query";
import type { LeaderboardRow } from "@mrd/contracts";
import { Crown, Flame, ShieldAlert, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCountUp } from "@/hooks/use-count-up";
import { cn } from "@/lib/utils";
import { fmtHours, fmtScore } from "../../kernel/format.js";
import { useRange } from "../../kernel/range.js";
import { Empty, ErrorBox, Loading, PageHeader } from "../../kernel/page.js";
import { getLeaderboard } from "./api.js";

const MEDAL = [
  { name: "Quán quân", color: "var(--gold)", block: 216, ring: "ring-[var(--gold)]" },
  { name: "Á quân", color: "var(--silver)", block: 176, ring: "ring-[var(--silver)]" },
  { name: "Hạng ba", color: "var(--bronze)", block: 144, ring: "ring-[var(--bronze)]" },
] as const;
const CONFETTI = ["#f59e0b", "#6366f1", "#10b981", "#ef4444", "#0ea5e9", "#ec4899"];

function Confetti() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 28 }, (_, i) => (
        <span key={i} className="anim-fall absolute top-0 block h-2.5 w-1.5 rounded-[1px]"
          style={{ left: `${(i * 37) % 100}%`, background: CONFETTI[i % CONFETTI.length], animationDelay: `${(i % 9) * 0.35}s`, animationDuration: `${2.6 + (i % 5) * 0.5}s` }} />
      ))}
    </div>
  );
}

function PodiumSlot({ row, place }: { row: LeaderboardRow; place: 0 | 1 | 2 }) {
  const m = MEDAL[place];
  const delay = place === 0 ? 0.5 : place === 1 ? 0.2 : 0;
  const score = useCountUp(row.rankScore ?? 0, 1400, delay * 1000 + 300);
  return (
    <div className="flex w-full max-w-[240px] flex-1 flex-col items-center">
      <div className="anim-pop flex flex-col items-center gap-1 text-center" style={{ animationDelay: `${delay + 0.35}s` }}>
        {place === 0 && <Crown className="anim-float size-8 text-[var(--gold)]" fill="currentColor" aria-label="Quán quân" />}
        <span className={cn("flex size-16 items-center justify-center rounded-full bg-background text-lg font-bold ring-4", m.ring, place === 0 && "anim-glow size-20 text-2xl")}>
          <Avatar name={row.name} className="size-full bg-transparent text-[length:inherit]" />
        </span>
        <div className="mt-1 text-base font-semibold text-white">{row.name}</div>
        <div className="text-xs text-white/60">{row.usernames[0] ?? ""}</div>
      </div>
      <div className="anim-rise relative mt-3 flex w-full flex-col items-center overflow-hidden rounded-t-xl border border-b-0 border-white/15 px-3 pt-4"
        style={{ height: m.block, animationDelay: `${delay}s`, background: `linear-gradient(180deg, color-mix(in oklab, ${m.color} 38%, transparent), color-mix(in oklab, ${m.color} 6%, transparent))` }}>
        <span className="anim-shine absolute inset-0 overflow-hidden" />
        <span className="text-5xl font-black leading-none tabular-nums" style={{ color: m.color }}>{place + 1}</span>
        <span className="mt-1 text-xs font-medium uppercase tracking-widest text-white/70">{m.name}</span>
        <span className="mt-auto pb-3 text-2xl font-bold tabular-nums text-white">{score.toFixed(1)}</span>
      </div>
    </div>
  );
}

function RankRow({ row, rank, index, max }: { row: LeaderboardRow; rank: number; index: number; max: number }) {
  const improved = (row.improvement ?? 0) >= 0;
  const width = max ? ((row.rankScore ?? 0) / max) * 100 : 0;
  return (
    <li className="anim-slide" style={{ animationDelay: `${1.1 + index * 0.08}s` }}>
      <Card className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4 transition-shadow hover:shadow-md">
        <span className="w-8 text-center text-xl font-bold tabular-nums text-muted-foreground">{rank}</span>
        <div className="flex min-w-[170px] items-center gap-3"><Avatar name={row.name} className="size-10 text-sm" /><div><div className="font-medium leading-tight">{row.name}</div><div className="font-mono text-xs text-muted-foreground">{row.usernames[0] ?? ""}</div></div></div>
        <div className="min-w-[160px] flex-1">
          <div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>{row.mrCount} MR · lần đầu {fmtScore(row.avgFirstScore)}</span><span className="font-semibold tabular-nums text-foreground">{fmtScore(row.rankScore)}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="anim-bar h-full rounded-full bg-primary" style={{ width: `${width}%`, animationDelay: `${1.2 + index * 0.08}s` }} /></div>
        </div>
        <Badge variant={improved ? "success" : "danger"} className="tabular-nums">{improved ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}{fmtScore(row.improvement)}</Badge>
        <div className="flex min-w-[120px] gap-1.5">
          {row.secretLeaks > 0 && <Badge variant="danger"><ShieldAlert className="size-3" />{row.secretLeaks} secret</Badge>}
          {row.blockers > 0 && <Badge variant="blocker">{row.blockers} blocker</Badge>}
          {row.secretLeaks === 0 && row.blockers === 0 && <Badge variant="success"><Sparkles className="size-3" />Sạch</Badge>}
        </div>
      </Card>
    </li>
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
      <PageHeader title="Bảng xếp hạng" description={`Mùa giải ${days} ngày · xếp theo điểm lần review đầu, chuẩn hoá để công bằng với người ít MR.`} />

      <section aria-label="Top 3" className="relative isolate overflow-hidden rounded-2xl border border-white/10 px-4 pt-10 text-white shadow-lg" style={{ background: "radial-gradient(120% 90% at 50% 0%, #3730a3 0%, #1e1b4b 45%, #09090b 100%)" }}>
        <Confetti />
        <div className="relative mb-8 flex flex-col items-center gap-1 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80"><Flame className="size-3.5 text-[var(--gold)]" />Top 3 chất lượng code</span>
          <h2 className="text-3xl font-black tracking-tight">Ai đang dẫn đầu?</h2>
        </div>
        <div className="relative mx-auto flex max-w-3xl items-end justify-center gap-3 sm:gap-6">
          {order.map((s, i) => (s ? <PodiumSlot key={s.r.name + i} row={s.r} place={s.place} /> : <div key={i} className="flex-1" />))}
        </div>
      </section>

      {rest.length > 0 && (
        <ol className="flex flex-col gap-3" aria-label="Các hạng tiếp theo">
          {rest.map((r, i) => <RankRow key={r.memberId ?? r.name} row={r} rank={i + 4} index={i} max={max} />)}
        </ol>
      )}

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
