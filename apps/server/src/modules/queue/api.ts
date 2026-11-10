import type { Logger } from "../../kernel/logger.js";
import type { EnqueueOptions, JobHandler, QueueDriver, QueueStats } from "./domain/types.js";
import { BullMqDriver } from "./infra/bullmq.js";
import { MemoryDriver } from "./infra/memory.js";

export interface QueueDeps {
  /** URL Redis, hoặc "memory" để dùng hàng đợi trong process. */
  redisUrl: string;
  concurrency: number;
  logger?: Logger;
}

export interface QueueApi {
  readonly driver: "bullmq" | "memory";
  enqueue<T>(queue: string, data: T, opts?: EnqueueOptions): Promise<{ id: string; deduplicated: boolean }>;
  process<T>(queue: string, handler: JobHandler<T>, opts?: { concurrency?: number }): void;
  repeat<T>(queue: string, key: string, data: T, everyMs: number): Promise<void>;
  stats(queue: string): Promise<QueueStats>;
  close(): Promise<void>;
}

export function createQueueModule(deps: QueueDeps): QueueApi {
  const driver: QueueDriver = deps.redisUrl === "memory" || !deps.redisUrl ? new MemoryDriver(deps.logger) : new BullMqDriver(deps.redisUrl, deps.logger);
  return {
    driver: driver.name,
    enqueue: (queue, data, opts = {}) => driver.enqueue(queue, data, opts),
    process: (queue, handler, opts) => driver.process(queue, handler as JobHandler<never>, opts?.concurrency ?? deps.concurrency),
    repeat: (queue, key, data, everyMs) => driver.repeat(queue, key, data, everyMs),
    stats: (queue) => driver.stats(queue),
    close: () => driver.close(),
  };
}
