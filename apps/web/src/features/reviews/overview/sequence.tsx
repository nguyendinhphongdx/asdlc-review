import type { SequenceBlock } from "@mrd/contracts";

const COL = 150;
const ROW = 36;
const HEAD = 44;

/** Sơ đồ trình tự: các bên theo cột, thông điệp theo hàng; trả lời vẽ nét đứt. */
export function SequenceDiagram({ block }: { block: SequenceBlock }) {
  const x = (a: string) => 70 + Math.max(0, block.actors.indexOf(a)) * COL;
  const width = 140 + (block.actors.length - 1) * COL;
  const height = HEAD + block.messages.length * ROW + 24;
  return (
    <div className="overflow-x-auto rounded-lg border bg-card p-2">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ minWidth: Math.min(width, 520) }} role="img" aria-label={`${block.title}: ${block.actors.join(", ")}`}>
        <defs><marker id="seq-ar" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" className="fill-muted-foreground" /></marker></defs>
        {block.actors.map((a) => (
          <g key={a}>
            <rect x={x(a) - 56} y={6} width={112} height={28} rx={8} className="fill-muted stroke-border" /><text x={x(a)} y={25} textAnchor="middle" className="fill-foreground text-[12px] font-semibold">{a.length > 14 ? `${a.slice(0, 13)}…` : a}</text>
            <line x1={x(a)} x2={x(a)} y1={36} y2={height - 6} strokeDasharray="3 4" className="stroke-border" />
          </g>
        ))}
        {block.messages.map((m, i) => {
          const y = HEAD + i * ROW + 12, a = x(m.from), b = x(m.to), self = m.from === m.to;
          return (
            <g key={i}>
              {self ? <path d={`M${a} ${y - 6} h26 v16 h-24`} fill="none" className="stroke-muted-foreground" markerEnd="url(#seq-ar)" /> : <line x1={a} x2={b + (b > a ? -2 : 2)} y1={y} y2={y} strokeDasharray={m.reply ? "5 3" : undefined} className="stroke-muted-foreground" markerEnd="url(#seq-ar)" />}
              <text x={self ? a + 32 : (a + b) / 2} y={y - 5} textAnchor={self ? "start" : "middle"} className={m.reply ? "fill-muted-foreground text-[11px]" : "fill-foreground text-[11.5px]"}>{m.text.length > 34 ? `${m.text.slice(0, 33)}…` : m.text}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
