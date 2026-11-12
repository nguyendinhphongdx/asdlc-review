import type { RunActivityEntry, RunDetailDto } from "@mrd/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Bot, Check, ChevronDown, CircleAlert, ExternalLink, RotateCw, ThumbsDown, ThumbsUp, TriangleAlert } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Avatar } from "@/components/ui/avatar";
import { Badge, GradeBadge, SeverityBadge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { CodeBlock } from "@/components/code-block";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScoreRing } from "@/components/ui/score-ring";
import { cn } from "@/lib/utils";
import { fmtDate, fmtDur } from "../../kernel/format.js";
import { Empty, ErrorBox, Loading, PageHeader } from "../../kernel/page.js";
import { FileChanges } from "./changes.js";
import { HarnessLoad, RuleChecklist } from "./coverage.js";
import { HarnessPanel } from "../../kernel/harness.js";
import { addNote, deleteNote, getRun, listFrameworks, listNotes, openRunStream, setFeedback } from "./api.js";
import { useReviewRequest } from "./use-review-request.js";
import { LogTab } from "./log-tab.js";
import { ProgressStrip, defaultLogStage } from "./strip.js";
import { AgentChat } from "./chat.js";
import { STAGES } from "../../kernel/stages.js";

const VERDICT: Record<string, { label: string; variant: "success" | "warning" | "danger" }> = {
  approve: { label: "Có thể merge", variant: "success" }, comment: { label: "Cần góp ý", variant: "warning" }, request_changes: { label: "Yêu cầu sửa", variant: "danger" },
};
const SEV_ORDER = ["blocker", "critical", "major", "minor", "nit"];
const SEV_COLOR: Record<string, string> = { blocker: "bg-danger", critical: "bg-chart-4", major: "bg-chart-3", minor: "bg-chart-2", nit: "bg-muted-foreground/60" };
const SEV_HINT: Record<string, string> = { blocker: "chặn merge", critical: "cần sửa ngay", major: "cần sửa trước khi merge", minor: "nên cải thiện", nit: "tuỳ chọn" };
const FB = { agree: "Đồng ý", disagree: "Không đồng ý", fixed: "Đã sửa" } as const;

type TabId = "overview" | "changes" | "findings" | "context" | "log";

export function ReviewDetailPage() {
  const { id = "" } = useParams();
  const [sp, setSp] = useSearchParams();
  const qc = useQueryClient();
  const [live, setLive] = useState<RunActivityEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [openStage, setOpenStage] = useState("review");
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
  const entries = live.length ? live : r.activity;
  // Đang review thì mở sẵn tab Nhật ký (dữ liệu có liên quan nhất lúc này); xong thì mở Tổng quan.
  const tab = ((sp.get("tab") as TabId | null) ?? (active ? "log" : "overview"));
  const setTab = (t: TabId) => setSp((p) => { const n = new URLSearchParams(p); n.set("tab", t); return n; }, { replace: true });
  const openLog = (stage: string) => { setOpenStage(stage); setTab("log"); };
  const openFindings = r.findings.filter((f) => f.feedback !== "fixed" && f.feedback !== "disagree").length;
  const tabs: { id: TabId; label: string; count?: number | string; tone?: "live" | "warn" }[] = [
    { id: "overview", label: "Tổng quan" },
    { id: "changes", label: "Thay đổi", count: r.files.length || r.filesChanged || undefined },
    { id: "findings", label: "Góp ý", count: r.findings.length ? openFindings : undefined, tone: "warn" },
    { id: "context", label: "Ngữ cảnh AI" },
    { id: "log", label: "Nhật ký", count: active ? "LIVE" : undefined, tone: "live" },
  ];
  return (
    <>
      <PageHeader title={`!${r.mr.iid} ${r.mr.title}`}>
        <Button disabled={re.isPending || active} onClick={() => re.mutate({ mrId: r.mr.id })} title={active ? "Đang có một lần review chạy cho MR này" : undefined}><RotateCw />{re.isPending ? "Đang xếp hàng…" : "Review lại"}</Button>
        <a className={buttonVariants({ variant: "ghost", size: "icon" })} href={r.mr.webUrl} target="_blank" rel="noreferrer" aria-label="Mở MR trên GitLab (tab mới)" title="Mở trên GitLab"><ExternalLink /></a>
      </PageHeader>
      <div className="-mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-muted-foreground">
        <span className="inline-flex items-center gap-2"><Avatar name={r.mr.authorUsername} className="size-[22px] text-[10px]" /><span className="font-medium text-foreground">{r.mr.authorUsername}</span></span>
        <span className="font-mono text-xs">{r.mr.sourceBranch} → {r.mr.targetBranch}</span>
        <span>Vòng {r.round} · {fmtDate(r.createdAt)}</span>
        <Link to="/reviews" className="hover:underline">← Danh sách</Link>
      </div>
      {r.error && !(r.status === "failed" && STAGES.some((x) => x.id === r.stage)) && <ErrorBox error={r.error} />}

      <ProgressStrip r={r} entries={entries} onPickStage={openLog} onViewLog={() => openLog(defaultLogStage(r, entries))} retrying={re.isPending} retried={re.isSuccess} onRetry={() => re.mutate({ mrId: r.mr.id })} />
      {re.error && <ErrorBox error={re.error} />}
      {re.notice && !re.error && !re.isPending && <p role="status" className="text-[13px] text-muted-foreground">{re.notice}</p>}

      <div role="tablist" aria-label="Nội dung review" className="flex flex-wrap gap-1 border-b">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} onClick={() => setTab(t.id)}
            className={cn("-mb-px inline-flex h-10 items-center gap-2 border-b-2 px-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring", tab === t.id ? "border-primary font-semibold text-foreground" : "border-transparent font-medium text-muted-foreground hover:text-foreground")}>
            {t.label}
            {t.count != null && <span className={cn("rounded-full px-1.5 text-[11.5px] font-semibold tabular-nums", t.tone === "live" ? "bg-info-bg text-info-fg" : t.tone === "warn" ? "bg-warning-bg text-warning-fg" : "bg-muted text-muted-foreground")}>{t.count}</span>}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="flex flex-col gap-4">
        {tab === "overview" && <OverviewTab r={r} frameworkName={fws.data?.find((f) => f.id === r.frameworkId)?.name} />}
        {tab === "changes" && <FileChanges mrId={r.mr.id} files={r.files ?? []} findings={r.findings} />}
        {tab === "findings" && <Findings findings={r.findings} onFeedback={(fid, v) => fb.mutate({ id: fid, v })} />}
        {tab === "context" && <ContextTab r={r} frameworkName={fws.data?.find((f) => f.id === r.frameworkId)?.name} />}
        {tab === "log" && <LogTab r={r} entries={entries} open={openStage} onOpen={setOpenStage} />}
      </div>

      <AgentChat mrId={r.mr.id} active={active} connected={connected} />
    </>
  );
}

function OverviewTab({ r, frameworkName }: { r: RunDetailDto; frameworkName?: string | undefined }) {
  const verdict = r.verdict ? VERDICT[r.verdict] : undefined;
  return (
    <>
      <MrDescription d={r.mrDescription} />
      <OverviewCard sections={r.overview ?? []} />
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
            {r.findings.length > 0 && (
              <div className="max-w-md" role="img" aria-label={SEV_ORDER.map((k) => `${r.findings.filter((f) => f.severity === k).length} ${k}`).join(", ")}>
                <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">{SEV_ORDER.map((k) => { const n = r.findings.filter((f) => f.severity === k).length; return n ? <span key={k} className={cn("transition-all", SEV_COLOR[k])} style={{ flex: n }} /> : null; })}</div>
              </div>
            )}
            {r.frameworkId && <p className="text-[13px] text-muted-foreground">Chấm bằng framework <Link className="font-medium text-foreground hover:underline" to={`/framework?id=${encodeURIComponent(r.frameworkId)}`}>{frameworkName ?? r.frameworkId}</Link>{r.frameworkVersion && ` v${r.frameworkVersion}`}</p>}
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

      {r.categoryScores.length > 0 && (
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
      )}
      <RuleChecklist checks={r.ruleChecks ?? []} />
    </>
  );
}

/** "Đánh giá tổng quan" do AI viết theo khung framework (mục, dạng hiển thị, nhãn kết luận đều do framework quyết định). */
function OverviewCard({ sections }: { sections: RunDetailDto["overview"] }) {
  if (!sections.length) return null;
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
        <div className="flex items-center gap-2.5"><span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Bot className="size-4" aria-hidden="true" /></span><div><h2 className="text-[15px] font-semibold">Đánh giá tổng quan</h2><p className="text-xs text-muted-foreground">AI nhìn MR từ xa, theo khung của framework</p></div></div>
        <Badge variant="info">Do AI viết</Badge>
      </div>
      <div className="flex flex-col px-5 pb-2 pt-1">
        {sections.map((x, i) => (
          <div key={x.id} className="flex gap-3.5 border-t py-3.5 first:border-0">
            <span className="mt-0.5 flex size-[22px] flex-none items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">{i + 1}</span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{x.title}</h3>{x.verdict && <span className="rounded-full bg-info-bg px-2 py-0.5 text-[11.5px] font-semibold text-info-fg">{x.verdict}</span>}</div>
              {x.text && <p className="text-sm leading-relaxed text-foreground/85">{x.text}</p>}
              {x.bullets.length > 0 && <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-relaxed text-foreground/85">{x.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Tiêu đề, mô tả MR và tài liệu liên kết theo chuẩn của framework (có/thiếu). */
function MrDescription({ d }: { d: RunDetailDto["mrDescription"] }) {
  if (!d || (!d.body.trim() && d.docs.length === 0)) return null;
  const req = d.docs.filter((x) => x.required);
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3.5">
        <h2 className="text-[15px] font-semibold">Mô tả MR</h2>
        {d.docs.length > 0 && <Badge variant={d.missingRequired ? "danger" : "success"}>{d.docs.filter((x) => x.found).length}/{d.docs.length} tài liệu{req.length ? (d.missingRequired ? ` · thiếu ${d.missingRequired} bắt buộc` : " · đủ bắt buộc") : ""}</Badge>}
      </div>
      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="text-[15px] font-semibold">{d.title}</div>
        {d.body.trim() ? <p className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/85">{d.body.trim()}</p> : <p className="text-sm text-muted-foreground">Mô tả MR trống.</p>}
        {d.docs.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tài liệu liên kết</div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-2">
              {d.docs.map((x) => (
                <div key={x.kind} className={cn("flex items-start gap-2.5 rounded-lg border px-3 py-2.5", !x.found && "border-dashed border-danger/50 bg-danger-bg/40")}>
                  <span className={cn("flex size-[22px] flex-none items-center justify-center rounded-md text-xs font-bold", x.found ? "bg-success-bg text-success-fg" : "bg-danger-bg text-danger-fg")}>{x.found ? "✓" : "!"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">{x.kind}<span className={cn("rounded px-1.5 text-[10.5px]", x.required ? "bg-info-bg text-info-fg" : "bg-muted")}>{x.required ? "Bắt buộc" : "Khuyến nghị"}</span></div>
                    <div className={cn("truncate text-[13px]", x.found ? "font-medium" : "text-danger-fg")} title={x.match ?? x.hint}>{x.found ? x.match : (x.hint || "Chưa có")}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

const PREV: Record<string, { label: string; variant: "success" | "secondary" | "warning" }> = { fixed: { label: "đã xử lý", variant: "success" }, dismissed: { label: "bỏ qua", variant: "secondary" }, open: { label: "còn mở", variant: "warning" } };

function ContextTab({ r, frameworkName }: { r: RunDetailDto; frameworkName?: string | undefined }) {
  const qc = useQueryClient();
  const notesQ = useQuery({ queryKey: ["notes", r.mr.id], queryFn: () => listNotes(r.mr.id) });
  const [text, setText] = useState("");
  const add = useMutation({ mutationFn: () => addNote(r.mr.id, text), onSuccess: () => { setText(""); void qc.invalidateQueries({ queryKey: ["notes", r.mr.id] }); } });
  const del = useMutation({ mutationFn: (id: string) => deleteNote(id), onSuccess: () => void qc.invalidateQueries({ queryKey: ["notes", r.mr.id] }) });
  const ctx = r.aiContext;
  const prev = ctx?.previousRound ?? null;
  const tok = (c: number) => `~${Math.max(1, Math.round(c / 4)).toLocaleString("vi-VN")} token`;
  return (
    <>
      <Card className="gap-1 p-5">
        <h2 className="text-[15px] font-semibold">AI nhận được gì ở lần review này</h2>
        <p className="text-[13px] text-muted-foreground">Framework + harness của repo + diff + mô tả MR, thêm bộ nhớ repo, ghi chú của người và kết quả vòng trước. Harness lấy từ base commit nên tác giả MR không sửa lén được. AI không giữ phiên giữa các vòng — mọi thứ "nhớ" đều đến từ các nguồn dưới đây.</p>
        <p className="mt-2 text-sm">Framework: <b>{frameworkName ?? r.frameworkId ?? "không rõ"}</b>{r.frameworkVersion && ` v${r.frameworkVersion}`} · {r.ruleChecks.length} rule</p>
        {ctx && (
          <ul className="mt-2 grid gap-1.5 text-[13px] sm:grid-cols-3">
            {ctx.sources.map((s) => <li key={s.id} className="flex justify-between rounded-md bg-muted/50 px-3 py-1.5"><span>{s.label}</span><span className="tabular-nums text-muted-foreground">{s.chars ? tok(s.chars) : "—"}</span></li>)}
          </ul>
        )}
      </Card>

      {ctx && ctx.lessons.length > 0 && (
        <Card className="gap-1 p-5">
          <h2 className="text-[15px] font-semibold">Bộ nhớ repo đã nạp ({ctx.lessons.length})</h2>
          <ul>{ctx.lessons.map((l, i) => <li key={i} className="flex items-start gap-2 border-t py-2 text-[13.5px] first:border-0"><Badge variant="secondary">{l.kind}</Badge><span className="min-w-0 flex-1 break-words">{l.text}{l.paths && <span className="ml-2 font-mono text-[11px] text-muted-foreground">{l.paths}</span>}</span></li>)}</ul>
        </Card>
      )}

      <Card className="gap-2 p-5">
        <h2 className="text-[15px] font-semibold">Ghi chú cho AI về MR này</h2>
        <p className="text-[13px] text-muted-foreground">Bối cảnh chỉ đúng với MR này (ví dụ: "đang di chuyển dần sang X, đừng đòi sửa hết"). Có hiệu lực từ lần review sau; không thay thế bộ nhớ repo.</p>
        {(notesQ.data ?? []).length > 0 && (
          <ul>{(notesQ.data ?? []).map((n) => <li key={n.id} className="flex items-start gap-2 border-t py-2 text-[13.5px] first:border-0"><span className="min-w-0 flex-1 break-words">{n.text}<span className="ml-2 text-xs text-muted-foreground">{n.author} · {fmtDate(n.createdAt)}</span></span><Button size="sm" variant="ghost" onClick={() => del.mutate(n.id)}>Xoá</Button></li>)}</ul>
        )}
        <textarea aria-label="Ghi chú mới" rows={2} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Viết ghi chú…" className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        <div><Button size="sm" disabled={text.trim().length < 3 || add.isPending} onClick={() => add.mutate()}>Thêm ghi chú</Button></div>
      </Card>

      <Card className="gap-1 p-5">
        <h2 className="text-[15px] font-semibold">{prev ? `Vòng trước (vòng ${prev.round}) → vòng này` : "Vòng trước"}</h2>
        {prev ? (
          <>
            <p className="text-[13px] text-muted-foreground">AI nhận danh sách góp ý của vòng {prev.round}{prev.score != null && ` (điểm ${Math.round(prev.score)})`} kèm trạng thái, để kiểm tra lại thay vì bắt đầu từ đầu, và không nêu lại mục đã bị bỏ qua.</p>
            <ul>{prev.findings.map((f, i) => { const s = PREV[f.status]!; return <li key={i} className="flex items-start gap-2 border-t py-2 text-[13.5px] first:border-0"><Badge variant={s.variant}>{s.label}</Badge><span className="min-w-0 flex-1 break-words">{f.title}{f.file && <span className="ml-2 font-mono text-xs text-muted-foreground">{f.file}{f.line ? `:${f.line}` : ""}</span>}</span></li>; })}</ul>
          </>
        ) : <p className="text-[13px] text-muted-foreground">Đây là vòng đầu tiên, hoặc chưa có vòng trước thành công.</p>}
      </Card>

      <HarnessLoad load={r.harnessLoad ?? null} />
    </>
  );
}

type Finding = RunDetailDto["findings"][number];

const isClosed = (f: Finding) => f.feedback === "fixed" || f.feedback === "disagree";

function Findings({ findings: all, onFeedback }: { findings: Finding[]; onFeedback: (id: string, v: keyof typeof FB | null) => void }) {
  const [sev, setSev] = useState<string>("all");
  const [showClosed, setShowClosed] = useState(false);
  const findings = showClosed ? all : all.filter((f) => !isClosed(f));
  const openOf = (ks: string[]) => all.filter((f) => !isClosed(f) && ks.includes(f.severity)).length;
  const tiles = [
    { n: openOf(["blocker", "critical", "major"]), label: "Major trở lên", sub: "cần sửa trước khi merge", tone: "bg-danger-bg text-danger-fg" },
    { n: openOf(["minor"]), label: "Minor", sub: "nên sửa", tone: "bg-warning-bg text-warning-fg" },
    { n: openOf(["nit"]), label: "Nit", sub: "tuỳ chọn", tone: "bg-muted text-muted-foreground" },
    { n: all.filter(isClosed).length, label: "Đã xử lý / bỏ qua", sub: "không tính vào đang mở", tone: "bg-success-bg text-success-fg" },
  ];
  const counts = SEV_ORDER.map((k) => [k, findings.filter((f) => f.severity === k).length] as const).filter(([, n]) => n > 0);
  if (all.length === 0) return <Card><Empty>Không có finding 🎉</Empty></Card>;
  const groups = counts.filter(([k]) => sev === "all" || sev === k);
  const fixed = all.filter((f) => f.feedback === "fixed").length;
  return (
    <section aria-label="Finding" className="flex flex-col gap-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        {tiles.map((t) => (
          <Card key={t.label} className="flex-row items-center gap-3 px-4 py-3.5"><span className={cn("flex size-9 flex-none items-center justify-center rounded-lg text-base font-bold tabular-nums", t.tone)}>{t.n}</span><div><div className="text-[13.5px] font-semibold">{t.label}</div><div className="text-xs text-muted-foreground">{t.sub}</div></div></Card>
        ))}
      </div>
      <div role="group" aria-label="Lọc theo mức độ" className="flex flex-wrap items-center gap-2">
        {[["all", findings.length] as const, ...counts].map(([k, n]) => (
          <button key={k} type="button" aria-pressed={sev === k} onClick={() => setSev(k)}
            className={cn("inline-flex h-8 items-center gap-2 rounded-full border bg-card px-3 text-[13px] font-medium capitalize outline-none focus-visible:ring-2 focus-visible:ring-ring", sev === k && "border-primary bg-info-bg text-info-fg")}>
            {k !== "all" && <span className={cn("size-2 rounded-full", SEV_COLOR[k])} />}{k === "all" ? "Tất cả" : k}<span className="tabular-nums">{n}</span>
          </button>
        ))}
        <button type="button" aria-pressed={showClosed} onClick={() => setShowClosed(!showClosed)} className={cn("ml-auto h-8 rounded-full border px-3 text-[13px] font-medium", showClosed ? "border-primary bg-info-bg text-info-fg" : "text-muted-foreground")}>Gồm đã xử lý{fixed > 0 ? ` (${fixed} đã sửa)` : ""}</button>
      </div>
      {groups.map(([k]) => {
        const list = findings.filter((f) => f.severity === k);
        const open = SEV_ORDER.indexOf(k) <= 2;
        return (
          <Card key={k} className="overflow-hidden">
            <div className="flex items-center gap-2 border-b bg-muted/40 px-5 py-3 text-[13px] font-semibold"><span className={cn("size-2 rounded-full", SEV_COLOR[k])} /><span className="capitalize">{k}</span><span className="font-normal text-muted-foreground">· {SEV_HINT[k]}</span><span className="ml-auto tabular-nums text-muted-foreground">{list.length}</span></div>
            {list.map((f, i) => (
              <details key={f.id} open={open && i < 3} className="group border-t p-5 first:border-0">
                <summary className="flex w-full cursor-pointer list-none items-start justify-between gap-3 outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold">{f.title}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {f.file && <span className="font-mono text-foreground">{f.file}{f.lineStart ? `:${f.lineStart}` : ""}</span>}
                      <Badge className="font-mono">{f.ruleId ?? f.category}</Badge>
                      <Badge variant={f.source === "ai" ? "info" : "secondary"}>{f.source === "ai" ? "AI" : "Phân tích tĩnh"}</Badge>
                      <span className="tabular-nums">Tin cậy {Math.round(f.confidence * 100)}% · trừ {f.deduction.toFixed(1)}</span>
                      {f.feedback && <Badge variant={f.feedback === "fixed" ? "success" : "secondary"}>{FB[f.feedback as keyof typeof FB]}</Badge>}
                    </span>
                  </span>
                  <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="mt-3 flex flex-col gap-2.5">
                  <p>{f.why}</p>
                  {f.evidence && <CodeBlock code={f.evidence} file={f.file} />}
                  {f.suggestion && <div className="rounded-md bg-success-bg px-3.5 py-3 text-[13px] text-success-fg"><b>Gợi ý.</b> {f.suggestion}</div>}
                  {f.question && <div className="rounded-md bg-info-bg px-3.5 py-3 text-[13px] text-info-fg"><b>Câu hỏi cho tác giả.</b> {f.question}</div>}
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="outline" className={cn(f.feedback === "fixed" && "border-primary bg-info-bg text-info-fg")} onClick={() => onFeedback(f.id, f.feedback === "fixed" ? null : "fixed")}><Check />Đã sửa</Button>
                    <Button size="icon-sm" variant="ghost" aria-label="Đồng ý với finding" title="Đồng ý" aria-pressed={f.feedback === "agree"} className={cn(f.feedback === "agree" && "bg-info-bg text-info-fg")} onClick={() => onFeedback(f.id, f.feedback === "agree" ? null : "agree")}><ThumbsUp /></Button>
                    <Button size="icon-sm" variant="ghost" aria-label="Không đồng ý với finding" title="Không đồng ý" aria-pressed={f.feedback === "disagree"} className={cn(f.feedback === "disagree" && "bg-info-bg text-info-fg")} onClick={() => onFeedback(f.id, f.feedback === "disagree" ? null : "disagree")}><ThumbsDown /></Button>
                    <Button size="sm" variant="ghost" className={cn(f.feedback === "disagree" && "text-muted-foreground")} onClick={() => onFeedback(f.id, f.feedback === "disagree" ? null : "disagree")}>{f.feedback === "disagree" ? "Mở lại" : "Không đúng, bỏ qua"}</Button>
                  </div>
                </div>
              </details>
            ))}
          </Card>
        );
      })}
    </section>
  );
}
