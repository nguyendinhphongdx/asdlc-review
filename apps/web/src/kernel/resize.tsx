import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** Số lưu cục bộ theo trình duyệt (độ rộng người dùng kéo); không lưu được thì dùng giá trị mặc định. */
export function usePersistedNumber(key: string, initial: number): [number, (n: number) => void] {
  const [v, setV] = useState(() => { try { const n = Number(localStorage.getItem(key)); return Number.isFinite(n) && n > 0 ? n : initial; } catch { return initial; } });
  const set = useCallback((n: number) => { setV(n); try { localStorage.setItem(key, String(Math.round(n))); } catch { /* không lưu được thì thôi */ } }, [key]);
  return [v, set];
}

/**
 * Thanh kéo đổi độ rộng. `edge`: thanh nằm ở mép nào của phần tử được đổi cỡ ("right": kéo sang phải thì rộng ra,
 * "left": kéo sang trái thì rộng ra). Hỗ trợ chuột/cảm ứng, phím ←/→ (Shift = bước lớn), bấm đúp để về mặc định.
 */
export function ResizeHandle({ value, min, max, onChange, onReset, edge, label, className }: {
  value: number; min: number; max: () => number; onChange: (n: number) => void; onReset: () => void; edge: "left" | "right"; label: string; className?: string;
}) {
  const start = useRef<{ x: number; v: number } | null>(null);
  const [drag, setDrag] = useState(false);
  const dir = edge === "right" ? 1 : -1;
  return (
    <div
      role="separator" aria-orientation="vertical" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={min} aria-valuemax={Math.round(max())} tabIndex={0}
      title={`${label} · kéo để đổi, bấm đúp để về mặc định`}
      className={cn("group z-10 flex w-2 flex-none cursor-col-resize touch-none select-none justify-center outline-none", className)}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); start.current = { x: e.clientX, v: value }; setDrag(true); }}
      onPointerMove={(e) => { if (start.current) onChange(clamp(start.current.v + (e.clientX - start.current.x) * dir, min, max())); }}
      onPointerUp={(e) => { start.current = null; setDrag(false); e.currentTarget.releasePointerCapture(e.pointerId); }}
      onPointerCancel={() => { start.current = null; setDrag(false); }}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 80 : 24;
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); onChange(clamp(value + (e.key === "ArrowRight" ? 1 : -1) * dir * step, min, max())); }
        if (e.key === "Home" || e.key === "Escape") { e.preventDefault(); onReset(); }
      }}
    >
      <span className={cn("h-full w-px bg-border transition-colors group-hover:w-0.5 group-hover:bg-primary group-focus-visible:w-0.5 group-focus-visible:bg-ring", drag && "w-0.5 bg-primary")} />
    </div>
  );
}
