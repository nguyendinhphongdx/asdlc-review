import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classify, relevanceBoost, summarizeTree } from "../domain/classify.js";

describe("harness classify", () => {
  it("nhận diện các loại file", () => {
    assert.equal(classify("CLAUDE.md")?.kind, "instructions");
    assert.equal(classify("apps/web/AGENTS.md")?.kind, "instructions");
    assert.equal(classify(".claude/agents/reviewer.md")?.kind, "agents");
    assert.equal(classify(".claude/skills/foo/SKILL.md")?.kind, "skills");
    assert.equal(classify("README.md")?.kind, "docs");
    assert.equal(classify("docs/architecture/overview.md")?.kind, "docs");
    assert.equal(classify("src/index.ts"), null);
    assert.equal(classify("node_modules/x/README.md"), null);
  });
  it("extraDocGlobs", () => {
    assert.equal(classify("specs/payment.md", ["specs/**"])?.kind, "docs");
  });
  it("ưu tiên tài liệu liên quan file thay đổi", () => {
    assert.ok(relevanceBoost("docs/payment-flow.md", ["src/payment/service.ts"]) > relevanceBoost("docs/auth.md", ["src/payment/service.ts"]));
  });
  it("tóm tắt cây", () => {
    assert.ok(summarizeTree(["a/b/c.ts", "a/b/d.ts", "README.md"]).includes("a/b/ (2)"));
  });
});
