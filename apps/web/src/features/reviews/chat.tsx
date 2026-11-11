import type { ChatImageDto, ChatMessageDto, LessonDto, RunActivityEntry } from "@mrd/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Check, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputBody, PromptInputFooter, PromptInputHeader, PromptInputSubmit, PromptInputTextarea, PromptInputTools, usePromptInputAttachments, usePromptInputController, PromptInputProvider } from "@/components/ai-elements/prompt-input";
import { ErrorBox } from "../../kernel/page.js";
import { approveLesson, deleteLesson, getChat, rejectLesson, sendChat } from "./api.js";
import { ActivityLog } from "./live-log.js";

const SUGGEST = ["Giải thích finding nghiêm trọng nhất", "Finding nào có thể là báo nhầm?", "nhớ: ", "review lại"];

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

function Attachments() {
  const att = usePromptInputAttachments();
  if (!att.files.length) return null;
  return (
    <div className="flex flex-wrap gap-2 px-3 pt-3">
      {att.files.map((f) => (
        <span key={f.id} className="relative">
          <img src={f.url} alt={f.filename ?? "Ảnh đính kèm"} className="size-16 rounded-md border object-cover" />
          <button type="button" aria-label="Bỏ ảnh" className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border bg-background" onClick={() => att.remove(f.id)}><X className="size-3" /></button>
        </span>
      ))}
    </div>
  );
}

function Suggestions({ disabled, onSend }: { disabled: boolean; onSend: (t: string) => void }) {
  const ctl = usePromptInputController();
  return (
    <div className="flex flex-wrap gap-1.5">
      {SUGGEST.map((s) => <Button key={s} type="button" size="sm" variant="outline" disabled={disabled} onClick={() => (s.endsWith(": ") ? ctl.textInput.setInput(s) : onSend(s))}>{s}</Button>)}
    </div>
  );
}

/** Màn review dạng chat (AI Elements): tiến trình trực tiếp, hỏi đáp, dán ảnh, dạy agent qua sổ tay bài học của repo. */
export function AgentChat({ mrId, live, active, connected }: { mrId: string; live: RunActivityEntry[]; active: boolean; connected: boolean }) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["chat", mrId], queryFn: () => getChat(mrId) });
  const send = useMutation({
    mutationFn: (a: { t: string; imgs: ChatImageDto[] }) => sendChat(mrId, a.t, a.imgs),
    onMutate: (a) => setPending(a.imgs.length ? `${a.t}\n📎 ${a.imgs.length} ảnh đính kèm` : a.t),
    onSettled: () => { setPending(null); void qc.invalidateQueries({ queryKey: ["chat", mrId] }); void qc.invalidateQueries({ queryKey: ["runs"] }); },
  });
  const msgs = q.data?.messages ?? [];
  const submit = (t: string, imgs: ChatImageDto[] = []) => { if (send.isPending || (!t.trim() && !imgs.length)) return; setNotice(null); send.mutate({ t: t.trim(), imgs }); };
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle>Trò chuyện với agent</CardTitle>
        {active && <Badge variant={connected ? "success" : "secondary"}>{connected ? "● Đang review" : "Đang kết nối…"}</Badge>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {active && <ActivityLog entries={live} live />}
        <Conversation className="relative h-[26rem] flex-none rounded-lg border" aria-label="Hội thoại">
          <ConversationContent>
            {msgs.length === 0 && !pending && <ConversationEmptyState title="Hỏi hoặc dạy agent" description="Hỏi về kết quả review này, hoặc dạy cách review repo này: “nhớ: đừng báo console.log trong scripts/”. Dán ảnh bằng Cmd/Ctrl+V." />}
            {msgs.map((m) => (
              <Message key={m.id} from={m.role === "user" ? "user" : "assistant"}>
                <MessageContent>{m.role === "user" ? <span className="whitespace-pre-wrap">{m.text}</span> : <MessageResponse>{m.text}</MessageResponse>}</MessageContent>
              </Message>
            ))}
            {pending && <Message from="user"><MessageContent><span className="whitespace-pre-wrap">{pending}</span></MessageContent></Message>}
            {send.isPending && <p className="text-[13px] text-muted-foreground" aria-live="polite">Agent đang trả lời…</p>}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
        {send.error && <ErrorBox error={send.error} />}
        {notice && <p role="alert" className="text-[13px] text-danger-fg">{notice}</p>}
        <PromptInputProvider>
          <Suggestions disabled={send.isPending} onSend={(t) => submit(t)} />
          <PromptInput
            accept="image/png,image/jpeg,image/gif,image/webp" multiple maxFiles={4} maxFileSize={3_500_000}
            onError={(e) => setNotice(e.code === "max_file_size" ? "Ảnh quá lớn (tối đa ~3.5MB)." : e.code === "max_files" ? "Tối đa 4 ảnh." : "Chỉ nhận ảnh png/jpg/gif/webp.")}
            onSubmit={(m) => submit(m.text, m.files.flatMap((f) => { const r = /^data:(image\/[a-z]+);base64,(.+)$/.exec(f.url); return r ? [{ mediaType: r[1] as ChatImageDto["mediaType"], data: r[2]! }] : []; }))}
          >
            <PromptInputHeader><Attachments /></PromptInputHeader>
            <PromptInputBody><PromptInputTextarea placeholder="Hỏi hoặc dạy agent… (dán ảnh bằng Cmd/Ctrl+V)" /></PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools />
              <PromptInputSubmit status={send.isPending ? "submitted" : undefined} />
            </PromptInputFooter>
          </PromptInput>
        </PromptInputProvider>
        <div className="border-t pt-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium"><BookOpen className="size-4" aria-hidden="true" />Sổ tay của repo</div>
          <Lessons lessons={q.data?.lessons ?? []} onChange={() => void qc.invalidateQueries({ queryKey: ["chat", mrId] })} />
        </div>
      </CardContent>
    </Card>
  );
}
