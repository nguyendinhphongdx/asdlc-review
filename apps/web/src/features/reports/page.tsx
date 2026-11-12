import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table/data-table";
import { fmtScore } from "../../kernel/format.js";
import { useRange } from "../../kernel/range.js";
import { ErrorBox, Loading, PageHeader, Stat } from "../../kernel/page.js";
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
              <DataTable<(typeof r.byRepo)[number]>
                aria-label="Báo cáo theo repo" compact framed={false} data={r.byRepo} getRowId={(x) => x.repoId} empty="Chưa có dữ liệu" initialSort={[{ id: "mrCount", desc: true }]}
                columns={[
                  { id: "repo", header: "Repo", accessorFn: (x) => names.data?.[x.repoId] ?? x.repoId, meta: { className: "font-medium" } },
                  { accessorKey: "mrCount", header: "MR", meta: { className: "tabular-nums" } },
                  { id: "avgScore", header: "Điểm TB", accessorFn: (x) => x.avgScore ?? undefined, sortUndefined: "last", cell: ({ getValue }) => fmtScore(getValue<number | undefined>() ?? null), meta: { className: "tabular-nums" } },
                  { accessorKey: "blockers", header: "Blocker", meta: { className: "tabular-nums" } },
                ]}
              />
            </Card>
          </>
        );
      })()}
    </>
  );
}
