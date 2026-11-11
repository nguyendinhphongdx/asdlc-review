import type { FrameworkDetailDto } from "@mrd/contracts";
import { Lock } from "lucide-react";
import { useState } from "react";
import { Badge, SeverityBadge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const LockedBadge = ({ what = "bắt buộc" }: { what?: string }) => (
  <Badge variant="info" title="Quy tắc bảo mật nền: không thể tắt, hạ mức độ hay nới trần"><Lock className="size-3" aria-hidden="true" />{what}</Badge>
);

/** Hạng mục và rule (chỉ xem). */
export function RulesView({ d }: { d: FrameworkDetailDto }) {
  const [open, setOpen] = useState<string | null>(d.categories[0]?.id ?? null);
  const total = d.categories.reduce((s, c) => s + c.weight, 0) || 1;
  const rules = d.categories.reduce((s, c) => s + c.criteria.length, 0);
  return (
    <Card>
      <CardHeader><CardTitle>Review cái gì</CardTitle><CardDescription>{d.categories.length} hạng mục, {rules} rule. Trọng số quyết định phần đóng góp vào điểm tổng.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-2">
        {d.categories.map((c) => {
          const isOpen = open === c.id;
          return (
            <div key={c.id} className="rounded-lg border">
              <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : c.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="flex-1 text-sm font-medium">{c.name}</span>
                <span className="text-xs text-muted-foreground">{c.criteria.length} rule</span>
                <span className="hidden w-24 sm:block"><span className="block h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${(c.weight / total) * 100}%` }} /></span></span>
                <span className="w-10 text-right text-xs font-semibold tabular-nums">{c.weight}</span>
              </button>
              {isOpen && (
                <ul className="divide-y border-t">
                  {c.criteria.map((k) => (
                    <li key={k.id} className={cn("px-4 py-3", !k.enabled && "opacity-60")}>
                      <div className="flex flex-wrap items-center gap-2"><code className="font-mono text-xs text-muted-foreground">{k.id}</code><span className="text-sm font-medium">{k.title}</span><SeverityBadge severity={k.defaultSeverity} />{k.locked && <LockedBadge />}{!k.enabled && <Badge>Đang tắt</Badge>}</div>
                      <p className="mt-1 text-sm text-muted-foreground">{k.check}</p>
                      {k.why && <p className="mt-1 text-xs text-muted-foreground"><span className="font-medium text-foreground">Hỏi tác giả:</span> {k.why}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/** Cách chấm điểm (chỉ xem). */
export function ScoringView({ d }: { d: FrameworkDetailDto }) {
  return (
    <Card>
      <CardHeader><CardTitle>Cách chấm điểm</CardTitle><CardDescription>Mỗi hạng mục bắt đầu 100 điểm; điểm tổng là trung bình có trọng số, sau đó áp gate.</CardDescription></CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-3">
        <div><h3 className="mb-2 text-sm font-medium">Mức độ và điểm trừ</h3><ul className="flex flex-col gap-2">{Object.entries(d.severity).map(([k, v]) => (
          <li key={k} className="text-sm"><div className="flex items-center gap-2"><SeverityBadge severity={k} /><span className="tabular-nums text-muted-foreground">−{v.deduction}</span></div><p className="mt-0.5 text-xs text-muted-foreground">{v.description}</p></li>))}</ul></div>
        <div><h3 className="mb-2 text-sm font-medium">Gate chặn điểm</h3><ul className="flex flex-col gap-2">{d.gates.map((g) => (
          <li key={g.id} className="text-sm"><span className="font-semibold tabular-nums">≤ {g.capTotal}</span> <span className="text-muted-foreground">{g.reason}</span> {g.locked && <LockedBadge />}</li>))}</ul>
          <p className="mt-3 text-xs text-muted-foreground">Với minor/nit, điểm trừ được chia cho √(dòng thay đổi / {d.sizeBaseline}) để MR lớn không bị phạt dồn.</p></div>
        <div><h3 className="mb-2 text-sm font-medium">Xếp loại</h3><ul className="flex flex-col gap-1">{d.grades.map((g) => (<li key={g.grade} className="flex justify-between text-sm"><span className="font-semibold">{g.grade}</span><span className="tabular-nums text-muted-foreground">≥ {g.min}</span></li>))}</ul></div>
      </CardContent>
    </Card>
  );
}
