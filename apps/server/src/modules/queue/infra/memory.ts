import type { Logger } from "../../../kernel/logger.js";
import { sanitizeJobId, type EnqueueOptions, type JobHandler, type QueueDriver, type QueueStats } from "../domain/types.js";

interface Job { id: string; data: unknown; attempts: number; attempt: number; runAt: number }
interface Q { waiting: Job[]; active: Set<string>; failed: number; handler?: JobHandler<never>; concurrency: number; ids: Set<string> }

/** Hàng đợi trong process: dùng cho dev/test hoặc khi không có Redis. Không bền vững khi restart. */
export class MemoryDriver implements QueueDriver {
  readonly name = "memory" as const;
  private qs = new Map<string, Q>();
  private timers = new Set<NodeJS.Timeout>();
  private seq = 0;
  constructor(private log?: Logger) {}

  private q(name: string): Q {
    let q = this.qs.get(name);
    if (!q) this.qs.set(name, (q = { waiting: [], active: new Set(), failed: 0, concurrency: 1, ids: new Set() }));
    return q;
  }

  async enqueue(queue: string, data: unknown, opts: EnqueueOptions) {
    const q = this.q(queue);
    const id = sanitizeJobId(opts.jobId ?? `job-${++this.seq}`);
    if (q.ids.has(id)) return { id, deduplicated: true };
    q.ids.add(id);
    q.waiting.push({ id, data, attempts: opts.attempts ?? 1, attempt: 0, runAt: Date.now() + (opts.delayMs ?? 0) });
    this.pump(queue);
    return { id, deduplicated: false };
  }

  process(queue: string, handler: JobHandler<never>, concurrency: number) {
    const q = this.q(queue);
    q.handler = handler;
    q.concurrency = concurrency;
    this.pump(queue);
  }

  private pump(name: string) {
    const q = this.q(name);
    if (!q.handler) return;
    while (q.active.size < q.concurrency) {
      const i = q.waiting.findIndex((j) => j.runAt <= Date.now());
      if (i < 0) {
        const next = Math.min(...q.waiting.map((j) => j.runAt));
        if (Number.isFinite(next)) {
          const t = setTimeout(() => (this.timers.delete(t), this.pump(name)), Math.max(10, next - Date.now()));
          this.timers.add(t);
        }
        return;
      }
      const [job] = q.waiting.splice(i, 1);
      q.active.add(job!.id);
      job!.attempt++;
      void Promise.resolve()
        .then(() => (q.handler as JobHandler<unknown>)(job!.data, { id: job!.id, attempt: job!.attempt }))
        .catch((err) => {
          this.log?.error(`job ${name}/${job!.id} lỗi`, { err: String(err) });
          if (job!.attempt < job!.attempts) {
            q.waiting.push({ ...job!, runAt: Date.now() + 2000 * job!.attempt });
            return;
          }
          q.failed++;
        })
        .finally(() => {
          q.active.delete(job!.id);
          if (!q.waiting.some((j) => j.id === job!.id)) q.ids.delete(job!.id); // giải phóng khoá khi xong
          this.pump(name);
        });
    }
  }

  async repeat(queue: string, key: string, data: unknown, everyMs: number) {
    const t = setInterval(() => void this.enqueue(queue, data, { jobId: `${key}-${Math.floor(Date.now() / everyMs)}` }), everyMs);
    t.unref();
    this.timers.add(t);
  }

  async stats(queue: string): Promise<QueueStats> {
    const q = this.q(queue);
    const now = Date.now();
    return { waiting: q.waiting.filter((j) => j.runAt <= now).length, active: q.active.size, delayed: q.waiting.filter((j) => j.runAt > now).length, failed: q.failed };
  }

  async close() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }
}
