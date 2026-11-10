import { useQuery } from "@tanstack/react-query";
import { fmtHours, fmtScore } from "../../kernel/format.js";
import { RangePicker, useRange } from "../../kernel/range.js";
import { Card, Empty, ErrorBox, Loading, PageHeader } from "../../kernel/ui.js";
import { getLeaderboard } from "./api.js";

export function LeaderboardPage() {
  const { days } = useRange();
  const q = useQuery({ queryKey: ["leaderboard", days], queryFn: () => getLeaderboard(days) });
  return (
    <>
      <PageHeader title="Bảng xếp hạng"><RangePicker /></PageHeader>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : !q.data?.length ? <Empty>Chưa có dữ liệu</Empty> : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500"><tr><th>#</th><th>Thành viên</th><th>MR</th><th>Điểm lần đầu</th><th>Điểm cuối</th><th>Cải thiện</th><th>Rank</th><th>Blocker</th><th>Bảo mật</th><th>Secret</th><th>Convention</th><th>File TB</th><th>Vòng TB</th><th>Lead time</th></tr></thead>
              <tbody>
                {q.data.map((r, i) => (
                  <tr key={r.memberId ?? r.name} className="border-t border-slate-100">
                    <td className="py-2 font-semibold">{i + 1}</td><td>{r.name}<div className="text-xs text-slate-400">{r.usernames.join(", ")}</div></td>
                    <td>{r.mrCount}</td><td>{fmtScore(r.avgFirstScore)}</td><td>{fmtScore(r.avgFinalScore)}</td>
                    <td className={(r.improvement ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}>{r.improvement == null ? "–" : (r.improvement >= 0 ? "+" : "") + fmtScore(r.improvement)}</td>
                    <td className="font-semibold">{fmtScore(r.rankScore)}</td><td>{r.blockers}</td><td>{r.securityIssues}</td><td>{r.secretLeaks}</td><td>{r.conventionViolations}</td>
                    <td>{fmtScore(r.avgFilesChanged)}</td><td>{fmtScore(r.avgReviewRounds)}</td><td>{fmtHours(r.avgLeadTimeHours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
