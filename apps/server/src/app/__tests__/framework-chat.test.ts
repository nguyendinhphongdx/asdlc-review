import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { ActionDto, ChatStateDto, FrameworkDetailDto } from "@mrd/contracts";
import type { FastifyInstance } from "fastify";
import { loadConfig } from "../../kernel/config.js";
import { run } from "../../kernel/exec.js";
import { silentLogger } from "../../kernel/logger.js";
import { buildContainer, type Container } from "../container.js";
import { buildServer } from "../http/server.js";

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("chat framework: tool → đề xuất → duyệt (HTTP + DB thật)", () => {
  let tmp: string;
  let c: Container;
  let app: FastifyInstance;
  before(async () => {
    tmp = mkdtempSync(path.join(tmpdir(), "mrd-fwchat-"));
    const cfg = loadConfig({ DATA_DIR: path.join(tmp, "data"), DATABASE_URL: `file:${path.join(tmp, "t.db")}`, REDIS_URL: "memory" } as NodeJS.ProcessEnv);
    await run("npx", ["--no-install", "prisma", "db", "push", "--skip-generate", "--schema", "prisma/schema"], { cwd: SERVER_DIR, env: { DATABASE_URL: cfg.databaseUrl }, timeoutMs: 120_000 });
    c = buildContainer({ ...cfg, frameworksDir: path.resolve(SERVER_DIR, "../../frameworks") }, silentLogger);
    await c.startWorkers();
    app = await buildServer(c, { webDist: path.join(tmp, "none"), version: "test", log: silentLogger });
  });
  after(async () => {
    await app.close();
    await c.stop();
    rmSync(tmp, { recursive: true, force: true });
  });

  /** Gọi tool như agent (MCP JSON-RPC qua HTTP, token dùng cho một lượt). */
  const tool = async (frameworkId: string, name: string, args: Record<string, unknown>) => {
    const s = c.frameworkTools.open({ scope: `fw:${frameworkId}`, frameworkId });
    try {
      const r = await app.inject({ method: "POST", url: `/mcp/framework/${s.token}`, payload: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } } });
      assert.equal(r.statusCode, 200);
      return (r.json() as { result: { content: { text: string }[] } }).result.content[0]!.text;
    } finally { s.close(); }
  };
  const chat = async (id: string) => (await app.inject({ method: "GET", url: `/api/frameworks/${id}/chat` })).json() as ChatStateDto;
  const NEW_RULE = { op: "add_rule", category: "security", id: "ACM-01", title: "Không log dữ liệu cá nhân", check: "Diff có ghi email/số điện thoại vào log không?", severity: "major" };

  it("token hết hạn bị từ chối; tool đọc trả nội dung framework", async () => {
    assert.equal((await app.inject({ method: "POST", url: "/mcp/framework/khong-co", payload: { id: 1, method: "ping" } })).statusCode, 404);
    const fw = JSON.parse(await tool("backend", "get_framework", {})) as { id: string; readOnly: boolean; categories: unknown[] };
    assert.equal(fw.id, "backend");
    assert.equal(fw.readOnly, true);
    assert.ok(fw.categories.length > 0);
    assert.match(await tool("backend", "get_rule_stats", {}), /Chưa có review/);
  });

  it("preview/propose bác thay đổi vi phạm rule khoá hoặc sai cấu trúc, không tạo đề xuất", async () => {
    const bad = await tool("backend", "propose_edit", { reason: "x", forkName: "Acme", ops: [{ op: "update_rule", id: "SEC-01", enabled: false }] });
    assert.match(bad, /SEC-01/);
    assert.match(await tool("backend", "propose_edit", { reason: "x", forkName: "Acme", ops: [{ op: "add_rule", category: "khong-co", id: "ACM-09", title: "t", check: "c", severity: "minor" }] }), /hạng mục/);
    assert.match(await tool("backend", "propose_edit", { reason: "x", ops: [NEW_RULE] }), /forkName/); // bản chỉ đọc cần tên bản mới
    assert.match(await tool("backend", "propose_edit", { reason: "x", forkName: "A", ops: [{ op: "xoa_het" }] }), /không hỗ trợ/);
    assert.equal((await chat("backend")).actions.length, 0);
  });

  let forkId = "";
  it("đề xuất trên bản chỉ đọc → duyệt thì fork + áp thành phiên bản mới (rule locked giữ nguyên)", async () => {
    const prev = JSON.parse(await tool("backend", "preview_changes", { ops: [NEW_RULE] })) as { errors: string[]; changes: unknown[] };
    assert.deepEqual(prev.errors, []);
    assert.ok(prev.changes.length >= 1);
    assert.match(await tool("backend", "propose_edit", { reason: "Team hay lộ PII trong log", forkName: "Acme Backend", ops: [NEW_RULE] }), /chờ người dùng duyệt/);
    const st = await chat("backend");
    assert.equal(st.actions.length, 1);
    const a: ActionDto = st.actions[0]!;
    assert.equal(a.kind, "framework_edit");
    assert.equal(a.payload.forkName, "Acme Backend");

    const ok = await app.inject({ method: "POST", url: `/api/actions/${a.id}/approve`, payload: {} });
    assert.equal(ok.statusCode, 200);
    const out = ok.json() as { note: string; frameworkId: string };
    forkId = out.frameworkId;
    assert.notEqual(forkId, "backend");
    const d = (await app.inject({ method: "GET", url: `/api/frameworks/${forkId}` })).json() as FrameworkDetailDto;
    assert.equal(d.kind, "custom");
    assert.ok(d.categories.flatMap((x) => x.criteria).some((r) => r.id === "ACM-01"));
    assert.ok(d.categories.flatMap((x) => x.criteria).find((r) => r.id === "SEC-01")?.locked);
    assert.equal(d.versions.length, 2); // fork (v1) + đề xuất AI (v2)
    assert.equal((await chat("backend")).actions.length, 0);
    // duyệt lần hai bị từ chối
    assert.equal((await app.inject({ method: "POST", url: `/api/actions/${a.id}/approve`, payload: {} })).statusCode, 409);
  });

  it("bản tự tạo: đề xuất áp thẳng vào bản đó; bỏ đề xuất thì không đổi gì", async () => {
    assert.match(await tool(forkId, "propose_edit", { reason: "Hạ ACM-01 xuống minor", ops: [{ op: "update_rule", id: "ACM-01", severity: "minor" }] }), /chờ người dùng duyệt/);
    const [a] = (await chat(forkId)).actions;
    assert.ok(a && !a.payload.forkName);
    await app.inject({ method: "POST", url: `/api/actions/${a.id}/dismiss`, payload: {} });
    assert.equal((await chat(forkId)).actions.length, 0);
    assert.equal(((await app.inject({ method: "GET", url: `/api/frameworks/${forkId}` })).json() as FrameworkDetailDto).versions.length, 2);

    await tool(forkId, "propose_edit", { reason: "Hạ ACM-01 xuống minor", ops: [{ op: "update_rule", id: "ACM-01", severity: "minor" }] });
    const [b] = (await chat(forkId)).actions;
    const res = (await app.inject({ method: "POST", url: `/api/actions/${b!.id}/approve`, payload: {} })).json() as { frameworkId: string };
    assert.equal(res.frameworkId, forkId);
    const d = (await app.inject({ method: "GET", url: `/api/frameworks/${forkId}` })).json() as FrameworkDetailDto;
    assert.equal(d.categories.flatMap((x) => x.criteria).find((r) => r.id === "ACM-01")?.defaultSeverity, "minor");
    assert.equal(d.versions.length, 3);
    assert.equal((await app.inject({ method: "GET", url: "/api/frameworks/khong-co/chat" })).statusCode, 404);
  });
});
