import type { DiagramEdge, DiagramGraph, DiagramNode } from "@mrd/contracts";

export const NODE_W = 150;
export const NODE_H = 56;
const GAP_X = 72;
const GAP_Y = 30;
const PAD = 24;

export interface PlacedNode { node: DiagramNode; x: number; y: number }
export interface PlacedEdge { edge: DiagramEdge; path: string; lx: number; ly: number }
export interface PlacedGroup { name: string; x: number; y: number; w: number; h: number }
export interface Layout { width: number; height: number; nodes: PlacedNode[]; edges: PlacedEdge[]; groups: PlacedGroup[] }

/** Chia tầng theo đường dài nhất từ trái sang phải; cạnh quay ngược (chu trình) bị bỏ qua khi xếp tầng. */
export function layerOf(g: DiagramGraph): Map<string, number> {
  const ids = new Set(g.nodes.map((n) => n.id));
  const out = new Map<string, string[]>();
  for (const e of g.edges) if (ids.has(e.from) && ids.has(e.to) && e.from !== e.to) out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
  const state = new Map<string, 0 | 1 | 2>();
  const dag = new Map<string, string[]>();
  const visit = (u: string) => {
    state.set(u, 1);
    for (const v of out.get(u) ?? []) {
      if (state.get(v) === 1) continue; // cạnh ngược
      dag.set(u, [...(dag.get(u) ?? []), v]);
      if (!state.get(v)) visit(v);
    }
    state.set(u, 2);
  };
  const hasIn = new Set([...out.values()].flat());
  for (const n of g.nodes) if (!hasIn.has(n.id) && !state.get(n.id)) visit(n.id);
  for (const n of g.nodes) if (!state.get(n.id)) visit(n.id);
  const layer = new Map<string, number>();
  const depth = (u: string): number => {
    const known = layer.get(u);
    if (known != null) return known;
    layer.set(u, 0);
    return 0;
  };
  // Topo bằng Kahn trên dag
  const indeg = new Map<string, number>(g.nodes.map((n) => [n.id, 0]));
  for (const vs of dag.values()) for (const v of vs) indeg.set(v, (indeg.get(v) ?? 0) + 1);
  const queue = g.nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  for (const q of queue) depth(q);
  while (queue.length) {
    const u = queue.shift()!;
    for (const v of dag.get(u) ?? []) {
      layer.set(v, Math.max(layer.get(v) ?? 0, (layer.get(u) ?? 0) + 1));
      indeg.set(v, (indeg.get(v) ?? 1) - 1);
      if (indeg.get(v) === 0) queue.push(v);
    }
  }
  for (const n of g.nodes) depth(n.id);
  return layer;
}

export function layoutGraph(g: DiagramGraph): Layout {
  if (!g.nodes.length) return { width: PAD * 2, height: PAD * 2, nodes: [], edges: [], groups: [] };
  const layer = layerOf(g);
  const cols = new Map<number, DiagramNode[]>();
  for (const n of g.nodes) cols.set(layer.get(n.id) ?? 0, [...(cols.get(layer.get(n.id) ?? 0) ?? []), n]);
  const maxLayer = Math.max(...cols.keys());
  const tallest = Math.max(...[...cols.values()].map((c) => c.length));
  const colH = tallest * NODE_H + (tallest - 1) * GAP_Y;
  const pos = new Map<string, PlacedNode>();
  for (let l = 0; l <= maxLayer; l++) {
    const col = [...(cols.get(l) ?? [])].sort((a, b) => (a.group ?? "").localeCompare(b.group ?? ""));
    const h = col.length * NODE_H + (col.length - 1) * GAP_Y;
    col.forEach((node, i) => pos.set(node.id, { node, x: PAD + l * (NODE_W + GAP_X), y: PAD + (colH - h) / 2 + i * (NODE_H + GAP_Y) }));
  }
  const edges: PlacedEdge[] = [];
  let hasBack = false;
  for (const edge of g.edges) {
    const a = pos.get(edge.from), b = pos.get(edge.to);
    if (!a || !b) continue;
    if ((layer.get(edge.to) ?? 0) > (layer.get(edge.from) ?? 0)) {
      const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2, x2 = b.x, y2 = b.y + NODE_H / 2, mx = (x1 + x2) / 2;
      edges.push({ edge, path: `M${x1} ${y1} C${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`, lx: mx, ly: (y1 + y2) / 2 - 4 });
    } else {
      // cạnh quay lại hoặc cùng tầng: đi vòng dưới các nút
      hasBack = true;
      const x1 = a.x + NODE_W / 2, y1 = a.y + NODE_H, x2 = b.x + NODE_W / 2, y2 = b.y + NODE_H, dip = Math.max(y1, y2) + 34;
      edges.push({ edge, path: `M${x1} ${y1} C${x1} ${dip}, ${x2} ${dip}, ${x2} ${y2}`, lx: (x1 + x2) / 2, ly: dip - 6 });
    }
  }
  const groups: PlacedGroup[] = [];
  const names = [...new Set(g.nodes.map((n) => n.group).filter((x): x is string => !!x))];
  for (const name of names) {
    const ps = [...pos.values()].filter((p) => p.node.group === name);
    const x = Math.min(...ps.map((p) => p.x)) - 12, y = Math.min(...ps.map((p) => p.y)) - 26;
    groups.push({ name, x, y, w: Math.max(...ps.map((p) => p.x + NODE_W)) + 12 - x, h: Math.max(...ps.map((p) => p.y + NODE_H)) + 12 - y });
  }
  return { width: PAD * 2 + (maxLayer + 1) * NODE_W + maxLayer * GAP_X, height: PAD * 2 + colH + (hasBack ? 44 : 0), nodes: [...pos.values()], edges, groups };
}

/** Xuất sang Mermaid để dán vào tài liệu. Nhãn được làm sạch để không phá cú pháp. */
export function toMermaid(g: DiagramGraph): string {
  const q = (s: string) => `"${s.replace(/["\n]/g, " ")}"`;
  const lines = ["flowchart LR"];
  for (const n of g.nodes) lines.push(`  ${n.id.replace(/\W/g, "_")}[${q(n.label)}]`);
  for (const e of g.edges) lines.push(`  ${e.from.replace(/\W/g, "_")} ${e.violation ? "-.->" : "-->"}${e.label ? `|${q(e.label)}|` : ""} ${e.to.replace(/\W/g, "_")}`);
  return lines.join("\n");
}

export const isVerified = (n: { evidence: string[] }) => n.evidence.length > 0;
