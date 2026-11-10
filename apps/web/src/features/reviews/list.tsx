import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "@/components/ui/avatar";
import { Badge, GradeBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate, fmtDur } from "../../kernel/format.js";
import { Empty, ErrorBox, Loading, PageHeader } from "../../kernel/page.js";
import { listRuns, requestReview } from "./api.js";

const SEV_DOT: [string, string][] = [["blocker", "bg-danger"], ["critical", "bg-chart-4"], ["major", "bg-chart-3"], ["minor", "bg-chart-2"]];

function Status({ status, stage, error }: { status: string; stage: string | null; error: string | null }) {
  if (status === "succeeded") return <Badge variant="success">Hoàn tất</Badge>;
  if (status === "failed") return <Badge variant="danger" title={error ?? ""}>Lỗi</Badge>;
  if (status === "running") return <Badge variant="info"><span className="size-1.5 animate-pulse rounded-full bg-primary" />Đang review{stage ? ` · ${stage}` : ""}</Badge>;
  return <Badge>{status === "queued" ? "Đang chờ" : status}</Badge>;
}

export function ReviewsPage() {
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [search, setSearch] = useState("");
  const q = useQuery({ queryKey: ["runs"], queryFn: () => listRuns({ limit: 100 }), refetchInterval: 5000 });
  const m = useMutation({ mutationFn: requestReview, onSuccess: () => { setUrl(""); void qc.invalidateQueries({ queryKey: ["runs"] }); } });
  const items = (q.data?.items ?? []).filter((r) => !search || `${r.mr.title} ${r.mr.authorUsername}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <>
      <PageHeader title="Các lần review" description="Mỗi commit mới của MR tạo một vòng review. Dán link để review thủ công." />
      <Card className="p-4">
        <form className="flex flex-wrap gap-3" onSubmit={(e) => { e.preventDefault(); if (url.trim()) m.mutate(url.trim()); }}>
          <Input aria-label="Link MR" className="flex-[1_1_320px]" placeholder="https://gitlab.example.com/group/project/-/merge_requests/140" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Button type="submit" disabled={m.isPending}>Review ngay</Button>
        </form>
        {m.error && <div className="mt-3"><ErrorBox error={m.error} /></div>}
        {m.data && <p className="mt-3 text-sm text-muted-foreground">Kết quả: {m.data.status}</p>}
      </Card>
      <Input aria-label="Tìm kiếm" className="max-w-xs" placeholder="Tìm theo tiêu đề, tác giả…" value={search} onChange={(e) => setSearch(e.target.value)} />
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : !items.length ? <Empty>Chưa có lần review nào</Empty> : (
        <Card className="overflow-hidden">
          <Table className="min-w-[980px]">
            <TableHeader><TableRow className="hover:bg-transparent"><TableHead>Merge request</TableHead><TableHead>Tác giả</TableHead><TableHead>Vòng</TableHead><TableHead>Điểm</TableHead><TableHead>Finding</TableHead><TableHead>Thay đổi</TableHead><TableHead>Thời gian</TableHead><TableHead>Trạng thái</TableHead><TableHead>Lúc</TableHead></TableRow></TableHeader>
            <TableBody>
              {items.map((r) => (
                <TableRow key={r.id}>
                  <TableCell><Link to={`/reviews/${r.id}`} className="font-medium hover:underline">!{r.mr.iid} {r.mr.title}</Link></TableCell>
                  <TableCell><span className="inline-flex items-center gap-2"><Avatar name={r.mr.authorUsername} />{r.mr.authorUsername}</span></TableCell>
                  <TableCell className="tabular-nums">{r.round}</TableCell>
                  <TableCell>{r.status === "succeeded" ? <GradeBadge grade={r.grade} score={r.score} /> : <Badge>—</Badge>}</TableCell>
                  <TableCell><span className="inline-flex gap-2.5 text-xs">{SEV_DOT.map(([k, c]) => (r.findingCounts[k] ? <span key={k} className="inline-flex items-center gap-1"><span className={`size-2 rounded-full ${c}`} />{r.findingCounts[k]}</span> : null))}</span></TableCell>
                  <TableCell className="font-mono text-xs"><span className="text-success-fg">+{r.additions}</span> <span className="text-danger-fg">−{r.deletions}</span> · {r.filesChanged} file</TableCell>
                  <TableCell className="tabular-nums">{fmtDur(r.durationMs)}</TableCell>
                  <TableCell><Status status={r.status} stage={r.stage} error={r.error} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmtDate(r.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="border-t px-5 py-3 text-[13px] text-muted-foreground">{items.length} / {q.data?.total ?? 0} lần review</div>
        </Card>
      )}
    </>
  );
}
