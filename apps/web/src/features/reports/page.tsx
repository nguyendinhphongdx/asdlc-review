import { useQuery } from "@tanstack/react-query";
import { fmtScore } from "../../kernel/format.js";
import { RangePicker, useRange } from "../../kernel/range.js";
import { Card, Empty, ErrorBox, Loading, PageHeader, Stat } from "../../kernel/ui.js";
import { exportUrl, getRepoNames, getReport } from "./api.js";

export function ReportsPage() {
  const { days } = useRange();
  const q = useQuery({ queryKey: ["report", days], queryFn: () => getReport(days) });
  const names = useQuery({ queryKey: ["repo-names"], queryFn: getRepoNames });
  return (
    <>
      <PageHeader title="Báo cáo cuối kỳ">
        <RangePicker />
        <a className="text-sm text-indigo-700 hover:underline" href={exportUrl(days, "md")} download>Tải .md</a>
        <a className="text-sm text-indigo-700 hover:underline" href={exportUrl(days, "csv")} download>Tải .csv</a>
      </PageHeader>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : (() => {
        const r = q.data!;
        return (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="MR" value={r.overview.totalMrs} /><Stat label="Điểm TB" value={fmtScore(r.overview.avgScore)} />
              <Stat label="Secret" value={r.overview.secretLeaks} /><Stat label="Bảo mật" value={r.overview.securityIssues} />
            </div>
            <Card className="mt-4" title="Theo repo">
              {r.byRepo.length === 0 ? <Empty>Chưa có dữ liệu</Empty> : (
                <table className="w-full text-sm"><tbody>{r.byRepo.map((x) => (
                  <tr key={x.repoId} className="border-t border-slate-100"><td className="py-1.5 font-mono text-xs">{names.data?.[x.repoId] ?? x.repoId}</td><td>{x.mrCount} MR</td><td>TB {fmtScore(x.avgScore)}</td><td>{x.blockers} blocker</td></tr>
                ))}</tbody></table>
              )}
            </Card>
            <Card className="mt-4" title="Top thành viên">
              {r.leaderboard.slice(0, 10).map((m, i) => <div key={m.name} className="flex justify-between border-t border-slate-100 py-1.5 text-sm first:border-0"><span>{i + 1}. {m.name}</span><span>{fmtScore(m.rankScore)}</span></div>)}
            </Card>
          </>
        );
      })()}
    </>
  );
}
