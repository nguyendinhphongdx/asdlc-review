import type { ActionDto, ChatImageDto, ChatStepDto, LessonDto, RunActivityEntry } from "@mrd/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Check, FileText, Minus, MessageSquare, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputBody, PromptInputFooter, PromptInputHeader, PromptInputSubmit, PromptInputTextarea, PromptInputTools, usePromptInputAttachments, usePromptInputController, PromptInputProvider } from "@/components/ai-elements/prompt-input";
import { ErrorBox } from "../../kernel/page.js";
import { Confirmation, ConfirmationAccepted, ConfirmationAction, ConfirmationActions, ConfirmationRequest, ConfirmationTitle } from "@/components/ai-elements/confirmation";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { readAttachmentText, approveAction, approveLesson, deleteLesson, dismissAction, getChat, rejectLesson, sendChat } from "./api.js";
import { ActivityLog } from "./live-log.js";

const SUGGEST = ["Giải thích finding nghiêm trọng nhất", "Finding nào có thể là báo nhầm?", "Đọc code liên quan và kiểm tra lại", "Soạn comment cho finding quan trọng nhất", "nhớ: ", "review lại"];
const TOOL_LABEL: Record<string, string> = { Read: "Đọc file", Grep: "Tìm trong code", Glob: "Liệt kê file", get_review: "Xem kết quả review", get_diff: "Xem diff MR", get_framework: "Xem framework", get_harness: "Xem harness", propose_comment: "Soạn comment", propose_rerun: "Đề xuất chạy lại" };
const TEXT_EXT = /\.(txt|md|log|json|diff|patch|ya?ml|toml|csv|tsx?|jsx?|py|go|rs|java|kt|rb|php|sh|sql|html|css|xml)$/i;
const MAX_TEXT = 24_000;

function Lessons({ lessons, onChange }: { lessons: LessonDto[]; onChange: () => void }) {
  const act = useMutation({ mutationFn: async (a: { id: string; op: "ok" | "no" | "del" }) => { if (a.op === "ok") await approveLesson(a.id); else if (a.op === "no") await rejectLesson(a.id); else await deleteLesson(a.id); }, onSuccess: onChange });
  const proposed = lessons.filter((l) => l.status === "proposed");
  const active = lessons.filter((l) => l.status === "active");
  if (!lessons.length) return <p className="text-[13px] text-muted-foreground">Chưa có bài học nào. Gõ <span className="font-mono">nhớ: …</span> hoặc sửa lại agent khi nó sai để nó học.</p>;
  return (
    <div className="flex flex-col gap-3">
      {proposed.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[13px] font-medium">Đề xuất, chờ bạn duyệt</div>
          {proposed.map((l) => (
            <div key={l.id} className="flex items-start gap-2 rounded-lg border border-warning bg-warning-bg px-3 py-2 text-[13px] text-warning-fg">
              <span className="min-w-0 flex-1">{l.text}</span>
              <Button size="sm" variant="outline" aria-label="Duyệt bài học" onClick={() => act.mutate({ id: l.id, op: "ok" })}><Check />Duyệt</Button>
              <Button size="sm" variant="outline" aria-label="Bỏ bài học" onClick={() => act.mutate({ id: l.id, op: "no" })}><X />Bỏ</Button>
            </div>
          ))}
        </div>
      )}
      {active.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {active.map((l) => (
            <li key={l.id} className="flex items-start gap-2 text-[13px]">
              <Badge variant="success">đang áp dụng</Badge>
              <span className="min-w-0 flex-1">{l.text}</span>
              <button type="button" aria-label="Xoá bài học" className="text-muted-foreground hover:text-danger-fg" onClick={() => act.mutate({ id: l.id, op: "del" })}><Trash2 className="size-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Steps({ steps, live }: { steps: ChatStepDto[]; live?: boolean }) {
  if (!steps.length) return null;
  return (
    <div className="flex w-full flex-col gap-1">
      {steps.map((st, i) => st.kind === "thinking"
        ? (
          <Reasoning key={i} isStreaming={Boolean(live) && i === steps.length - 1} defaultOpen={false}>
            <ReasoningTrigger getThinkingMessage={(streaming) => (streaming ? <Shimmer duration={1}>Đang suy luận…</Shimmer> : <span>Đã suy luận</span>)} />
            <ReasoningContent>{st.text}</ReasoningContent>
          </Reasoning>
        )
        : (
          <Tool key={st.id} className="mb-1">
            <ToolHeader type={`tool-${st.name}`} title={TOOL_LABEL[st.name] ?? st.name} state={st.error ? "output-error" : st.output !== undefined ? "output-available" : "input-available"} />
            <ToolContent>
              <ToolInput input={st.input} />
              <ToolOutput output={st.output && !st.error ? st.output.slice(0, 1500) : undefined} errorText={st.error ? st.output : undefined} />
            </ToolContent>
          </Tool>
        ))}
    </div>
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

function QuickPrompts({ disabled, onSend }: { disabled: boolean; onSend: (t: string) => void }) {
  const ctl = usePromptInputController();
  return (
    <Suggestions>
      {SUGGEST.map((s) => <Suggestion key={s} suggestion={s} disabled={disabled} onClick={(t) => (t.endsWith(": ") ? ctl.textInput.setInput(t) : onSend(t))} />)}
    </Suggestions>
  );
}

type Mode = "closed" | "open" | "min";
const loadMode = (): Mode => { try { const v = localStorage.getItem("mrd.chat.mode"); return v === "closed" || v === "min" ? v : "open"; } catch { return "open"; } };

/**
 * Trợ lý review dạng chat nổi (AI Elements): đóng/mở/thu gọn. Agent đọc kết quả review, diff, framework, harness và code repo
 * (Read/Grep/Glob), hiện suy luận và từng lệnh gọi tool; comment/chạy lại chỉ là đề xuất chờ bạn duyệt.
 */
export function AgentChat({ mrId, live, active, connected }: { mrId: string; live: RunActivityEntry[]; active: boolean; connected: boolean }) {
  const qc = useQueryClient();
  const [mode, setModeState] = useState<Mode>(loadMode);
  const setMode = (m: Mode) => { setModeState(m); try { localStorage.setItem("mrd.chat.mode", m); } catch { /* không lưu được thì thôi */ } };
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lessonsOpen, setLessonsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ["chat", mrId], queryFn: () => getChat(mrId), refetchInterval: busy ? 1200 : false });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["chat", mrId] }); void qc.invalidateQueries({ queryKey: ["runs"] }); };
  const send = useMutation({
    mutationFn: (a: { t: string; imgs: ChatImageDto[] }) => sendChat(mrId, a.t, a.imgs),
    onMutate: (a) => { setBusy(true); setPending(a.imgs.length ? `${a.t}\n📎 ${a.imgs.length} ảnh đính kèm` : a.t); },
    onSettled: () => { setBusy(false); setPending(null); refresh(); },
  });
  const msgs = q.data?.messages ?? [];
  const actions = q.data?.actions ?? [];
  const proposed = (q.data?.lessons ?? []).filter((l) => l.status === "proposed").length;
  const waiting = actions.length + proposed;
  useEffect(() => { if (waiting > 0 && mode === "closed") setMode("min"); }, [waiting]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = (t: string, imgs: ChatImageDto[] = []) => { if (send.isPending || (!t.trim() && !imgs.length)) return; setNotice(null); send.mutate({ t: t.trim(), imgs }); };

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
      <Button size="icon-sm" variant="ghost" aria-label="Sổ tay bài học" onClick={() => { setMode("open"); setLessonsOpen((v) => !v); }}><BookOpen /></Button>
      <Button size="icon-sm" variant="ghost" aria-label={mode === "min" ? "Mở rộng" : "Thu gọn"} onClick={() => setMode(mode === "min" ? "open" : "min")}>{mode === "min" ? <MessageSquare /> : <Minus />}</Button>
      <Button size="icon-sm" variant="ghost" aria-label="Đóng" onClick={() => setMode("closed")}><X /></Button>
    </div>
  );

  if (mode === "min") return <div className="fixed bottom-5 right-5 z-50 w-[min(420px,calc(100vw-2.5rem))] overflow-hidden rounded-xl border bg-card shadow-xl">{header}</div>;

  const liveSteps = busy ? (q.data?.live ?? []) : [];
  return (
    <div className="fixed bottom-5 right-5 z-50 flex h-[min(680px,calc(100vh-6rem))] w-[min(440px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-xl border bg-card shadow-xl" role="dialog" aria-label="Trợ lý review">
      {header}
      {lessonsOpen && (
        <div className="max-h-56 overflow-y-auto border-b bg-muted/30 p-3">
          <div className="mb-2 text-[13px] font-medium">Sổ tay của repo</div>
          <Lessons lessons={q.data?.lessons ?? []} onChange={refresh} />
        </div>
      )}
      {active && <div className="max-h-40 overflow-y-auto border-b p-2"><ActivityLog entries={live} live /></div>}
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
          {pending && <Message from="user"><MessageContent><span className="whitespace-pre-wrap">{pending}</span></MessageContent></Message>}
          {busy && <Message from="assistant"><MessageContent><Steps steps={liveSteps} live /><Shimmer duration={1.2}>Agent đang làm việc…</Shimmer></MessageContent></Message>}
          {actions.map((a) => <ActionCard key={a.id} a={a} onDone={refresh} />)}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      {send.error && <div className="px-3"><ErrorBox error={send.error} /></div>}
      {notice && <p role="alert" className="px-3 text-[13px] text-danger-fg">{notice}</p>}
      <div className="flex flex-col gap-2 border-t p-3">
        <PromptInputProvider>
          <QuickPrompts disabled={send.isPending} onSend={(t) => submit(t)} />
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
            <PromptInputHeader><Attachments /></PromptInputHeader>
            <PromptInputBody><PromptInputTextarea placeholder="Hỏi, nhờ đọc code, soạn comment… (dán ảnh bằng Cmd/Ctrl+V)" /></PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools />
              <PromptInputSubmit status={send.isPending ? "submitted" : undefined} />
            </PromptInputFooter>
          </PromptInput>
        </PromptInputProvider>
      </div>
    </div>
  );
}
