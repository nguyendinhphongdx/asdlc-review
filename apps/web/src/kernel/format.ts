export const fmtScore = (n: number | null | undefined) => (n == null ? "–" : String(Math.round(n * 10) / 10));
export const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "–");
export const fmtDur = (ms: number | null | undefined) => {
  if (ms == null) return "–";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
};
export const fmtHours = (h: number | null | undefined) => (h == null ? "–" : h < 48 ? `${Math.round(h * 10) / 10}h` : `${Math.round(h / 24)}d`);
export const repoShort = (fullPath: string) => fullPath;
/** Thời lượng ngắn cho từng stage: 0.1s, 1.8s, 2m41s. */
export const fmtMs = (ms: number | null | undefined) => {
  if (ms == null) return "–";
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
};
/** "2 phút trước", "1 giờ trước"... */
export const fmtAgo = (iso: string | null | undefined, now = Date.now()) => {
  if (!iso) return "–";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "vừa xong";
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  return `${Math.floor(s / 86400)} ngày trước`;
};
