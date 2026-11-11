import { cn } from "@/lib/utils";

/** Vương miện có ngọc; màu theo hạng. */
export function CrownIcon({ id, c1, c2, gems, className }: { id: string; c1: string; c2: string; gems: [string, string, string]; className?: string }) {
  return (
    <svg viewBox="0 0 64 50" aria-hidden="true" className={className} style={{ filter: `drop-shadow(0 0 16px ${c1}99)` }}>
      <defs><linearGradient id={`cg-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c1} /><stop offset="1" stopColor={c2} /></linearGradient></defs>
      <path d="M6 40 2 12l15 13L32 4l15 21 15-13-4 28z" fill={`url(#cg-${id})`} stroke="rgb(255 255 255 / .55)" strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="6" y="40" width="52" height="8" rx="3" fill={`url(#cg-${id})`} stroke="rgb(255 255 255 / .55)" strokeWidth="1.5" />
      <circle cx="2" cy="11" r="3.2" fill="#fff" /><circle cx="32" cy="4" r="3.6" fill="#fff" /><circle cx="62" cy="11" r="3.2" fill="#fff" />
      <circle cx="32" cy="30" r="4.2" fill={gems[0]} stroke="#fff" strokeOpacity=".6" />
      <circle cx="17" cy="44" r="2.4" fill={gems[1]} /><circle cx="32" cy="44" r="2.4" fill={gems[2]} /><circle cx="47" cy="44" r="2.4" fill={gems[1]} />
    </svg>
  );
}

/** Bục 3D: mặt trước + mặt trên + mặt hông, chữ hạng nổi. */
export function PodiumBlock({ id, color, height, ord }: { id: string; color: string; height: number; ord: string }) {
  const H = height + 34;
  return (
    <svg width="100%" height={H} viewBox={`0 0 270 ${H}`} preserveAspectRatio="none" aria-hidden="true" className="block">
      <defs>
        <linearGradient id={`f-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#232d78" /><stop offset=".5" stopColor="#151c55" /><stop offset="1" stopColor="#0a0f2e" /></linearGradient>
        <linearGradient id={`t-${id}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor={color} stopOpacity=".55" /><stop offset="1" stopColor="#fff" stopOpacity=".35" /></linearGradient>
        <linearGradient id={`s-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0f1540" /><stop offset="1" stopColor="#050818" /></linearGradient>
        <linearGradient id={`x-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".55" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient>
      </defs>
      <polygon points="0,30 34,0 270,0 236,30" fill={`url(#t-${id})`} />
      <polygon points={`236,30 270,0 270,${H - 34} 236,${H}`} fill={`url(#s-${id})`} />
      <rect x="0" y="30" width="236" height={H - 30} fill={`url(#f-${id})`} />
      <line x1="0" y1="30.5" x2="236" y2="30.5" stroke={color} strokeOpacity=".8" strokeWidth="1.5" />
      <text x="118" y={Math.min(150, H - 30)} textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="900" fontStyle="italic" fontSize="92" fill={`url(#x-${id})`} stroke={color} strokeOpacity=".35" strokeWidth="2">{ord}</text>
    </svg>
  );
}

const SPARKS: [number, number, number, number, string][] = [
  [6, 14, 14, 0, "#fff"], [14, 40, 10, 0.6, "#a5b4fc"], [22, 8, 12, 1.2, "#fff"], [38, 22, 9, 0.3, "#fbbf24"], [61, 10, 13, 0.9, "#fff"],
  [72, 34, 10, 1.5, "#a5b4fc"], [86, 16, 14, 0.4, "#fff"], [93, 44, 9, 1.1, "#fbbf24"], [8, 62, 9, 1.8, "#fff"], [90, 70, 12, 0.2, "#a5b4fc"],
];
export function Sparkles() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {SPARKS.map(([x, y, s, d, c], i) => (
        <svg key={i} className="anim-twinkle absolute" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${d}s` }} width={s} height={s} viewBox="0 0 24 24">
          <path fill={c} d="M12 0c.6 7 5 11.4 12 12-7 .6-11.4 5-12 12-.6-7-5-11.4-12-12 7-.6 11.4-5 12-12z" />
        </svg>
      ))}
    </div>
  );
}

export function Spotlights() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute top-0 h-[560px] w-[36%]" style={{ left: "14%", background: "linear-gradient(180deg, rgb(165 180 252 / .22), transparent 85%)", clipPath: "polygon(40% 0, 60% 0, 100% 100%, 0 100%)" }} />
      <div className="absolute top-0 h-[520px] w-[24%]" style={{ left: "40%", background: "linear-gradient(180deg, rgb(251 191 36 / .16), transparent 85%)", clipPath: "polygon(40% 0, 60% 0, 100% 100%, 0 100%)" }} />
    </div>
  );
}

export function GlassCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-[14px] border border-white/10 bg-white/5 backdrop-blur-sm", className)}>{children}</div>;
}
export const Eyebrow = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("text-[11px] font-semibold uppercase tracking-[0.1em] text-white/45", className)}>{children}</div>
);
