import type { UsageBucketDto, UsageDayDto, UsageSliceDto } from "@mrd/contracts";
import { useState } from "react";

/** Màu theo thực thể (thứ tự cố định), dùng token --chart-N của giao diện. */
export const SERIES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-5)", "var(--chart-3)", "var(--chart-4)", "var(--muted-foreground)"];
export const colorOf = (i: number) => SERIES[Math.min(i, SERIES.length - 1)]!;

export type Metric = "cost" | "tokens" | "runs";
export const fmtUsd = (n: number) => (n >= 100 ? `$${Math.round(n)}` : n >= 10 ? `$${n.toFixed(1)}` : `$${n.toFixed(2)}`);
export const fmtNum = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}k` : String(Math.round(n)));
const fmtMetric = (m: Metric, v: number) => (m === "cost" ? fmtUsd(v) : fmtNum(v));
const idx: Record<Metric, 0 | 1 | 2> = { cost: 0, tokens: 1, runs: 2 };
const niceMax = (v: number) => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); const f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };

/** Cột xếp chồng theo ngày, mỗi tầng một model; rê chuột xem chi tiết. */
export function DayChart({ days, metric, models }: { days: UsageDayDto[]; metric: Metric; models: string[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = 240, L = 44, R = 8, T = 10, B = 26;
  const top = models.slice(0, 5);
  const keyOf = (m: string) => (top.includes(m) ? m : "_other");
  const keys = models.length > 5 ? [...top, "_other"] : top;
  const stack = days.map((d) => {
    const acc: Record<string, number> = {};
    for (const [m, v] of Object.entries(d.models)) acc[keyOf(m)] = (acc[keyOf(m)] ?? 0) + v[idx[metric]];
    return acc;
  });
  const totals = stack.map((s) => Object.values(s).reduce((a, b) => a + b, 0));
  const max = niceMax(Math.max(...totals, 0));
  const bw = (W - L - R) / Math.max(days.length, 1);
  const bar = Math.min(24, bw * 0.7);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const step = Math.max(1, Math.ceil(days.length / 10));
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  if (!days.length || max === 1 && totals.every((t) => t === 0)) return <div className="flex h-48 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">Không có dữ liệu trong khoảng này</div>;
  const h = hover !== null ? days[hover] : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Biểu đồ cột theo ngày" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(max * t)} y2={y(max * t)} stroke="var(--border)" />
            <text x={L - 8} y={y(max * t) + 4} textAnchor="end" fontSize="11" fill="var(--muted-foreground)">{fmtMetric(metric, max * t)}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const cx = L + bw * i + bw / 2;
          let acc = 0;
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)}>
              <rect x={L + bw * i} y={T} width={bw} height={H - T - B} fill={hover === i ? "var(--muted)" : "transparent"} opacity={0.5} />
              {keys.map((k, ki) => {
                const v = stack[i]![k] ?? 0;
                if (v <= 0) return null;
                const y1 = y(acc + v), y0 = y(acc);
                acc += v;
                return <rect key={k} x={cx - bar / 2} y={y1} width={bar} height={Math.max(0, y0 - y1 - (ki ? 1.5 : 0))} rx={ki === keys.length - 1 || acc === totals[i] ? 3 : 0} fill={colorOf(k === "_other" ? 5 : models.indexOf(k))} />;
              })}
              {d.failed > 0 && metric !== "runs" && <circle cx={cx} cy={H - B + 9} r="2.5" fill="var(--chart-4)" />}
              {i % step === 0 && <text x={cx} y={H - 9} textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">{d.date.slice(8, 10)}/{d.date.slice(5, 7)}</text>}
            </g>
          );
        })}
      </svg>
      {h && hover !== null && (
        <div className="pointer-events-none absolute top-1 z-10 min-w-40 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md" style={{ left: `clamp(0px, calc(${((L + bw * hover + bw / 2) / W) * 100}% - 80px), calc(100% - 170px))` }}>
          <div className="mb-1 font-medium">{h.date.slice(8, 10)}/{h.date.slice(5, 7)}/{h.date.slice(0, 4)}</div>
          {Object.entries(h.models).sort((a, b) => b[1][idx[metric]] - a[1][idx[metric]]).map(([m, v]) => (
            <div key={m} className="flex items-center gap-2"><span className="size-2 rounded-sm" style={{ background: colorOf(top.includes(m) ? models.indexOf(m) : 5) }} /><span className="min-w-0 flex-1 truncate">{m}</span><b className="tabular-nums">{fmtMetric(metric, v[idx[metric]])}</b></div>
          ))}
          <div className="mt-1 flex justify-between border-t pt-1 text-muted-foreground"><span>{h.runs} run{h.failed ? ` · ${h.failed} lỗi` : ""}</span><span className="tabular-nums">{fmtUsd(h.costUsd)}</span></div>
        </div>
      )}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">{items.map((i) => <span key={i.label} className="flex items-center gap-1.5"><span className="size-2.5 rounded-[2px]" style={{ background: i.color }} />{i.label}</span>)}</div>;
}

/** Donut + chú thích có giá trị và %. */
export function Donut({ data, center, sub, metric }: { data: UsageSliceDto[]; center: string; sub: string; metric: "costUsd" | "runs" | "tokens" }) {
  const total = data.reduce((s, d) => s + d[metric], 0);
  const R = 52, S = 16, C = 2 * Math.PI * R;
  let off = 0;
  if (!total) return <p className="py-8 text-center text-sm text-muted-foreground">Chưa có dữ liệu</p>;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg viewBox="0 0 140 140" className="size-32 shrink-0" role="img" aria-label="Biểu đồ vành khuyên">
        <g transform="rotate(-90 70 70)">
          {data.map((d, i) => { const len = (d[metric] / total) * C; const el = <circle key={d.key} cx="70" cy="70" r={R} fill="none" stroke={colorOf(d.key === "_other" ? 5 : i)} strokeWidth={S} strokeDasharray={`${Math.max(0, len - 2)} ${C}`} strokeDashoffset={-off} />; off += len; return el; })}
        </g>
        <text x="70" y="68" textAnchor="middle" fontSize="16" fontWeight="600" fill="var(--foreground)">{center}</text>
        <text x="70" y="84" textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">{sub}</text>
      </svg>
      <ul className="flex min-w-40 flex-1 flex-col gap-1.5 text-xs">
        {data.map((d, i) => (
          <li key={d.key} className="flex items-center gap-2"><span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: colorOf(d.key === "_other" ? 5 : i) }} /><span className="min-w-0 flex-1 truncate" title={d.label}>{d.label}</span><span className="tabular-nums text-muted-foreground">{metric === "costUsd" ? fmtUsd(d.costUsd) : fmtNum(d[metric])} · {Math.round((d[metric] / total) * 100)}%</span></li>
        ))}
      </ul>
    </div>
  );
}

/** Cột ngang: so sánh nhiều mục theo chi phí. */
export function HBars({ data, color = "var(--chart-1)" }: { data: UsageSliceDto[]; color?: string }) {
  const max = Math.max(...data.map((d) => d.costUsd), 0.0001);
  if (!data.length) return <p className="py-8 text-center text-sm text-muted-foreground">Chưa có dữ liệu</p>;
  return (
    <ul className="flex flex-col gap-2.5">
      {data.map((d) => (
        <li key={d.key} className="flex items-center gap-2.5 text-xs">
          <span className="w-44 shrink-0 truncate" title={d.label}>{d.label}</span>
          <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-secondary"><span className="block h-full rounded-full" style={{ width: `${Math.max(2, (d.costUsd / max) * 100)}%`, background: d.key === "_other" ? "var(--muted-foreground)" : color }} /></span>
          <span className="w-24 shrink-0 text-right tabular-nums text-muted-foreground">{fmtUsd(d.costUsd)} · {d.runs} run</span>
        </li>
      ))}
    </ul>
  );
}

const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
/** Bản đồ nhiệt số run theo thứ × giờ (đậm hơn = nhiều run hơn). */
export function Heatmap({ heat }: { heat: number[][] }) {
  const max = Math.max(...heat.flat(), 1);
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div>
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: "24px repeat(24, minmax(0, 1fr))" }}>
        {order.map((d) => (
          <div key={d} className="contents">
            <span className="text-[11px] leading-none text-muted-foreground self-center">{WD[d]}</span>
            {heat[d]!.map((v, h) => <span key={h} title={`${WD[d]} ${h}h: ${v} run`} className="aspect-square rounded-[3px]" style={v ? { background: "var(--chart-1)", opacity: 0.18 + 0.82 * (v / max) } : { background: "var(--muted)" }} />)}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between pl-6 text-[11px] text-muted-foreground"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span></div>
    </div>
  );
}

export function Histogram({ data }: { data: UsageBucketDto[] }) {
  const max = Math.max(...data.map((d) => d.runs), 1);
  const total = data.reduce((s, d) => s + d.runs, 0);
  if (!total) return <p className="py-8 text-center text-sm text-muted-foreground">Chưa có run nào báo chi phí</p>;
  return (
    <div className="flex h-36 items-end gap-2">
      {data.map((d) => (
        <div key={d.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <span className="text-[11px] tabular-nums text-muted-foreground">{d.runs || ""}</span>
          <span className="w-full max-w-10 rounded-t-md" style={{ height: `${Math.max(d.runs ? 3 : 0, (d.runs / max) * 88)}px`, background: "var(--chart-1)" }} />
          <span className="text-center text-[10.5px] leading-tight text-muted-foreground">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 0.0001);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${22 - (v / max) * 20}`).join(" ");
  return <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="mt-1 h-6 w-full" aria-hidden="true"><polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" /></svg>;
}
