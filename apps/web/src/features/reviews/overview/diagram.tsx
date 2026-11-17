import type { DiagramGraph, DiagramNode, DiagramStatus, FlowBlock } from "@mrd/contracts";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CopyButton } from "../../../kernel/copy.js";
import { isVerified, layoutGraph, NODE_H, NODE_W, toMermaid } from "./layout.js";

const FILL: Record<DiagramStatus, string> = { added: "fill-success-bg stroke-success", changed: "fill-warning-bg stroke-warning", removed: "fill-danger-bg stroke-danger", unchanged: "fill-card stroke-border" };
const TEXT: Record<DiagramStatus, string> = { added: "fill-success-fg", changed: "fill-warning-fg", removed: "fill-danger-fg", unchanged: "fill-foreground" };
const STATUS_LABEL: Record<DiagramStatus, string> = { added: "mới", changed: "sửa", removed: "xoá", unchanged: "không đổi" };

function clip(s: string, n: number) { return s.length > n ? `${s.slice(0, n - 1)}…` : s; }

/** Vẽ một đồ thị (nút, cạnh, nhóm) bằng SVG thuần; bấm nút để chọn. */
export function Graph({ graph, selected, onSelect, label }: { graph: DiagramGraph; selected: string | null; onSelect: (n: DiagramNode) => void; label: string }) {
  const lay = useMemo(() => layoutGraph(graph), [graph]);
  const marker = useMemo(() => `ar${Math.random().toString(36).slice(2, 7)}`, []);
  return (
    <svg viewBox={`0 0 ${lay.width} ${lay.height}`} width="100%" style={{ minWidth: Math.min(lay.width, 520), maxHeight: 460 }} role="group" aria-label={label}>
      <defs>
        <marker id={marker} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" className="fill-muted-foreground" /></marker>
        <marker id={`${marker}v`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" className="fill-danger" /></marker>
      </defs>
      {lay.groups.map((g) => (
        <g key={g.name}><rect x={g.x} y={g.y} width={g.w} height={g.h} rx={12} className="fill-muted/40 stroke-border" /><text x={g.x + 10} y={g.y + 16} className="fill-muted-foreground text-[11px] font-semibold">{g.name}</text></g>
      ))}
      {lay.edges.map(({ edge, path, lx, ly }, i) => {
        const bad = edge.violation;
        const unverified = !bad && edge.evidence.length === 0;
        return (
          <g key={i}>
            <path d={path} fill="none" strokeWidth={bad ? 1.8 : 1.4} strokeDasharray={bad || unverified ? "5 4" : undefined} className={cn(bad ? "stroke-danger" : edge.status === "added" ? "stroke-success" : edge.status === "removed" ? "stroke-danger/60" : "stroke-muted-foreground")} markerEnd={`url(#${marker}${bad ? "v" : ""})`} />
            {edge.label && <text x={lx} y={ly} textAnchor="middle" className={cn("text-[11px]", bad ? "fill-danger-fg" : "fill-muted-foreground")}>{clip(edge.label, 28)}</text>}
          </g>
        );
      })}
      {lay.nodes.map(({ node, x, y }) => {
        const sel = selected === node.id;
        return (
          <g key={node.id} transform={`translate(${x} ${y})`} role="button" tabIndex={0} aria-pressed={sel} aria-label={`${node.label}, ${STATUS_LABEL[node.status]}${isVerified(node) ? "" : ", chưa xác minh"}`}
            className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-ring" onClick={() => onSelect(node)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(node); } }}>
            <rect width={NODE_W} height={NODE_H} rx={10} strokeWidth={sel ? 3 : 1.4} strokeDasharray={isVerified(node) ? undefined : "4 3"} className={FILL[node.status]} />
            <text x={NODE_W / 2} y={node.sub ? 23 : 33} textAnchor="middle" className={cn("text-[12.5px] font-semibold", TEXT[node.status], node.status === "removed" && "line-through")}>{clip(node.label, 20)}</text>
            {node.sub && <text x={NODE_W / 2} y={40} textAnchor="middle" className="fill-muted-foreground text-[11px]">{clip(node.sub, 24)}</text>}
          </g>
        );
      })}
    </svg>
  );
}

type Mode = "after" | "before" | "side";

/** Khối `flow`/`architecture`: sơ đồ, chuyển Trước/Sau/Cạnh nhau, thẻ chi tiết nút, sao chép Mermaid. */
export function DiagramBlock({ block, onAsk, onOpenFile }: { block: FlowBlock; onAsk?: ((prompt: string) => void) | undefined; onOpenFile?: ((path: string) => void) | undefined }) {
  const hasBefore = !!block.before?.nodes.length;
  const [mode, setMode] = useState<Mode>("after");
  const [sel, setSel] = useState<DiagramNode | null>(null);
  const all = block.after.nodes;
  const verified = all.filter(isVerified).length;
  const violations = block.after.edges.filter((e) => e.violation);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={verified === all.length ? "success" : "secondary"}>{verified}/{all.length} nút đã xác minh</Badge>
        {violations.length > 0 && <Badge variant="danger">{violations.length} cạnh vi phạm quy tắc</Badge>}
        <span className="flex-1" />
        {hasBefore && (
          <span role="group" aria-label="Chế độ xem" className="inline-flex overflow-hidden rounded-md border">
            {([["after", "Sau"], ["before", "Trước"], ["side", "Cạnh nhau"]] as const).map(([m, l]) => <Button key={m} size="sm" variant={mode === m ? "secondary" : "ghost"} aria-pressed={mode === m} className="rounded-none" onClick={() => setMode(m)}>{l}</Button>)}
          </span>
        )}
        <CopyButton label="Sao chép Mermaid" getValue={() => toMermaid(block.after)} />
      </div>
      <div className={cn("grid gap-3", mode === "side" ? "lg:grid-cols-2" : "grid-cols-1")}>
        {(mode === "before" || mode === "side") && block.before && <div className="overflow-x-auto rounded-lg border bg-card p-2"><div className="px-1 pb-1 text-xs font-semibold text-muted-foreground">Trước</div><Graph graph={block.before} selected={sel?.id ?? null} onSelect={setSel} label={`${block.title} — trước`} /></div>}
        {mode !== "before" && <div className="overflow-x-auto rounded-lg border bg-card p-2">{hasBefore && <div className="px-1 pb-1 text-xs font-semibold text-muted-foreground">Sau</div>}<Graph graph={block.after} selected={sel?.id ?? null} onSelect={setSel} label={block.title} /></div>}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {(["added", "changed", "removed", "unchanged"] as const).map((s) => <span key={s} className="inline-flex items-center gap-1.5"><span className={cn("size-3 rounded-sm border", s === "added" && "border-success bg-success-bg", s === "changed" && "border-warning bg-warning-bg", s === "removed" && "border-danger bg-danger-bg", s === "unchanged" && "bg-card")} />{STATUS_LABEL[s]}</span>)}
        <span>Nét đứt = chưa xác minh</span>
      </div>
      {sel ? <NodeCard title={block.title} node={sel} edges={block.after.edges.filter((e) => e.from === sel.id || e.to === sel.id)} onAsk={onAsk} onOpenFile={onOpenFile} onClose={() => setSel(null)} /> : <p className="text-xs text-muted-foreground">Bấm một nút để xem bằng chứng.</p>}
    </div>
  );
}

function NodeCard({ title, node, edges, onAsk, onOpenFile, onClose }: { title: string; node: DiagramNode; edges: FlowBlock["after"]["edges"]; onAsk?: ((prompt: string) => void) | undefined; onOpenFile?: ((path: string) => void) | undefined; onClose: () => void }) {
  const ok = isVerified(node);
  const bad = edges.filter((e) => e.violation);
  return (
    <div className={cn("rounded-lg border p-3.5 text-sm", ok ? "border-primary/40" : "border-warning bg-warning-bg/40")}>
      <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{node.label}</span><Badge variant={node.status === "added" ? "success" : node.status === "removed" ? "danger" : node.status === "changed" ? "warning" : "secondary"}>{STATUS_LABEL[node.status]}</Badge><Badge variant={ok ? "success" : "warning"}>{ok ? "đã xác minh" : "chưa xác minh"}</Badge><span className="flex-1" /><Button size="sm" variant="ghost" onClick={onClose}>Đóng</Button></div>
      {node.note && <p className="mt-1.5 text-foreground/85">{node.note}</p>}
      {ok ? <ul className="mt-2 flex flex-col gap-0.5 font-mono text-xs">{node.evidence.map((e) => <li key={e} className="break-all">{onOpenFile ? <button type="button" className="text-left underline-offset-2 hover:underline focus-visible:underline" title="Mở file trong tab Thay đổi" onClick={() => onOpenFile(e.trim().split(/[\s:]/)[0] ?? e)}>{e}</button> : e}</li>)}</ul> : <p className="mt-1.5 text-[13px] text-warning-fg">AI suy ra từ mô tả MR nhưng không tìm thấy code tương ứng; sơ đồ có thể sai ở nút này.</p>}
      {bad.map((e, i) => <p key={i} className="mt-2 rounded-md bg-danger-bg px-2.5 py-1.5 text-[13px] text-danger-fg">Vi phạm quy tắc: {e.from} → {e.to}{e.label ? ` (${e.label})` : ""}</p>)}
      {onAsk && <div className="mt-3"><Button size="sm" variant="outline" onClick={() => onAsk(`Giải thích nút "${node.label}" (${STATUS_LABEL[node.status]}${node.sub ? `, ${node.sub}` : ""}) trong sơ đồ "${title}": nó làm gì, nối với những nút nào (${edges.map((e) => `${e.from}→${e.to}`).join(", ") || "không có cạnh"}), có rủi ro gì?${ok ? ` Bằng chứng: ${node.evidence.join("; ")}.` : " Nút này chưa xác minh, hãy kiểm tra trong code."} Nếu cần, vẽ lại bằng Mermaid.`)}>Hỏi chat về nút này</Button></div>}
    </div>
  );
}
