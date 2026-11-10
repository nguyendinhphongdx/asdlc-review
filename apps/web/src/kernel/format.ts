export const fmtScore = (n: number | null | undefined) => (n == null ? "–" : String(Math.round(n * 10) / 10));
export const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("vi-VN") : "–");
export const fmtDur = (ms: number | null | undefined) => {
  if (ms == null) return "–";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
};
export const fmtHours = (h: number | null | undefined) => (h == null ? "–" : h < 48 ? `${Math.round(h * 10) / 10}h` : `${Math.round(h / 24)}d`);
export const gradeColor = (g: string | null | undefined) =>
  ({ A: "bg-emerald-100 text-emerald-800", B: "bg-lime-100 text-lime-800", C: "bg-amber-100 text-amber-800", D: "bg-orange-100 text-orange-800", F: "bg-red-100 text-red-800" })[g ?? ""] ?? "bg-slate-100 text-slate-600";
export const sevColor = (s: string) =>
  ({ blocker: "bg-red-600 text-white", critical: "bg-red-100 text-red-800", major: "bg-orange-100 text-orange-800", minor: "bg-amber-100 text-amber-800", nit: "bg-slate-100 text-slate-600" })[s] ?? "bg-slate-100 text-slate-600";
