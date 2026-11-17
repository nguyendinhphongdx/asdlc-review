import type { OverviewBlock, OverviewSectionDto } from "@mrd/contracts";
import { useState } from "react";
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

function BlockBody({ b, onAsk, onOpenFile }: { b: OverviewBlock; onAsk?: ((p: string) => void) | undefined; onOpenFile?: ((path: string) => void) | undefined }) {
  switch (b.kind) {
    case "summary": return <p className="text-sm leading-relaxed text-foreground/85">{b.text}</p>;
    case "bullets": return <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-relaxed text-foreground/85">{b.bullets.map((x, i) => <li key={i}>{x}</li>)}</ul>;
    case "verdict": return <div className="flex flex-col gap-1.5"><span className="w-fit rounded-full bg-info-bg px-2.5 py-0.5 text-[12px] font-semibold text-info-fg">{b.verdict}</span>{b.text && <p className="text-sm leading-relaxed text-foreground/85">{b.text}</p>}</div>;
    case "flow": case "architecture": return <DiagramBlock block={b} onAsk={onAsk} onOpenFile={onOpenFile} />;
    case "sequence": return <SequenceDiagram block={b} />;
  }
}

/** Tổng quan động: thanh chọn view (mỗi khối một chip) + nội dung khối đang chọn. Chỉ có 1 khối thì không hiện thanh. */
export function OverviewBlocks({ blocks, onAsk, onOpenFile }: { blocks: OverviewBlock[]; onAsk?: ((p: string) => void) | undefined; onOpenFile?: ((path: string) => void) | undefined }) {
  const firstDiagram = blocks.findIndex((b) => b.kind === "flow" || b.kind === "architecture" || b.kind === "sequence");
  const [idx, setIdx] = useState(Math.max(0, firstDiagram));
  if (!blocks.length) return null;
  const cur = blocks[Math.min(idx, blocks.length - 1)]!;
  return (
    <div className="flex flex-col gap-3">
      {blocks.length > 1 && (
        <div role="tablist" aria-label="Chọn view tổng quan" className="flex flex-wrap gap-1.5">
          {blocks.map((b, i) => <button key={b.id} type="button" role="tab" aria-selected={b === cur} onClick={() => setIdx(i)} className={cn("h-8 rounded-full px-3 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring", b === cur ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}>{VIEW_LABEL[b.kind]}<span className="sr-only"> {b.title}</span></button>)}
        </div>
      )}
      <div className="flex flex-col gap-2"><h3 className="text-sm font-semibold">{cur.title}</h3><BlockBody b={cur} onAsk={onAsk} onOpenFile={onOpenFile} /></div>
    </div>
  );
}
