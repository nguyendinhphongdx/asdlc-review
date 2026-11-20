import type { ActionDto, ChatImageDto, ChatRefDto, ChatStepDto, ChatViewingDto } from "@mrd/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, CircleCheck, CircleDot, CircleX, Eye, Loader2, FileText, Minus, MessageSquare, Sparkles, Wrench, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Completer, repoCommandsFrom, type AsdlcCommand } from "./completer.js";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputBody, PromptInputFooter, PromptInputHeader, PromptInputSubmit, PromptInputTextarea, usePromptInputAttachments, usePromptInputController, PromptInputProvider } from "@/components/ai-elements/prompt-input";
import { ErrorBox } from "../../kernel/page.js";
import { Confirmation, ConfirmationAccepted, ConfirmationAction, ConfirmationActions, ConfirmationRequest, ConfirmationTitle } from "@/components/ai-elements/confirmation";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Suggestion } from "@/components/ai-elements/suggestion";
import { readAttachmentText, approveAction, dismissAction, getChat, sendChat } from "./api.js";

const SUGGEST = ["Giải thích finding nghiêm trọng nhất", "Finding nào có thể là báo nhầm?", "Đọc code liên quan và kiểm tra lại", "Soạn comment cho finding quan trọng nhất", "nhớ: ", "review lại"];
const TOOL_LABEL: Record<string, string> = { Read: "Đọc file", Grep: "Tìm trong code", Glob: "Liệt kê file", get_review: "Xem kết quả review", get_diff: "Xem diff MR", get_framework: "Xem framework", get_harness: "Xem harness", propose_comment: "Soạn comment", get_summary_comment: "Đọc bản nháp comment", edit_summary_comment: "Sửa bản nháp comment", post_summary_comment: "Đăng comment tổng hợp", propose_rerun: "Đề xuất chạy lại" };
const TEXT_EXT = /\.(txt|md|log|json|diff|patch|ya?ml|toml|csv|tsx?|jsx?|py|go|rs|java|kt|rb|php|sh|sql|html|css|xml)$/i;
const MAX_TEXT = 24_000;

/** Tóm tắt tham số của một lệnh gọi tool thành một chuỗi ngắn (đường dẫn, mẫu tìm kiếm, id…). */
function hintOf(input: Record<string, unknown>): string {
  const v = input.file_path ?? input.path ?? input.pattern ?? input.query ?? input.command ?? input.id ?? Object.values(input).find((x) => typeof x === "string");
  return typeof v === "string" ? v.replace(/^\/(?:private\/)?(?:var|tmp)\/[^ ]*?\/(?=[^/]+\/)/, "").slice(0, 120) : "";
}

type ToolStep = Extract<ChatStepDto, { kind: "tool" }>;
const STEP_ICON = "mt-0.5 size-3.5 flex-none";

/** Một bước trong dòng thời gian: tool (nhãn + gợi ý + trạng thái) hoặc suy luận; bấm để xem tham số/kết quả. */
function StepItem({ st, running }: { st: ChatStepDto; running: boolean }) {
  if (st.kind === "thinking") {
    return (
      <li className="relative">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-start gap-2 text-[13px] text-muted-foreground [&::-webkit-details-marker]:hidden">
            <CircleDot className={cn(STEP_ICON, "text-muted-foreground/70")} aria-hidden="true" /><span className="min-w-0 flex-1 truncate">{running ? "Đang suy luận…" : "Suy luận"}</span>
            <ChevronDown className="mt-0.5 size-3.5 flex-none transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <p className="mt-1 whitespace-pre-wrap pl-5 text-[12px] leading-relaxed text-muted-foreground">{st.text}</p>
        </details>
      </li>
    );
  }
  const done = st.output !== undefined;
  return (
    <li className="relative">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start gap-2 text-[13px] [&::-webkit-details-marker]:hidden">
          {st.error ? <CircleX className={cn(STEP_ICON, "text-danger-fg")} aria-label="Lỗi" /> : done ? <CircleCheck className={cn(STEP_ICON, "text-success-fg")} aria-label="Xong" /> : <Loader2 className={cn(STEP_ICON, "animate-spin text-primary")} aria-label="Đang chạy" />}
          <span className="flex-none font-medium">{TOOL_LABEL[st.name] ?? st.name}</span>
          <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-muted-foreground">{hintOf(st.input)}</span>
          <ChevronDown className="mt-0.5 size-3.5 flex-none text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="mt-1 flex flex-col gap-1 pl-5 text-[12px]">
          <div><div className="mb-0.5 font-medium text-muted-foreground">Tham số</div><pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 font-mono text-[11.5px]">{JSON.stringify(st.input, null, 2)}</pre></div>
          {st.output !== undefined && <div><div className={cn("mb-0.5 font-medium", st.error ? "text-danger-fg" : "text-muted-foreground")}>{st.error ? "Lỗi" : "Kết quả"}</div><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 font-mono text-[11.5px]">{st.output.slice(0, 1500)}</pre></div>}
        </div>
      </details>
    </li>
  );
}

const fmtSec = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s` : `${s}s`);

/**
 * Toàn bộ hoạt động của agent trong một lượt gói vào MỘT khối gập: dòng đầu luôn nằm trên cùng
 * ("Agent đang làm việc…" khi đang chạy, "Đã dùng N công cụ" khi xong), bên trong là dòng thời gian từng bước.
 */
function Steps({ steps, live, sinceMs }: { steps: ChatStepDto[]; live?: boolean; sinceMs?: number | undefined }) {
  const [, tick] = useState(0);
  useEffect(() => { if (!live) return; const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, [live]);
  if (!steps.length && !live) return null;
  const tools = steps.filter((x): x is ToolStep => x.kind === "tool");
  const failed = tools.filter((t) => t.error).length;
  const secs = live && sinceMs ? Math.max(0, Math.round((Date.now() - sinceMs) / 1000)) : null;
  const counts = new Map<string, number>();
  for (const t of tools) counts.set(TOOL_LABEL[t.name] ?? t.name, (counts.get(TOOL_LABEL[t.name] ?? t.name) ?? 0) + 1);
  const last = steps.length - 1;
  return (
    <Collapsible defaultOpen={false} className="not-prose group w-full rounded-md border bg-card/50">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px]">
        {live ? <Loader2 className="size-3.5 flex-none animate-spin text-primary" aria-hidden="true" /> : <Wrench className="size-3.5 flex-none text-muted-foreground" aria-hidden="true" />}
        <span className="flex-none font-medium">{live ? <Shimmer duration={1.2}>Agent đang làm việc…</Shimmer> : `Đã dùng ${tools.length} công cụ`}</span>
        {live && tools.length > 0 && <span className="flex-none text-[12px] text-muted-foreground">{tools.length} công cụ{secs != null ? ` · ${fmtSec(secs)}` : ""}</span>}
        {!live && <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">{[...counts].map(([k, n]) => (n > 1 ? `${k} ×${n}` : k)).join(" · ")}</span>}
        {live && <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">{(() => { const t = [...tools].reverse().find((x) => x.output === undefined); return t ? `${TOOL_LABEL[t.name] ?? t.name} ${hintOf(t.input)}` : ""; })()}</span>}
        {failed > 0 && <span className="flex-none text-[12px] text-danger-fg">{failed} lỗi</span>}
        <ChevronDown className="size-3.5 flex-none text-muted-foreground transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
      </CollapsibleTrigger>
      {steps.length > 0 && (
        <CollapsibleContent>
          <ol className="ml-4 flex flex-col gap-2 border-l py-2 pl-3 pr-2.5">
            {steps.map((st, i) => <StepItem key={st.kind === "tool" ? st.id : `t${i}`} st={st} running={Boolean(live) && i === last} />)}
          </ol>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

function ActionCard({ a, onDone }: { a: ActionDto; onDone: () => void }) {
  const ok = useMutation({ mutationFn: () => approveAction(a.id), onSettled: onDone });
  const no = useMutation({ mutationFn: () => dismissAction(a.id), onSettled: onDone });
  const comment = a.kind === "comment";
  const busy = ok.isPending || no.isPending;
  return (
    <Confirmation state={ok.isSuccess ? "approval-responded" : "approval-requested"} approval={ok.isSuccess ? { id: a.id, approved: true } : { id: a.id }} className="my-2">
      <ConfirmationTitle>
        <div className="flex flex-col gap-1.5 text-[13px]">
          <span className="font-medium">{comment ? (a.payload.file ? `Đăng comment tại ${a.payload.file}:${a.payload.line}` : "Đăng comment lên MR") : "Chạy lại review"}</span>
          {comment ? <span className="whitespace-pre-wrap break-words rounded-md bg-muted/50 p-2 [overflow-wrap:anywhere]">{a.payload.body}</span> : <span>{a.payload.reason}</span>}
        </div>
      </ConfirmationTitle>
      <ConfirmationRequest>
        <ConfirmationActions>
          <ConfirmationAction variant="outline" disabled={busy} onClick={() => no.mutate()}>Bỏ</ConfirmationAction>
          <ConfirmationAction disabled={busy} onClick={() => ok.mutate()}>{comment ? "Đăng" : "Chạy lại"}</ConfirmationAction>
        </ConfirmationActions>
      </ConfirmationRequest>
      <ConfirmationAccepted><span className="text-[13px]">Đã thực hiện.</span></ConfirmationAccepted>
      {(ok.error || no.error) && <p role="alert" className="text-[13px] text-danger-fg">{String((ok.error ?? no.error) as Error)}</p>}
    </Confirmation>
  );
}

function Attachments() {
  const att = usePromptInputAttachments();
  if (!att.files.length) return null;
  return (
    <div className="flex flex-wrap gap-2 px-3 pt-3">
      {att.files.map((f) => (
        <span key={f.id} className="relative">
          {f.mediaType?.startsWith("image/")
            ? <img src={f.url} alt={f.filename ?? "Ảnh đính kèm"} className="size-16 rounded-md border object-cover" />
            : <span className="flex h-16 max-w-40 items-center gap-1.5 rounded-md border px-2 text-xs"><FileText className="size-4 shrink-0" /><span className="truncate">{f.filename}</span></span>}
          <button type="button" aria-label="Bỏ tệp" className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border bg-background" onClick={() => att.remove(f.id)}><X className="size-3" /></button>
        </span>
      ))}
    </div>
  );
}

function QuickPrompts({ disabled, onSend, file }: { disabled: boolean; onSend: (t: string) => void; file?: string | undefined }) {
  const ctl = usePromptInputController();
  const list = file ? ["Giải thích file đang xem", "File này có vấn đề gì?", ...SUGGEST] : SUGGEST;
  const box = useRef<HTMLDivElement | null>(null);
  const [more, setMore] = useState(false);
  const [dlg, setDlg] = useState(false);
  // Chỉ hiện tối đa 2 dòng, không cuộn ngang; thừa thì có nút "Xem thêm" mở hộp thoại liệt kê tất cả.
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const check = () => setMore(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [list.length]);
  const pickOne = (t: string) => { setDlg(false); if (t.endsWith(": ")) ctl.textInput.setInput(t); else onSend(t); };
  return (
    <div className="flex items-start gap-1.5">
      <div ref={box} className="flex max-h-[62px] min-w-0 flex-1 flex-wrap gap-1.5 overflow-hidden">
        {list.map((s) => <Suggestion key={s} suggestion={s} disabled={disabled} className="h-7 rounded-full px-2.5 text-xs" onClick={pickOne} />)}
      </div>
      {more && <Button type="button" variant="ghost" size="sm" className="h-7 flex-none rounded-full px-2.5 text-xs" onClick={() => setDlg(true)}>Xem thêm</Button>}
      <Dialog open={dlg} onOpenChange={setDlg}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Gợi ý câu hỏi</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-1.5">
            {list.map((s) => <button key={s} type="button" disabled={disabled} className="rounded-md border px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50" onClick={() => pickOne(s)}>{s}</button>)}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type Mode = "closed" | "open" | "min";
const loadMode = (): Mode => { try { const v = localStorage.getItem("mrd.chat.mode"); return v === "closed" || v === "min" ? v : "open"; } catch { return "open"; } };

/**
 * Trợ lý review dạng chat nổi (AI Elements): đóng/mở/thu gọn. Agent đọc kết quả review, diff, framework, harness và code repo
 * (Read/Grep/Glob), hiện suy luận và từng lệnh gọi tool; comment/chạy lại chỉ là đề xuất chờ bạn duyệt.
 */
/** `incoming`: câu hỏi do nơi khác trên trang đẩy vào (vd bấm nút trên sơ đồ); mỗi `id` mới được gửi một lần. */
export function AgentChat({ mrId, active, connected, dock = false, incoming = null, viewing, onClearSelection, onAskSettled, files = [], repoName = "Repo", harnessItems = [] }: { onAskSettled?: ((r: { id: number; failed: boolean; reply: string }) => void) | undefined; files?: string[]; repoName?: string; harnessItems?: { path: string }[]; onClearSelection?: (() => void) | undefined; mrId: string; active: boolean; connected: boolean; dock?: boolean; incoming?: { id: number; text: string } | null; viewing?: ChatViewingDto | undefined }) {
  const qc = useQueryClient();
  const [modeRaw, setModeState] = useState<Mode>(loadMode);
  const mode: Mode = dock ? "open" : modeRaw;
  const setMode = (m: Mode) => { setModeState(m); try { localStorage.setItem("mrd.chat.mode", m); } catch { /* không lưu được thì thôi */ } };
  const [pending, setPending] = useState<string | null>(null);
  // Số tin đã có lúc bấm gửi: khi server lưu tin của bạn (số tin tăng) thì bỏ tin tạm để không hiện trùng.
  const baseline = useRef(0);
  // Chia sẻ "đang xem gì" (tab, file, nút sơ đồ) với agent để nó hiểu "file này", "chỗ này". Tắt được cho từng phiên.
  const [share, setShare] = useState(true);
  const view = share && viewing && (viewing.file || viewing.node) ? viewing : undefined;
  const viewRef = useRef<ChatViewingDto | undefined>(undefined);
  viewRef.current = share ? viewing : viewing?.selection ? { tab: viewing.tab, selection: viewing.selection } : undefined;
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busySince = useRef(Date.now());
  const q = useQuery({ queryKey: ["chat", mrId], queryFn: () => getChat(mrId), refetchInterval: busy ? 1200 : false });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["chat", mrId] }); void qc.invalidateQueries({ queryKey: ["runs"] }); void qc.invalidateQueries({ queryKey: ["run"] }); };
  // Câu hỏi do nơi khác trên trang đẩy vào (vd bấm thêm view): báo lại thành/bại để nơi đó không chờ mãi.
  const askId = useRef<number | null>(null);
  const reportAsk = (failed: boolean, reply: string) => { const id = askId.current; askId.current = null; if (id != null) onAskSettled?.({ id, failed, reply }); };
  const send = useMutation({
    mutationFn: (a: { t: string; imgs: ChatImageDto[]; refs: ChatRefDto[] }) => sendChat(mrId, a.t, a.imgs, viewRef.current, a.refs),
    onMutate: (a) => { busySince.current = Date.now(); baseline.current = q.data?.messages.length ?? 0; setBusy(true); setPending(a.imgs.length ? `${a.t}\n📎 ${a.imgs.length} ảnh đính kèm` : a.t); },
    onSuccess: (d) => reportAsk(d.failed === true, d.reply),
    onError: (e) => reportAsk(true, e instanceof Error ? e.message : "Lỗi không rõ"),
    onSettled: () => { setBusy(false); setPending(null); refresh(); },
  });
  const msgs = q.data?.messages ?? [];
  const actions = q.data?.actions ?? [];
  const proposed = (q.data?.lessons ?? []).filter((l) => l.status === "proposed").length;
  const waiting = actions.length + proposed;
  useEffect(() => { if (waiting > 0 && mode === "closed") setMode("min"); }, [waiting]); // eslint-disable-line react-hooks/exhaustive-deps
  // Mục chọn bằng @ và / (file, lệnh/skill/agent của repo); chỉ gửi những mục mà token còn nằm trong văn bản.
  const refsRef = useRef<{ token: string; ref: ChatRefDto }[]>([]);
  const repoCommands = useMemo(() => repoCommandsFrom(harnessItems), [harnessItems]);
  const submit = (t: string, imgs: ChatImageDto[] = []) => {
    if (send.isPending || (!t.trim() && !imgs.length)) return;
    setNotice(null);
    const refs = refsRef.current.filter((r) => t.includes(r.token)).map((r) => r.ref);
    refsRef.current = [];
    send.mutate({ t: t.trim(), imgs, refs });
  };
  const extraCmds: AsdlcCommand[] = view?.file ? [{ id: "file", label: "file-này", desc: "Giải thích file đang xem", insert: "Giải thích file đang xem" }] : [];

  const lastIncoming = useRef(0);
  useEffect(() => {
    if (!incoming || incoming.id === lastIncoming.current) return;
    lastIncoming.current = incoming.id;
    askId.current = incoming.id;
    if (mode === "closed") setMode("open");
    submit(incoming.text);
  }, [incoming]); // eslint-disable-line react-hooks/exhaustive-deps

  if (mode === "closed") {
    return (
      <button type="button" aria-label="Mở trợ lý AI" onClick={() => setMode("open")} className="fixed bottom-5 right-5 z-50 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105">
        <Sparkles className="size-6" />
        {waiting > 0 && <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-destructive text-[11px] font-medium text-white">{waiting}</span>}
      </button>
    );
  }

  const header = (
    <div className="flex items-center gap-2 border-b px-3 py-2.5">
      <Sparkles className="size-4 text-primary" aria-hidden="true" />
      <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setMode(mode === "min" ? "open" : "min")}>
        <span className="truncate text-sm font-medium">Trợ lý review</span>
        {active && <Badge variant={connected ? "success" : "secondary"}>{connected ? "đang review" : "kết nối…"}</Badge>}
        {mode === "min" && waiting > 0 && <Badge variant="warning">{waiting} chờ duyệt</Badge>}
        {mode === "min" && busy && <Shimmer duration={1}>đang làm…</Shimmer>}
      </button>
      {!dock && <Button size="icon-sm" variant="ghost" aria-label={mode === "min" ? "Mở rộng" : "Thu gọn"} onClick={() => setMode(mode === "min" ? "open" : "min")}>{mode === "min" ? <MessageSquare /> : <Minus />}</Button>}
      {!dock && <Button size="icon-sm" variant="ghost" aria-label="Đóng" onClick={() => setMode("closed")}><X /></Button>}
    </div>
  );

  if (mode === "min") return <div className="fixed bottom-5 right-5 z-50 w-[min(420px,calc(100vw-2.5rem))] overflow-hidden rounded-xl border bg-card shadow-xl">{header}</div>;

  const liveSteps = busy ? (q.data?.live ?? []) : [];
  return (
    <div className={dock ? "flex h-full min-h-0 flex-col bg-card" : "fixed bottom-5 right-5 z-50 flex h-[min(680px,calc(100vh-6rem))] w-[min(440px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-xl border bg-card shadow-xl"} role={dock ? "region" : "dialog"} aria-label="Trợ lý review">
      {header}
      {proposed > 0 && (
        <div className="border-b bg-warning-bg px-3 py-2 text-[13px] text-warning-fg">AI đề xuất {proposed} mục cho bộ nhớ repo — duyệt ở <Link className="font-medium underline" to="/repos">Repository → Bộ nhớ</Link>.</div>
      )}
      <Conversation className="relative min-h-0 flex-1" aria-label="Hội thoại">
        <ConversationContent>
          {msgs.length === 0 && !pending && <ConversationEmptyState title="Hỏi, nhờ hoặc dạy agent" description="Agent đọc được kết quả review, diff, code repo, framework và harness. Nó soạn comment / đề xuất chạy lại để bạn duyệt. Dán ảnh hoặc đính kèm file log/diff." />}
          {msgs.map((m) => m.role === "system"
            ? <p key={m.id} className="text-center text-xs text-muted-foreground">{m.text}</p>
            : (
              <Message key={m.id} from={m.role === "user" ? "user" : "assistant"}>
                <MessageContent>
                  {m.role === "agent" && m.steps && <Steps steps={m.steps} />}
                  {m.role === "user" ? <span className="whitespace-pre-wrap">{m.text}</span> : <MessageResponse>{m.text}</MessageResponse>}
                </MessageContent>
              </Message>
            ))}
          {pending && msgs.length <= baseline.current && <Message from="user"><MessageContent><span className="whitespace-pre-wrap">{pending}</span></MessageContent></Message>}
          {busy && <Message from="assistant"><MessageContent><Steps steps={liveSteps} live sinceMs={busySince.current} /></MessageContent></Message>}
          {actions.map((a) => <ActionCard key={a.id} a={a} onDone={refresh} />)}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      {send.error && <div className="px-3"><ErrorBox error={send.error} /></div>}
      {notice && <p role="alert" className="px-3 text-[13px] text-danger-fg">{notice}</p>}
      <div className="flex flex-col gap-1.5 border-t px-3 py-2">
        <PromptInputProvider>
          {viewing?.selection && (
            <div className="flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-xs" title={`${viewing.selection.file}\n${viewing.selection.lineStart}:${viewing.selection.colStart} – ${viewing.selection.lineEnd}:${viewing.selection.colEnd}\n\n${viewing.selection.text.slice(0, 400)}`}>
              <FileText className="size-3.5 flex-none text-muted-foreground" aria-hidden="true" />
              <span className="font-medium">{viewing.selection.lineEnd - viewing.selection.lineStart + 1} dòng đã chọn</span>
              <span className="min-w-0 truncate font-mono text-[11.5px] text-muted-foreground" dir="rtl"><bdi>{viewing.selection.file}:{viewing.selection.lineStart}{viewing.selection.lineEnd !== viewing.selection.lineStart ? `-${viewing.selection.lineEnd}` : ""}</bdi></span>
              <button type="button" aria-label="Bỏ đoạn đã chọn" className="ml-auto flex-none rounded p-0.5 hover:bg-muted" onClick={() => onClearSelection?.()}><X className="size-3.5" /></button>
            </div>
          )}
          {view && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Agent biết bạn đang xem mục này nên hiểu “file này”, “chỗ này”. Bấm × để không chia sẻ.">
              <Eye className="size-3.5 flex-none" aria-hidden="true" /><span className="flex-none">Đang xem:</span>
              <span className="min-w-0 truncate font-mono text-[11.5px] text-foreground" dir="rtl"><bdi>{view.file ?? view.node}</bdi></span>
              <button type="button" aria-label="Không chia sẻ mục đang xem với agent" className="ml-auto flex-none rounded p-0.5 hover:bg-muted" onClick={() => setShare(false)}><X className="size-3.5" /></button>
            </div>
          )}
          {!share && viewing && (viewing.file || viewing.node) && <button type="button" className="w-fit text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => setShare(true)}>Chia sẻ mục đang xem với agent</button>}
          <QuickPrompts disabled={send.isPending} onSend={(t) => submit(t)} file={view?.file} />
          <Completer files={files} repoName={repoName} repoCommands={repoCommands} extra={extraCmds} refsRef={refsRef}>
          <PromptInput
            accept="image/png,image/jpeg,image/gif,image/webp,text/*,application/json,.md,.log,.diff,.patch,.yml,.yaml,.ts,.tsx,.py,.go" multiple maxFiles={5} maxFileSize={3_500_000}
            onError={(e) => setNotice(e.code === "max_file_size" ? "Tệp quá lớn (tối đa ~3.5MB)." : e.code === "max_files" ? "Tối đa 5 tệp." : "Chỉ nhận ảnh hoặc tệp văn bản/code.")}
            onSubmit={async (m) => {
              const imgs: ChatImageDto[] = [];
              let text = m.text;
              for (const f of m.files) {
                const r = /^data:(image\/[a-z]+);base64,(.+)$/.exec(f.url);
                if (r) imgs.push({ mediaType: r[1] as ChatImageDto["mediaType"], data: r[2]! });
                else if (TEXT_EXT.test(f.filename ?? "") || f.mediaType?.startsWith("text/")) {
                  try { const body = (await readAttachmentText(f.url)).slice(0, MAX_TEXT); text += `\n\n[Tệp đính kèm: ${f.filename}]\n\`\`\`\n${body}\n\`\`\``; } catch { setNotice(`Không đọc được ${f.filename}`); }
                }
              }
              submit(text, imgs);
            }}
          >
            <PromptInputHeader className="empty:hidden"><Attachments /></PromptInputHeader>
            <PromptInputBody><PromptInputTextarea rows={1} className="min-h-10 max-h-40 py-2.5 pr-12 text-sm" placeholder="Hỏi hoặc nhờ agent…" title="Dán ảnh bằng Cmd/Ctrl+V" /></PromptInputBody>
            <PromptInputFooter className="absolute bottom-1 right-1 w-auto p-0">
              <PromptInputSubmit className="size-8" status={send.isPending ? "submitted" : undefined} />
            </PromptInputFooter>
          </PromptInput>
          </Completer>
        </PromptInputProvider>
      </div>
    </div>
  );
}
