import type { RunActivityEntry, RunDetailDto } from "@mrd/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Check, CircleAlert, ExternalLink, Loader2, TriangleAlert, X } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Avatar } from "@/components/ui/avatar";
import { Badge, GradeBadge, SeverityBadge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScoreRing } from "@/components/ui/score-ring";
import { cn } from "@/lib/utils";
import { fmtDate, fmtDur, fmtMs } from "../../kernel/format.js";
import { Empty, ErrorBox, Loading, PageHeader } from "../../kernel/page.js";
import { FileCoverage, HarnessLoad, RuleChecklist } from "./coverage.js";
import { HarnessPanel } from "../../kernel/harness.js";
import { getRun, listFrameworks, openRunStream, setFeedback } from "./api.js";
import { useReviewRequest } from "./use-review-request.js";
import { ActivityLog } from "./live-log.js";
import { AgentChat } from "./chat.js";
import { STAGES, stageLabel } from "../../kernel/stages.js";

const VERDICT: Record<string, { label: string; variant: "success" | "warning" | "danger" }> = {
  approve: { label: "Có thể merge", variant: "success" }, comment: { label: "Cần góp ý", variant: "warning" }, request_changes: { label: "Yêu cầu sửa", variant: "danger" },
};
const FB = { agree: "Đồng ý", disagree: "Không đồng ý", fixed: "Đã sửa" } as const;

export function ReviewDetailPage() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const [live, setLive] = useState<RunActivityEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const q = useQuery({ queryKey: ["run", id], queryFn: () => getRun(id), refetchInterval: (s) => (s.state.data && ["queued", "running"].includes(s.state.data.status) ? (connected ? 15000 : 3000) : false) });
  const active = q.data ? ["queued", "running"].includes(q.data.status) : false;
  // SSE: nhận tiến trình từng bước; khi xong/lỗi thì tải lại chi tiết.
  useEffect(() => {
    if (!active) return;
    setLive([]);
    return openRunStream({
      onProgress: (_r, e) => setLive((l) => [...l, e]),
      // Chuyển bước/chuyển từ chờ sang chạy: tải lại chi tiết ngay (TanStack Query refetch) để thanh tiến trình đổi tức thì.
      onRunStatus: (s) => { if (s.runId === id) void qc.invalidateQueries({ queryKey: ["run", id] }); },
      onDone: () => void qc.invalidateQueries({ queryKey: ["run", id] }),
      onStatus: setConnected,
    }, id);
  }, [active, id, qc]);
  // Bấm "Review lại" → chuyển ngay sang trang theo dõi của run mới (đang chờ → đang chạy), không ở lại trang cũ.
  const re = useReviewRequest({ open: true });
  const fws = useQuery({ queryKey: ["frameworks"], queryFn: listFrameworks, staleTime: 60_000 });
  const fb = useMutation({ mutationFn: (a: { id: string; v: keyof typeof FB | null }) => setFeedback(a.id, a.v), onSuccess: () => qc.invalidateQueries({ queryKey: ["run", id] }) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const r = q.data!;
  const verdict = r.verdict ? VERDICT[r.verdict] : undefined;
  return (
    <>
      <PageHeader title={`!${r.mr.iid} ${r.mr.title}`}>
        <Button variant="outline" disabled={re.isPending || active} onClick={() => re.mutate({ mrId: r.mr.id })} title={active ? "Đang có một lần review chạy cho MR này" : undefined}>{re.isPending ? "Đang xếp hàng…" : "Review lại"}</Button>
        <a className={buttonVariants()} href={r.mr.webUrl} target="_blank" rel="noreferrer">Mở MR<ExternalLink /></a>
      </PageHeader>
      <div className="-mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-muted-foreground">
        <span className="inline-flex items-center gap-2"><Avatar name={r.mr.authorUsername} className="size-[22px] text-[10px]" /><span className="font-medium text-foreground">{r.mr.authorUsername}</span></span>
        <span className="font-mono text-xs">{r.mr.sourceBranch} → {r.mr.targetBranch}</span>
        <span>Vòng {r.round} · {fmtDate(r.createdAt)}</span>
        <Link to="/reviews" className="hover:underline">← Danh sách</Link>
      </div>
      {r.error && !(r.status === "failed" && STAGES.some((x) => x.id === r.stage)) && <ErrorBox error={r.error} />}

      <Pipeline r={r} entries={live.length ? live : r.activity} retrying={re.isPending} retried={re.isSuccess} onRetry={() => re.mutate({ mrId: r.mr.id })} />
      {re.error && <ErrorBox error={re.error} />}
      {re.notice && !re.error && !re.isPending && <p role="status" className="text-[13px] text-muted-foreground">{re.notice}</p>}

      <AgentChat mrId={r.mr.id} live={live} active={active} connected={connected} />
      {!active && r.activity.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Nhật ký review</CardTitle></CardHeader>
          <CardContent><ActivityLog entries={r.activity} /></CardContent>
        </Card>
      )}

      {r.omittedFiles.length > 0 && (
        <section role="status" className="flex gap-3 rounded-xl border border-warning bg-warning-bg px-5 py-4 text-warning-fg">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <div className="font-semibold">Diff lớn — chỉ review một phần</div>
            <div className="mt-0.5 text-[13px]">Đã xem {Math.max(0, r.filesChanged - r.omittedFiles.length)}/{r.filesChanged} file. {r.omittedFiles.length} file bị bỏ qua do vượt ngân sách (xếp theo độ ưu tiên):{" "}
              <span className="font-mono text-xs">{r.omittedFiles.slice(0, 3).join(" · ")}</span>{r.omittedFiles.length > 3 && ` · +${r.omittedFiles.length - 3} file`}</div>
            {r.omittedFiles.length > 3 && <details className="mt-2 text-[13px]"><summary className="cursor-pointer font-medium">Xem toàn bộ file bị bỏ qua</summary><ul className="mt-1 list-disc pl-5 font-mono text-xs">{r.omittedFiles.map((f) => <li key={f} className="break-all">{f}</li>)}</ul></details>}
            <div className="mt-1.5 text-[13px]">Điểm chỉ phản ánh phần đã xem. Chia nhỏ MR hoặc tăng ngân sách trong Cài đặt → Review.</div>
          </div>
        </section>
      )}

      {r.score != null && (
        <Card className="flex flex-wrap items-center gap-8 p-6">
          <ScoreRing score={r.score} />
          <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2"><GradeBadge grade={r.grade} />{verdict && <Badge variant={verdict.variant}>{verdict.label}</Badge>}{r.rawScore != null && r.rawScore - r.score > 1 && <Badge>Điểm thô {Math.round(r.rawScore)} → bị chặn ở {Math.round(r.score)}</Badge>}</div>
            {r.summary && <p className="max-w-[60ch]">{r.summary}</p>}
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-muted-foreground"><span>{r.filesChanged} file · <span className="text-success-fg">+{r.additions}</span> <span className="text-danger-fg">−{r.deletions}</span></span><span>{fmtDur(r.durationMs)}</span>{r.model && <span className="font-mono text-xs">{r.model}</span>}{r.costUsd != null && <span>${r.costUsd.toFixed(2)}</span>}<span className="font-mono text-xs">{r.headSha.slice(0, 7)}</span></div>
            {r.frameworkId && <p className="text-[13px] text-muted-foreground">Chấm bằng framework <Link className="font-medium text-foreground hover:underline" to={`/framework?id=${encodeURIComponent(r.frameworkId)}`}>{fws.data?.find((f) => f.id === r.frameworkId)?.name ?? r.frameworkId}</Link>{r.frameworkVersion && ` v${r.frameworkVersion}`}</p>}
          </div>
        </Card>
      )}

      {r.gates.map((g) => (
        <section key={g.id} role="alert" className="flex gap-3 rounded-xl border border-danger bg-danger-bg px-5 py-4 text-danger-fg">
          <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div><div className="font-semibold">Cổng chặn — điểm tối đa {g.cap}</div><div className="mt-0.5 text-[13px]">{g.reason}</div></div>
        </section>
      ))}

      {(r.strengths.length > 0 || r.intent) && (
        <Card><CardHeader><CardTitle>Ghi nhận</CardTitle></CardHeader><CardContent className="flex flex-col gap-2 text-sm">
          {r.intent && <p className="text-muted-foreground">Ý định MR: {r.intent}</p>}
          {r.strengths.length > 0 && <ul className="list-disc pl-5 text-success-fg">{r.strengths.map((s) => <li key={s}>{s}</li>)}</ul>}
        </CardContent></Card>
      )}

      {r.harnessReport && (
        <Card><CardHeader className="flex-row flex-wrap items-baseline justify-between gap-2"><CardTitle>Độ phủ harness của repo</CardTitle><span className="text-xs text-muted-foreground">Chỉ để gợi ý, không ảnh hưởng điểm</span></CardHeader>
          <CardContent><HarnessPanel report={r.harnessReport} compact /></CardContent></Card>
      )}

      <Card><CardHeader><CardTitle>Điểm theo hạng mục</CardTitle></CardHeader><CardContent>
        {r.categoryScores.map((c) => (
          <div key={c.category} className="grid grid-cols-[minmax(110px,1.2fr)_3fr_44px_72px] items-center gap-4 border-t py-2.5">
            <span className="font-medium">{c.name}</span>
            <Progress value={c.score} barClassName={c.score >= 90 ? "bg-success" : c.score >= 60 ? "bg-chart-3" : "bg-danger"} />
            <span className="text-right font-semibold tabular-nums">{Math.round(c.score)}</span>
            <span className="text-right text-xs text-muted-foreground">{c.findings} finding</span>
          </div>
        ))}
      </CardContent></Card>

      <HarnessLoad load={r.harnessLoad ?? null} />
      <RuleChecklist checks={r.ruleChecks ?? []} />
      <FileCoverage files={r.files ?? []} findings={r.findings} />

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-baseline justify-between"><CardTitle>Finding <span className="font-normal text-muted-foreground">({r.findings.length})</span></CardTitle></CardHeader>
        {r.findings.length === 0 ? <Empty>Không có finding 🎉</Empty> : r.findings.map((f) => (
          <article key={f.id} className="flex flex-col gap-2.5 border-t p-5">
            <div className="flex flex-wrap items-center gap-2"><SeverityBadge severity={f.severity} /><Badge className="font-mono">{f.ruleId ?? f.category}</Badge><Badge variant={f.source === "ai" ? "info" : "secondary"}>{f.source === "ai" ? "AI" : "Phân tích tĩnh"}</Badge><h3 className="ml-1 text-[15px] font-semibold">{f.title}</h3></div>
            {f.file && <div className="font-mono text-xs text-primary">{f.file}{f.lineStart ? `:${f.lineStart}` : ""}</div>}
            <p>{f.why}</p>
            {f.evidence && <pre className="overflow-x-auto rounded-md bg-zinc-900 px-3.5 py-3 font-mono text-xs leading-[1.7] text-zinc-200">{f.evidence}</pre>}
            {f.suggestion && <div className="rounded-md bg-success-bg px-3.5 py-3 text-[13px] text-success-fg"><b>Gợi ý.</b> {f.suggestion}</div>}
            {f.question && <div className="rounded-md bg-info-bg px-3.5 py-3 text-[13px] text-info-fg"><b>Câu hỏi cho tác giả.</b> {f.question}</div>}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
              <span className="tabular-nums">Độ tin cậy {Math.round(f.confidence * 100)}% · trừ {f.deduction.toFixed(1)}</span>
              <span className="flex gap-1.5">{(Object.keys(FB) as (keyof typeof FB)[]).map((v) => (
                <Button key={v} size="sm" variant="outline" className={cn(f.feedback === v && "border-primary bg-info-bg text-info-fg")} onClick={() => fb.mutate({ id: f.id, v: f.feedback === v ? null : v })}>{FB[v]}</Button>
              ))}</span>
            </div>
          </article>
        ))}
      </Card>
    </>
  );
}

type StageState = "done" | "failed" | "running" | "pending";

/** Đồng hồ 1 giây/lần khi `on`, để số giây "đã chờ/đang chạy" nhích theo thời gian thực. */
function useTick(on: boolean) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => set((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [on]);
}
const since = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
const clock = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}p${String(s % 60).padStart(2, "0")}s` : `${s}s`);

function Pipeline({ r, entries, retrying, retried, onRetry }: { r: RunDetailDto; entries: RunActivityEntry[]; retrying: boolean; retried: boolean; onRetry: () => void }) {
  const live = r.status === "queued" || r.status === "running";
  useTick(live);
  const last = entries[entries.length - 1];
  /** Mốc bắt đầu của một bước: lấy từ dòng "Bắt đầu: …" gần nhất của bước đó (queue: từ lúc tạo run). */
  const startedAt = (id: string) => (id === "queue" ? r.createdAt : [...entries].reverse().find((e) => e.stage === id && e.message.startsWith("Bắt đầu"))?.at);
  const known = STAGES.some((x) => x.id === r.stage);
  const stateOf = (id: string): StageState => {
    if (r.status === "failed" && r.stage === id) return "failed";
    if ((r.status === "running" || r.status === "queued") && r.stage === id) return "running";
    if (id === "queue" && !(r.status === "queued" || (r.status === "failed" && r.stage === "queue"))) return "done";
    if (r.stageTimings[id] != null) return "done";
    if (r.status === "succeeded") return "done";
    return "pending";
  };
  const statusLabel = r.status === "failed" ? `Lỗi${known ? ` · ${stageLabel(r.stage)}` : ""}` : r.status === "running" ? `Đang chạy${known ? ` · ${stageLabel(r.stage)}` : ""}` : r.status === "succeeded" ? "Hoàn tất" : r.status === "skipped" ? "Bỏ qua" : "Đang chờ · hàng đợi";
  const variant = r.status === "failed" ? "danger" : r.status === "succeeded" ? "success" : r.status === "running" ? "info" : "secondary";
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2"><CardTitle>Tiến trình review</CardTitle><Badge variant={variant}>{statusLabel}</Badge></CardHeader>
      <CardContent>
        {live && (
          <div role="status" aria-live="polite" className="mb-3 flex items-start gap-2.5 rounded-lg border bg-muted/30 px-3.5 py-2.5 text-sm">
            <Loader2 className="mt-0.5 size-4 flex-none animate-spin text-primary" aria-hidden="true" />
            <div className="min-w-0">
              <div className="font-medium">{r.status === "queued" ? `Đang chờ tới lượt trong hàng đợi · ${clock(since(r.createdAt))}` : known ? `${stageLabel(r.stage)}…` : "Đang khởi động…"}</div>
              <div className="break-words text-[13px] text-muted-foreground">{last ? <>{last.message} <span className="tabular-nums">· {clock(since(last.at))} trước</span></> : "Chưa có tín hiệu nào từ worker."}</div>
            </div>
          </div>
        )}
        {r.status === "skipped" && <p className="mb-3 text-sm text-muted-foreground">{r.error ?? "Lần review này bị bỏ qua."}</p>}
        <ol className="flex flex-col">
          {STAGES.map((st, i) => {
            const s = stateOf(st.id);
            const ms = r.stageTimings[st.id];
            return (
              <li key={st.id} className={cn("flex gap-3 border-t py-2.5 first:border-0", s === "pending" && "opacity-50")} aria-current={s === "running" ? "step" : undefined}>
                <span className={cn("mt-0.5 flex size-5 flex-none items-center justify-center rounded-full text-[11px] font-semibold", s === "done" && "bg-success-bg text-success-fg", s === "failed" && "bg-danger-bg text-danger-fg", s === "running" && "bg-info-bg text-info-fg", s === "pending" && "bg-secondary text-muted-foreground")}>
                  {s === "done" ? <Check className="size-3" aria-hidden="true" /> : s === "failed" ? <X className="size-3" aria-hidden="true" /> : s === "running" ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3"><span className={cn("font-medium", s === "failed" && "text-danger-fg")}>{st.label}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{s === "pending" ? "Chưa chạy" : s === "running" ? `${st.id === "queue" ? "Đang chờ" : "Đang chạy"}${startedAt(st.id) ? ` · ${clock(since(startedAt(st.id)!))}` : "…"}` : ms != null ? fmtMs(ms) : "—"}</span></div>
                  {s === "failed" && (
                    <div className="mt-2 flex flex-col gap-2.5">
                      <p role="alert" className="text-[13px] text-danger-fg">{r.error ?? "Stage này đã lỗi."}</p>
                      <div className="flex flex-wrap items-center gap-3"><Button size="sm" variant="outline" disabled={retrying} onClick={onRetry}>Thử lại</Button>{retried && <span className="text-xs text-muted-foreground">Đã xếp hàng lại.</span>}</div>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
