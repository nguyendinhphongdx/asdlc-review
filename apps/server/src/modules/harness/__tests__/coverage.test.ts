import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeCoverage } from "../domain/coverage.js";

const body = (n: number) => Array.from({ length: n }, (_, i) => `dòng ${i + 1}`).join("\n");
const none = { present: false, valid: false };

describe("harness/coverage", () => {
  it("repo trống = 0 điểm, mọi mục thiếu và có gợi ý", () => {
    const r = computeCoverage({ discovered: [], contents: [], repoConfig: none });
    assert.equal(r.score, 0);
    assert.equal(r.level, "poor");
    assert.ok(r.items.every((i) => i.status === "missing" && i.hint));
  });
  it("file rỗng/ngắn không làm tăng điểm tối đa", () => {
    const r = computeCoverage({ discovered: [{ path: "AGENTS.md", kind: "instructions" }], contents: [{ path: "AGENTS.md", kind: "instructions", content: "# x" }], repoConfig: none });
    assert.equal(r.items.find((i) => i.id === "instructions")!.points, 10);
  });
  it("harness đầy đủ đạt ≥ 80 và tổng tối đa là 100", () => {
    const cmd = `${body(20)}\nChạy \`pnpm test\` và \`pnpm lint\` trước khi commit.`;
    const r = computeCoverage({
      discovered: [
        { path: "AGENTS.md", kind: "instructions" }, { path: "docs/ARCHITECTURE.md", kind: "docs" },
        { path: ".claude/rules/api.md", kind: "instructions" }, { path: "api/AGENTS.md", kind: "instructions" }, { path: "web/CLAUDE.md", kind: "instructions" },
        { path: "docs/features/a.md", kind: "docs" }, { path: "docs/features/b.md", kind: "docs" }, { path: "docs/features/c.md", kind: "docs" },
      ],
      contents: [{ path: "AGENTS.md", kind: "instructions", content: cmd }],
      repoConfig: { present: true, valid: true, hasDocs: true, hasIgnore: true },
    });
    assert.equal(r.score, 100);
    assert.equal(r.level, "good");
    assert.equal(r.items.reduce((s, i) => s + i.max, 0), 100);
  });
  it(".asdlc.yml lỗi chỉ nhận điểm rất thấp và mang thông báo lỗi", () => {
    const r = computeCoverage({ discovered: [], contents: [], repoConfig: { present: true, valid: false, error: "sai dòng 3" } });
    const i = r.items.find((x) => x.id === "asdlc-config")!;
    assert.equal(i.points, 3);
    assert.equal(i.hint, "sai dòng 3");
  });
});
