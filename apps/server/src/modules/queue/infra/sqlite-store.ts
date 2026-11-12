import type { Db } from "../../../kernel/db.js";
import type { JobRecord, JobStore } from "../domain/types.js";

/** Lưu job vào bảng QueueJob (SQLite của app). */
export class SqliteJobStore implements JobStore {
  constructor(private db: Db) {}
  async save(queue: string, j: JobRecord) {
    const row = { data: JSON.stringify(j.data), attempts: j.attempts, attempt: j.attempt, runAt: new Date(j.runAt) };
    await this.db.queueJob.upsert({ where: { queue_jobId: { queue, jobId: j.id } }, create: { queue, jobId: j.id, ...row }, update: row });
  }
  async remove(queue: string, id: string) {
    await this.db.queueJob.deleteMany({ where: { queue, jobId: id } });
  }
  async load(queue: string): Promise<JobRecord[]> {
    const rows = await this.db.queueJob.findMany({ where: { queue }, orderBy: { runAt: "asc" } });
    return rows.map((r) => ({ id: r.jobId, data: JSON.parse(r.data) as unknown, attempts: r.attempts, attempt: r.attempt, runAt: r.runAt.getTime() }));
  }
}
