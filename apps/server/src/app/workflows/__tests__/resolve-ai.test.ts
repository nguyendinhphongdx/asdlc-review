import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveAi } from "../mappers.js";

const s = { reviewProvider: "claude-cli", providerModels: { "claude-cli": "opus", "gemini-api": "flash" }, aiRoles: { chat: { provider: "", model: "" } } };

describe("resolveAi", () => {
  it("review: theo cài đặt chung, repo ghi đè được", () => {
    assert.deepEqual(resolveAi(s, "review"), { provider: "claude-cli", model: "opus" });
    assert.deepEqual(resolveAi(s, "review", { provider: "gemini-api", model: null }), { provider: "gemini-api", model: "flash" });
    assert.deepEqual(resolveAi(s, "review", { provider: null, model: "x" }), { provider: "claude-cli", model: "x" });
  });
  it("chat dùng chung khi vai trò chưa chọn provider", () => {
    assert.deepEqual(resolveAi(s, "chat", { provider: null, model: "x" }), { provider: "claude-cli", model: "x" });
  });
  it("chat có provider riêng: dùng model của vai trò, thiếu thì model cấu hình cho provider, bỏ qua repo", () => {
    const a = { ...s, aiRoles: { chat: { provider: "gemini-api", model: "" } } };
    assert.deepEqual(resolveAi(a, "chat", { provider: "claude-cli", model: "x" }), { provider: "gemini-api", model: "flash" });
    const b = { ...s, aiRoles: { chat: { provider: "gemini-api", model: "pro" } } };
    assert.equal(resolveAi(b, "chat").model, "pro");
  });
  it("vai trò lạ rơi về review", () => {
    assert.deepEqual(resolveAi(s, "summary"), { provider: "claude-cli", model: "opus" });
  });
});
