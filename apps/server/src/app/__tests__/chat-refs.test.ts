import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { refsBlock } from "../workflows/agent-chat.js";

describe("refsBlock (@ và / trong chat)", () => {
  it("nạp lệnh/skill của repo như dữ liệu không tin cậy, bỏ đường dẫn lạ và thoát thư mục", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "refs-"));
    await fs.mkdir(path.join(dir, ".claude/commands"), { recursive: true });
    await fs.writeFile(path.join(dir, ".claude/commands/sec.md"), "Kiểm tra bảo mật migration");
    await fs.writeFile(path.join(dir, "secret.txt"), "KHONG-DUOC-DOC");
    const out = await refsBlock(dir, [
      { kind: "command", path: ".claude/commands/sec.md" },
      { kind: "command", path: "../secret.txt" },
      { kind: "skill", path: "secret.txt" },
      { kind: "file", path: "src/a.ts" },
      { kind: "file", path: "../etc/passwd" },
    ]);
    assert.match(out, /UNTRUSTED/);
    assert.match(out, /Kiểm tra bảo mật migration/);
    assert.doesNotMatch(out, /KHONG-DUOC-DOC/);
    assert.match(out, /- src\/a\.ts/);
    assert.doesNotMatch(out, /passwd/);
    assert.equal((out.match(/ignored invalid reference/g) ?? []).length, 2);
  });
  it("không có checkout thì báo không nạp được thay vì lỗi", async () => {
    assert.match(await refsBlock(undefined, [{ kind: "agent", path: ".claude/agents/x.md" }]), /checkout unavailable/);
  });
});
