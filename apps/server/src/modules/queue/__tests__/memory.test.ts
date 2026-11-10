import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createQueueModule } from "../index.js";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("queue (memory)", () => {
  it("xử lý job và khử trùng khi đang chờ", async () => {
    const q = createQueueModule({ redisUrl: "memory", concurrency: 1 });
    const seen: number[] = [];
    q.process<number>("t", async (n) => {
      await wait(30);
      seen.push(n);
    });
    const a = await q.enqueue("t", 1, { jobId: "x:1" });
    const b = await q.enqueue("t", 2, { jobId: "x:1" });
    assert.equal(a.deduplicated, false);
    assert.equal(b.deduplicated, true);
    await wait(120);
    assert.deepEqual(seen, [1]);
    const c = await q.enqueue("t", 3, { jobId: "x:1" }); // đã xong → thêm lại được
    assert.equal(c.deduplicated, false);
    await wait(120);
    assert.deepEqual(seen, [1, 3]);
    await q.close();
  });

  it("giới hạn concurrency và thử lại", async () => {
    const q = createQueueModule({ redisUrl: "memory", concurrency: 1 });
    let running = 0;
    let max = 0;
    let tries = 0;
    q.process<string>("c", async (k) => {
      running++;
      max = Math.max(max, running);
      await wait(20);
      running--;
      if (k === "flaky" && ++tries < 2) throw new Error("boom");
    });
    await q.enqueue("c", "a");
    await q.enqueue("c", "b");
    await q.enqueue("c", "flaky", { attempts: 2 });
    await wait(2500);
    assert.equal(max, 1);
    assert.equal(tries, 2);
    await q.close();
  });
});
