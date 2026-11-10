import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtScore } from "../../kernel/format.js";
import { useRange } from "../../kernel/range.js";
import { Empty, ErrorBox, Loading, PageHeader, Stat } from "../../kernel/page.js";
import { exportUrl, getRepoNames, getReport } from "./api.js";

export function ReportsPage() {
  const { days } = useRange();
  const q = useQuery({ queryKey: ["report", days], queryFn: () => getReport(days) });
  const names = useQuery({ queryKey: ["repo-names"], queryFn: getRepoNames });
  return (
    <>
      <PageHeader title="Báo cáo cuối kỳ" description={`${days} ngày gần nhất`}>
        <a className={buttonVariants({ variant: "outline" })} href={exportUrl(days, "md")} download><Download />.md</a>
        <a className={buttonVariants({ variant: "outline" })} href={exportUrl(days, "csv")} download><Download />.csv</a>
      </PageHeader>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : (() => {
        const r = q.data!;
        return (
          <>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
              <Stat label="MR" value={r.overview.totalMrs} /><Stat label="Điểm TB" value={fmtScore(r.overview.avgScore)} />
              <Stat label="Lộ secret" value={r.overview.secretLeaks} tone={r.overview.secretLeaks ? "danger" : undefined} /><Stat label="Lỗi bảo mật" value={r.overview.securityIssues} />
            </div>
            <Card className="overflow-hidden"><CardHeader><CardTitle>Theo repo</CardTitle></CardHeader>
              {r.byRepo.length === 0 ? <Empty>Chưa có dữ liệu</Empty> : (
                <Table><TableHeader><TableRow className="hover:bg-transparent"><TableHead>Repo</TableHead><TableHead>MR</TableHead><TableHead>Điểm TB</TableHead><TableHead>Blocker</TableHead></TableRow></TableHeader>
                  <TableBody>{r.byRepo.map((x) => <TableRow key={x.repoId}><TableCell className="font-medium">{names.data?.[x.repoId] ?? x.repoId}</TableCell><TableCell className="tabular-nums">{x.mrCount}</TableCell><TableCell className="tabular-nums">{fmtScore(x.avgScore)}</TableCell><TableCell className="tabular-nums">{x.blockers}</TableCell></TableRow>)}</TableBody></Table>
              )}
            </Card>
          </>
        );
      })()}
    </>
  );
}
