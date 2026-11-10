import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAnalysisModule } from "../index.js";

const api = createAnalysisModule();
const diff = (path: string, lines: string[]) =>
  `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,${lines.length} @@\n${lines.map((l) => "+" + l).join("\n")}\n`;
const files = (path: string, additions: number) => [{ path, additions, deletions: 0, binary: false }];

describe("analysis", () => {
  it("phát hiện secret và che giá trị", () => {
    const key = "AKIA" + "ABCDEFGHIJKLMNOP";
    const r = api.analyze({ diff: diff("src/a.ts", [`const k = "${key}";`]), files: files("src/a.ts", 1), mrDescription: "mô tả đủ dài để qua kiểm tra" });
    const f = r.findings.find((x) => x.ruleId === "SEC-01")!;
    assert.ok(f);
    assert.equal(f.lineStart, 1);
    assert.ok(!JSON.stringify(f).includes(key), "evidence không được chứa secret thật");
  });

  it("bỏ qua placeholder", () => {
    const r = api.analyze({ diff: diff("src/a.ts", ['const password = "changeme-example-value";']), files: files("src/a.ts", 1), mrDescription: "x".repeat(30) });
    assert.equal(r.findings.filter((x) => x.ruleId === "SEC-01").length, 0);
  });

  it("phát hiện .only, console.log, ts-ignore với số dòng đúng", () => {
    const r = api.analyze({
      diff: diff("src/a.test.ts", ["// c", "it.only('x', () => {})"]) + diff("src/b.ts", ["a()", "console.log(1)", "// @ts-ignore"]),
      files: [...files("src/a.test.ts", 2), ...files("src/b.ts", 3)],
      mrDescription: "x".repeat(30),
    });
    const by = (id: string) => r.findings.filter((x) => x.ruleId === id);
    assert.equal(by("TST-04")[0]?.lineStart, 2);
    assert.equal(by("TST-04")[0]?.severity, "critical");
    assert.equal(by("MNT-03")[0]?.lineStart, 2);
    assert.equal(by("CON-05")[0]?.lineStart, 3);
  });

  it("lockfile không tính vào changedLines; mô tả trống bị nhắc", () => {
    const r = api.analyze({
      diff: "",
      files: [
        { path: "pnpm-lock.yaml", additions: 5000, deletions: 100, binary: false },
        { path: "src/a.ts", additions: 10, deletions: 5, binary: false },
      ],
      mrDescription: "",
    });
    assert.equal(r.changedLines, 15);
    assert.ok(r.findings.some((f) => f.ruleId === "SCO-01"));
    assert.ok(!r.findings.some((f) => f.ruleId === "SCO-03"));
  });
});
