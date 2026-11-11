import type { ChatImageDto, ChatMessageDto, LessonDto, RunActivityEntry } from "@mrd/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, BookOpen, Check, Send, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ErrorBox } from "../../kernel/page.js";
import { approveLesson, deleteLesson, getChat, rejectLesson, sendChat } from "./api.js";
import { ActivityLog } from "./live-log.js";

const SUGGEST = ["Giải thích finding nghiêm trọng nhất", "Finding nào có thể là báo nhầm?", "nhớ: ", "review lại"];

function Bubble({ m }: { m: ChatMessageDto }) {
  const me = m.role === "user";
  return (
    <div className={cn("flex gap-2", me && "justify-end")}>
      {!me && <span className="mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Bot className="size-3.5" aria-hidden="true" /></span>}
      <div className={cn("max-w-[78ch] whitespace-pre-wrap break-words rounded-xl px-3.5 py-2 text-sm", me ? "bg-primary text-primary-foreground" : "border bg-muted/40")}>{m.text}</div>
    </div>
  );
}

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

/** Màn review dạng chat: tiến trình trực tiếp, hỏi đáp về kết quả, dạy agent (sổ tay bài học của repo). */
export function AgentChat({ mrId, live, active, connected }: { mrId: string; live: RunActivityEntry[]; active: boolean; connected: boolean }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [images, setImages] = useState<ChatImageDto[]>([]);
  const [imgError, setImgError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const q = useQuery({ queryKey: ["chat", mrId], queryFn: () => getChat(mrId) });
  const send = useMutation({
    mutationFn: (a: { t: string; imgs: ChatImageDto[] }) => sendChat(mrId, a.t, a.imgs),
    onMutate: (a) => setPending(a.imgs.length ? `${a.t}\n📎 ${a.imgs.length} ảnh đính kèm` : a.t),
    onSettled: () => { setPending(null); void qc.invalidateQueries({ queryKey: ["chat", mrId] }); void qc.invalidateQueries({ queryKey: ["runs"] }); },
  });
  const msgs = q.data?.messages ?? [];
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [msgs.length, pending, send.isPending]);
  const submit = (t: string) => { const v = t.trim(); if ((!v && !images.length) || send.isPending) return; setText(""); const imgs = images; setImages([]); send.mutate({ t: v, imgs }); };
  const onPaste = (e: React.ClipboardEvent) => {
    const files = [...e.clipboardData.items].filter((i) => i.kind === "file" && /^image\/(png|jpeg|gif|webp)$/.test(i.type)).map((i) => i.getAsFile()).filter((f): f is File => !!f);
    if (!files.length) return;
    e.preventDefault();
    setImgError(null);
    for (const f of files) {
      if (f.size > 3_500_000) { setImgError("Ảnh quá lớn (tối đa ~3.5MB)."); continue; }
      const rd = new FileReader();
      rd.onload = () => { const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(String(rd.result)); if (m) setImages((l) => (l.length >= 4 ? l : [...l, { mediaType: m[1] as ChatImageDto["mediaType"], data: m[2]! }])); };
      rd.readAsDataURL(f);
    }
  };
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle>Trò chuyện với agent</CardTitle>
        {active && <Badge variant={connected ? "success" : "secondary"}>{connected ? "● Đang review" : "Đang kết nối…"}</Badge>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {active && <ActivityLog entries={live} live />}
        <div role="log" aria-label="Hội thoại" className="flex max-h-[26rem] min-h-24 flex-col gap-2.5 overflow-y-auto">
          {msgs.length === 0 && !pending && <p className="text-sm text-muted-foreground">Hỏi agent về kết quả review này, hoặc dạy nó cách review repo này. Ví dụ: “vì sao finding đầu là blocker?”, “nhớ: đừng báo console.log trong scripts/”.</p>}
          {msgs.map((m) => <Bubble key={m.id} m={m} />)}
          {pending && <Bubble m={{ id: "p", role: "user", text: pending, createdAt: "" }} />}
          {send.isPending && <p className="text-[13px] text-muted-foreground" aria-live="polite">Agent đang trả lời…</p>}
          <div ref={end} />
        </div>
        {send.error && <ErrorBox error={send.error} />}
        <div className="flex flex-wrap gap-1.5">
          {SUGGEST.map((s) => <Button key={s} size="sm" variant="outline" disabled={send.isPending} onClick={() => (s.endsWith(": ") ? setText(s) : submit(s))}>{s}</Button>)}
        </div>
        {(images.length > 0 || imgError) && (
          <div className="flex flex-wrap items-center gap-2">
            {images.map((im, i) => (
              <span key={i} className="relative">
                <img src={`data:${im.mediaType};base64,${im.data}`} alt={`Ảnh đính kèm ${i + 1}`} className="size-16 rounded-md border object-cover" />
                <button type="button" aria-label={`Bỏ ảnh ${i + 1}`} className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border bg-background" onClick={() => setImages((l) => l.filter((_, j) => j !== i))}><X className="size-3" /></button>
              </span>
            ))}
            {imgError && <span role="alert" className="text-[13px] text-danger-fg">{imgError}</span>}
          </div>
        )}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); submit(text); }}>
          <label className="sr-only" htmlFor="agent-chat-input">Tin nhắn cho agent</label>
          <input id="agent-chat-input" value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} onPaste={onPaste} placeholder="Hỏi hoặc dạy agent… (dán ảnh bằng Cmd/Ctrl+V)" className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm" />
          <Button type="submit" disabled={send.isPending || (!text.trim() && !images.length)}><Send />Gửi</Button>
        </form>
        <div className="border-t pt-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium"><BookOpen className="size-4" aria-hidden="true" />Sổ tay của repo</div>
          <Lessons lessons={q.data?.lessons ?? []} onChange={() => void qc.invalidateQueries({ queryKey: ["chat", mrId] })} />
        </div>
      </CardContent>
    </Card>
  );
}
