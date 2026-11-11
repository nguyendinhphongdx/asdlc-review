import type { RunActivityEntry } from "@mrd/contracts";
import { Brain, CircleAlert, Check, FileSearch, Info } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { stageLabel } from "../../kernel/stages.js";

const ICON = { info: Info, tool: FileSearch, ai: Brain, warn: CircleAlert, done: Check } as const;
const TONE = { info: "text-muted-foreground", tool: "text-info-fg", ai: "text-primary", warn: "text-danger-fg", done: "text-success-fg" } as const;
const time = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { hour12: false });

/** Nhật ký hoạt động của review: AI đọc file nào, đang ở bước nào. `live` tự cuộn xuống dòng mới nhất. */
export function ActivityLog({ entries, live }: { entries: RunActivityEntry[]; live?: boolean }) {
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => { if (live) end.current?.scrollIntoView({ block: "nearest" }); }, [entries.length, live]);
  if (!entries.length) return <p className="text-sm text-muted-foreground">{live ? "Đang chờ tín hiệu đầu tiên…" : "Review này không có nhật ký chi tiết."}</p>;
  return (
    <ol aria-live={live ? "polite" : "off"} aria-label="Nhật ký review" className="max-h-80 overflow-y-auto rounded-lg border bg-muted/30 p-3 font-mono text-xs leading-6">
      {entries.map((e, i) => {
        const Icon = ICON[e.level];
        return (
          <li key={`${e.at}-${i}`} className={cn("flex items-start gap-2", TONE[e.level])}>
            <Icon className="mt-1.5 size-3 shrink-0" aria-hidden="true" />
            <span className="shrink-0 tabular-nums text-muted-foreground">{time(e.at)}</span>
            <span className="shrink-0 text-muted-foreground">[{stageLabel(e.stage)}]</span>
            <span className="min-w-0 break-words">{e.message}</span>
          </li>
        );
      })}
      <li ref={end} aria-hidden="true" />
    </ol>
  );
}
