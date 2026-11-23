import assert from "node:assert/strict";
import { test } from "node:test";
import { createRunControl } from "../workflows/run-control.js";

test("run-control: abort huỷ đúng run đang đăng ký; run lạ hoặc đã release trả false", () => {
  const c = createRunControl();
  const a = c.register("a");
  const b = c.register("b");
  assert.equal(c.abort("a"), true);
  assert.equal(a.aborted, true);
  assert.equal(b.aborted, false);
  c.release("b");
  assert.equal(c.abort("b"), false);
  assert.equal(c.abort("zzz"), false);
});
