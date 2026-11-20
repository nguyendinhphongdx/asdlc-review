import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyFilter, computeUsage } from "../domain/usage.js";
import type { UsageRow, UsageTask } from "../ports.js";

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

describe("analytics: usage theo việc", () => {
  const task = (kind: UsageTask["kind"], day: string, costUsd: number | null, o: Partial<UsageTask> = {}): UsageTask => ({
    runId: "r1", mrId: "m1", repositoryId: "repoA", frameworkId: "fw", kind, createdAt: at(day), provider: "claude-cli", model: "opus", costUsd,
    inputTokens: 10, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 40, ...o,
  });
  const tasks = [task("area", "11", 0.5), task("area", "11", 0.25), task("design", "11", 0.1), task("chat", "12", null), task("review", "05", 9)];

  it("gộp theo loại việc, đúng thứ tự, bỏ lần gọi ngoài khoảng", () => {
    const r = computeUsage([], range, {}, opts, tasks).byTask;
    assert.deepEqual(r.map((x) => x.kind), ["design", "area", "chat"]);
    const area = r.find((x) => x.kind === "area")!;
    assert.equal(area.calls, 2);
    assert.equal(area.costUsd, 0.75);
    assert.equal(area.tokens, 200);
    assert.equal(area.cache, 140);
  });

  it("lọc theo repo/model như phần còn lại, chat không có cost vẫn được đếm", () => {
    const other = [...tasks, task("area", "11", 5, { repositoryId: "repoB", model: "haiku" })];
    assert.equal(computeUsage([], range, { repoIds: ["repoA"] }, opts, other).byTask.find((x) => x.kind === "area")!.calls, 2);
    assert.equal(computeUsage([], range, { models: ["haiku"] }, opts, other).byTask.length, 1);
    assert.equal(computeUsage([], range, {}, opts, tasks).byTask.find((x) => x.kind === "chat")!.calls, 1);
  });
});
