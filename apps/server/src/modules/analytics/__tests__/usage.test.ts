import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyFilter, computeUsage } from "../domain/usage.js";
import type { UsageRow } from "../ports.js";

const at = (d: string, h = 10) => new Date(2026, 10, Number(d), h, 0, 0);
const row = (o: Partial<UsageRow> & { day: string }): UsageRow => ({
  runId: `r${Math.random()}`, mrId: "m1", iid: 1, title: "t", repositoryId: "repoA", repoName: "a/a", createdAt: at(o.day), status: "succeeded", provider: "claude-cli", model: "opus", frameworkId: "asdlc",
  costUsd: 1, durationMs: 1000, score: 90, inputTokens: 100, outputTokens: 50, cacheReadTokens: 300, cacheWriteTokens: 50, ...o,
});
const opts = { repos: [], providers: [], models: [], frameworks: [] };
const range = { from: at("10", 0), to: at("12", 23) };

describe("analytics: usage", () => {
  const rows = [
    row({ day: "10" }), row({ day: "10", model: "sonnet", costUsd: 0.5 }), row({ day: "12", status: "failed", costUsd: 2 }),
    row({ day: "11", provider: "gemini-api", model: "gemini", costUsd: null, cacheReadTokens: null, cacheWriteTokens: null }),
    row({ day: "08", costUsd: 4 }), // kỳ trước (trước `from`)
  ];
  it("tổng, theo ngày đủ liên tục (kể cả ngày trống) và xếp chồng theo model", () => {
    const u = computeUsage(rows, range, {}, opts);
    assert.equal(u.totals.runs, 4);
    assert.equal(u.totals.runsWithCost, 3);
    assert.equal(u.totals.costUsd, 3.5);
    assert.equal(u.totals.failedRuns, 1);
    assert.equal(u.totals.failedCostUsd, 2);
    assert.equal(u.totals.prevCostUsd, 4);
    assert.deepEqual(u.byDay.map((d) => d.date), ["2026-11-10", "2026-11-11", "2026-11-12"]);
    assert.equal(u.byDay[0]!.costUsd, 1.5);
    assert.deepEqual(Object.keys(u.byDay[0]!.models).sort(), ["opus", "sonnet"]);
    assert.equal(u.byDay[2]!.failed, 1);
  });
  it("token, cache hit, heatmap, phân bố chi phí và top run", () => {
    const u = computeUsage(rows, range, {}, opts);
    assert.equal(u.totals.tokens.input, 400);
    assert.equal(u.totals.cacheHitRate, 900 / (400 + 900 + 150));
    assert.equal(u.heat.flat().reduce((a, b) => a + b, 0), 4);
    assert.equal(u.costBuckets.reduce((s, b) => s + b.runs, 0), 3); // run không có chi phí không vào histogram
    assert.equal(u.topRuns[0]!.costUsd, 2);
    assert.equal(u.byModel[0]!.label, "opus");
  });
  it("bộ lọc theo model/status/repo", () => {
    assert.equal(applyFilter(rows, { models: ["sonnet"] }).length, 1);
    assert.equal(applyFilter(rows, { status: "failed" }).length, 1);
    assert.equal(applyFilter(rows, { repoIds: ["khác"] }).length, 0);
    assert.equal(computeUsage(applyFilter(rows, { status: "succeeded" }), range, {}, opts).totals.failedRuns, 0);
  });
});
