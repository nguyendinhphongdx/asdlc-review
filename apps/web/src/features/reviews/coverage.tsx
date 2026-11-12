import type { HarnessLoadDto, RuleCheckDto } from "@mrd/contracts";
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
        <CardDescription>Framework là bộ chuẩn chung; ngoài ra app tự nhận diện luật riêng của repo theo tên file và theo liên kết giữa các tài liệu, không bắt repo theo cấu trúc cố định, và nạp đầy đủ. AI còn tự khám phá thêm khi review. Quét {load.totalRepoFiles} file.</CardDescription>
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
                  {i.via && <span className="text-muted-foreground" title={`Tìm thấy qua liên kết từ ${i.via}`}>← {i.via.split("/").pop()}</span>}
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
