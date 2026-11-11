import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WebhookEventRow } from "../domain/types.js";
import { summarize } from "../domain/webhook-status.js";

const row = (result: WebhookEventRow["result"], min: number): WebhookEventRow => ({ id: String(min), at: new Date(2026, 0, 1, 0, min), event: "mr", result, detail: null });

describe("repos/webhook-status", () => {
  it("chưa có sự kiện → none", () => assert.equal(summarize([]).status, "none"));
  it("sự kiện gần nhất hợp lệ → ok, lastEventAt là sự kiện hợp lệ mới nhất", () => {
    const s = summarize([row("accepted", 5), row("rejected", 3)]);
    assert.equal(s.status, "ok");
    assert.equal(s.lastEventAt?.getMinutes(), 5);
    assert.equal(s.rejectedCount, 1);
  });
  it("sự kiện gần nhất bị từ chối → bad", () => assert.equal(summarize([row("rejected", 9), row("accepted", 1)]).status, "bad"));
  it("ignored/skipped vẫn tính là webhook hoạt động", () => assert.equal(summarize([row("skipped", 2)]).status, "ok"));
});
