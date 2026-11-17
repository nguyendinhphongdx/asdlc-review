import type { ChatRefDto } from "@mrd/contracts";
import { AtSign, Bot, FileCode2, Slash, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { usePromptInputController } from "@/components/ai-elements/prompt-input";
import { cn } from "@/lib/utils";

/** Lệnh của ASDLC (vùng trên của menu "/"): chọn thì điền sẵn nội dung vào ô chat. */
export interface AsdlcCommand { id: string; label: string; desc: string; insert: string }
/** Lệnh/skill/agent của repo đang review (vùng dưới của menu "/"), lấy từ harness. */
export interface RepoCommand { kind: "command" | "skill" | "agent"; name: string; path: string }

export const ASDLC_COMMANDS: AsdlcCommand[] = [
  { id: "review", label: "review", desc: "Chạy lại review cho MR này", insert: "review lại" },
  { id: "luong", label: "luồng", desc: "Giải thích luồng của tác giả, luồng đúng hơn, phương án khác", insert: "Giải thích luồng xử lý mà tác giả đang làm, chỉ ra luồng đúng hơn hoặc phương án khác nếu có, vẽ bằng sơ đồ mermaid." },
  { id: "nghiem-trong", label: "nghiêm-trọng", desc: "Giải thích finding nghiêm trọng nhất", insert: "Giải thích finding nghiêm trọng nhất" },
  { id: "bao-nham", label: "báo-nhầm", desc: "Finding nào có thể là báo nhầm?", insert: "Finding nào có thể là báo nhầm?" },
  { id: "kiem-tra", label: "kiểm-tra", desc: "Đọc code liên quan và kiểm tra lại", insert: "Đọc code liên quan và kiểm tra lại" },
  { id: "comment", label: "soạn-comment", desc: "Soạn comment cho finding quan trọng nhất", insert: "Soạn comment cho finding quan trọng nhất" },
  { id: "nho", label: "nhớ", desc: "Ghi một bài học vào sổ tay của repo", insert: "nhớ: " },
];

interface Item { key: string; group: "asdlc" | "repo" | "file"; label: string; desc?: string | undefined; icon: ReactNode; apply: (text: string, start: number) => { text: string; ref?: { token: string; ref: ChatRefDto } } }

const TRIGGER = /(^|\s)([@/])([^\s]*)$/;
const ICON = "size-3.5 flex-none text-muted-foreground";

/**
 * Bao quanh ô nhập chat: gõ "/" hiện hai vùng (lệnh của ASDLC, lệnh/skill/agent của repo), gõ "@" hiện file của MR.
 * Phím mũi tên/Tab/Enter/Esc được xử lý ở pha capture để không gửi tin khi đang chọn.
 * `refsRef` giữ các mục repo/file đã chọn, nơi gửi tin lọc theo token còn nằm trong văn bản.
 */
export function Completer({ files, repoName, repoCommands, extra, refsRef, children }: { files: string[]; repoName: string; repoCommands: RepoCommand[]; extra?: AsdlcCommand[]; refsRef: { current: { token: string; ref: ChatRefDto }[] }; children: ReactNode }) {
  const ctl = usePromptInputController();
  const text = ctl.textInput.value;
  const m = TRIGGER.exec(text);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const items = useMemo<Item[]>(() => {
    if (!m) return [];
    const q = (m[3] ?? "").toLowerCase();
    if (m[2] === "@") {
      return files.filter((f) => f.toLowerCase().includes(q)).slice(0, 30).map((f) => ({
        key: `f:${f}`, group: "file" as const, label: f, icon: <FileCode2 className={ICON} aria-hidden="true" />,
        apply: (t: string, start: number) => ({ text: `${t.slice(0, start)}@${f} `, ref: { token: `@${f}`, ref: { kind: "file" as const, path: f } } }),
      }));
    }
    const asdlc: Item[] = [...(extra ?? []), ...ASDLC_COMMANDS].filter((c) => `${c.label} ${c.desc}`.toLowerCase().includes(q)).map((c) => ({
      key: `a:${c.id}`, group: "asdlc" as const, label: `/${c.label}`, desc: c.desc, icon: <Sparkles className={ICON} aria-hidden="true" />,
      apply: (t: string, start: number) => ({ text: `${t.slice(0, start)}${c.insert}` }),
    }));
    const repo: Item[] = repoCommands.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 30).map((c) => ({
      key: `r:${c.path}`, group: "repo" as const, label: `/${c.name}`, desc: `${c.kind === "agent" ? "agent" : c.kind === "skill" ? "skill" : "command"} · ${c.path}`,
      icon: c.kind === "agent" ? <Bot className={ICON} aria-hidden="true" /> : <Wand2 className={ICON} aria-hidden="true" />,
      apply: (t: string, start: number) => ({ text: `${t.slice(0, start)}/${c.name} `, ref: { token: `/${c.name}`, ref: { kind: c.kind, path: c.path } } }),
    }));
    return [...asdlc, ...repo];
  }, [m?.[2], m?.[3], files, repoCommands, extra]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = !!m && items.length > 0 && dismissed !== text;
  useEffect(() => setActive(0), [m?.[2], m?.[3]]);
  useEffect(() => { listRef.current?.querySelector<HTMLElement>("[data-active='true']")?.scrollIntoView({ block: "nearest" }); }, [active, open]);

  const pick = (it: Item) => {
    if (!m) return;
    const start = text.length - m[0].length + (m[1]?.length ?? 0);
    const r = it.apply(text, start);
    if (r.ref) refsRef.current = [...refsRef.current.filter((x) => x.token !== r.ref!.token), r.ref];
    ctl.textInput.setInput(r.text);
    setDismissed(null);
  };

  const onKeyDownCapture = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!open || e.nativeEvent.isComposing) return;
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    if (e.key === "ArrowDown") { stop(); setActive((a) => (a + 1) % items.length); }
    else if (e.key === "ArrowUp") { stop(); setActive((a) => (a - 1 + items.length) % items.length); }
    else if (e.key === "Enter" && !e.shiftKey || e.key === "Tab") { stop(); const it = items[active]; if (it) pick(it); }
    else if (e.key === "Escape") { stop(); setDismissed(text); }
  };

  const section = (g: Item["group"], title: string) => {
    const list = items.filter((i) => i.group === g);
    if (!list.length) return null;
    return (
      <div key={g}>
        <div className="sticky top-0 bg-popover px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
        {list.map((it) => {
          const idx = items.indexOf(it);
          return (
            <button key={it.key} type="button" role="option" aria-selected={idx === active} data-active={idx === active} onMouseEnter={() => setActive(idx)} onMouseDown={(e) => { e.preventDefault(); pick(it); }}
              className={cn("flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs", idx === active ? "bg-muted" : "hover:bg-muted/60")}>
              {it.icon}
              <span className={cn("flex-none font-medium", it.group === "file" && "min-w-0 truncate font-mono text-[11.5px] font-normal")} dir={it.group === "file" ? "rtl" : undefined}>{it.group === "file" ? <bdi>{it.label}</bdi> : it.label}</span>
              {it.desc && <span className="min-w-0 truncate text-muted-foreground">{it.desc}</span>}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="relative" onKeyDownCapture={onKeyDownCapture}>
      {open && (
        <div ref={listRef} role="listbox" aria-label={m![2] === "@" ? "File của MR" : "Lệnh"} className="absolute inset-x-0 bottom-full z-30 mb-1 max-h-64 overflow-y-auto rounded-lg border bg-popover py-1 shadow-lg">
          {m![2] === "@" ? section("file", "File của MR") : <>{section("asdlc", "ASDLC")}{section("repo", repoName)}</>}
          <div className="flex items-center gap-1 border-t px-2.5 pt-1 text-[11px] text-muted-foreground">{m![2] === "@" ? <AtSign className="size-3" aria-hidden="true" /> : <Slash className="size-3" aria-hidden="true" />}↑↓ chọn · Enter/Tab điền · Esc đóng</div>
        </div>
      )}
      {children}
    </div>
  );
}

/** Lệnh/skill/agent của repo suy từ danh sách file harness (đường dẫn quy ước của Claude Code). */
export function repoCommandsFrom(items: { path: string }[]): RepoCommand[] {
  const out: RepoCommand[] = [];
  for (const { path: p } of items) {
    let r: RegExpExecArray | null;
    if ((r = /^\.claude\/commands\/(.+)\.md$/.exec(p))) out.push({ kind: "command", name: r[1]!.replace(/\//g, ":"), path: p });
    else if ((r = /^\.claude\/skills\/([^/]+)\/SKILL\.md$/.exec(p))) out.push({ kind: "skill", name: r[1]!, path: p });
    else if ((r = /^\.claude\/agents\/(.+)\.md$/.exec(p)) || (r = /^\.agents?\/(.+)\.md$/.exec(p))) out.push({ kind: "agent", name: r[1]!.replace(/\//g, ":"), path: p });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
