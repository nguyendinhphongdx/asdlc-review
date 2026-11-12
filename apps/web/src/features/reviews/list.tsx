import type { InboxItemDto, RunListItemDto } from "@mrd/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Clock, Inbox, Loader2, RefreshCw, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge, GradeBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type ColumnDef } from "@/components/data-table/data-table";
import { fmtDate, fmtDur } from "../../kernel/format.js";
import { ErrorBox, PageHeader } from "../../kernel/page.js";
import { getInbox, listRuns, openRunStream, refreshInbox } from "./api.js";
import { useReviewRequest } from "./use-review-request.js";
import { FindMrDialog } from "./find-dialog.js";
import { stageLabel } from "../../kernel/stages.js";

const SEV_DOT: [string, string][] = [["blocker", "bg-danger"], ["critical", "bg-chart-4"], ["major", "bg-chart-3"], ["minor", "bg-chart-2"]];

function Status({ status, stage, error }: { status: string; stage: string | null; error: string | null }) {
  if (status === "succeeded") return <Badge variant="success">Hoàn tất</Badge>;
  if (status === "failed") return <Badge variant="danger" title={error ?? ""}>Lỗi{stage ? ` · ${stageLabel(stage)}` : ""}</Badge>;
  if (status === "running") return <Badge variant="info"><span className="size-1.5 animate-pulse rounded-full bg-primary" />Đang review{stage && stage !== "start" ? ` · ${stageLabel(stage)}` : ""}</Badge>;
  if (status === "queued") return <Badge variant="warning"><span className="size-1.5 animate-pulse rounded-full bg-current" />Đang chờ · hàng đợi</Badge>;
  if (status === "skipped") return <Badge title={error ?? ""}>Bỏ qua</Badge>;
  return <Badge>{status === "queued" ? "Đang chờ" : status}</Badge>;
}

const TABS = [{ id: "inbox", label: "Cần review" }, { id: "history", label: "Đã review & lịch sử" }] as const;

function useLiveRuns() {
  const qc = useQueryClient();
  // Cập nhật ngay khi có tiến trình mới (SSE); polling chỉ là dự phòng.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    // invalidate → TanStack Query tự refetch; gộp các sự kiện dồn dập trong 150ms.
    const refresh = () => { clearTimeout(t); t = setTimeout(() => { void qc.invalidateQueries({ queryKey: ["runs"] }); void qc.invalidateQueries({ queryKey: ["inbox"] }); }, 150); };
    const close = openRunStream({ onRunStatus: refresh, onDone: refresh });
    return () => { clearTimeout(t); close(); };
  }, [qc]);
}

type ViewId = "all" | "pending" | "running" | "failed" | "reviewed";
const VIEWS: { id: ViewId; label: string; icon: LucideIcon; tone: string; spin?: boolean; test: (i: InboxItemDto) => boolean }[] = [
  { id: "all", label: "Tất cả MR đang mở", icon: Inbox, tone: "bg-secondary text-muted-foreground", test: () => true },
  { id: "pending", label: "Cần review", icon: Clock, tone: "bg-warning-bg text-warning-fg", test: (i) => i.status === "pending" },
  { id: "running", label: "Đang review", icon: Loader2, spin: true, tone: "bg-info-bg text-info-fg", test: (i) => i.status === "running" || i.status === "queued" },
  { id: "failed", label: "Lỗi, cần xử lý", icon: AlertCircle, tone: "bg-danger-bg text-danger-fg", test: (i) => i.status === "failed" },
  { id: "reviewed", label: "Đã review xong", icon: CheckCircle2, tone: "bg-success-bg text-success-fg", test: (i) => i.status === "reviewed" },
];
const ago = (iso: string | null) => (iso ? fmtDate(iso) : "chưa lần nào");
const INBOX_STATUS = { pending: "Chờ review", queued: "Đang chờ", running: "Đang review", failed: "Lỗi", reviewed: "Đã review" } as const;
const RUN_STATUS = { succeeded: "Hoàn tất", failed: "Lỗi", running: "Đang review", queued: "Đang chờ", skipped: "Bỏ qua" } as const;

function InboxTab() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["inbox"], queryFn: getInbox, refetchInterval: 30000 });
  const refresh = useMutation({ mutationFn: refreshInbox, onSuccess: (d) => qc.setQueryData(["inbox"], d) });
  const req = useReviewRequest();
  const run = { ...req, mutate: (url: string) => req.mutate({ url }), variables: req.variables && "url" in req.variables ? req.variables.url : undefined };
  const d = q.data;
  const [view, setView] = useState<ViewId>("all");
  const all = d?.items ?? [];
  const counts = Object.fromEntries(VIEWS.map((v) => [v.id, all.filter(v.test).length])) as Record<ViewId, number>;
  const shown = all.filter(VIEWS.find((v) => v.id === view)!.test);
  const columns: ColumnDef<InboxItemDto>[] = [
    { id: "mr", header: "Merge request", accessorFn: (i) => `!${i.iid} ${i.title}`, meta: { className: "max-w-[360px]" },
      cell: ({ row: { original: i } }) => (<>
        {i.runId ? <Link to={`/reviews/${i.runId}`} className="block truncate font-medium hover:underline">!{i.iid} {i.title}</Link> : <span className="block truncate font-medium">!{i.iid} {i.title}</span>}
        <span className="block truncate font-mono text-xs text-muted-foreground">{i.sourceBranch} → {i.targetBranch}</span>
      </>) },
    { id: "repo", header: "Repo", accessorFn: (i) => i.repoPath.split("/").pop() ?? i.repoPath, meta: { className: "max-w-[200px] truncate" }, cell: ({ row: { original: i }, getValue }) => <span title={i.repoPath}>{getValue<string>()}</span> },
    { accessorKey: "authorUsername", header: "Tác giả", cell: ({ getValue }) => <span className="inline-flex items-center gap-2"><Avatar name={getValue<string>()} />{getValue<string>()}</span> },
    { accessorKey: "updatedAt", header: "Cập nhật", meta: { className: "text-xs text-muted-foreground whitespace-nowrap" }, cell: ({ getValue }) => fmtDate(getValue<string>()) },
    { accessorKey: "status", header: "Trạng thái", meta: { filterLabels: INBOX_STATUS },
      cell: ({ row: { original: i } }) => (<>
        {i.status === "running" ? <Badge variant="info"><Loader2 className="size-3 animate-spin" aria-hidden="true" />Đang review{i.stage && i.stage !== "start" ? ` · ${stageLabel(i.stage)}` : ""}</Badge> : i.status === "queued" ? <Badge variant="warning"><Clock className="size-3 animate-pulse" aria-hidden="true" />Đang chờ · hàng đợi</Badge> : i.status === "failed" ? <Badge variant="danger" title={i.error ?? ""}><AlertCircle className="size-3" aria-hidden="true" />Lỗi · bấm xem log</Badge> : i.status === "reviewed" ? <Badge variant="success"><CheckCircle2 className="size-3" aria-hidden="true" />Đã review</Badge> : <Badge variant="warning"><Clock className="size-3" aria-hidden="true" />Chờ review</Badge>}
        {i.draft && <Badge className="ml-1.5">Draft</Badge>}
      </>) },
    { id: "review", header: () => <span className="sr-only">Review</span>, enableSorting: false, enableHiding: false, meta: { className: "w-24 text-right", headerClassName: "w-24" },
      cell: ({ row: { original: i } }) => i.status === "failed" && i.runId ? <span className="inline-flex items-center gap-2"><Link to={`/reviews/${i.runId}`} className="text-sm font-medium hover:underline">Log</Link><Button size="sm" variant="outline" disabled={run.isPending} onClick={() => run.mutate(i.webUrl)}>Review lại</Button></span>
        : i.runId ? <Link to={`/reviews/${i.runId}`} className="text-sm font-medium hover:underline">Xem</Link>
        : <Button size="sm" disabled={run.isPending} onClick={() => run.mutate(i.webUrl)}>{run.isPending && run.variables === i.webUrl ? "Đang xếp hàng…" : "Review"}</Button> },
  ];
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
          <div className="mt-0.5 text-[13px]">Poller chỉ quét các repo đã thêm. Thêm ở trang <Link className="font-medium underline" to="/repos">Repository</Link>, hoặc bấm “Tìm MR” và review một MR (repo sẽ tự được thêm).</div>
        </section>
      )}
      {refresh.error && <ErrorBox error={refresh.error} />}
      {run.error && <ErrorBox error={run.error} />}
      {run.notice && !run.error && <p role="status" className="text-[13px] text-muted-foreground">{run.notice}</p>}
      {d?.errors.map((e) => <p key={e.repo} role="alert" className="text-[13px] text-danger-fg">Không lấy được MR của {e.repo}: {e.message}</p>)}
      <div role="group" aria-label="Lọc theo việc cần làm" className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => setView(v.id)}
            className={cn("flex items-center gap-3 rounded-xl border bg-card p-3.5 text-left outline-none transition-colors hover:border-ring focus-visible:ring-2 focus-visible:ring-ring", view === v.id && "border-primary ring-2 ring-primary/20")}>
            <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", v.tone)}><v.icon className={cn("size-[18px]", v.spin && counts[v.id] > 0 && "animate-spin")} aria-hidden="true" /></span>
            <span><span className={cn("block text-xl font-bold leading-tight tabular-nums", v.id === "failed" && counts.failed > 0 && "text-danger-fg")}>{counts[v.id]}</span><span className="text-[13px] text-muted-foreground">{v.label}</span></span>
          </button>
        ))}
      </div>
      <DataTable<InboxItemDto>
        aria-label="MR đang mở" columns={columns} data={shown} loading={q.isLoading} error={q.error}
        getRowId={(i) => `${i.repoId}-${i.iid}`} unit="MR đang mở" minWidth={860}
        search={{ placeholder: "Tìm theo tiêu đề, repo, tác giả…" }}
        filters={[{ columnId: "repo", label: "Repo" }, { columnId: "authorUsername", label: "Tác giả" }, { columnId: "status", label: "Trạng thái" }]}
        initialSort={[{ id: "updatedAt", desc: true }]}
        rowActions={(i) => [
          { label: "Review ngay", onSelect: () => run.mutate(i.webUrl), hidden: () => !!i.runId },
          { label: "Xem kết quả", onSelect: () => nav(`/reviews/${i.runId}`), hidden: () => !i.runId },
          { label: "Mở trên GitLab", onSelect: () => window.open(i.webUrl, "_blank", "noopener") },
          { label: "Sao chép link MR", onSelect: () => void navigator.clipboard?.writeText(i.webUrl) },
        ]}
        empty={"Không có MR nào đang mở. Bấm “Làm mới” để poll ngay, hoặc “Tìm MR” để chọn MR từ repo chưa thêm."}
      />
    </>
  );
}

function HistoryTab() {
  const nav = useNavigate();
  const re = useReviewRequest({ open: true });
  const q = useQuery({ queryKey: ["runs"], queryFn: () => listRuns({ limit: 100 }), refetchInterval: 20000 });
  const total = (r: RunListItemDto) => Object.values(r.findingCounts).reduce((a, b) => a + b, 0);
  const columns: ColumnDef<RunListItemDto>[] = [
    { id: "mr", header: "Merge request", accessorFn: (r) => `!${r.mr.iid} ${r.mr.title}`, meta: { className: "min-w-[280px]" }, cell: ({ row: { original: r } }) => <Link to={`/reviews/${r.id}`} className="font-medium hover:underline">!{r.mr.iid} {r.mr.title}</Link> },
    { id: "author", header: "Tác giả", accessorFn: (r) => r.mr.authorUsername, cell: ({ getValue }) => <span className="inline-flex items-center gap-2"><Avatar name={getValue<string>()} />{getValue<string>()}</span> },
    { accessorKey: "round", header: "Vòng", meta: { className: "tabular-nums" } },
    { id: "score", header: "Điểm", accessorFn: (r) => (r.status === "succeeded" ? r.score ?? undefined : undefined), sortUndefined: "last",
      cell: ({ row: { original: r } }) => (r.status === "succeeded" ? <GradeBadge grade={r.grade} score={r.score} /> : <Badge>—</Badge>) },
    { id: "findings", header: "Finding", accessorFn: total, cell: ({ row: { original: r } }) => <span className="inline-flex gap-2.5 text-xs">{SEV_DOT.map(([k, c]) => (r.findingCounts[k] ? <span key={k} className="inline-flex items-center gap-1"><span className={`size-2 rounded-full ${c}`} />{r.findingCounts[k]}</span> : null))}</span> },
    { id: "changes", header: "Thay đổi", accessorFn: (r) => r.additions + r.deletions, meta: { className: "font-mono text-xs whitespace-nowrap" },
      cell: ({ row: { original: r } }) => <><span className="text-success-fg">+{r.additions}</span> <span className="text-danger-fg">−{r.deletions}</span> · {r.filesChanged} file</> },
    { accessorKey: "durationMs", header: "Thời gian", meta: { className: "tabular-nums" }, cell: ({ getValue }) => fmtDur(getValue<number | null>()) },
    { accessorKey: "status", header: "Trạng thái", meta: { filterLabels: RUN_STATUS }, cell: ({ row: { original: r } }) => <Status status={r.status} stage={r.stage} error={r.error} /> },
    { accessorKey: "createdAt", header: "Lúc", meta: { className: "text-xs text-muted-foreground whitespace-nowrap" }, cell: ({ getValue }) => fmtDate(getValue<string>()) },
  ];
  return (
    <>
      {re.error && <ErrorBox error={re.error} />}
      {re.isPending && <p role="status" className="text-[13px] text-muted-foreground">Đang xếp hàng review…</p>}
      <DataTable<RunListItemDto>
        aria-label="Lịch sử review" columns={columns} data={q.data?.items ?? []} loading={q.isLoading} error={q.error} getRowId={(r) => r.id}
        unit="lần review" minWidth={980} search={{ placeholder: "Tìm theo tiêu đề, tác giả…" }}
        filters={[{ columnId: "author", label: "Tác giả" }, { columnId: "status", label: "Trạng thái" }]}
        initialSort={[{ id: "createdAt", desc: true }]} empty="Chưa có lần review nào"
        rowActions={(r) => [
          { label: "Xem chi tiết", onSelect: () => nav(`/reviews/${r.id}`) },
          { label: "Review lại", onSelect: () => re.mutate({ mrId: r.mr.id }) },
          { label: "Mở MR trên GitLab", onSelect: () => window.open(r.mr.webUrl, "_blank", "noopener") },
        ]}
      />
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
