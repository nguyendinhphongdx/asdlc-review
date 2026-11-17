import type { OverviewBlock, OverviewSectionDto } from "@mrd/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { DiagramBlock } from "./diagram.js";
import { SequenceDiagram } from "./sequence.js";

/** Mục tổng quan kiểu cũ (text/bullets/verdict) → khối mới, để review cũ vẫn hiển thị. */
export function sectionsToBlocks(sections: OverviewSectionDto[]): OverviewBlock[] {
  return sections.map((s): OverviewBlock => s.kind === "verdict" ? { kind: "verdict", id: s.id, title: s.title, verdict: s.verdict ?? "", text: s.text }
    : s.kind === "bullets" ? { kind: "bullets", id: s.id, title: s.title, bullets: s.bullets }
    : { kind: "summary", id: s.id, title: s.title, text: s.text });
}

const VIEW_LABEL: Record<OverviewBlock["kind"], string> = { summary: "Tóm tắt", bullets: "Ý chính", verdict: "Kết luận", flow: "Luồng", architecture: "Kiến trúc", sequence: "Trình tự" };

function BlockBody({ b, onAsk, onOpenFile, onSelectNode }: { b: OverviewBlock; onAsk?: ((p: string) => void) | undefined; onOpenFile?: ((path: string) => void) | undefined; onSelectNode?: ((l: string | null) => void) | undefined }) {
  switch (b.kind) {
    case "summary": return <p className="text-sm leading-relaxed text-foreground/85">{b.text}</p>;
    case "bullets": return <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-relaxed text-foreground/85">{b.bullets.map((x, i) => <li key={i}>{x}</li>)}</ul>;
    case "verdict": return <div className="flex flex-col gap-1.5"><span className="w-fit rounded-full bg-info-bg px-2.5 py-0.5 text-[12px] font-semibold text-info-fg">{b.verdict}</span>{b.text && <p className="text-sm leading-relaxed text-foreground/85">{b.text}</p>}</div>;
    case "flow": case "architecture": return <DiagramBlock block={b} onAsk={onAsk} onOpenFile={onOpenFile} onSelectNode={onSelectNode} />;
    case "sequence": return <SequenceDiagram block={b} />;
  }
}

/** Các view có thể thêm theo yêu cầu: bấm chip thì giao cho agent chat vẽ (tool add_overview_view), view hiện ngay khi xong. */
const CATALOG = [
  { key: "flow", label: "Luồng", prompt: 'Hãy tạo thêm view "Luồng" cho tab Tổng quan: đọc diff và code liên quan, rồi gọi tool add_overview_view (kind=flow, title "Luồng xử lý") vẽ luồng chính mà MR này thay đổi, mỗi nút kèm evidence thật.' },
  { key: "architecture", label: "Kiến trúc", prompt: 'Hãy tạo thêm view "Kiến trúc" cho tab Tổng quan: đọc diff và code, rồi gọi tool add_overview_view (kind=architecture, title "Kiến trúc") vẽ các module/lớp MR này đụng tới và quan hệ giữa chúng; đánh dấu cạnh vi phạm quy tắc kiến trúc của repo nếu có.' },
  { key: "sequence", label: "Trình tự", prompt: 'Hãy tạo thêm view "Trình tự" cho tab Tổng quan: đọc diff và code, rồi gọi tool add_overview_view (kind=sequence, title "Trình tự") vẽ chuỗi gọi giữa các bên (client, controller, service, DB, hệ thống ngoài…) trong luồng chính của MR.' },
  { key: "proposal", label: "Đề xuất", prompt: 'Hãy tạo thêm view "Đề xuất" cho tab Tổng quan: đọc diff và code, hiểu luồng tác giả đang làm, rồi gọi tool add_overview_view (kind=flow, title bắt đầu bằng "Đề xuất:") vẽ luồng đúng hơn hoặc một phương án thay thế tốt hơn. Nút khác với cách làm của tác giả đặt status "changed"/"added" và ghi lý do ở note; nút của tác giả cần bỏ thì "removed".' },
] as const;
type ViewKey = (typeof CATALOG)[number]["key"];
const keyOf = (b: OverviewBlock): ViewKey | null => (b.kind === "flow" || b.kind === "architecture" || b.kind === "sequence" ? (b.title.startsWith("Đề xuất") ? "proposal" : b.kind) : null);

function Skeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3 rounded-lg border border-dashed p-4">
      <div className="flex items-center gap-2 text-sm font-medium"><Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />Agent đang đọc code và vẽ view “{label}”…</div>
      <div className="h-24 animate-pulse rounded-md bg-muted" /><div className="flex gap-2"><div className="h-8 w-1/4 animate-pulse rounded-md bg-muted" /><div className="h-8 w-1/3 animate-pulse rounded-md bg-muted" /><div className="h-8 w-1/5 animate-pulse rounded-md bg-muted" /></div>
      <p className="text-xs text-muted-foreground">Tiến độ hiện trong khung chat bên trái. View sẽ tự hiện khi xong.</p>
    </div>
  );
}

/**
 * Tổng quan động: thanh chọn view (khối đã có + chip "+" cho view chưa có). Bấm view chưa có thì giao agent chat vẽ,
 * hiện khung chờ (skeleton) cho tới khi view xuất hiện trong dữ liệu run.
 */
export function OverviewBlocks({ blocks, onAsk, onOpenFile, onSelectNode, gen }: { blocks: OverviewBlock[]; onAsk?: ((p: string) => void) | undefined; onOpenFile?: ((path: string) => void) | undefined; onSelectNode?: ((l: string | null) => void) | undefined; gen?: { runId: string; ask: (text: string) => void } | undefined }) {
  const qc = useQueryClient();
  const firstDiagram = blocks.findIndex((b) => b.kind === "flow" || b.kind === "architecture" || b.kind === "sequence");
  const [idx, setIdx] = useState(Math.max(0, firstDiagram));
  const [pending, setPending] = useState<Record<string, number>>({});
  const [want, setWant] = useState<ViewKey | null>(null);
  const have = new Set(blocks.map(keyOf).filter(Boolean) as ViewKey[]);
  const waiting = Object.keys(pending);

  // View vừa xuất hiện: bỏ khung chờ và chuyển sang xem nó.
  useEffect(() => {
    const done = waiting.filter((k) => have.has(k as ViewKey));
    if (!done.length) return;
    setPending((p) => Object.fromEntries(Object.entries(p).filter(([k]) => !done.includes(k))));
    const i = blocks.findIndex((b) => keyOf(b) === done[0]);
    if (i >= 0) { setIdx(i); setWant(null); }
  }, [blocks]); // eslint-disable-line react-hooks/exhaustive-deps
  // Trong lúc chờ: làm mới dữ liệu run định kỳ; quá 4 phút thì thôi chờ.
  useEffect(() => {
    if (!waiting.length || !gen) return;
    const t = setInterval(() => {
      void qc.invalidateQueries({ queryKey: ["run", gen.runId] });
      setPending((p) => Object.fromEntries(Object.entries(p).filter(([, at]) => Date.now() - at < 240_000)));
    }, 3000);
    return () => clearInterval(t);
  }, [waiting.length, gen?.runId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!blocks.length && !gen) return null;
  const cur = blocks[Math.min(idx, blocks.length - 1)];
  const showing = want && pending[want] ? CATALOG.find((c) => c.key === want)! : null;
  const request = (c: (typeof CATALOG)[number]) => {
    if (!gen || pending[c.key]) { setWant(c.key); return; }
    setPending((p) => ({ ...p, [c.key]: Date.now() }));
    setWant(c.key);
    gen.ask(c.prompt);
  };
  const chip = "h-8 rounded-full px-3 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div className="flex flex-col gap-3">
      {(blocks.length > 1 || gen) && (
        <div role="tablist" aria-label="Chọn view tổng quan" className="flex flex-wrap gap-1.5">
          {blocks.map((b, i) => <button key={b.id} type="button" role="tab" aria-selected={!showing && b === cur} onClick={() => { setIdx(i); setWant(null); }} className={cn(chip, !showing && b === cur ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}>{VIEW_LABEL[b.kind]}<span className="sr-only"> {b.title}</span></button>)}
          {gen && CATALOG.filter((c) => !have.has(c.key)).map((c) => (
            <button key={c.key} type="button" role="tab" aria-selected={want === c.key} title={pending[c.key] ? "Agent đang vẽ view này" : `Nhờ agent vẽ thêm view ${c.label}`} onClick={() => request(c)} className={cn(chip, "inline-flex items-center gap-1 border border-dashed", want === c.key ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {pending[c.key] ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Plus className="size-3.5" aria-hidden="true" />}{c.label}
            </button>
          ))}
        </div>
      )}
      {showing ? <Skeleton label={showing.label} /> : cur && <div className="flex flex-col gap-2"><h3 className="text-sm font-semibold">{cur.title}</h3><BlockBody b={cur} onAsk={onAsk} onOpenFile={onOpenFile} onSelectNode={onSelectNode} /></div>}
    </div>
  );
}
