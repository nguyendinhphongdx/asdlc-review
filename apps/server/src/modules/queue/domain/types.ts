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

/** Nơi lưu job chưa xong để nạp lại sau khi khởi động (tuỳ chọn cho driver trong process). */
export interface JobRecord { id: string; data: unknown; attempts: number; attempt: number; runAt: number }
export interface JobStore {
  save(queue: string, job: JobRecord): Promise<void>;
  remove(queue: string, id: string): Promise<void>;
  load(queue: string): Promise<JobRecord[]>;
}

/** Hợp đồng cho từng backend hàng đợi. */
export interface QueueDriver {
  readonly name: "bullmq" | "memory" | "sqlite";
  enqueue(queue: string, data: unknown, opts: EnqueueOptions): Promise<{ id: string; deduplicated: boolean }>;
  process(queue: string, handler: JobHandler<never>, concurrency: number): void;
  repeat(queue: string, key: string, data: unknown, everyMs: number): Promise<void>;
  stats(queue: string): Promise<QueueStats>;
  close(): Promise<void>;
}

/** BullMQ không cho dấu ":" trong jobId tuỳ chỉnh. */
export const sanitizeJobId = (id: string) => id.replace(/[:\s]/g, "_");
