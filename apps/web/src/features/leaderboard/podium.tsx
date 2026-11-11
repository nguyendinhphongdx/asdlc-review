import type { LeaderboardRow } from "@mrd/contracts";
import { ArrowDown, ArrowUp } from "lucide-react";
import { initials } from "@/components/ui/avatar";
import { useCountUp } from "@/hooks/use-count-up";
import { cn } from "@/lib/utils";
import { fmtScore } from "../../kernel/format.js";
import { CrownIcon, Eyebrow, PodiumBlock } from "./stage.js";

const PLACE = [
  { ord: "1st", id: "a", c1: "#fbbf24", c2: "#b45309", gems: ["#ef4444", "#34d399", "#38bdf8"] as [string, string, string], block: 196, crown: "w-16", avatar: "size-24 text-3xl", top: 0, delay: 0.45 },
  { ord: "2nd", id: "b", c1: "#cbd5e1", c2: "#64748b", gems: ["#38bdf8", "#e2e8f0", "#e2e8f0"] as [string, string, string], block: 150, crown: "w-12", avatar: "size-20 text-2xl", top: 56, delay: 0.2 },
  { ord: "3rd", id: "c", c1: "#e0955a", c2: "#7c3f17", gems: ["#34d399", "#fcd9b8", "#fcd9b8"] as [string, string, string], block: 126, crown: "w-12", avatar: "size-20 text-2xl", top: 92, delay: 0 },
] as const;

export function PodiumSlot({ row, place, title }: { row: LeaderboardRow; place: 0 | 1 | 2; title: string }) {
  const m = PLACE[place];
  const score = useCountUp(row.rankScore ?? 0, 1400, m.delay * 1000 + 300);
  const imp = row.improvement ?? 0;
  const up = imp >= 0;
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center" style={{ marginTop: m.top }}>
      <div className="anim-pop flex flex-col items-center" style={{ animationDelay: `${m.delay + 0.35}s` }}>
        <CrownIcon id={m.id} c1={m.c1} c2={m.c2} gems={m.gems} className={cn("anim-float", m.crown)} />
        <div className="relative mt-0.5">
          <span className={cn("flex rounded-full p-[3px]", place === 0 && "anim-glow")} style={{ background: `conic-gradient(${m.c1}, color-mix(in oklab, ${m.c1} 25%, #0b1030), ${m.c1})`, boxShadow: `0 0 28px ${m.c1}66` }}>
            <span className={cn("flex items-center justify-center rounded-full font-bold text-white", m.avatar)} style={{ background: "radial-gradient(circle at 30% 25%, #2b3590, #111743)" }}>{initials(row.name)}</span>
          </span>
          <span className="absolute -bottom-1 -right-1.5 flex size-7 items-center justify-center text-[11px] font-extrabold text-white" style={{ background: "linear-gradient(160deg, #ec4899, #a855f7)", clipPath: "polygon(50% 0, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)" }} title={`${row.mrCount} MR`}>{row.mrCount}</span>
        </div>
        <div className="mt-3.5 max-w-full truncate px-1 text-lg font-bold text-white">@{row.usernames[0] ?? row.name}</div>
        <Eyebrow className="mt-0.5" ><span style={{ color: m.c1 }}>{title}</span></Eyebrow>
        <div className="mt-2 inline-flex items-baseline gap-2 tabular-nums">
          <span className={cn("font-extrabold leading-none text-white", place === 0 ? "text-3xl" : "text-2xl")}>{score.toFixed(1)}</span>
          <span className={cn("inline-flex items-center gap-0.5 rounded-full bg-white/10 px-2 py-px text-xs font-semibold", up ? "text-emerald-400" : "text-red-400")}>{up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}{fmtScore(Math.abs(imp))}</span>
        </div>
      </div>
      <div className="anim-rise mt-3.5 w-full" style={{ animationDelay: `${m.delay}s` }}>
        <PodiumBlock id={m.id} color={m.c1} height={m.block} ord={m.ord} />
      </div>
    </div>
  );
}
