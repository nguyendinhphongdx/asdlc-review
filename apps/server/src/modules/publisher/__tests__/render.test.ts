import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ReviewReport } from "@mrd/contracts";
import { createPublisherModule } from "../index.js";

const report: ReviewReport = {
  mr: { title: "t", iid: 1, webUrl: "u", author: "a", sourceBranch: "s", targetBranch: "m", headSha: "abcdef123456" },
  score: { total: 72.5, rawTotal: 72.5, grade: "C", verdict: "request_changes", gates: [], categories: [{ category: "x", name: "X", weight: 10, score: 80, deduction: 20, findings: 1 }], deductions: [12, 4] },
  summary: "Tóm tắt", intent: "ý định", strengths: ["tốt"],
  findings: [
    { category: "x", ruleId: "ARC-03", severity: "major", kind: "issue", title: "Trùng lặp util", file: "src/a.ts", lineStart: 10, why: "đã có sẵn", confidence: 0.9, source: "ai", deduction: 12, question: "Sao không dùng lại?" },
    { category: "x", ruleId: "CON-01", severity: "minor", kind: "issue", title: "Tên chưa chuẩn", file: "src/b.ts", lineStart: 3, why: "", confidence: 0.9, source: "ai", deduction: 4 },
  ],
  stats: { filesChanged: 2, additions: 10, deletions: 1, durationSec: 30 }, harnessFiles: ["CLAUDE.md"], frameworkLabel: "ASDLC 1.0.0", provider: "claude-cli", language: "vi",
};

describe("publisher", () => {
  const api = createPublisherModule();
  it("summary có marker, điểm và finding", () => {
    const md = api.renderSummary(report);
    assert.ok(md.includes(api.summaryMarker));
    assert.ok(md.includes("72.5/100"));
    assert.ok(md.includes("Trùng lặp util"));
    assert.ok(md.includes("<details>"));
  });
  it("inline chỉ chọn finding đủ mức nghiêm trọng", () => {
    const inl = api.renderInline(report, { minSeverity: "major", max: 5 });
    assert.equal(inl.length, 1);
    assert.equal(inl[0]!.line, 10);
  });
});
