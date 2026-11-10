import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import type { Logger } from "../../../kernel/logger.js";
import { sanitizeJobId, type EnqueueOptions, type JobHandler, type QueueDriver, type QueueStats } from "../domain/types.js";

export class BullMqDriver implements QueueDriver {
  readonly name = "bullmq" as const;
  private queues = new Map<string, Queue>();
  private workers: Worker[] = [];
  private connection: Redis;
  constructor(redisUrl: string, private log?: Logger) {
    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.connection.on("error", (err) => this.log?.error("redis lỗi", { err: err.message }));
  }

  private q(name: string) {
    let q = this.queues.get(name);
    if (!q) this.queues.set(name, (q = new Queue(name, { connection: this.connection })));
    return q;
  }

  async enqueue(queue: string, data: unknown, opts: EnqueueOptions) {
    const q = this.q(queue);
    const jobId = opts.jobId ? sanitizeJobId(opts.jobId) : undefined;
    if (jobId) {
      const existing = await q.getJob(jobId);
      if (existing) {
        const state = await existing.getState();
        if (state === "waiting" || state === "active" || state === "delayed") return { id: jobId, deduplicated: true };
        await existing.remove().catch(() => undefined);
      }
    }
    const job = await q.add(queue, data, {
      jobId,
      delay: opts.delayMs,
      attempts: opts.attempts ?? 2,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { age: 3600, count: 500 },
      removeOnFail: { age: 7 * 24 * 3600, count: 500 },
    });
    return { id: String(job.id), deduplicated: false };
  }

  process(queue: string, handler: JobHandler<never>, concurrency: number) {
    const w = new Worker(queue, async (job) => (handler as JobHandler<unknown>)(job.data, { id: String(job.id), attempt: job.attemptsMade + 1 }), { connection: this.connection, concurrency });
    w.on("failed", (job, err) => this.log?.error(`job ${queue}/${job?.id} lỗi`, { err: err.message }));
    this.workers.push(w);
  }

  async repeat(queue: string, key: string, data: unknown, everyMs: number) {
    await this.q(queue).upsertJobScheduler(key, { every: everyMs }, { name: queue, data });
  }

  async stats(queue: string): Promise<QueueStats> {
    const c = await this.q(queue).getJobCounts("waiting", "active", "delayed", "failed");
    return { waiting: c.waiting ?? 0, active: c.active ?? 0, delayed: c.delayed ?? 0, failed: c.failed ?? 0 };
  }

  async close() {
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    this.connection.disconnect();
  }
}
