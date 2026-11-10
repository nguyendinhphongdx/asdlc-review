import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bayesian, computeLeaderboard, computeOverview, weekStart } from "../domain/metrics.js";
import type { MrFactRow, RunFact } from "../ports.js";

const run = (score: number, extra: Partial<RunFact> = {}): RunFact => ({ id: Math.random().toString(), round: 1, createdAt: new Date("2026-11-03T10:00:00Z"), score, grade: score >= 80 ? "B" : "D", filesChanged: 4, additions: 20, deletions: 5, durationMs: 60_000, costUsd: 0.5, findings: [], ...extra });
const mr = (author: string, runs: RunFact[], extra: Partial<MrFactRow> = {}): MrFactRow => ({ mrId: author + runs.length, repositoryId: "r1", iid: 1, title: "t", authorUsername: author, memberId: null, state: "opened", openedAt: new Date("2026-11-03T00:00:00Z"), mergedAt: null, runs, ...extra });
const issue = (category: string, severity: string, ruleId: string | null = null) => ({ category, ruleId, severity, kind: "issue", title: "x" });
const range = { from: new Date("2026-11-01"), to: new Date("2026-11-30") };

describe("analytics metrics", () => {
  it("đếm vi phạm trên lần review đầu, điểm cuối trên lần gần nhất", () => {
    const mrs = [mr("a", [run(50, { findings: [issue("security", "blocker", "SEC-01"), issue("conventions", "minor")] }), run(90)])];
    const o = computeOverview(mrs, range, 70);
    assert.equal(o.secretLeaks, 1);
    assert.equal(o.conventionViolations, 1);
    assert.equal(o.totalRuns, 2);
    assert.equal(o.passRate, 100); // lần gần nhất 90 >= 70
    const lb = computeLeaderboard(mrs, []);
    assert.equal(lb[0]!.avgFirstScore, 50);
    assert.equal(lb[0]!.avgFinalScore, 90);
    assert.equal(lb[0]!.improvement, 40);
    assert.equal(lb[0]!.avgReviewRounds, 2);
  });

  it("Bayesian: cùng điểm, nhiều MR hơn thì xếp trên; điểm 1 MR bị kéo về trung bình", () => {
    const many = Array.from({ length: 10 }, () => mr("steady", [run(88)]));
    const lb = computeLeaderboard([...many, mr("lonely", [run(88)]), mr("low", [run(60)])], []);
    const rank = (n: string) => lb.findIndex((r) => r.name === n);
    assert.ok(rank("steady") < rank("lonely"));
    assert.ok(bayesian([100], 80) < 100 && bayesian([100], 80) > 80);
  });

  it("gộp theo thành viên khi có memberId", () => {
    const members = [{ id: "m1", name: "An", usernames: ["an", "an2"], active: true }];
    const lb = computeLeaderboard([mr("an", [run(80)], { memberId: "m1" }), mr("an2", [run(90)], { memberId: "m1" })], members);
    assert.equal(lb.length, 1);
    assert.equal(lb[0]!.name, "An");
    assert.equal(lb[0]!.mrCount, 2);
  });

  it("tuần bắt đầu thứ Hai", () => {
    assert.equal(weekStart(new Date("2026-11-08T12:00:00Z")), "2026-11-02"); // Chủ nhật
    assert.equal(weekStart(new Date("2026-11-02T00:00:00Z")), "2026-11-02");
  });
});
