import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pathsMatch } from "../domain/glob.js";

describe("pathsMatch", () => {
  it("trống = luôn khớp", () => { assert.equal(pathsMatch("", ["a.ts"]), true); });
  it("khớp thư mục với **", () => {
    assert.equal(pathsMatch("apps/server/**", ["apps/server/src/a.ts"]), true);
    assert.equal(pathsMatch("apps/server/**", ["apps/web/src/a.ts"]), false);
  });
  it("khớp đuôi file ở mọi cấp", () => {
    assert.equal(pathsMatch("**/*.sql", ["db/migrations/1.sql"]), true);
    assert.equal(pathsMatch("*.sql", ["db/x.ts"]), false);
  });
  it("nhiều glob: chỉ cần một khớp", () => { assert.equal(pathsMatch("docs/**, **/*.md", ["README.md"]), true); });
});
