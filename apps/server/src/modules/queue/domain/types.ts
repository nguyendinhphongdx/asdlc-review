export interface EnqueueOptions {
  /** Khoá khử trùng: cùng jobId đang chờ/đang chạy thì không thêm lần nữa. */
  jobId?: string;
  delayMs?: number;
  attempts?: number;
}
export interface JobContext {
  id: string;
  attempt: number;
}
export type JobHandler<T> = (data: T, ctx: JobContext) => Promise<void>;
export interface QueueStats {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
}

/** Hợp đồng cho từng backend hàng đợi. */
export interface QueueDriver {
  readonly name: "bullmq" | "memory";
  enqueue(queue: string, data: unknown, opts: EnqueueOptions): Promise<{ id: string; deduplicated: boolean }>;
  process(queue: string, handler: JobHandler<never>, concurrency: number): void;
  repeat(queue: string, key: string, data: unknown, everyMs: number): Promise<void>;
  stats(queue: string): Promise<QueueStats>;
  close(): Promise<void>;
}

/** BullMQ không cho dấu ":" trong jobId tuỳ chỉnh. */
export const sanitizeJobId = (id: string) => id.replace(/[:\s]/g, "_");
