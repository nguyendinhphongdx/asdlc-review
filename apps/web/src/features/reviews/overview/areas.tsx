import type { AreaReportDto, ChangeAreaDto, DesignReviewDto } from "@mrd/contracts";
import { Boxes, ChevronRight, History, Network } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const VERDICT: Record<DesignReviewDto["verdict"], { label: string; variant: "success" | "warning" | "danger" }> = {
  accept: { label: "Thiết kế ổn", variant: "success" }, conditional: { label: "Chấp nhận có điều kiện", variant: "warning" }, rework: { label: "Cần làm lại", variant: "danger" },
};
const CONCERN_TONE: Record<string, string> = { major: "bg-chart-3", minor: "bg-chart-2", info: "bg-muted-foreground/60" };

const riskTone = (r: number) => (r >= 0.5 ? { bar: "bg-danger", label: "Rủi ro cao" } : r >= 0.25 ? { bar: "bg-warning", label: "Rủi ro vừa" } : { bar: "bg-muted-foreground/50", label: "Rủi ro thấp" });

function AreaRow({ a, pass, focus, onOpenFile }: { a: ChangeAreaDto; pass?: AreaReportDto["passes"][number] | undefined; focus: boolean; onOpenFile?: ((path: string) => void) | undefined }) {
  const t = riskTone(a.risk);
  return (
    <li className="flex flex-col gap-1.5 rounded-lg border bg-card px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button type="button" onClick={() => onOpenFile?.(a.files[0]?.path ?? "")} className="min-w-0 truncate text-left font-mono text-[13px] font-semibold hover:underline" title={`Mở ${a.files[0]?.path ?? ""}`}>{a.label}</button>
        {focus && <Badge variant="warning">Trọng tâm thiết kế</Badge>}
        <span className="text-xs text-muted-foreground tabular-nums">{a.files.length} file · <span className="text-success-fg">+{a.additions}</span> <span className="text-danger-fg">-{a.deletions}</span></span>
        <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground" title={`${t.label} (${a.risk})`}>
          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden="true"><span className={cn("block h-full rounded-full", t.bar)} style={{ width: `${Math.max(8, Math.round(a.risk * 100))}%` }} /></span>
          {t.label}
        </span>
      </div>
      {(a.riskReasons.length > 0 || a.dependsOn.length > 0 || pass) && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {a.riskReasons.map((r) => <span key={r} className="rounded bg-muted px-1.5 py-0.5">{r}</span>)}
          {a.dependsOn.length > 0 && <span className="inline-flex items-center gap-1"><Network className="size-3" aria-hidden="true" />import tới {a.dependsOn.join(", ")}</span>}
          {pass && <span className="ml-auto tabular-nums">{pass.findings} finding{pass.costUsd != null ? ` · $${pass.costUsd.toFixed(2)}` : ""}{pass.omitted.length ? ` · ${pass.omitted.length} file chưa soi` : ""}</span>}
        </div>
      )}
    </li>
  );
}

/** Khu vực thay đổi (T0) và, với MR lớn, thiết kế hiện tại (T2), đánh giá thiết kế (T3), kết quả từng khu vực (T4). */
export function AreaReport({ report, onOpenFile }: { report: AreaReportDto | null; onOpenFile?: (path: string) => void }) {
  if (!report || (report.areas.length < 2 && !report.design)) return null;
  const d = report.design;
  const passBy = new Map(report.passes.map((p) => [p.area, p]));
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center gap-2">
        <Boxes className="size-4 text-muted-foreground" aria-hidden="true" />
        <CardTitle>Khu vực thay đổi</CardTitle>
        <span className="text-xs text-muted-foreground">{report.areas.length} khu vực · {report.split ? "review theo khu vực" : "review một lượt"}</span>
        {d && <Badge variant={VERDICT[d.verdict].variant} className="ml-auto">{VERDICT[d.verdict].label}</Badge>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {report.split && <p className="text-[13px] text-muted-foreground">MR lớn nên được chia nhỏ: {report.reason}. Mỗi khu vực được review riêng rồi ghép lại, nhờ vậy không phải bỏ file.</p>}
        {d && (
          <div className="flex flex-col gap-2 text-sm">
            {d.summary && <p>{d.summary}</p>}
            {d.concerns.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {d.concerns.map((c, i) => (
                  <li key={i} className="flex gap-2 text-[13px]"><span className={cn("mt-1.5 size-2 shrink-0 rounded-full", CONCERN_TONE[c.severity])} aria-hidden="true" /><span className="min-w-0"><span className="font-medium">{c.area ?? "Liên khu vực"}: </span>{c.text}</span></li>
                ))}
              </ul>
            )}
            {d.splitSuggestion && <p className="rounded-lg border border-warning bg-warning-bg px-3 py-2 text-[13px] text-warning-fg"><span className="font-semibold">Gợi ý tách MR: </span>{d.splitSuggestion}</p>}
          </div>
        )}
        <ul className="flex flex-col gap-2">
          {report.areas.map((a) => <AreaRow key={a.id} a={a} pass={passBy.get(a.label)} focus={!!d?.focus.includes(a.label)} onOpenFile={onOpenFile} />)}
        </ul>
        {report.maps.length > 0 && (
          <details className="group text-[13px]">
            <summary className="flex cursor-pointer list-none items-center gap-1 font-medium"><ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden="true" />Thiết kế hiện tại của từng khu vực (trước MR)</summary>
            <div className="mt-2 flex flex-col gap-3">
              {report.maps.map((m) => (
                <div key={m.area} className="rounded-lg border bg-muted/30 px-3 py-2">
                  <div className="mb-1 flex items-center gap-2 font-mono text-xs font-semibold">{m.area}{m.cached && <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-sans font-normal text-muted-foreground"><History className="size-3" aria-hidden="true" />dùng lại bản đã lưu</span>}</div>
                  <p className="whitespace-pre-wrap text-muted-foreground">{m.text}</p>
                </div>
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
