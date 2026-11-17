import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_VIEWS, type AiBlock } from "@mrd/contracts";
import { buildBlocks, blocksPrompt, deriveBefore } from "../domain/blocks.js";
import { classifyMr } from "../domain/mr-kind.js";

const f = (path: string, additions = 10, deletions = 2) => ({ path, additions, deletions });

describe("classifyMr", () => {
  it("nhận ra MR nhỏ theo file", () => {
    assert.equal(classifyMr([f("README.md"), f("docs/a.md")]).kind, "docs");
    assert.equal(classifyMr([f("src/a.test.ts"), f("src/__tests__/b.ts")]).kind, "test-only");
    assert.equal(classifyMr([f("package.json"), f("pnpm-lock.yaml")]).kind, "deps");
    assert.equal(classifyMr([f(".github/workflows/ci.yml"), f("Dockerfile")]).kind, "config-infra");
  });
  it("schema/migration và API thắng tiêu đề", () => {
    assert.equal(classifyMr([f("prisma/schema/a.prisma"), f("src/a.ts")], "feat: thêm cột").kind, "schema-change");
    assert.equal(classifyMr([f("apps/server/src/modules/x/http.ts"), f("src/a.ts")], "fix: x").kind, "api-change");
  });
  it("tiêu đề: refactor, bugfix nhỏ, tính năng; còn lại là đổi luồng", () => {
    assert.equal(classifyMr([f("src/a.ts")], "refactor: tách hàm").kind, "refactor");
    assert.equal(classifyMr([f("src/a.ts", 5, 1)], "fix: lỗi null").kind, "bugfix");
    assert.equal(classifyMr([f("src/a.ts", 500, 400)], "fix: lỗi lớn").kind, "flow-change");
    assert.equal(classifyMr([f("src/a.ts")], "feat: thêm thanh toán").kind, "new-feature");
    assert.equal(classifyMr([f("src/a.ts")], "cập nhật xử lý").kind, "flow-change");
  });
  it("không có file → docs", () => assert.equal(classifyMr([]).kind, "docs"));
});

const node = (id: string, evidence: string[] = []) => ({ id, label: id, sub: null, group: null, status: "added" as const, evidence, note: null });
const base: AiBlock = { kind: "flow", title: "Luồng", nodes: [node("a", ["src/a.ts:3 run", "src/bịa.ts:9"]), node("b"), node("a")], edges: [{ from: "a", to: "b", label: null, status: "added", violation: false, evidence: [] }, { from: "a", to: "zzz", label: null, status: "added", violation: false, evidence: [] }], beforeNodes: [], beforeEdges: [], actors: [], messages: [] };

describe("buildBlocks", () => {
  it("bỏ bằng chứng bịa, nút trùng và cạnh trỏ vào nút lạ", () => {
    const [b] = buildBlocks([base], DEFAULT_VIEWS["flow-change"], ["src/a.ts"]);
    assert.ok(b && b.kind === "flow");
    assert.deepEqual(b.after.nodes.map((n) => n.id), ["a", "b"]);
    assert.deepEqual(b.after.nodes[0]!.evidence, ["src/a.ts:3 run"]);
    assert.equal(b.after.edges.length, 1);
    assert.equal(b.before, null); // mọi nút đều "added" → không có gì tồn tại trước
  });
  it("bỏ khối loại không được yêu cầu cho loại MR, và MR nhỏ không có khối", () => {
    assert.equal(buildBlocks([base], DEFAULT_VIEWS.bugfix, ["src/a.ts"]).length, 0);
    assert.equal(buildBlocks([{ ...base, kind: "sequence" }], DEFAULT_VIEWS.refactor, ["src/a.ts"]).length, 0);
  });
  it("sequence cần ≥2 bên và thông điệp hợp lệ; khối bắt buộc đứng trước", () => {
    const seq: AiBlock = { ...base, kind: "sequence", title: "Gọi", nodes: [], edges: [], actors: ["Web", "Server"], messages: [{ from: "Web", to: "Server", text: "PUT", reply: false, evidence: [] }, { from: "Web", to: "Lạ", text: "x", reply: false, evidence: [] }] };
    const out = buildBlocks([seq, { ...base, title: "Luồng 2" }], DEFAULT_VIEWS["api-change"], ["src/a.ts"]);
    assert.deepEqual(out.map((b) => b.kind), ["sequence", "flow"]);
    assert.equal((out[0] as { messages: unknown[] }).messages.length, 1);
  });
});

describe("deriveBefore", () => {
  it("bỏ nút/cạnh mới, giữ nút bị xoá, cạnh nối vào nút mới bị bỏ", () => {
    const n = (id: string, status: "added" | "removed" | "changed" | "unchanged") => ({ ...node(id), status });
    const e = (from: string, to: string, status: "added" | "unchanged" = "unchanged") => ({ from, to, label: null, status, violation: false, evidence: [] });
    const b = deriveBefore({ nodes: [n("a", "unchanged"), n("b", "added"), n("c", "removed"), n("d", "changed")], edges: [e("a", "b", "added"), e("a", "c"), e("c", "d"), e("a", "d", "added")] });
    assert.deepEqual(b?.nodes.map((x) => x.id), ["a", "c", "d"]);
    assert.deepEqual(b?.edges.map((x) => `${x.from}>${x.to}`), ["a>c", "c>d"]);
    assert.equal(deriveBefore({ nodes: [n("a", "unchanged")], edges: [] }), null);
  });
});

describe("blocksPrompt", () => {
  it("framework ghi đè được: bugfix bắt buộc sơ đồ luồng", () => assert.match(blocksPrompt("bugfix", { required: ["flow"], optional: [] }), /flow \(REQUIRED\)/));
  it("rỗng với MR nhỏ, nêu khối bắt buộc với đổi luồng", () => {
    assert.equal(blocksPrompt("docs", DEFAULT_VIEWS.docs), "");
    assert.match(blocksPrompt("flow-change", DEFAULT_VIEWS["flow-change"]), /flow \(REQUIRED\)/);
    assert.match(blocksPrompt("flow-change", DEFAULT_VIEWS["flow-change"]), /EVIDENCE IS MANDATORY/);
  });
});
