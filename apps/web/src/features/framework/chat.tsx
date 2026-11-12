import type { ActionDto, ChatStepDto } from "@mrd/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, MessageSquare, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputBody, PromptInputFooter, PromptInputSubmit, PromptInputTextarea, PromptInputTools, PromptInputProvider, usePromptInputController } from "@/components/ai-elements/prompt-input";
import { Confirmation, ConfirmationAccepted, ConfirmationAction, ConfirmationActions, ConfirmationRequest, ConfirmationTitle } from "@/components/ai-elements/confirmation";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { ErrorBox } from "../../kernel/page.js";
import { approveFrameworkEdit, dismissFrameworkEdit, getFrameworkChat, sendFrameworkChat } from "./api.js";

const SUGGEST = [
  "Rule nào đang ồn hoặc hay bị báo nhầm?",
  "Rà soát độ rõ của các câu kiểm tra (check)",
  "Rule nào còn thiếu so với bài học của team?",
  "Viết thêm rule cho: ",
  "Nên chỉnh trọng số các hạng mục thế nào?",
];
const TOOL_LABEL: Record<string, string> = { get_framework: "Xem framework", get_rule_stats: "Xem thống kê rule", get_usage: "Xem repo & bài học", preview_changes: "Kiểm tra thay đổi", propose_edit: "Đề xuất sửa framework" };

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

/** Đề xuất sửa framework: hiện diff, người dùng bấm Áp dụng thì server mới lưu (tạo bản chỉnh sửa nếu đang chỉ đọc). */
function EditCard({ a, onDone, onApplied }: { a: ActionDto; onDone: () => void; onApplied: (frameworkId: string) => void }) {
  const ok = useMutation({ mutationFn: () => approveFrameworkEdit(a.id), onSuccess: (r) => onApplied(r.frameworkId), onSettled: onDone });
  const no = useMutation({ mutationFn: () => dismissFrameworkEdit(a.id), onSettled: onDone });
  const busy = ok.isPending || no.isPending;
  const changes = a.payload.changes ?? [];
  return (
    <Confirmation state={ok.isSuccess ? "approval-responded" : "approval-requested"} approval={ok.isSuccess ? { id: a.id, approved: true } : { id: a.id }} className="my-2">
      <ConfirmationTitle>
        <div className="flex flex-col gap-1.5 text-[13px]">
          <span className="font-medium">Đề xuất sửa framework ({changes.length} thay đổi)</span>
          {a.payload.reason && <span className="text-muted-foreground">{a.payload.reason}</span>}
          {a.payload.forkName && <span className="rounded-md bg-muted/50 p-2">Framework này chỉ đọc: áp dụng sẽ tạo bản chỉnh sửa mới “{a.payload.forkName}”.</span>}
          <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md bg-muted/50 p-2 font-mono text-xs">
            {changes.map((c, i) => (
              <li key={i} className="break-words [overflow-wrap:anywhere]"><span className="font-semibold">{c.path}</span>{c.from !== null && <> <span className="text-danger-fg line-through">{c.from}</span></>}{c.to !== null && <> → <span className="text-success-fg">{c.to}</span></>}</li>
            ))}
          </ul>
        </div>
      </ConfirmationTitle>
      <ConfirmationRequest>
        <ConfirmationActions>
          <ConfirmationAction variant="outline" disabled={busy} onClick={() => no.mutate()}>Bỏ</ConfirmationAction>
          <ConfirmationAction disabled={busy} onClick={() => ok.mutate()}>{ok.isPending ? "Đang áp dụng…" : "Áp dụng"}</ConfirmationAction>
        </ConfirmationActions>
      </ConfirmationRequest>
      <ConfirmationAccepted><span className="text-[13px]">Đã áp dụng.</span></ConfirmationAccepted>
      {(ok.error || no.error) && <p role="alert" className="text-[13px] text-danger-fg">{String(((ok.error ?? no.error) as Error).message)}</p>}
    </Confirmation>
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
const loadMode = (): Mode => { try { const v = localStorage.getItem("mrd.fwchat.mode"); return v === "closed" || v === "min" ? v : "open"; } catch { return "open"; } };

/**
 * Trợ lý cải thiện/xây framework (chat nổi). Agent đọc framework, thống kê rule thực tế (số finding, bị báo nhầm),
 * bài học của team, thử thay đổi và ĐỀ XUẤT sửa; chỉ khi bạn bấm Áp dụng mới lưu thành phiên bản mới.
 */
export function FrameworkChat({ frameworkId, name, onApplied }: { frameworkId: string; name: string; onApplied: (frameworkId: string) => void }) {
  const qc = useQueryClient();
  const [mode, setModeState] = useState<Mode>(loadMode);
  const setMode = (m: Mode) => { setModeState(m); try { localStorage.setItem("mrd.fwchat.mode", m); } catch { /* không lưu được thì thôi */ } };
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ["fw-chat", frameworkId], queryFn: () => getFrameworkChat(frameworkId), refetchInterval: busy ? 1200 : false });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["fw-chat", frameworkId] }); };
  const send = useMutation({
    mutationFn: (t: string) => sendFrameworkChat(frameworkId, t),
    onMutate: (t) => { setBusy(true); setPending(t); },
    onSettled: () => { setBusy(false); setPending(null); refresh(); },
  });
  const msgs = q.data?.messages ?? [];
  const actions = q.data?.actions ?? [];
  const submit = (t: string) => { if (!send.isPending && t.trim()) send.mutate(t.trim()); };

  if (mode === "closed") {
    return (
      <button type="button" aria-label="Mở trợ lý framework" onClick={() => setMode("open")} className="fixed bottom-5 right-5 z-50 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105">
        <Sparkles className="size-6" />
        {actions.length > 0 && <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-destructive text-[11px] font-medium text-white">{actions.length}</span>}
      </button>
    );
  }
  const header = (
    <div className="flex items-center gap-2 border-b px-3 py-2.5">
      <Sparkles className="size-4 text-primary" aria-hidden="true" />
      <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setMode(mode === "min" ? "open" : "min")}>
        <span className="truncate text-sm font-medium">Trợ lý framework</span>
        <span className="truncate text-xs text-muted-foreground">{name}</span>
        {mode === "min" && actions.length > 0 && <Badge variant="warning">{actions.length} chờ duyệt</Badge>}
        {mode === "min" && busy && <Shimmer duration={1}>đang làm…</Shimmer>}
      </button>
      <Button size="icon-sm" variant="ghost" aria-label={mode === "min" ? "Mở rộng" : "Thu gọn"} onClick={() => setMode(mode === "min" ? "open" : "min")}>{mode === "min" ? <MessageSquare /> : <Minus />}</Button>
      <Button size="icon-sm" variant="ghost" aria-label="Đóng" onClick={() => setMode("closed")}><X /></Button>
    </div>
  );
  if (mode === "min") return <div className="fixed bottom-5 right-5 z-50 w-[min(420px,calc(100vw-2.5rem))] overflow-hidden rounded-xl border bg-card shadow-xl">{header}</div>;

  const liveSteps = busy ? (q.data?.live ?? []) : [];
  return (
    <div className="fixed bottom-5 right-5 z-50 flex h-[min(680px,calc(100vh-6rem))] w-[min(440px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-xl border bg-card shadow-xl" role="dialog" aria-label="Trợ lý framework">
      {header}
      <Conversation className="relative min-h-0 flex-1" aria-label="Hội thoại">
        <ConversationContent>
          {msgs.length === 0 && !pending && <ConversationEmptyState title="Cải thiện & xây framework cùng AI" description="Agent đọc rule, trọng số, thống kê finding/báo nhầm từ các review thật và bài học của team, rồi đề xuất thay đổi. Mọi sửa đổi chỉ lưu khi bạn bấm Áp dụng; rule bảo mật bị khoá vẫn được giữ." />}
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
          {busy && <Message from="assistant"><MessageContent><Steps steps={liveSteps} live /><Shimmer duration={1.2}>Agent đang phân tích…</Shimmer></MessageContent></Message>}
          {actions.filter((a) => a.kind === "framework_edit").map((a) => <EditCard key={a.id} a={a} onDone={refresh} onApplied={(id) => { onApplied(id); }} />)}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      {send.error && <div className="px-3"><ErrorBox error={send.error} /></div>}
      <div className="flex flex-col gap-2 border-t p-3">
        <PromptInputProvider>
          <QuickPrompts disabled={send.isPending} onSend={submit} />
          <PromptInput onSubmit={(m) => submit(m.text)}>
            <PromptInputBody><PromptInputTextarea placeholder="Hỏi hoặc nhờ cải thiện rule, trọng số, gate…" /></PromptInputBody>
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
