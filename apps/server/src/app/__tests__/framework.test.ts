import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { FrameworkDetailDto, FrameworkEditInput, FrameworkInfoDto } from "@mrd/contracts";
import type { FastifyInstance } from "fastify";
import { loadConfig } from "../../kernel/config.js";
import { run } from "../../kernel/exec.js";
import { silentLogger } from "../../kernel/logger.js";
import { buildContainer, type Container } from "../container.js";
import { buildServer } from "../http/server.js";

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("framework: fork, phiên bản, xoá an toàn (HTTP + DB thật)", () => {
  let tmp: string;
  let c: Container;
  let app: FastifyInstance;
  before(async () => {
    tmp = mkdtempSync(path.join(tmpdir(), "mrd-fw-"));
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

  const call = (method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH", url: string, payload?: unknown) => app.inject({ method, url, payload: payload as never });
  const toEdit = (d: FrameworkDetailDto, note = "n"): FrameworkEditInput => ({
    name: d.name, severity: d.severity, sizeBaseline: d.sizeBaseline, grades: d.grades, note,
    gates: d.gates.map((g) => ({ id: g.id, reason: g.reason, capTotal: g.capTotal, when: g.when })),
    categories: d.categories.map((x) => ({ id: x.id, name: x.name, weight: x.weight, criteria: x.criteria.map(({ locked: _l, ...r }) => r) })),
  });
  let id = "";
  let detail: FrameworkDetailDto;

  it("danh sách gồm mặc định + 3 mẫu, chỉ đọc; sửa bản mặc định bị từ chối", async () => {
    const list = (await call("GET", "/api/frameworks")).json() as FrameworkInfoDto[];
    assert.deepEqual(list.map((f) => f.kind).sort(), ["default", "template", "template", "template"]);
    const asdlc = (await call("GET", "/api/frameworks/asdlc")).json() as FrameworkDetailDto;
    assert.equal(asdlc.readOnly, true);
    const r = await call("PUT", "/api/frameworks/asdlc", toEdit(asdlc));
    assert.equal(r.statusCode, 400);
    assert.match(r.json().message, /fork/);
  });

  it("fork từ mẫu Backend → bản v1 sửa được, có lịch sử", async () => {
    const r = await call("POST", "/api/frameworks", { baseId: "backend", name: "Acme Backend" });
    assert.equal(r.statusCode, 201);
    detail = r.json();
    id = detail.id;
    assert.equal(detail.kind, "custom");
    assert.equal(detail.version, "1");
    assert.equal(detail.baseId, "backend");
    assert.equal(detail.versions.length, 1);
  });

  it("sửa hợp lệ → phiên bản mới; diff so với bản gốc; review dùng rubric mới", async () => {
    const e = toEdit(detail, "tăng trọng số bảo mật");
    e.categories.find((x) => x.id === "security")!.weight = 40;
    const r = await call("PUT", `/api/frameworks/${id}`, e);
    assert.equal(r.statusCode, 200);
    detail = r.json();
    assert.equal(detail.version, "2");
    assert.equal(detail.versions[0]!.note, "tăng trọng số bảo mật");
    const diff = (await call("GET", `/api/frameworks/${id}/diff`)).json() as { path: string; to: string }[];
    assert.ok(diff.some((d) => d.path === "security.weight" && d.to === "40"));
    const resolved = await c.modules.framework.resolve({ frameworkId: id });
    assert.equal(resolved.rubric.version, "2");
    assert.equal(resolved.rubric.categories.find((x) => x.id === "security")!.weight, 40);
  });

  it("tắt SEC-01 bị từ chối, nêu rõ lý do; không tạo phiên bản", async () => {
    const e = toEdit(detail);
    e.categories.find((x) => x.id === "security")!.criteria.find((r) => r.id === "SEC-01")!.enabled = false;
    const r = await call("PUT", `/api/frameworks/${id}`, e);
    assert.equal(r.statusCode, 400);
    assert.match(r.json().message, /SEC-01/);
    assert.equal(((await call("GET", `/api/frameworks/${id}`)).json() as FrameworkDetailDto).version, "2");
  });

  it("khôi phục v1 tạo phiên bản mới (v3) và trả lại trọng số cũ; v2 vẫn còn", async () => {
    const r = await call("POST", `/api/frameworks/${id}/restore`, { version: 1 });
    detail = r.json();
    assert.equal(detail.version, "3");
    assert.notEqual(detail.categories.find((x) => x.id === "security")!.weight, 40);
    assert.equal(detail.versions.length, 3);
    const old = (await call("GET", `/api/frameworks/${id}?version=2`)).json() as FrameworkDetailDto;
    assert.equal(old.categories.find((x) => x.id === "security")!.weight, 40);
  });

  it("repo đang dùng thì không xoá được; hết dùng thì xoá được; xoá rồi vẫn review bằng mặc định", async () => {
    const repo = await c.modules.repos.register({ platform: "gitlab", fullPath: "team/demo", webUrl: "http://x/team/demo" });
    await call("PATCH", `/api/repos/${repo.id}`, { frameworkId: id });
    assert.equal((await call("DELETE", `/api/frameworks/${id}`)).statusCode, 409);
    const list = (await call("GET", "/api/frameworks")).json() as FrameworkInfoDto[];
    assert.equal(list.find((f) => f.id === id)!.repoCount, 1);
    await call("PATCH", `/api/repos/${repo.id}`, { frameworkId: null });
    assert.equal((await call("DELETE", `/api/frameworks/${id}`)).statusCode, 204);
    const r = await c.modules.framework.resolve({ frameworkId: id });
    assert.equal(r.rubric.id, "asdlc");
  });

  it("preview .asdlc.yml: hợp lệ liệt kê thay đổi; vi phạm báo lỗi", async () => {
    const ok = (await call("POST", "/api/framework-config/preview", { yaml: "weights: { security: 25 }\ndocs: [docs/**]\n" })).json();
    assert.equal(ok.valid, true);
    assert.equal(ok.changes.length, 1);
    assert.deepEqual(ok.docs, ["docs/**"]);
    const bad = (await call("POST", "/api/framework-config/preview", { yaml: "disable: [SEC-01]\n" })).json();
    assert.equal(bad.valid, false);
    assert.match(bad.errors[0], /SEC-01/);
  });
});
