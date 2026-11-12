import type { FileReviewDto, FindingDto, MrFileDiffDto } from "@mrd/contracts";
import { useQuery } from "@tanstack/react-query";
import { Bot, ChevronDown, ChevronRight, FileCode2, Folder, Search, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, SeverityBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getMrDiff } from "./api.js";

const SEV_RANK: Record<string, number> = { blocker: 0, critical: 1, major: 2, minor: 3, nit: 4 };
const SEV_DOT: Record<string, string> = { blocker: "bg-danger", critical: "bg-chart-4", major: "bg-chart-3", minor: "bg-chart-2", nit: "bg-muted-foreground" };
const MAX_LINES = 600;

interface Row { kind: "hunk" | "add" | "del" | "ctx"; text: string; oldNo?: number; newNo?: number }
function parseDiff(diff: string): Row[] {
  const rows: Row[] = [];
  let o = 0, n = 0;
  for (const line of diff.split("\n")) {
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (h) { o = Number(h[1]); n = Number(h[2]); rows.push({ kind: "hunk", text: line }); continue; }
    if (line.startsWith("\\")) continue;
    if (line.startsWith("+")) rows.push({ kind: "add", text: line.slice(1), newNo: n++ });
    else if (line.startsWith("-")) rows.push({ kind: "del", text: line.slice(1), oldNo: o++ });
    else if (rows.length) rows.push({ kind: "ctx", text: line.slice(1), oldNo: o++, newNo: n++ });
  }
  while (rows.length && rows[rows.length - 1]!.kind === "ctx" && rows[rows.length - 1]!.text === "") rows.pop();
  return rows;
}

/** Tập file người dùng đã đánh dấu "đã xem" cho một MR, lưu cục bộ theo trình duyệt (không gửi đi đâu). */
function useViewed(mrId: string) {
  const key = `mrd:viewed:${mrId}`;
  const read = (): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(key) ?? "[]") as string[]); } catch { return new Set(); } };
  const [set, setSet] = useState<Set<string>>(read);
  useEffect(() => setSet(read()), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = useCallback((p: string) => setSet((cur) => {
    const n = new Set(cur);
    if (n.has(p)) n.delete(p); else n.add(p);
    try { localStorage.setItem(key, JSON.stringify([...n])); } catch { /* chế độ riêng tư: bỏ qua */ }
    return n;
  }), [key]);
  return { viewed: set, toggle };
}

interface Item { path: string; additions: number; deletions: number; reviewed: boolean; binary: boolean; diff?: MrFileDiffDto }

function FindingBubble({ f }: { f: FindingDto }) {
  return (
    <div className="mx-3 my-2 flex flex-col gap-1.5 rounded-lg border border-primary/30 bg-info-bg/40 p-3 font-sans text-[13px] shadow-xs">
      <div className="flex flex-wrap items-center gap-2"><span className="flex size-[22px] items-center justify-center rounded-md bg-primary text-primary-foreground"><Bot className="size-3.5" aria-hidden="true" /></span><span className="font-semibold">AI review</span><span className="rounded bg-info-bg px-1.5 text-[10.5px] font-bold text-info-fg">AI</span><SeverityBadge severity={f.severity} />{f.ruleId && <Badge className="font-mono">{f.ruleId}</Badge>}<span className="text-xs text-muted-foreground">tin cậy {Math.round(f.confidence * 100)}%</span></div>
      <div className="font-medium">{f.title}</div>
      {f.why && <p className="text-muted-foreground">{f.why}</p>}
      {f.suggestion && <div className="rounded-md bg-success-bg px-3 py-2 text-success-fg"><b>Gợi ý.</b> {f.suggestion}</div>}
    </div>
  );
}

function DiffBody({ file, findings }: { file: MrFileDiffDto; findings: FindingDto[] }) {
  const rows = useMemo(() => parseDiff(file.diff), [file.diff]);
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, MAX_LINES);
  const byLine = useMemo(() => {
    const m = new Map<number, FindingDto[]>();
    const lines = new Set(rows.filter((r) => r.newNo !== undefined).map((r) => r.newNo!));
    const orphans: FindingDto[] = [];
    for (const f of findings) {
      const ln = f.lineEnd ?? f.lineStart;
      if (ln && lines.has(ln)) m.set(ln, [...(m.get(ln) ?? []), f]);
      else orphans.push(f);
    }
    return { m, orphans };
  }, [rows, findings]);
  if (file.truncated || !file.diff) return <p className="px-4 py-3 text-xs text-muted-foreground">Nền tảng không trả nội dung diff cho file này (quá lớn hoặc nhị phân).</p>;
  return (
    <div className="overflow-x-auto border-t font-mono text-xs leading-5">
      {byLine.orphans.map((f) => <FindingBubble key={f.id} f={f} />)}
      <table className="w-full border-collapse">
        <tbody>
          {shown.map((r, i) => {
            if (r.kind === "hunk") return <tr key={i} className="bg-muted/60 text-muted-foreground"><td colSpan={3} className="px-3 py-1">{r.text}</td></tr>;
            const fs = r.newNo !== undefined && r.kind !== "del" ? byLine.m.get(r.newNo) : undefined;
            return (
              <>
                <tr key={i} className={cn(r.kind === "add" && "bg-success/10", r.kind === "del" && "bg-danger/10", fs && "outline outline-1 -outline-offset-1 outline-primary/40")}>
                  <td className="w-12 select-none px-2 text-right text-muted-foreground/70">{r.oldNo ?? ""}</td>
                  <td className="w-12 select-none border-r px-2 text-right text-muted-foreground/70">{r.newNo ?? ""}</td>
                  <td className="whitespace-pre pl-3 pr-4"><span className="select-none text-muted-foreground">{r.kind === "add" ? "+" : r.kind === "del" ? "-" : " "}</span> {r.text}</td>
                </tr>
                {fs?.map((f) => <tr key={`f-${f.id}`}><td colSpan={3} className="bg-background"><FindingBubble f={f} /></td></tr>)}
              </>
            );
          })}
        </tbody>
      </table>
      {!all && rows.length > MAX_LINES && <button type="button" className="w-full border-t py-2 text-center font-sans text-xs text-primary hover:bg-muted/50" onClick={() => setAll(true)}>Hiện thêm {rows.length - MAX_LINES} dòng</button>}
    </div>
  );
}

function FileCard({ item, findings, open, onToggle, id, viewed, onViewed }: { item: Item; findings: FindingDto[]; open: boolean; onToggle: () => void; id: string; viewed: boolean; onViewed: () => void }) {
  const dir = item.path.includes("/") ? item.path.slice(0, item.path.lastIndexOf("/") + 1) : "";
  const name = item.path.slice(dir.length);
  return (
    <Card id={id} className="scroll-mt-20 gap-0 overflow-hidden py-0">
      <div className="flex items-center gap-2 px-3 hover:bg-muted/40">
      <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground"><input type="checkbox" checked={viewed} onChange={onViewed} aria-label={`Đã xem ${item.path}`} className="size-4 accent-[var(--primary)]" />Đã xem</label>
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} aria-hidden="true" />
        <span className="min-w-0 flex-1 break-all font-mono text-[13px]"><span className="text-muted-foreground">{dir}</span><b className="font-semibold">{name}</b></span>
        {!item.reviewed && <Badge variant="warning">AI chưa xem (bị bỏ qua)</Badge>}
        {item.reviewed && findings.length === 0 && <Badge variant="success">AI: sạch</Badge>}
        {findings.length > 0 && <span className="inline-flex items-center gap-1">{[...findings].sort((a, b) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9)).slice(0, 4).map((f) => <SeverityBadge key={f.id} severity={f.severity} />)}{findings.length > 4 && <span className="text-xs text-muted-foreground">+{findings.length - 4}</span>}</span>}
        {item.binary ? <span className="text-xs text-muted-foreground">binary</span> : <span className="font-mono text-xs tabular-nums"><span className="text-success-fg">+{item.additions}</span> <span className="text-danger-fg">−{item.deletions}</span></span>}
      </button>
      </div>
      {open && (item.diff ? <DiffBody file={item.diff} findings={findings} /> : <p className="border-t px-4 py-3 text-xs text-muted-foreground">Chưa tải được nội dung diff.</p>)}
    </Card>
  );
}

interface Node { name: string; path: string; children: Node[]; file?: Item }
function buildTree(items: Item[]): Node[] {
  const root: Node = { name: "", path: "", children: [] };
  for (const it of items) {
    let cur = root;
    const parts = it.path.split("/");
    parts.forEach((p, i) => {
      let c = cur.children.find((x) => x.name === p && !!x.file === (i === parts.length - 1));
      if (!c) { c = { name: p, path: parts.slice(0, i + 1).join("/"), children: [], ...(i === parts.length - 1 ? { file: it } : {}) }; cur.children.push(c); }
      cur = c;
    });
  }
  const squash = (n: Node): Node => {
    n.children = n.children.map(squash);
    while (!n.file && n.name && n.children.length === 1 && !n.children[0]!.file) { const c = n.children[0]!; n = { ...c, name: `${n.name}/${c.name}` }; }
    return n;
  };
  const sort = (ns: Node[]) => ns.sort((a, b) => Number(!!a.file) - Number(!!b.file) || a.name.localeCompare(b.name)).forEach((n) => sort(n.children));
  const top = root.children.map(squash);
  sort(top);
  return top;
}

function TreeNode({ n, depth, onPick, active, counts, viewed, onViewed }: { n: Node; depth: number; onPick: (p: string) => void; active: string | null; counts: Map<string, FindingDto[]>; viewed: Set<string>; onViewed: (p: string) => void }) {
  const [open, setOpen] = useState(true);
  const pad = { paddingLeft: 8 + depth * 14 };
  if (n.file) {
    const fs = counts.get(n.file.path);
    const worst = fs?.reduce((w, f) => ((SEV_RANK[f.severity] ?? 9) < (SEV_RANK[w] ?? 9) ? f.severity : w), "nit");
    return (
      <div style={pad} className={cn("flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-[13px] hover:bg-muted", active === n.file.path && "bg-muted font-medium", (!n.file.reviewed || viewed.has(n.file.path)) && "text-muted-foreground")}>
        <input type="checkbox" checked={viewed.has(n.file.path)} onChange={() => onViewed(n.file!.path)} aria-label={`Đã xem ${n.file.path}`} className="size-3.5 shrink-0 accent-[var(--primary)]" />
      <button type="button" onClick={() => onPick(n.file!.path)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <FileCode2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate" title={n.file.path}>{n.name}</span>
        {!n.file.reviewed && <TriangleAlert className="size-3.5 shrink-0 text-warning-fg" aria-label="Bị bỏ qua" />}
        {fs && worst && <span className="flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-muted-foreground"><span className={cn("size-2 rounded-full", SEV_DOT[worst])} />{fs.length}</span>}
        <span className="shrink-0 font-mono text-[11px] tabular-nums"><span className="text-success-fg">+{n.file.additions}</span> <span className="text-danger-fg">−{n.file.deletions}</span></span>
      </button>
      </div>
    );
  }
  return (
    <div>
      <button type="button" style={pad} onClick={() => setOpen(!open)} className="flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-[13px] hover:bg-muted">
        {open ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /> : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
        <Folder className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="min-w-0 truncate" title={n.name}>{n.name}</span>
      </button>
      {open && n.children.map((c) => <TreeNode key={c.name + c.path} n={c} depth={depth + 1} onPick={onPick} active={active} counts={counts} viewed={viewed} onViewed={onViewed} />)}
    </div>
  );
}

/** Trang "Changes" kiểu GitLab: cây file bên trái, diff từng file bên phải, finding của AI hiện inline như comment. */
export function FileChanges({ mrId, files, findings }: { mrId: string; files: FileReviewDto[]; findings: FindingDto[] }) {
  const diff = useQuery({ queryKey: ["mr-diff", mrId], queryFn: () => getMrDiff(mrId), staleTime: 120_000, retry: false });
  const [filter, setFilter] = useState<"all" | "unviewed" | "issues">("all");
  const { viewed, toggle: toggleViewed } = useViewed(mrId);
  const [search, setSearch] = useState("");
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [active, setActive] = useState<string | null>(null);

  const byFile = useMemo(() => {
    const m = new Map<string, FindingDto[]>();
    for (const f of findings) if (f.file && f.kind === "issue") m.set(f.file, [...(m.get(f.file) ?? []), f]);
    return m;
  }, [findings]);
  const items = useMemo<Item[]>(() => {
    const d = new Map((diff.data?.files ?? []).map((x) => [x.path, x]));
    const base = files.length ? files : (diff.data?.files ?? []).map((x) => ({ path: x.path, additions: x.additions, deletions: x.deletions, binary: false, reviewed: true }));
    return base.map((f) => ({ ...f, diff: d.get(f.path) }));
  }, [files, diff.data]);
  if (!items.length) return null;

  const skipped = items.filter((f) => !f.reviewed).length;
  const visible = items
    .filter((f) => filter === "all" || (filter === "unviewed" ? !viewed.has(f.path) : byFile.has(f.path) || !f.reviewed))
    .filter((f) => !search.trim() || f.path.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => a.path.localeCompare(b.path));
  const total = items.reduce((s, f) => ({ a: s.a + f.additions, d: s.d + f.deletions }), { a: 0, d: 0 });
  const defaultOpen = (f: Item) => byFile.has(f.path) && f.reviewed && (byFile.get(f.path)?.length ?? 0) > 0;
  let autoOpen = 0;
  const isOpen = (f: Item) => {
    if (toggled[f.path] !== undefined) return toggled[f.path]!;
    if (defaultOpen(f) && autoOpen < 6) { autoOpen++; return true; }
    return false;
  };
  const pick = (p: string) => {
    setActive(p);
    setToggled((t) => ({ ...t, [p]: true }));
    setTimeout(() => document.getElementById(`file-${encodeURIComponent(p)}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  };
  const tree = buildTree(visible);
  const viewedCount = items.filter((f) => viewed.has(f.path)).length;
  const nextUnviewed = () => {
    const order = items.map((f) => f.path).sort();
    const start = active ? order.indexOf(active) : -1;
    const nxt = order.map((_, i) => order[(start + 1 + i) % order.length]!).find((p) => !viewed.has(p));
    if (nxt) pick(nxt);
  };

  return (
    <section aria-label="Thay đổi của MR" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="text-base font-semibold">Changes <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-normal tabular-nums">{items.length}</span></h2>
        <span className="font-mono text-xs tabular-nums"><span className="text-success-fg">+{total.a}</span> <span className="text-danger-fg">−{total.d}</span></span>
        <span className="text-[13px] tabular-nums text-muted-foreground">{viewedCount}/{items.length} đã xem · {items.length - skipped}/{items.length} file đã gửi cho AI{findings.some((f) => f.file) ? ` · ${findings.filter((f) => f.file && f.kind === "issue").length} finding gắn vào dòng code` : ""}</span>
        <div role="group" aria-label="Lọc file" className="ml-auto flex flex-wrap items-center gap-1.5">
          {([["all", `Tất cả ${items.length}`], ["unviewed", `Chưa xem ${items.length - viewedCount}`], ["issues", `Có vấn đề ${items.filter((f) => byFile.has(f.path) || !f.reviewed).length}`]] as const).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={cn("h-7 rounded-full border px-3 text-[12.5px] font-medium", filter === k ? "border-primary bg-info-bg text-info-fg" : "text-muted-foreground hover:text-foreground")}>{l}</button>
          ))}
          <button type="button" onClick={nextUnviewed} className="h-7 rounded-md border px-3 text-[12.5px] font-medium hover:bg-muted">Chưa xem tiếp →</button>
        </div>
      </div>
      {skipped > 0 && <p className="text-xs text-muted-foreground">File bị bỏ qua (vượt ngân sách diff) không được AI xem trong diff; điểm không phản ánh chúng.</p>}
      {diff.isLoading && <p className="text-xs text-muted-foreground">Đang tải nội dung diff…</p>}
      {diff.error && <p role="alert" className="text-xs text-warning-fg">Không tải được nội dung diff từ nền tảng ({String((diff.error as Error).message).slice(0, 160)}). Vẫn hiện danh sách file.</p>}
      <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="gap-0 overflow-hidden py-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]">
          <div className="relative border-b p-2"><Search className="absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><input aria-label="Tìm file" placeholder="Tìm file (vd *.tsx)" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 w-full rounded-md border bg-background pl-7 pr-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
          <div className="min-h-0 overflow-y-auto p-1.5">{tree.length ? tree.map((n) => <TreeNode key={n.name + n.path} n={n} depth={0} onPick={pick} active={active} counts={byFile} viewed={viewed} onViewed={toggleViewed} />) : <p className="p-3 text-xs text-muted-foreground">Không có file khớp.</p>}</div>
        </Card>
        <div className="flex min-w-0 flex-col gap-3">
          {visible.map((f) => <FileCard key={f.path} id={`file-${encodeURIComponent(f.path)}`} item={f} findings={byFile.get(f.path) ?? []} open={isOpen(f)} onToggle={() => setToggled((t) => ({ ...t, [f.path]: !isOpen(f) }))} viewed={viewed.has(f.path)} onViewed={() => toggleViewed(f.path)} />)}
          {visible.length === 0 && <Card><p className="px-6 py-10 text-center text-sm text-muted-foreground">Không có file nào khớp bộ lọc.</p></Card>}
        </div>
      </div>
    </section>
  );
}
