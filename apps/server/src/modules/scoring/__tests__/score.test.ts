import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Finding, Rubric } from "@mrd/contracts";
import { scoreFindings } from "../domain/score.js";

const rubric: Rubric = {
  id: "t",
  name: "t",
  version: "1",
  language: "vi",
  severity: {
    blocker: { deduction: 35, label: "b", description: "" },
    critical: { deduction: 25, label: "c", description: "" },
    major: { deduction: 12, label: "m", description: "" },
    minor: { deduction: 4, label: "n", description: "" },
    nit: { deduction: 1, label: "t", description: "" },
  },
  gates: [
    { id: "secret", when: { ruleIds: ["SEC-01"] }, capTotal: 30, reason: "secret" },
    { id: "blocker", when: { minSeverity: "blocker" }, capTotal: 59, reason: "blocker" },
  ],
  grades: [
    { grade: "A", min: 90 },
    { grade: "B", min: 80 },
    { grade: "C", min: 70 },
    { grade: "D", min: 60 },
    { grade: "F", min: 0 },
  ],
  sizeBaseline: 200,
  categories: [
    { id: "security", name: "Sec", weight: 50, criteria: [{ id: "SEC-01", title: "", check: "", why: "", defaultSeverity: "blocker" }] },
    { id: "style", name: "Style", weight: 50, criteria: [{ id: "CON-01", title: "", check: "", why: "", defaultSeverity: "minor" }] },
  ],
};

const f = (over: Partial<Finding>): Finding => ({
  category: "style",
  severity: "minor",
  kind: "issue",
  title: "x",
  why: "",
  confidence: 1,
  source: "ai",
  ...over,
});

describe("scoreFindings", () => {
  it("không có finding → 100, A, approve", () => {
    const r = scoreFindings({ rubric, findings: [], changedLines: 100 });
    assert.equal(r.total, 100);
    assert.equal(r.grade, "A");
    assert.equal(r.verdict, "approve");
  });

  it("trừ theo severity × confidence", () => {
    const r = scoreFindings({ rubric, findings: [f({ severity: "major", confidence: 0.5, ruleId: "CON-01" })], changedLines: 100 });
    assert.equal(r.deductions[0], 6);
    assert.equal(r.categories.find((c) => c.category === "style")!.score, 94);
    assert.equal(r.verdict, "request_changes");
  });

  it("lộ secret bị chặn trần 30", () => {
    const r = scoreFindings({ rubric, findings: [f({ severity: "blocker", ruleId: "SEC-01", category: "security" })], changedLines: 50 });
    assert.ok(r.total <= 30);
    assert.equal(r.grade, "F");
    assert.deepEqual(r.gates.map((g) => g.id).sort(), ["blocker", "secret"]);
  });

  it("minor được chia theo kích thước MR, major thì không", () => {
    const small = scoreFindings({ rubric, findings: [f({})], changedLines: 200 });
    const big = scoreFindings({ rubric, findings: [f({})], changedLines: 800 });
    assert.equal(small.deductions[0], 4);
    assert.equal(big.deductions[0], 2);
    const bigMajor = scoreFindings({ rubric, findings: [f({ severity: "major" })], changedLines: 800 });
    assert.equal(bigMajor.deductions[0], 12);
  });

  it("question/praise và confidence thấp không trừ điểm; trùng lặp chỉ tính một lần", () => {
    const r = scoreFindings({
      rubric,
      findings: [f({ kind: "question" }), f({ confidence: 0.2 }), f({ title: "dup" }), f({ title: "DUP" })],
      changedLines: 100,
    });
    assert.deepEqual(r.deductions, [0, 0, 4, 0]);
  });

  it("tất định", () => {
    const fs = [f({ severity: "major", ruleId: "CON-01" }), f({ severity: "nit" })];
    assert.deepEqual(scoreFindings({ rubric, findings: fs, changedLines: 300 }), scoreFindings({ rubric, findings: fs, changedLines: 300 }));
  });
});
