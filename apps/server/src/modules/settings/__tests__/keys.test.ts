import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { migrateLegacy } from "../domain/keys.js";

describe("settings: chuyển cài đặt cũ sang providerModels/aiRoles", () => {
  it("gom model từng provider và chat riêng", () => {
    const out = migrateLegacy({ claudeModel: "claude-opus-5-5", geminiModel: "", chatProvider: "gemini-api", chatModel: "gemini-3.5-flash", passScore: 70 });
    assert.deepEqual(out.providerModels, { "claude-cli": "claude-opus-5-5" });
    assert.deepEqual(out.aiRoles, { chat: { provider: "gemini-api", model: "gemini-3.5-flash" } });
    assert.equal(out.passScore, 70);
    assert.ok(!("claudeModel" in out) && !("chatProvider" in out));
  });
  it("khoá mới thắng khoá cũ", () => {
    const out = migrateLegacy({ claudeModel: "old", providerModels: { "claude-cli": "new" } });
    assert.deepEqual(out.providerModels, { "claude-cli": "new" });
  });
});
