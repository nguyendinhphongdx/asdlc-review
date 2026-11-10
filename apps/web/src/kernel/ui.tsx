import clsx from "clsx";
import type { ReactNode } from "react";
import { fmtScore, gradeColor, sevColor } from "./format.js";

export const Card = ({ title, children, className, right }: { title?: string; children: ReactNode; className?: string; right?: ReactNode }) => (
  <section className={clsx("rounded-xl border border-slate-200 bg-white p-4 shadow-sm", className)}>
    {(title || right) && (
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        {right}
      </div>
    )}
    {children}
  </section>
);

export const Stat = ({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
    <div className="mt-1 text-2xl font-semibold">{value}</div>
    {hint && <div className="mt-0.5 text-xs text-slate-400">{hint}</div>}
  </div>
);

export const Badge = ({ children, className }: { children: ReactNode; className?: string }) => (
  <span className={clsx("inline-block rounded-md px-2 py-0.5 text-xs font-medium", className)}>{children}</span>
);
export const GradeBadge = ({ grade, score }: { grade: string | null; score?: number | null }) => (
  <Badge className={gradeColor(grade)}>{grade ?? "–"}{score !== undefined && ` · ${fmtScore(score)}`}</Badge>
);
export const SeverityBadge = ({ severity }: { severity: string }) => <Badge className={sevColor(severity)}>{severity}</Badge>;

export const Button = ({ children, onClick, disabled, variant = "primary", type = "button" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; variant?: "primary" | "ghost"; type?: "button" | "submit" }) => (
  <button type={type} onClick={onClick} disabled={disabled}
    className={clsx("rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50", variant === "primary" ? "bg-indigo-600 text-white hover:bg-indigo-700" : "border border-slate-300 hover:bg-slate-100")}>
    {children}
  </button>
);

export const Loading = () => <div className="p-6 text-sm text-slate-500">Đang tải…</div>;
export const ErrorBox = ({ error }: { error: unknown }) => (
  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error instanceof Error ? error.message : String(error)}</div>
);
export const Empty = ({ children }: { children: ReactNode }) => <div className="p-6 text-center text-sm text-slate-400">{children}</div>;
export const PageHeader = ({ title, children }: { title: string; children?: ReactNode }) => (
  <div className="mb-4 flex items-center justify-between"><h1 className="text-xl font-semibold">{title}</h1><div className="flex items-center gap-2">{children}</div></div>
);
export const inputCls = "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm";
