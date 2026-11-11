import type { RunActivityEntry } from "@mrd/contracts";
import type { EventBus } from "../kernel/event-bus.js";

const MAX_ENTRIES = 600;
const MAX_RUNS = 60;

/**
 * Nhật ký tiến trình theo run, giữ trong bộ nhớ để (1) phát SSE theo thời gian thực qua event bus,
 * (2) phát lại phần đã qua cho client vào giữa chừng, (3) lưu vào DB khi run kết thúc.
 */
export function createProgressHub(events: EventBus) {
  const logs = new Map<string, RunActivityEntry[]>();
  return {
    emit(runId: string, mrId: string, stage: string, level: RunActivityEntry["level"], message: string) {
      const entry: RunActivityEntry = { at: new Date().toISOString(), stage, level, message: message.slice(0, 400) };
      const list = logs.get(runId) ?? [];
      if (list.length < MAX_ENTRIES) list.push(entry);
      logs.set(runId, list);
      if (logs.size > MAX_RUNS) logs.delete(logs.keys().next().value as string);
      events.publish("reviews.run.progress", { runId, mrId, entry });
    },
    backlog: (runId: string): RunActivityEntry[] => logs.get(runId) ?? [],
  };
}
export type ProgressHub = ReturnType<typeof createProgressHub>;
