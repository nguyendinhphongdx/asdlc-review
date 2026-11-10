import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtHours, fmtScore } from "../../kernel/format.js";
import { RangePicker, useRange } from "../../kernel/range.js";
import { Card, Empty, ErrorBox, Loading, PageHeader, Stat } from "../../kernel/ui.js";
import { getOverview } from "./api.js";

export function OverviewPage() {
  const { days } = useRange();
  const q = useQuery({ queryKey: ["overview", days], queryFn: () => getOverview(days) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const o = q.data!;
  const sev = Object.entries(o.findingsBySeverity).map(([name, count]) => ({ name, count }));
  return (
    <>
      <PageHeader title="Tổng quan"><RangePicker /></PageHeader>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Số MR" value={o.totalMrs} hint={`${o.totalRuns} lần review`} />
        <Stat label="Điểm TB" value={fmtScore(o.avgScore)} hint={o.passRate != null ? `đạt ${Math.round(o.passRate * 100)}%` : undefined} />
        <Stat label="Lộ secret" value={o.secretLeaks} />
        <Stat label="Lỗi bảo mật" value={o.securityIssues} />
        <Stat label="Sai convention" value={o.conventionViolations} />
        <Stat label="Thời gian review TB" value={o.avgReviewDurationSec != null ? `${Math.round(o.avgReviewDurationSec)}s` : "–"} />
        <Stat label="Lead time TB" value={fmtHours(o.avgLeadTimeHours)} />
        <Stat label="Chi phí AI" value={`$${o.totalCostUsd.toFixed(2)}`} />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card title="Xu hướng theo tuần">
          {o.trend.length === 0 ? <Empty>Chưa có dữ liệu</Empty> : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={o.trend}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="week" fontSize={11} /><YAxis domain={[0, 100]} fontSize={11} /><Tooltip />
                <Line type="monotone" dataKey="avgScore" name="Điểm TB" stroke="#4f46e5" strokeWidth={2} /></LineChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card title="Finding theo mức độ">
          {sev.length === 0 ? <Empty>Chưa có dữ liệu</Empty> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={sev}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip /><Bar dataKey="count" fill="#4f46e5" /></BarChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card title="Quy tắc vi phạm nhiều nhất" className="md:col-span-2">
          {o.topRules.length === 0 ? <Empty>Chưa có dữ liệu</Empty> : (
            <table className="w-full text-sm"><tbody>
              {o.topRules.map((r) => <tr key={r.ruleId} className="border-t border-slate-100"><td className="py-1.5 font-mono text-xs">{r.ruleId}</td><td>{r.title}</td><td className="text-right font-medium">{r.count}</td></tr>)}
            </tbody></table>
          )}
        </Card>
      </div>
    </>
  );
}
