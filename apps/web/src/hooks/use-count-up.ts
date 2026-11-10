import { useEffect, useState } from "react";

/** Đếm số từ 0 tới `target` (tôn trọng prefers-reduced-motion). */
export function useCountUp(target: number, durationMs = 1200, delayMs = 0) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("still")) { setV(target); return; }
    let raf = 0;
    const t0 = performance.now() + delayMs;
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - t0) / durationMs));
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, delayMs]);
  return v;
}
