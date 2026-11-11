import type { WebhookEventRow, WebhookSummary } from "./types.js";

/**
 * rows: mới nhất trước.
 * - "bad": sự kiện gần nhất bị từ chối (thường sai secret) → cần sửa cấu hình.
 * - "ok": có ít nhất một sự kiện hợp lệ và sự kiện gần nhất không bị từ chối.
 * - "none": chưa nhận gì.
 */
export function summarize(rows: WebhookEventRow[]): WebhookSummary {
  const last = rows[0];
  const status = !last ? "none" : last.result === "rejected" ? "bad" : "ok";
  const lastOk = rows.find((r) => r.result !== "rejected");
  return { status, lastEventAt: lastOk?.at ?? null, rejectedCount: rows.filter((r) => r.result === "rejected").length, events: rows.slice(0, 20) };
}
