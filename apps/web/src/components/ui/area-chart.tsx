/** Biểu đồ vùng bằng SVG thuần, dùng token --chart-1. */
export function AreaChart({ data, min = 0, max = 100 }: { data: { label: string; value: number | null }[]; min?: number; max?: number }) {
  const W = 660, H = 236, L = 40, R = 20, T = 16, B = 36;
  const pts = data.filter((d) => d.value != null) as { label: string; value: number }[];
  if (!pts.length) return <div className="py-16 text-center text-sm text-muted-foreground">Chưa có dữ liệu</div>;
  const lo = Math.min(min, Math.floor(Math.min(...pts.map((p) => p.value)) / 10) * 10 - 0);
  const span = max - lo || 1;
  const x = (i: number) => (pts.length === 1 ? (L + W - R) / 2 : L + 20 + (i * (W - L - R - 40)) / (pts.length - 1));
  const y = (v: number) => T + ((max - v) / span) * (H - T - B);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(pts.length - 1).toFixed(1)} ${H - B} L${x(0).toFixed(1)} ${H - B} Z`;
  const ticks = Array.from({ length: 5 }, (_, i) => Math.round(max - (i * span) / 4));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Biểu đồ điểm trung bình theo tuần">
      <defs>
        <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--chart-1)" stopOpacity="0.22" />
          <stop offset="1" stopColor="var(--chart-1)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--border)" />
          <text x={L - 10} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted-foreground)">{t}</text>
        </g>
      ))}
      <path d={area} fill="url(#area-fill)" />
      <path d={line} fill="none" stroke="var(--chart-1)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <g key={p.label}>
          <circle cx={x(i)} cy={y(p.value)} r={i === pts.length - 1 ? 5.5 : 4.5} fill={i === pts.length - 1 ? "var(--chart-1)" : "var(--card)"} stroke="var(--chart-1)" strokeWidth="2.5" />
          <text x={x(i)} y={y(p.value) - 12} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--foreground)">{Math.round(p.value)}</text>
          <text x={x(i)} y={H - 12} textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">{p.label}</text>
        </g>
      ))}
    </svg>
  );
}
