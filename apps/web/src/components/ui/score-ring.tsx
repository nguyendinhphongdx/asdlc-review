import { cn } from "@/lib/utils";

const C = 2 * Math.PI * 54;
export function ScoreRing({ score, className }: { score: number; className?: string }) {
  const color = score >= 80 ? "var(--success)" : score >= 70 ? "var(--chart-3)" : "var(--danger)";
  return (
    <div className={cn("relative size-[132px] shrink-0", className)}>
      <svg viewBox="0 0 132 132" className="size-full" role="img" aria-label={`Điểm ${Math.round(score)} trên 100`}>
        <circle cx="66" cy="66" r="54" fill="none" stroke="var(--secondary)" strokeWidth="12" />
        <circle cx="66" cy="66" r="54" fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(score / 100) * C} ${C}`} transform="rotate(-90 66 66)" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-4xl font-bold tracking-tight tabular-nums">{Math.round(score)}</span>
        <span className="mt-1 text-xs text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}
