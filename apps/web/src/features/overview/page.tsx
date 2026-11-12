import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { AreaChart } from "@/components/ui/area-chart";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table/data-table";
import { cn } from "@/lib/utils";
import { fmtScore } from "../../kernel/format.js";
import { useRange } from "../../kernel/range.js";
import { ErrorBox, Loading, PageHeader } from "../../kernel/page.js";
import { getInbox, getOverview, listFailedRuns } from "./api.js";

const SEV: [string, string, string][] = [
  ["blocker", "bg-danger", "Blocker"],
  ["critical", "bg-chart-4", "Critical"],
  ["major", "bg-chart-3", "Major"],
  ["minor", "bg-chart-2", "Minor"],
  ["nit", "bg-muted-foreground", "Nit"],
];

function Metric({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "danger" }) {
  return (
    <div className="flex flex-col gap-1 px-5 py-4">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className={cn("text-2xl font-semibold tabular-nums", tone === "danger" && "text-destructive")}>{value}</span>
      <span className="text-xs text-muted-foreground">{sub ?? " "}</span>
    </div>
  );
}

function Attention({ to, count, label, cta, tone }: { to: string; count: number; label: string; cta: string; tone?: "danger" }) {
  if (count === 0) return null;
  return (
    <Link to={to} className="flex items-center justify-between gap-3 border-t px-6 py-3 text-sm first:border-t-0 hover:bg-muted/50">
      <span className="flex items-center gap-2.5">
        <span className={cn("inline-block size-2 rounded-full", tone === "danger" ? "bg-destructive" : "bg-chart-3")} />
        <span><b className="tabular-nums">{count}</b> {label}</span>
      </span>
      <span className="flex items-center gap-1 text-xs text-muted-foreground">{cta}<ArrowRight className="size-3.5" /></span>
    </Link>
  );
}

export function OverviewPage() {
  const { days } = useRange();
  const q = useQuery({ queryKey: ["overview", days], queryFn: () => getOverview(days) });
  const inbox = useQuery({ queryKey: ["overview-inbox"], queryFn: getInbox });
  const failed = useQuery({ queryKey: ["overview-failed"], queryFn: listFailedRuns });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const o = q.data!;

  const since = Date.now() - days * 86_400_000;
  const failedRecent = (failed.data?.items ?? []).filter((r) => new Date(r.createdAt).getTime() >= since).length;
  const awaiting = inbox.data?.items.length ?? 0;
  const critical = (o.findingsBySeverity.blocker ?? 0) + (o.findingsBySeverity.critical ?? 0);
  const serious = critical + (o.findingsBySeverity.major ?? 0);
  const total = Object.values(o.findingsBySeverity).reduce((a, b) => a + b, 0);
  const trend = o.trend.map((t) => ({ label: t.week.slice(8, 10) + "/" + t.week.slice(5, 7), value: t.avgScore }));
  const attentionCount = awaiting + failedRecent + critical + o.secretLeaks;

  return (
    <>
      <PageHeader title="Tổng quan" description={`Chất lượng MR của team trong ${days} ngày qua`}>
        <Link to="/reviews" className={buttonVariants()}><Plus />Review MR</Link>
      </PageHeader>

      <Card className="grid grid-cols-2 gap-0 divide-x divide-y overflow-hidden py-0 sm:grid-cols-4 sm:divide-y-0">
        <Metric label="Chất lượng code" value={<>{fmtScore(o.avgScore)}<span className="text-sm font-normal text-muted-foreground"> / 100</span></>} sub={`${o.totalMrs} MR · ${o.totalRuns} lượt review`} />
        <Metric label="Tỷ lệ đạt" value={o.passRate != null ? `${Math.round(o.passRate)}%` : "–"} sub="MR qua ngưỡng" />
        <Metric label="Vấn đề nghiêm trọng" value={serious} tone={critical ? "danger" : undefined} sub={`${critical} critical · ${o.findingsBySeverity.major ?? 0} major`} />
        <Metric label="Chi phí AI" value={`$${o.totalCostUsd.toFixed(2)}`} sub={o.totalRuns ? `TB $${(o.totalCostUsd / o.totalRuns).toFixed(2)} / review` : undefined} />
      </Card>

      <section className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] gap-4">
        <Card className="gap-0 overflow-hidden pb-0">
          <CardHeader className="pb-3"><CardTitle>Cần xử lý</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Attention to="/reviews" count={awaiting} label="MR đang chờ review" cta="Mở hộp MR" />
            <Attention to="/reviews" count={failedRecent} label={`lượt review thất bại trong ${days} ngày`} cta="Xem lịch sử" tone="danger" />
            <Attention to="/reviews" count={critical} label="finding critical / blocker" cta="Xem review" tone="danger" />
            <Attention to="/reviews" count={o.secretLeaks} label="lần lộ secret" cta="Xem review" tone="danger" />
            {attentionCount === 0 && (
              <div className="flex items-center gap-2 px-6 py-8 text-sm text-muted-foreground"><CheckCircle2 className="size-4 text-success" />Không có gì cần xử lý.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Vấn đề theo mức độ</CardTitle><CardDescription>{total} finding · bảo mật {o.securityIssues} · convention {o.conventionViolations}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4">
            {total === 0 ? <p className="text-sm text-muted-foreground">Chưa có finding.</p> : (
              <>
                <div className="flex h-2.5 overflow-hidden rounded-full bg-secondary">
                  {SEV.map(([k, bar]) => { const n = o.findingsBySeverity[k] ?? 0; return n ? <div key={k} className={bar} style={{ width: `${(n / total) * 100}%` }} /> : null; })}
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
                  {SEV.map(([k, bar, label]) => { const n = o.findingsBySeverity[k] ?? 0; return n ? <span key={k} className="flex items-center gap-1.5"><span className={cn("size-2 rounded-full", bar)} />{label} <b className="tabular-nums">{n}</b></span> : null; })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] gap-4">
        <Card>
          <CardHeader><CardTitle>Điểm trung bình theo tuần</CardTitle><CardDescription>Xu hướng chất lượng MR khi nộp</CardDescription></CardHeader>
          <CardContent>
            {trend.length >= 3 ? <AreaChart data={trend} min={40} /> : (
              <div className="flex h-32 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">Chưa đủ dữ liệu (cần từ 3 tuần)</div>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader><CardTitle>Quy tắc vi phạm nhiều nhất</CardTitle></CardHeader>
          <DataTable<(typeof o.topRules)[number]>
            aria-label="Quy tắc vi phạm nhiều nhất" compact framed={false} data={o.topRules} getRowId={(r) => r.ruleId} empty="Chưa có dữ liệu" initialSort={[{ id: "count", desc: true }]}
            columns={[
              { accessorKey: "ruleId", header: "Quy tắc", cell: ({ getValue }) => <Badge className="font-mono">{getValue<string>()}</Badge> },
              { accessorKey: "title", header: "Nội dung" },
              { accessorKey: "count", header: "Số lần", meta: { className: "text-right font-medium tabular-nums", headerClassName: "text-right" } },
            ]}
          />
        </Card>
      </section>
    </>
  );
}
