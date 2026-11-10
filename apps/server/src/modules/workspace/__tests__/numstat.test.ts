import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeRenamePath, parseNumstat, truncateDiff } from "../domain/numstat.js";

describe("workspace domain", () => {
  it("parse numstat, file nhị phân và đổi tên", () => {
    const r = parseNumstat("3\t1\tsrc/{a => b}/x.ts\n-\t-\timg.png\n");
    assert.deepEqual(r[0], { file: "src/b/x.ts", additions: 3, deletions: 1, binary: false });
    assert.equal(r[1]!.binary, true);
    assert.equal(normalizeRenamePath("old.ts => new.ts"), "new.ts");
  });
  it("cắt diff giữ file nhỏ, báo file bị lược", () => {
    const small = "diff --git a/s.ts b/s.ts\n+x\n";
    const big = "diff --git a/big.ts b/big.ts\n" + "+y\n".repeat(500);
    const r = truncateDiff(small + big, 200);
    assert.ok(r.text.includes("s.ts"));
    assert.deepEqual(r.omitted, ["big.ts"]);
  });
});
