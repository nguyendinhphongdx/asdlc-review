import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractReferences } from "../domain/references.js";

const tracked = new Set(["AGENTS.md", "wiki/rules/api.md", "docs/guide/style.md", "notes/design.txt", "src/a.ts"]);

describe("extractReferences: tìm tài liệu qua liên kết, không phụ thuộc vị trí", () => {
  it("link markdown, @import và đường dẫn trong backtick", () => {
    const md = "Xem [API](wiki/rules/api.md#auth) và @docs/guide/style.md, ghi chú ở `notes/design.txt`. Ngoài: [x](https://a.com/b.md)";
    assert.deepEqual(extractReferences("AGENTS.md", md, tracked).sort(), ["docs/guide/style.md", "notes/design.txt", "wiki/rules/api.md"]);
  });
  it("đường dẫn tương đối theo thư mục của file dẫn", () => {
    assert.deepEqual(extractReferences("docs/guide/index.md", "[s](./style.md)", tracked), ["docs/guide/style.md"]);
  });
  it("bỏ file không tồn tại, không phải tài liệu, hoặc trỏ ra ngoài repo", () => {
    assert.deepEqual(extractReferences("AGENTS.md", "[a](missing.md) `src/a.ts` [b](../../etc/x.md)", tracked), []);
  });
});
