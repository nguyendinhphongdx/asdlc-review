import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveWindowsCommand } from "../exec.js";

const NPM = "C:\\Users\\u\\AppData\\Roaming\\npm";
const SHIM = `@ECHO off\r\nGOTO start\r\n:start\r\nSETLOCAL\r\nIF EXIST "%dp0%\\node.exe" (\r\n  SET "_prog=%dp0%\\node.exe"\r\n) ELSE (\r\n  SET "_prog=node"\r\n)\r\n"%_prog%"  "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*\r\n`;
const fsOf = (files: Record<string, string>) => ({ exists: (p: string) => p in files, read: (p: string) => files[p] ?? "" });

describe("resolveWindowsCommand", () => {
  it("shim npm .cmd → chạy file JS thật bằng node (không cần shell)", () => {
    const fs = fsOf({ [`${NPM}\\codex.cmd`]: SHIM, [`${NPM}\\node_modules\\@openai\\codex\\bin\\codex.js`]: "" });
    const r = resolveWindowsCommand("codex", `C:\\Windows;${NPM}`, fs);
    assert.ok(r);
    assert.equal(r.cmd, process.execPath);
    assert.deepEqual(r.args, [`${NPM}\\node_modules\\@openai\\codex\\bin\\codex.js`]);
  });
  it(".exe thì chạy thẳng", () => {
    const r = resolveWindowsCommand("claude", "C:\\bin", fsOf({ "C:\\bin\\claude.exe": "" }));
    assert.deepEqual(r, { cmd: "C:\\bin\\claude.exe", args: [] });
  });
  it("không tìm thấy → null (để spawn báo ENOENT như cũ)", () => {
    assert.equal(resolveWindowsCommand("codex", NPM, fsOf({})), null);
  });
  it("shim lạ không đọc ra được file JS → null", () => {
    assert.equal(resolveWindowsCommand("x", NPM, fsOf({ [`${NPM}\\x.cmd`]: "@echo hi" })), null);
  });
});
