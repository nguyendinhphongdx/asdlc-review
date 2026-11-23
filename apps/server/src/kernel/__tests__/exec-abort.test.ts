import assert from "node:assert/strict";
import { test } from "node:test";
import { run } from "../exec.js";

test("run: huỷ bằng AbortSignal kill tiến trình và từ chối với AbortError (kể cả allowFailure)", { skip: process.platform === "win32" }, async () => {
  const ac = new AbortController();
  const t0 = Date.now();
  const p = run("sleep", ["30"], { signal: ac.signal, allowFailure: true });
  setTimeout(() => ac.abort(), 100);
  await assert.rejects(p, (e: Error) => e.name === "AbortError");
  assert.ok(Date.now() - t0 < 5000, "phải dừng nhanh, không đợi hết 30s");
});

test("run: signal đã huỷ từ trước thì không chạy tiến trình", async () => {
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(run("sleep", ["30"], { signal: ac.signal }), (e: Error) => e.name === "AbortError");
});
