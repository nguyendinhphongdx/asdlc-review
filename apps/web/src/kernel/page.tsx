import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const PageHeader = ({ title, description, children }: { title: string; description?: string; children?: ReactNode }) => (
  <div className="flex flex-wrap items-end justify-between gap-4">
    <div>
      <h1 className="text-2xl font-semibold leading-8 tracking-tight">{title}</h1>
      {description && <p className="mt-1 text-muted-foreground">{description}</p>}
    </div>
    {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
  </div>
);

export const Stat = ({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "danger" }) => (
  <Card className="flex flex-col gap-2.5 p-5">
    <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
    <span className={cn("text-3xl font-semibold leading-none tracking-tight tabular-nums", tone === "danger" && "text-danger")}>{value}</span>
    {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
  </Card>
);

export const Loading = () => <div className="p-8 text-sm text-muted-foreground">Đang tải…</div>;
export const Empty = ({ children }: { children: ReactNode }) => <div className="px-6 py-12 text-center text-sm text-muted-foreground">{children}</div>;
export const ErrorBox = ({ error }: { error: unknown }) => (
  <div role="alert" className="rounded-lg border border-danger bg-danger-bg p-3 text-sm text-danger-fg">{error instanceof Error ? error.message : String(error)}</div>
);
