import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

/** Màu điểm (A–F), mức độ finding và trạng thái — khớp token trong index.css. */
const badgeVariants = cva("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-px text-xs font-medium leading-5", {
  variants: {
    variant: {
      secondary: "bg-secondary text-secondary-foreground",
      success: "bg-success-bg text-success-fg",
      lime: "bg-lime-bg text-lime-fg",
      warning: "bg-warning-bg text-warning-fg",
      orange: "bg-orange-bg text-orange-fg",
      danger: "bg-danger-bg text-danger-fg",
      info: "bg-info-bg text-info-fg",
      blocker: "bg-danger text-white dark:text-zinc-950",
      outline: "border border-input text-foreground",
    },
  },
  defaultVariants: { variant: "secondary" },
});

export function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

const GRADE: Record<string, VariantProps<typeof badgeVariants>["variant"]> = { A: "success", B: "lime", C: "warning", D: "orange", F: "danger" };
export function GradeBadge({ grade, score }: { grade: string | null | undefined; score?: number | null }) {
  if (!grade) return <Badge>—</Badge>;
  return <Badge variant={GRADE[grade] ?? "secondary"} className="tabular-nums">{grade}{score != null && ` · ${Math.round(score)}`}</Badge>;
}

const SEVERITY: Record<string, VariantProps<typeof badgeVariants>["variant"]> = { blocker: "blocker", critical: "danger", major: "orange", minor: "warning", nit: "secondary" };
export function SeverityBadge({ severity }: { severity: string }) {
  return <Badge variant={SEVERITY[severity] ?? "secondary"} className="capitalize">{severity}</Badge>;
}
