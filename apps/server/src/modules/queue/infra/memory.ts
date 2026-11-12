import type { Logger } from "../../../kernel/logger.js";
import { sanitizeJobId, type EnqueueOptions, type JobHandler, type JobStore, type QueueDriver, type QueueStats } from "../domain/types.js";

interface Job { id: string; data: unknown; attempts: number; attempt: number; runAt: number }
interface Q { waiting: Job[]; active: Set<string>; failed: number; handler?: JobHandler<never>; concurrency: number; ids: Set<string> }

/**
 * Hàng đợi trong process, không cần Redis. Có `store` thì job chưa xong được lưu và nạp lại khi khởi động
 * (job đang chạy dở lúc app dừng sẽ chạy lại, tối đa `attempts` lần); không có thì mất khi restart (test).
 */
export class MemoryDriver implements QueueDriver {
  readonly name: "memory" | "sqlite";
  private qs = new Map<string, Q>();
  private timers = new Set<NodeJS.Timeout>();
  private seq = 0;
  private loaded = new Set<string>();
  constructor(private log?: Logger, private store?: JobStore) { this.name = store ? "sqlite" : "memory"; }

  private persist(queue: string, j: Job) { void this.store?.save(queue, j).catch((e) => this.log?.warn("lưu job lỗi", { err: String(e).slice(0, 160) })); }
  private forget(queue: string, id: string) { void this.store?.remove(queue, id).catch(() => undefined); }
  /** Nạp job còn dang dở từ lần chạy trước (một lần cho mỗi hàng đợi). */
  private async restore(queue: string) {
    if (!this.store || this.loaded.has(queue)) return;
    this.loaded.add(queue);
    const q = this.q(queue);
    for (const j of await this.store.load(queue).catch(() => [])) {
      if (q.ids.has(j.id)) continue;
      if (j.attempt >= j.attempts) { this.forget(queue, j.id); continue; } // đã hết lượt thử (nghi job làm sập app) thì bỏ
      q.ids.add(j.id);
      q.waiting.push({ ...j, runAt: Math.min(j.runAt, Date.now()) });
    }
    if (q.waiting.length) this.log?.info(`đã nạp lại ${q.waiting.length} job chưa xong cho hàng đợi ${queue}`);
  }

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
    const job: Job = { id, data, attempts: opts.attempts ?? 1, attempt: 0, runAt: Date.now() + (opts.delayMs ?? 0) };
    q.waiting.push(job);
    await this.store?.save(queue, job);
    this.pump(queue);
    return { id, deduplicated: false };
  }

  process(queue: string, handler: JobHandler<never>, concurrency: number) {
    const q = this.q(queue);
    q.handler = handler;
    q.concurrency = concurrency;
    void this.restore(queue).finally(() => this.pump(queue));
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
      this.persist(name, job!);
      void Promise.resolve()
        .then(() => (q.handler as JobHandler<unknown>)(job!.data, { id: job!.id, attempt: job!.attempt }))
        .catch((err) => {
          this.log?.error(`job ${name}/${job!.id} lỗi`, { err: String(err) });
          if (job!.attempt < job!.attempts) {
            const retry = { ...job!, runAt: Date.now() + 2000 * job!.attempt };
            q.waiting.push(retry);
            this.persist(name, retry);
            return;
          }
          q.failed++;
        })
        .finally(() => {
          q.active.delete(job!.id);
          if (!q.waiting.some((j) => j.id === job!.id)) { q.ids.delete(job!.id); this.forget(name, job!.id); } // giải phóng khoá khi xong
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
