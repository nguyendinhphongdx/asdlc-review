import { Table } from "@tiptap/extension-table";
import { TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bold, Code, ExternalLink, Italic, List, ListOrdered, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Markdown } from "tiptap-markdown";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ErrorBox } from "../../kernel/page.js";
import { postRunComment, saveRunDraft } from "./api.js";

/**
 * Bản nháp comment tổng hợp để sửa trước khi đăng (Tiptap, lưu/đăng dưới dạng Markdown).
 * Hiện khi repo/framework không tự đăng, hoặc để cập nhật comment đã đăng.
 */
export function CommentEditor({ runId, draft, commentUrl }: { runId: string; draft: string; commentUrl: string | null }) {
  const qc = useQueryClient();
  const [md, setMd] = useState(draft);
  const saved = useRef(draft); // bản mới nhất mà server đang giữ (do ô này lưu hoặc do agent ghi)
  const seen = useRef(draft); // bản `draft` đã nạp từ server lần trước
  const mdRef = useRef(draft);
  mdRef.current = md;
  const editor = useEditor({
    extensions: [StarterKit, Table, TableRow, TableHeader, TableCell, Markdown.configure({ html: false, tightLists: true, linkify: true })],
    content: draft,
    editorProps: { attributes: { class: "prose-comment min-h-40 max-h-[28rem] overflow-y-auto px-3 py-2 text-sm leading-6 outline-none", "aria-label": "Nội dung comment" } },
    onUpdate: ({ editor: e }) => setMd((e.storage as unknown as { markdown: { getMarkdown: () => string } }).markdown.getMarkdown()),
  });
  // Server đổi bản nháp (agent chat soạn lại) → nạp vào ô soạn; bản do chính ô này vừa lưu thì bỏ qua để không nhảy con trỏ.
  useEffect(() => {
    if (!editor || draft === seen.current) return;
    seen.current = draft;
    if (draft.trim() === mdRef.current.trim()) { saved.current = draft; return; }
    saved.current = draft;
    editor.commands.setContent(draft);
    setMd(draft);
  }, [draft, editor]);
  // Tự lưu chỗ người dùng sửa để agent đọc/đăng đúng nội dung đang thấy.
  useEffect(() => {
    if (md.trim() === saved.current.trim()) return;
    const t = setTimeout(() => { const v = md; void saveRunDraft(runId, v).then(() => { saved.current = v; }).catch(() => undefined); }, 800);
    return () => clearTimeout(t);
  }, [md, runId]);
  const post = useMutation({ mutationFn: () => postRunComment(runId, md), onSuccess: () => void qc.invalidateQueries({ queryKey: ["run", runId] }) });
  const btn = (on: boolean, label: string, run: () => void, icon: React.ReactNode) => (
    <button type="button" aria-label={label} title={label} aria-pressed={on} onClick={run} className={cn("grid size-7 place-items-center rounded hover:bg-muted", on && "bg-muted text-foreground")}>{icon}</button>
  );
  return (
    <div className="mt-3 rounded-lg border bg-card">
      <div className="flex items-center gap-1 border-b px-2 py-1 text-muted-foreground">
        {btn(!!editor?.isActive("bold"), "Đậm", () => editor?.chain().focus().toggleBold().run(), <Bold className="size-3.5" />)}
        {btn(!!editor?.isActive("italic"), "Nghiêng", () => editor?.chain().focus().toggleItalic().run(), <Italic className="size-3.5" />)}
        {btn(!!editor?.isActive("code"), "Mã", () => editor?.chain().focus().toggleCode().run(), <Code className="size-3.5" />)}
        {btn(!!editor?.isActive("bulletList"), "Danh sách", () => editor?.chain().focus().toggleBulletList().run(), <List className="size-3.5" />)}
        {btn(!!editor?.isActive("orderedList"), "Danh sách số", () => editor?.chain().focus().toggleOrderedList().run(), <ListOrdered className="size-3.5" />)}
        <span className="ml-auto text-xs">Bản nháp comment tổng hợp · tự lưu</span>
      </div>
      <EditorContent editor={editor} />
      <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
        <Button size="sm" disabled={post.isPending || md.trim().length < 5} onClick={() => post.mutate()}>
          <Send />{post.isPending ? "Đang đăng…" : commentUrl ? "Cập nhật comment" : "Đăng comment"}
        </Button>
        {(post.data?.url ?? commentUrl) && <a className="inline-flex items-center gap-1 text-xs text-primary hover:underline" href={post.data?.url ?? commentUrl ?? "#"} target="_blank" rel="noreferrer">Xem trên nền tảng <ExternalLink className="size-3" /></a>}
        {post.isSuccess && <span className="text-xs text-success-fg">Đã đăng.</span>}
      </div>
      {post.isError && <div className="px-3 pb-3"><ErrorBox error={post.error} /></div>}
    </div>
  );
}
