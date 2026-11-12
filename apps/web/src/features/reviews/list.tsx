import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge, GradeBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate, fmtDur } from "../../kernel/format.js";
import { Empty, ErrorBox, Loading, PageHeader } from "../../kernel/page.js";
import { getInbox, listRuns, openRunStream, refreshInbox, requestReview } from "./api.js";
import { FindMrDialog } from "./find-dialog.js";
import { stageLabel } from "../../kernel/stages.js";

const SEV_DOT: [string, string][] = [["blocker", "bg-danger"], ["critical", "bg-chart-4"], ["major", "bg-chart-3"], ["minor", "bg-chart-2"]];

function Status({ status, stage, error }: { status: string; stage: string | null; error: string | null }) {
  if (status === "succeeded") return <Badge variant="success">Hoàn tất</Badge>;
  if (status === "failed") return <Badge variant="danger" title={error ?? ""}>Lỗi{stage ? ` · ${stageLabel(stage)}` : ""}</Badge>;
  if (status === "running") return <Badge variant="info"><span className="size-1.5 animate-pulse rounded-full bg-primary" />Đang review{stage ? ` · ${stageLabel(stage)}` : ""}</Badge>;
  if (status === "skipped") return <Badge title={error ?? ""}>Bỏ qua</Badge>;
  return <Badge>{status === "queued" ? "Đang chờ" : status}</Badge>;
}

const TABS = [{ id: "inbox", label: "Cần review" }, { id: "history", label: "Đã review & lịch sử" }] as const;

function useLiveRuns() {
  const qc = useQueryClient();
  // Cập nhật ngay khi có tiến trình mới (SSE); polling chỉ là dự phòng.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { clearTimeout(t); t = setTimeout(() => { void qc.invalidateQueries({ queryKey: ["runs"] }); void qc.invalidateQueries({ queryKey: ["inbox"] }); }, 400); };
    const close = openRunStream({ onProgress: refresh, onDone: refresh });
    return () => { clearTimeout(t); close(); };
  }, [qc]);
}

const ago = (iso: string | null) => (iso ? fmtDate(iso) : "chưa lần nào");

function InboxTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["inbox"], queryFn: getInbox, refetchInterval: 30000 });
  const refresh = useMutation({ mutationFn: refreshInbox, onSuccess: (d) => qc.setQueryData(["inbox"], d) });
  const run = useMutation({ mutationFn: (url: string) => requestReview(url), onSuccess: () => { void qc.invalidateQueries({ queryKey: ["inbox"] }); void qc.invalidateQueries({ queryKey: ["runs"] }); } });
  const d = q.data;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground" aria-live="polite">
          {d ? <>Lần poll gần nhất: {ago(d.polledAt)} · đã quét {d.repos.polled}/{d.repos.enabled} repo, thấy {d.openMrs} MR đang mở · {d.autoPolling ? "tự động poll và tự xếp hàng review cho repo bật tự động" : "chế độ thủ công/webhook: chỉ cập nhật danh sách, không tự review"}</> : "Đang tải…"}
        </p>
        <Button variant="outline" disabled={refresh.isPending} onClick={() => refresh.mutate()}><RefreshCw className={cn(refresh.isPending && "animate-spin")} />{refresh.isPending ? "Đang poll…" : "Làm mới"}</Button>
      </div>
      {d && !d.connected && (
        <section role="alert" className="rounded-xl border border-danger bg-danger-bg px-5 py-4 text-danger-fg">
          <div className="font-semibold">Chưa kết nối GitLab nên poller không lấy được MR nào</div>
          <div className="mt-0.5 text-[13px]">Vào <Link className="font-medium underline" to="/settings">Cài đặt → Kết nối</Link> để nhập URL và token (nếu đã nhập mà vẫn báo thế này, token có thể không giải mã được: hãy nhập lại).</div>
        </section>
      )}
      {d?.connected && d.repos.enabled === 0 && (
        <section role="status" className="rounded-xl border border-warning bg-warning-bg px-5 py-4 text-warning-fg">
          <div className="font-semibold">Chưa có repo nào được thêm</div>
          <div className="mt-0.5 text-[13px]">Poller chỉ quét các repo đã thêm. Bấm “Tìm MR” và review một MR (repo sẽ tự được thêm), hoặc thêm ở trang <Link className="font-medium underline" to="/repos">Repository</Link>.</div>
        </section>
      )}
      {refresh.error && <ErrorBox error={refresh.error} />}
      {run.error && <ErrorBox error={run.error} />}
      {d?.errors.map((e) => <p key={e.repo} role="alert" className="text-[13px] text-danger-fg">Không lấy được MR của {e.repo}: {e.message}</p>)}
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : !d?.items.length ? (
        <Empty>{d?.openMrs ? `Có ${d.openMrs} MR đang mở nhưng tất cả đã được review ở commit hiện tại (xem tab lịch sử).` : "Không có MR nào đang chờ review. Bấm “Làm mới” để poll ngay, hoặc “Tìm MR” để chọn MR từ repo chưa thêm."}</Empty>
      ) : (
        <Card className="overflow-hidden">
          <Table className="min-w-[860px]">
            <TableHeader><TableRow className="hover:bg-transparent"><TableHead>Merge request</TableHead><TableHead>Repo</TableHead><TableHead>Tác giả</TableHead><TableHead>Cập nhật</TableHead><TableHead>Trạng thái</TableHead><TableHead className="w-28" /></TableRow></TableHeader>
            <TableBody>
              {d.items.map((i) => (
                <TableRow key={`${i.repoId}-${i.iid}`}>
                  <TableCell className="max-w-[360px]">
                    <a href={i.webUrl} target="_blank" rel="noreferrer" className="block truncate font-medium hover:underline">!{i.iid} {i.title}</a>
                    <span className="block truncate font-mono text-xs text-muted-foreground">{i.sourceBranch} → {i.targetBranch}</span>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-sm" title={i.repoPath}>{i.repoPath.split("/").pop()}</TableCell>
                  <TableCell><span className="inline-flex items-center gap-2"><Avatar name={i.authorUsername} />{i.authorUsername}</span></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmtDate(i.updatedAt)}</TableCell>
                  <TableCell>
                    {i.status === "running" ? <Badge variant="info"><span className="size-1.5 animate-pulse rounded-full bg-primary" />Đang review</Badge> : i.status === "queued" ? <Badge>Đang chờ</Badge> : <Badge variant="warning">Chờ review</Badge>}
                    {i.draft && <Badge className="ml-1.5">Draft</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    {i.runId ? <Link to={`/reviews/${i.runId}`} className="text-sm font-medium hover:underline">Xem</Link>
                      : <Button size="sm" disabled={run.isPending} onClick={() => run.mutate(i.webUrl)}>{run.isPending && run.variables === i.webUrl ? "Đang gửi…" : "Review"}</Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="border-t px-5 py-3 text-[13px] text-muted-foreground">{d.items.length} MR đang chờ</div>
        </Card>
      )}
    </>
  );
}

function HistoryTab() {
  const [search, setSearch] = useState("");
  const q = useQuery({ queryKey: ["runs"], queryFn: () => listRuns({ limit: 100 }), refetchInterval: 20000 });
  const items = (q.data?.items ?? []).filter((r) => !search || `${r.mr.title} ${r.mr.authorUsername}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <>
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

export function ReviewsPage() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get("tab") === "history" ? "history" : "inbox";
  useLiveRuns();
  const go = (id: string) => setSp(id === "inbox" ? {} : { tab: id }, { replace: true });
  return (
    <>
      <PageHeader title="Review" description="MR đang chờ review do poller kéo về, và lịch sử các lần review. Mỗi commit mới của MR tạo một vòng review.">
        <FindMrDialog />
      </PageHeader>
      <div role="tablist" aria-label="Danh sách review" className="-mt-2 flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t.id} id={`tab-${t.id}`} role="tab" type="button" aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1} onClick={() => go(t.id)}
            onKeyDown={(e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { const n = TABS[(TABS.findIndex((x) => x.id === tab) + 1) % TABS.length]!; go(n.id); document.getElementById(`tab-${n.id}`)?.focus(); } }}
            className={cn("-mb-px h-9 border-b-2 px-3.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring", tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{t.label}</button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="flex flex-col gap-4">
        {tab === "inbox" ? <InboxTab /> : <HistoryTab />}
      </div>
    </>
  );
}
