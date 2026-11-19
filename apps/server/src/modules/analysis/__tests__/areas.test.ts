import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAnalysisModule } from "../index.js";

const api = createAnalysisModule();
const f = (path: string, additions = 10, deletions = 0) => ({ path, additions, deletions, binary: false });

describe("analysis.areas (T0)", () => {
  it("gom theo module, test đi cùng code nguồn, bỏ file sinh tự động", () => {
    const a = api.areas({ files: [
      f("apps/server/src/modules/reviewer/api.ts", 40), f("apps/server/src/modules/reviewer/__tests__/x.test.ts", 20),
      f("apps/server/src/modules/scoring/api.ts", 5), f("apps/web/src/features/reviews/detail.tsx", 30),
      f("pnpm-lock.yaml", 900), f("docs/PLAN.md", 12),
    ] });
    const ids = a.map((x) => x.id).sort();
    assert.deepEqual(ids, ["apps/server/modules/reviewer", "apps/server/modules/scoring", "apps/web/features/reviews", "docs"].sort());
    const rv = a.find((x) => x.id === "apps/server/modules/reviewer")!;
    assert.equal(rv.files.length, 2);
    assert.equal(rv.noTests, false);
    assert.equal(a.find((x) => x.id === "apps/web/features/reviews")!.noTests, true);
    assert.ok(!a.some((x) => x.files.some((y) => y.path === "pnpm-lock.yaml")));
  });

  it("rủi ro: migration/auth cao hơn, sắp xếp rủi ro giảm dần", () => {
    const a = api.areas({ files: [f("apps/server/prisma/schema/reviews.prisma", 10), f("src/auth/login.ts", 30), f("src/util/str.ts", 4)] });
    assert.ok(a[0]!.risk >= a[a.length - 1]!.risk);
    assert.ok(a.some((x) => x.riskReasons.some((r) => r.includes("xác thực"))));
  });

  it("gộp về tối đa maxAreas, khu vực nhỏ nhất vào other", () => {
    const files = Array.from({ length: 12 }, (_, i) => f(`pkgs/p${i}/x.ts`, i + 1));
    const a = api.areas({ files, maxAreas: 4 });
    assert.ok(a.length <= 4);
    assert.ok(a.some((x) => x.id === "other"));
    assert.equal(a.reduce((s, x) => s + x.files.length, 0), 12);
  });

  it("phụ thuộc giữa khu vực suy từ import thêm vào", () => {
    const diff = `diff --git a/src/a/x.ts b/src/a/x.ts\n--- a/src/a/x.ts\n+++ b/src/a/x.ts\n@@ -0,0 +1,1 @@\n+import { y } from "../b/y.js";\n`;
    const a = api.areas({ files: [f("src/a/x.ts"), f("src/b/y.ts")], diff });
    assert.deepEqual(a.find((x) => x.id === "src/a")!.dependsOn, ["src/b"]);
  });

  it("shouldSplit: nhỏ thì không, lớn/vượt ngân sách thì có", () => {
    assert.equal(api.shouldSplit({ files: 4, lines: 100, areas: 2, omitted: 0 }).split, false);
    assert.equal(api.shouldSplit({ files: 40, lines: 3000, areas: 4, omitted: 0 }).split, true);
    assert.equal(api.shouldSplit({ files: 5, lines: 100, areas: 1, omitted: 2 }).split, true);
  });

  it("packDiff chia phần vừa ngân sách, file quá lớn vào omitted", () => {
    const d = (n: string, len: number) => `diff --git a/${n} b/${n}\n${"x".repeat(len)}\n`;
    const diff = d("a.ts", 100) + d("b.ts", 100) + d("c.ts", 100) + d("big.ts", 5000);
    const by = api.splitDiff(diff);
    assert.equal(by.size, 4);
    const r = api.packDiff(["a.ts", "b.ts", "c.ts", "big.ts"], by, 300);
    assert.deepEqual(r.omitted, ["big.ts"]);
    assert.equal(r.chunks.length, 2);
    assert.equal(r.chunks.flatMap((c) => c.files).length, 3);
  });
});
