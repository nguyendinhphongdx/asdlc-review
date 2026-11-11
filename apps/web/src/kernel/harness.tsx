import type { HarnessItemStatus, HarnessReportDto } from "@mrd/contracts";
import { Check, CircleAlert, CircleDashed } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScoreRing } from "@/components/ui/score-ring";
import { cn } from "@/lib/utils";
import { fmtDate } from "./format.js";

const LEVEL = {
  good: { label: "Tốt", variant: "success", color: "var(--success)" },
  fair: { label: "Khá", variant: "warning", color: "var(--chart-3)" },
  poor: { label: "Yếu", variant: "danger", color: "var(--danger)" },
} as const;
const ITEM: Record<HarnessItemStatus, { label: string; variant: "success" | "warning" | "danger"; tone: string; Icon: typeof Check }> = {
  ok: { label: "Đạt", variant: "success", tone: "bg-success-bg text-success-fg", Icon: Check },
  partial: { label: "Một phần", variant: "warning", tone: "bg-warning-bg text-warning-fg", Icon: CircleDashed },
  missing: { label: "Thiếu", variant: "danger", tone: "bg-danger-bg text-danger-fg", Icon: CircleAlert },
};

/** Độ phủ harness: vòng điểm 0–100 + từng hạng mục và gợi ý. `compact` bỏ danh sách mục đã đạt. Chỉ để gợi ý, không chặn MR. */
export function HarnessPanel({ report, compact }: { report: HarnessReportDto; compact?: boolean }) {
  const lv = LEVEL[report.level];
  const items = compact ? report.items.filter((i) => i.status !== "ok") : report.items;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-5">
        <ScoreRing score={report.score} color={lv.color} label={`Độ phủ harness ${Math.round(report.score)} trên 100`} className="size-[104px]" />
        <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-1.5 text-sm">
          <div className="flex flex-wrap items-center gap-2"><span className="font-medium">Độ phủ harness</span><Badge variant={lv.variant}>{lv.label}</Badge></div>
          <p className="text-[13px] text-muted-foreground">Chỉ để gợi ý, không chặn MR. Quét lúc {fmtDate(report.scannedAt)}.</p>
          {report.repoConfig.present && (report.repoConfig.valid
            ? <p className="text-xs text-muted-foreground">.asdlc.yml hợp lệ và đang được áp dụng.</p>
            : <p role="alert" className="text-xs text-warning-fg">.asdlc.yml lỗi nên bị bỏ qua{report.repoConfig.error ? `: ${report.repoConfig.error}` : "."}</p>)}
        </div>
      </div>
      {items.length === 0 ? <p className="text-sm text-muted-foreground">Mọi hạng mục đều đạt.</p> : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {items.map((i) => {
            const s = ITEM[i.status];
            return (
              <li key={i.id} className="flex gap-3 px-4 py-3">
                <span className={cn("mt-0.5 flex size-5 flex-none items-center justify-center rounded-full", s.tone)} aria-hidden="true"><s.Icon className="size-3" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{i.label}</span><Badge variant={s.variant}>{s.label}</Badge><span className="ml-auto text-xs tabular-nums text-muted-foreground">{i.points}/{i.max} điểm</span></div>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">{i.detail}</p>
                  {i.hint && i.status !== "ok" && <p className="mt-1 rounded-md bg-info-bg px-2.5 py-1.5 text-[13px] text-info-fg"><b>Gợi ý.</b> {i.hint}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
