import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchesBranch } from "../workflows/request-review.js";

describe("matchesBranch", () => {
  it("khớp chính xác và theo wildcard", () => {
    assert.equal(matchesBranch("develop", "develop"), true);
    assert.equal(matchesBranch("develop, release/*", "release/1.2"), true);
    assert.equal(matchesBranch("develop, release/*", "feature/x"), false);
    assert.equal(matchesBranch("main", "main-2"), false);
  });
  it("ký tự đặc biệt của regex được coi là chữ thường", () => {
    assert.equal(matchesBranch("v1.0", "v1x0"), false);
    assert.equal(matchesBranch("v1.0", "v1.0"), true);
  });
});
