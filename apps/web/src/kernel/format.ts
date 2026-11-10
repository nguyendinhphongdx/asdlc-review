export const fmtScore = (n: number | null | undefined) => (n == null ? "–" : String(Math.round(n * 10) / 10));
export const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "–");
export const fmtDur = (ms: number | null | undefined) => {
  if (ms == null) return "–";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
};
export const fmtHours = (h: number | null | undefined) => (h == null ? "–" : h < 48 ? `${Math.round(h * 10) / 10}h` : `${Math.round(h / 24)}d`);
export const repoShort = (fullPath: string) => fullPath;
