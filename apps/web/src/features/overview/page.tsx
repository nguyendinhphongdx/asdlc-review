import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { AreaChart } from "@/components/ui/area-chart";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { fmtHours, fmtScore } from "../../kernel/format.js";
import { useRange } from "../../kernel/range.js";
import { Empty, ErrorBox, Loading, PageHeader, Stat } from "../../kernel/page.js";
import { getOverview } from "./api.js";

const SEV: [string, string][] = [["blocker", "bg-danger"], ["critical", "bg-chart-4"], ["major", "bg-chart-3"], ["minor", "bg-chart-2"], ["nit", "bg-muted-foreground"]];

export function OverviewPage() {
  const { days } = useRange();
  const q = useQuery({ queryKey: ["overview", days], queryFn: () => getOverview(days) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const o = q.data!;
  const total = Object.values(o.findingsBySeverity).reduce((a, b) => a + b, 0);
  const maxSev = Math.max(1, ...Object.values(o.findingsBySeverity));
  const trend = o.trend.map((t) => ({ label: t.week.slice(8, 10) + "/" + t.week.slice(5, 7), value: t.avgScore }));
  return (
    <>
      <PageHeader title="Tổng quan" description={`Chất lượng MR của team trong ${days} ngày qua`}>
        <Link to="/reviews" className={buttonVariants()}><Plus />Review MR</Link>
      </PageHeader>

      <section aria-label="Chỉ số chính" className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-4">
        <Stat label="MR được review" value={o.totalMrs} hint={`${o.totalRuns} lần review`} />
        <Stat label="Điểm trung bình" value={<>{fmtScore(o.avgScore)}<span className="text-base font-medium text-muted-foreground"> / 100</span></>} />
        <Stat label="Tỷ lệ đạt" value={o.passRate != null ? `${Math.round(o.passRate)}%` : "–"} hint={o.passRate != null && <Progress value={o.passRate} barClassName="bg-success" />} />
        <Stat label="Chi phí AI" value={`$${o.totalCostUsd.toFixed(2)}`} hint={o.totalRuns ? `TB $${(o.totalCostUsd / o.totalRuns).toFixed(2)} / lần review` : undefined} />
        <Stat label="Lộ secret" value={o.secretLeaks} tone={o.secretLeaks ? "danger" : undefined} hint={o.secretLeaks ? "Cần xử lý ngay" : "Không có"} />
        <Stat label="Lỗi bảo mật" value={o.securityIssues} />
        <Stat label="Sai convention" value={o.conventionViolations} />
        <Stat label="Lead time TB" value={fmtHours(o.avgLeadTimeHours)} hint={o.avgReviewDurationSec != null ? `Review TB ${Math.round(o.avgReviewDurationSec)}s` : undefined} />
      </section>

      <section className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] gap-4">
        <Card>
          <CardHeader><CardTitle>Điểm trung bình theo tuần</CardTitle><CardDescription>Xu hướng chất lượng MR khi nộp</CardDescription></CardHeader>
          <CardContent><AreaChart data={trend} min={40} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Finding theo mức độ</CardTitle><CardDescription>{total} finding trong {o.totalRuns} lần review</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3.5 pt-4">
            {SEV.map(([k, bar]) => {
              const n = o.findingsBySeverity[k] ?? 0;
              return (
                <div key={k} className="grid grid-cols-[72px_1fr_32px] items-center gap-3">
                  <span className="text-[13px] capitalize">{k}</span>
                  <div className="h-2.5 overflow-hidden rounded-full bg-secondary"><div className={cn("h-full rounded-full", bar)} style={{ width: `${(n / maxSev) * 100}%` }} /></div>
                  <span className="text-right font-medium tabular-nums">{n}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </section>

      <Card className="overflow-hidden">
        <CardHeader><CardTitle>Quy tắc vi phạm nhiều nhất</CardTitle><CardDescription>Tính theo lần review đầu của mỗi MR</CardDescription></CardHeader>
        {o.topRules.length === 0 ? <Empty>Chưa có dữ liệu</Empty> : (
          <Table>
            <TableHeader><TableRow className="hover:bg-transparent"><TableHead>Quy tắc</TableHead><TableHead>Nội dung</TableHead><TableHead className="text-right">Số lần</TableHead></TableRow></TableHeader>
            <TableBody>{o.topRules.map((r) => (
              <TableRow key={r.ruleId}><TableCell><Badge className="font-mono">{r.ruleId}</Badge></TableCell><TableCell>{r.title}</TableCell><TableCell className="text-right font-medium tabular-nums">{r.count}</TableCell></TableRow>
            ))}</TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
