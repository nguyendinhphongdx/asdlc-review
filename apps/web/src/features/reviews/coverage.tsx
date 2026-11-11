import type { FileReviewDto, FindingDto, HarnessLoadDto, RuleCheckDto } from "@mrd/contracts";
import { Check, CircleHelp, Minus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, SeverityBadge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const ST = {
  pass: { label: "Đạt", icon: Check, cls: "bg-success-bg text-success-fg" },
  fail: { label: "Vi phạm", icon: X, cls: "bg-danger-bg text-danger-fg" },
  na: { label: "Không áp dụng", icon: Minus, cls: "bg-secondary text-muted-foreground" },
  unchecked: { label: "Chưa kiểm tra", icon: CircleHelp, cls: "bg-warning-bg text-warning-fg" },
} as const;
type Status = keyof typeof ST;

function StatusDot({ s }: { s: Status }) {
  const { icon: Icon, cls, label } = ST[s];
  return <span role="img" aria-label={label} title={label} className={cn("inline-flex size-5 flex-none items-center justify-center rounded-full", cls)}><Icon className="size-3" aria-hidden="true" /></span>;
}

/** Bằng chứng AI đã soi từng rule của framework, để không phải tin vào việc "không có finding". */
export function RuleChecklist({ checks }: { checks: RuleCheckDto[] }) {
  const [filter, setFilter] = useState<Status | "all">("all");
  const counts = useMemo(() => {
    const c: Record<Status, number> = { pass: 0, fail: 0, na: 0, unchecked: 0 };
    for (const x of checks) c[x.status]++;
    return c;
  }, [checks]);
  const groups = useMemo(() => {
    const m = new Map<string, { name: string; items: RuleCheckDto[] }>();
    for (const x of checks) {
      if (filter !== "all" && x.status !== filter) continue;
      const g = m.get(x.category) ?? { name: x.categoryName, items: [] };
      g.items.push(x);
      m.set(x.category, g);
    }
    return [...m.values()];
  }, [checks, filter]);
  if (!checks.length) return null;
  const checked = checks.length - counts.unchecked;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Checklist theo rule <span className="font-normal text-muted-foreground">({checked}/{checks.length} đã kiểm tra)</span></CardTitle>
        <CardDescription>Mỗi rule của framework một dòng. “Vi phạm” luôn khớp một finding; “Chưa kiểm tra” nghĩa là AI không báo cáo rule đó, không được hiểu là đạt.</CardDescription>
      </CardHeader>
      <CardContent>
        <div role="group" aria-label="Lọc theo trạng thái" className="mb-3 flex flex-wrap gap-2">
          <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")} className={cn("rounded-full border px-3 py-1 text-xs", filter === "all" && "border-primary bg-info-bg text-info-fg")}>Tất cả {checks.length}</button>
          {(Object.keys(ST) as Status[]).map((s) => (
            <button key={s} type="button" aria-pressed={filter === s} disabled={!counts[s]} onClick={() => setFilter(filter === s ? "all" : s)}
              className={cn("rounded-full border px-3 py-1 text-xs disabled:opacity-40", filter === s && "border-primary bg-info-bg text-info-fg")}>{ST[s].label} {counts[s]}</button>
          ))}
        </div>
        {groups.map((g) => (
          <section key={g.name} className="border-t py-3 first:border-0">
            <h3 className="mb-1.5 text-sm font-semibold">{g.name}</h3>
            <ul className="flex flex-col gap-1.5">
              {g.items.map((x) => (
                <li key={x.ruleId} className="flex items-start gap-2.5 text-sm">
                  <StatusDot s={x.status} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-muted-foreground">{x.ruleId}</span><span>{x.title}</span>{x.status === "fail" && <SeverityBadge severity={x.severity} />}</span>
                    {x.note && <span className={cn("block text-xs", x.status === "unchecked" ? "text-warning-fg" : "text-muted-foreground")}>{x.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {groups.length === 0 && <p className="text-sm text-muted-foreground">Không có rule nào ở trạng thái này.</p>}
      </CardContent>
    </Card>
  );
}

/** Mọi file MR đổi: file nào đã tới AI, file nào bị bỏ qua, và finding gắn theo file. */
export function FileCoverage({ files, findings }: { files: FileReviewDto[]; findings: FindingDto[] }) {
  const [onlyIssues, setOnlyIssues] = useState(false);
  const byFile = useMemo(() => {
    const m = new Map<string, FindingDto[]>();
    for (const f of findings) if (f.file && f.kind === "issue") m.set(f.file, [...(m.get(f.file) ?? []), f]);
    return m;
  }, [findings]);
  if (!files.length) return null;
  const skipped = files.filter((f) => !f.reviewed).length;
  const rows = [...files].sort((a, b) => Number(a.reviewed) - Number(b.reviewed) || (byFile.get(b.path)?.length ?? 0) - (byFile.get(a.path)?.length ?? 0) || b.additions + b.deletions - (a.additions + a.deletions))
    .filter((f) => !onlyIssues || byFile.has(f.path) || !f.reviewed);
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-baseline justify-between gap-2">
        <div><CardTitle>File trong MR <span className="font-normal text-muted-foreground">({files.length - skipped}/{files.length} đã gửi cho AI)</span></CardTitle>
          <CardDescription>File bị bỏ qua (vượt ngân sách diff) không được AI xem trong diff; điểm không phản ánh chúng.</CardDescription></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} />Chỉ file có vấn đề / bị bỏ qua</label>
      </CardHeader>
      <CardContent>
        <ul className="divide-y rounded-lg border">
          {rows.map((f) => {
            const fs = byFile.get(f.path) ?? [];
            return (
              <li key={f.path} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2 text-sm">
                <span className="min-w-0 flex-1 break-all font-mono text-xs">{f.path}</span>
                {!f.reviewed && <Badge variant="warning">Bị bỏ qua</Badge>}
                {f.binary ? <span className="text-xs text-muted-foreground">binary</span> : <span className="font-mono text-xs tabular-nums"><span className="text-success-fg">+{f.additions}</span> <span className="text-danger-fg">−{f.deletions}</span></span>}
                {fs.length > 0 && <span className="inline-flex gap-1">{fs.slice(0, 4).map((x) => <SeverityBadge key={x.id} severity={x.severity} />)}{fs.length > 4 && <span className="text-xs text-muted-foreground">+{fs.length - 4}</span>}</span>}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

const KIND: Record<string, string> = { asdlc: "Cấu hình ASDLC", instructions: "Hướng dẫn cho agent (AGENTS/CLAUDE…)", docs: "Tài liệu", skills: "Skills / lệnh", agents: "Subagent", config: "Cấu hình lint/build" };
const fmtKb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`);

/** Mọi file harness của repo được nạp vào review: nạp đủ hay không, AI có dẫn chiếu không. */
export function HarnessLoad({ load }: { load: HarnessLoadDto | null }) {
  const groups = useMemo(() => {
    const m = new Map<string, HarnessLoadDto["items"]>();
    for (const i of load?.items ?? []) m.set(i.kind, [...(m.get(i.kind) ?? []), i]);
    return [...m.entries()];
  }, [load]);
  if (!load || !load.items.length) return null;
  const loaded = load.items.filter((i) => i.loaded).length;
  const bad = load.items.filter((i) => !i.loaded || i.truncated);
  const cited = load.items.filter((i) => i.cited).length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Harness đã nạp <span className="font-normal text-muted-foreground">({loaded}/{load.items.length} file · {fmtKb(load.loadedChars)} · AI dẫn chiếu {cited})</span></CardTitle>
        <CardDescription>Toàn bộ file luật/tài liệu của repo được nạp đầy đủ, không cắt theo ngân sách nhỏ. Quét {load.totalRepoFiles} file đã được git theo dõi.</CardDescription>
      </CardHeader>
      <CardContent>
        {bad.length > 0 && <p role="alert" className="mb-3 rounded-lg border border-warning bg-warning-bg px-3.5 py-2.5 text-[13px] text-warning-fg">{bad.length} file chưa nạp đủ: {bad.slice(0, 3).map((b) => b.path).join(", ")}{bad.length > 3 ? ` +${bad.length - 3}` : ""}. Xem lý do ở danh sách bên dưới.</p>}
        {groups.map(([kind, items]) => (
          <details key={kind} open={items.length <= 8} className="border-t py-2 first:border-0">
            <summary className="cursor-pointer select-none text-sm font-semibold">{KIND[kind] ?? kind} <span className="font-normal text-muted-foreground">({items.length})</span></summary>
            <ul className="mt-1.5 flex flex-col gap-1">
              {items.map((i) => (
                <li key={i.path} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                  <span className="min-w-0 flex-1 break-all font-mono">{i.path}</span>
                  <span className="tabular-nums text-muted-foreground">{fmtKb(i.size)}</span>
                  {i.cited && <Badge variant="info">AI dẫn chiếu</Badge>}
                  {!i.loaded ? <Badge variant="danger" title={i.reason}>Chưa nạp</Badge> : i.truncated ? <Badge variant="warning" title={i.reason}>Bị cắt</Badge> : <Badge variant="success">Nạp đủ</Badge>}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </CardContent>
    </Card>
  );
}
