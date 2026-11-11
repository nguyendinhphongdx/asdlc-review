import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decrypt, encrypt, hintOf } from "../domain/crypto.js";

describe("secrets/crypto", () => {
  const key = "k".repeat(32);
  it("mã hoá rồi giải mã ra đúng giá trị, và mỗi lần mã hoá cho kết quả khác nhau", () => {
    const a = encrypt("glpat-abc123", key);
    assert.equal(decrypt(a, key), "glpat-abc123");
    assert.notEqual(a, encrypt("glpat-abc123", key));
    assert.ok(!a.includes("glpat"));
  });
  it("sai khoá hoặc dữ liệu bị sửa thì ném lỗi", () => {
    const a = encrypt("secret-value", key);
    assert.throws(() => decrypt(a, "x".repeat(32)));
    const raw = Buffer.from(a, "base64");
    raw[raw.length - 1] = (raw[raw.length - 1] ?? 0) ^ 1;
    assert.throws(() => decrypt(raw.toString("base64"), key));
    assert.throws(() => decrypt("YQ==", key));
  });
  it("hint chỉ lộ 4 ký tự cuối, giá trị ngắn thì che hết", () => {
    assert.equal(hintOf("glpat-xxxxxxxxXk9f"), "Xk9f");
    assert.equal(hintOf("short"), "••••");
  });
});
