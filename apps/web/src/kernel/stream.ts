import type { RunActivityEntry } from "@mrd/contracts";

export interface RunStreamHandlers {
  onProgress?: (runId: string, entry: RunActivityEntry) => void;
  /** Run đổi trạng thái/giai đoạn (chờ → chạy → từng bước): cập nhật UI ngay. */
  onRunStatus?: (s: { runId: string; mrId: string; status: "queued" | "running"; stage: string }) => void;
  onDone?: (kind: "completed" | "failed", runId: string) => void;
  onStatus?: (connected: boolean) => void;
}

/** Mở luồng SSE `/api/events` (một run nếu có `runId`). Trình duyệt tự nối lại; trả hàm đóng. */
export function openRunStream(h: RunStreamHandlers, runId?: string): () => void {
  if (typeof EventSource === "undefined") return () => undefined;
  const es = new EventSource(`/api/events${runId ? `?run=${encodeURIComponent(runId)}` : ""}`);
  const parse = <T,>(e: MessageEvent): T | null => { try { return JSON.parse(e.data) as T; } catch { return null; } };
  es.onopen = () => h.onStatus?.(true);
  es.onerror = () => h.onStatus?.(false);
  es.addEventListener("progress", (e) => { const d = parse<{ runId: string; entry: RunActivityEntry }>(e as MessageEvent); if (d) h.onProgress?.(d.runId, d.entry); });
  es.addEventListener("status", (e) => { const d = parse<{ runId: string; mrId: string; status: "queued" | "running"; stage: string }>(e as MessageEvent); if (d) h.onRunStatus?.(d); });
  es.addEventListener("completed", (e) => { const d = parse<{ runId: string }>(e as MessageEvent); if (d) h.onDone?.("completed", d.runId); });
  es.addEventListener("failed", (e) => { const d = parse<{ runId: string }>(e as MessageEvent); if (d) h.onDone?.("failed", d.runId); });
  return () => es.close();
}
