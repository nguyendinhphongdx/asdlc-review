import { viewFor, type AiBlock, type DiagramEdge, type DiagramKind, type DiagramNode, type MrKind, type OverviewBlock, type OverviewView } from "@mrd/contracts";

export const MAX_NODES = 12;
export const MAX_BLOCKS = 4;

/** Đoạn prompt yêu cầu AI vẽ sơ đồ; rỗng khi loại MR không cần. */
export function blocksPrompt(kind: MrKind, view: OverviewView): string {
  const v = view;
  if (!v.required.length && !v.optional.length) return "";
  const list = [...v.required.map((k) => `- ${k} (REQUIRED)`), ...v.optional.map((k) => `- ${k} (only if the MR really touches it)`)].join("\n");
  return `# Diagrams (field "blocks"; this MR was classified as "${kind}")
Return diagrams in "blocks" for these kinds, nothing else (leave "blocks" empty when you cannot ground a required one):
${list}
Rules: at most ${MAX_NODES} nodes per diagram and ${MAX_BLOCKS} blocks. A node is a step, function, service or module; give it a short "label", optional "sub" (layer/file), optional "group" (module or layer, for a frame around nodes) and "status": added / changed / removed / unchanged relative to the base branch. Edges connect node ids; set "violation": true only when the edge breaks a rule of this repository (for example a module importing another module) and name that in "label".
EVIDENCE IS MANDATORY: every node, edge and sequence message lists "evidence" entries like "path/to/file.ts:120 symbolName" that you verified in the checkout. If you cannot verify a node, keep it only if the MR description clearly states it and leave "evidence" empty; never invent paths or symbols. Leave "beforeNodes"/"beforeEdges" EMPTY: the "before" view is derived from your "status" values (added nodes/edges did not exist, removed ones did), so statuses must be accurate. For "sequence" fill "actors" (2-8 parties) and ordered "messages" (reply: true for returns); leave nodes/edges empty. For flow/architecture leave actors/messages empty. Use a different "title" for each diagram.`;
}

const evidencePath = (e: string) => e.trim().split(/[\s:]/)[0] ?? "";

/** Bỏ bằng chứng trỏ tới file không có trong diff hoặc cây repo (AI bịa) để nút bị đánh dấu "chưa xác minh". */
function cleanEvidence(ev: string[], known: Set<string>): string[] {
  return ev.map((e) => e.trim()).filter((e) => e && known.has(evidencePath(e).replace(/^\.\//, ""))).slice(0, 4);
}

function cleanGraph(nodes: DiagramNode[], edges: DiagramEdge[], known: Set<string>) {
  const seen = new Set<string>();
  const ns: DiagramNode[] = [];
  for (const n of nodes) {
    if (!n.id || seen.has(n.id) || ns.length >= MAX_NODES) continue;
    seen.add(n.id);
    ns.push({ ...n, label: n.label.slice(0, 40), sub: n.sub?.slice(0, 40) ?? null, group: n.group?.slice(0, 40) ?? null, evidence: cleanEvidence(n.evidence, known) });
  }
  const es = edges.filter((e) => seen.has(e.from) && seen.has(e.to)).slice(0, 40).map((e) => ({ ...e, label: e.label?.slice(0, 40) ?? null, evidence: cleanEvidence(e.evidence, known) }));
  return { nodes: ns, edges: es };
}

/** "Trước" suy từ trạng thái của "Sau": nút/cạnh `added` chưa có, `removed` còn; cạnh nối vào nút chưa có thì bỏ. Không có gì thêm/xoá thì không có chế độ Trước. */
export function deriveBefore(after: { nodes: DiagramNode[]; edges: DiagramEdge[] }): { nodes: DiagramNode[]; edges: DiagramEdge[] } | null {
  if (!after.nodes.some((n) => n.status === "added" || n.status === "removed") && !after.edges.some((e) => e.status === "added" || e.status === "removed")) return null;
  const nodes = after.nodes.filter((n) => n.status !== "added");
  const ids = new Set(nodes.map((n) => n.id));
  const edges = after.edges.filter((e) => e.status !== "added" && ids.has(e.from) && ids.has(e.to));
  return nodes.length ? { nodes, edges } : null;
}

/**
 * Chuyển khối thô của AI thành khối đã làm sạch: giới hạn cỡ, bỏ cạnh trỏ vào nút lạ, bỏ bằng chứng không có thật,
 * bỏ khối loại không được yêu cầu cho loại MR này hoặc rỗng.
 */
export function buildBlocks(raw: AiBlock[], view: OverviewView, knownPaths: Iterable<string>): OverviewBlock[] {
  const v = view;
  const allowed = new Set<DiagramKind>([...v.required, ...v.optional]);
  const known = new Set([...knownPaths].map((p) => p.replace(/^\.\//, "")));
  const out: OverviewBlock[] = [];
  const titles = new Set<string>();
  raw.forEach((b, i) => {
    if (out.length >= MAX_BLOCKS || !allowed.has(b.kind) || titles.has(b.title)) return;
    const id = `${b.kind}-${i}`;
    const title = b.title.slice(0, 80) || b.kind;
    if (b.kind === "sequence") {
      const actors = [...new Set(b.actors)].slice(0, 8);
      const messages = b.messages.filter((m) => actors.includes(m.from) && actors.includes(m.to)).slice(0, 24).map((m) => ({ ...m, text: m.text.slice(0, 80), evidence: cleanEvidence(m.evidence, known) }));
      if (actors.length < 2 || !messages.length) return;
      titles.add(b.title);
      out.push({ kind: "sequence", id, title, actors, messages });
      return;
    }
    const after = cleanGraph(b.nodes, b.edges, known);
    if (!after.nodes.length) return;
    const before = b.beforeNodes.length ? cleanGraph(b.beforeNodes, b.beforeEdges, known) : deriveBefore(after);
    titles.add(b.title);
    out.push({ kind: b.kind, id, title, after, before: before?.nodes.length ? before : null });
  });
  // Khối bắt buộc đứng trước
  const rank = (b: OverviewBlock) => (v.required.includes(b.kind as DiagramKind) ? 0 : 1);
  return out.sort((a, b) => rank(a) - rank(b));
}
