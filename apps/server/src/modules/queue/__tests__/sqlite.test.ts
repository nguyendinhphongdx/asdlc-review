import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Db } from "../../../kernel/db.js";
import { createQueueModule } from "../index.js";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Bảng QueueJob giả (Map) đủ cho SqliteJobStore. */
function fakeDb() {
  type Row = { queue: string; jobId: string; data: string; attempts: number; attempt: number; runAt: Date };
  const rows = new Map<string, Row>();
  const key = (q: string, j: string) => `${q}|${j}`;
  const queueJob = {
    upsert: async ({ where, create }: { where: { queue_jobId: { queue: string; jobId: string } }; create: Row }) => { rows.set(key(where.queue_jobId.queue, where.queue_jobId.jobId), { ...create }); },
    deleteMany: async ({ where }: { where: { queue: string; jobId: string } }) => { rows.delete(key(where.queue, where.jobId)); },
    findMany: async ({ where }: { where: { queue: string } }) => [...rows.values()].filter((r) => r.queue === where.queue),
  };
  return { db: { queueJob } as unknown as Db, rows };
}

describe("queue (sqlite)", () => {
  it("lưu job khi xếp hàng và xoá khi xong", async () => {
    const { db, rows } = fakeDb();
    const q = createQueueModule({ redisUrl: "sqlite", concurrency: 1, db });
    assert.equal(q.driver, "sqlite");
    await q.enqueue("t", { n: 1 }, { jobId: "a" });
    assert.equal(rows.size, 1);
    q.process("t", async () => undefined);
    await wait(80);
    assert.equal(rows.size, 0);
    await q.close();
  });

  it("nạp lại job chưa xong sau khi khởi động lại", async () => {
    const { db, rows } = fakeDb();
    const q1 = createQueueModule({ redisUrl: "sqlite", concurrency: 1, db });
    await q1.enqueue("t", { n: 7 }, { jobId: "a" }); // chưa có handler → còn trong bảng
    await q1.close();
    assert.equal(rows.size, 1);

    const q2 = createQueueModule({ redisUrl: "sqlite", concurrency: 1, db });
    const seen: unknown[] = [];
    q2.process<{ n: number }>("t", async (d) => { seen.push(d.n); });
    await wait(80);
    assert.deepEqual(seen, [7]);
    assert.equal(rows.size, 0);
    await q2.close();
  });
});
