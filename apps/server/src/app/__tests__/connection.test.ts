import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { loadConfig } from "../../kernel/config.js";
import { run } from "../../kernel/exec.js";
import { silentLogger } from "../../kernel/logger.js";
import { buildContainer, type Container } from "../container.js";
import { buildServer } from "../http/server.js";

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const TOKEN = "glpat-SUPERSECRETTOKEN1234";

/** GitLab giả: chỉ chấp nhận đúng token; có 1 project mà bot là Maintainer. */
function fakeGitLab(): Promise<{ server: Server; url: string; hooks: unknown[] }> {
  const hooks: unknown[] = [];
  const server = createServer((req, res) => {
    const send = (code: number, body: unknown, h: Record<string, string> = {}) => (res.writeHead(code, { "content-type": "application/json", ...h }), res.end(JSON.stringify(body)));
    if (req.headers["private-token"] !== TOKEN) return send(401, { message: "401 Unauthorized" });
    const u = req.url ?? "";
    if (u === "/api/v4/user") return send(200, { username: "review-bot", name: "Review Bot" });
    if (u === "/api/v4/personal_access_tokens/self") return send(200, { scopes: ["api"], expires_at: "2027-01-01", active: true });
    if (u.startsWith("/api/v4/projects?")) return send(200, [{ id: 1 }], { "x-total": "3" });
    if (u === "/api/v4/projects/team%2Fdemo") return send(200, { id: 1, path_with_namespace: "team/demo", web_url: "http://x/team/demo", http_url_to_repo: "", default_branch: "main", permissions: { project_access: { access_level: 40 } } });
    if (u.startsWith("/api/v4/projects/team%2Fdemo/hooks")) {
      if (req.method === "GET") return send(200, []);
      let b = "";
      req.on("data", (d) => (b += d));
      req.on("end", () => (hooks.push(JSON.parse(b)), send(201, { id: 9 })));
      return;
    }
    send(404, { message: "404 Not Found" });
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ server, url: `http://127.0.0.1:${(server.address() as { port: number }).port}`, hooks })));
}

describe("kết nối GitLab + webhook (HTTP thật, DB thật, GitLab giả)", () => {
  let tmp: string;
  let c: Container;
  let app: FastifyInstance;
  let gl: Awaited<ReturnType<typeof fakeGitLab>>;
  const logs: string[] = [];

  before(async () => {
    gl = await fakeGitLab()
    tmp = mkdtempSync(path.join(tmpdir(), "mrd-conn-"));
    const cfg = loadConfig({ DATA_DIR: path.join(tmp, "data"), DATABASE_URL: `file:${path.join(tmp, "t.db")}`, REDIS_URL: "memory", GITLAB_URL: "http://127.0.0.1:1" } as NodeJS.ProcessEnv);
    await run("npx", ["--no-install", "prisma", "db", "push", "--skip-generate", "--schema", "prisma/schema"], { cwd: SERVER_DIR, env: { DATABASE_URL: cfg.databaseUrl }, timeoutMs: 120_000 });
    const log = { ...silentLogger, info: (m: string, x?: unknown) => logs.push(m + JSON.stringify(x ?? "")), warn: (m: string, x?: unknown) => logs.push(m + JSON.stringify(x ?? "")), error: (m: string, x?: unknown) => logs.push(m + JSON.stringify(x ?? "")) };
    c = buildContainer({ ...cfg, frameworksDir: path.resolve(SERVER_DIR, "../../frameworks") }, silentLogger);
    await c.startWorkers();
    app = await buildServer(c, { webDist: path.join(tmp, "none"), version: "test", log: log as never });
  });
  after(async () => {
    await app.close();
    await c.stop();
    gl.server.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  const call = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: unknown, headers?: Record<string, string>) => app.inject({ method, url, payload: payload as never, headers });

  it("chưa cấu hình → test báo not_configured", async () => {
    const r = (await call("POST", "/api/connection/test", {})).json();
    assert.equal(r.ok, false);
    assert.equal(r.error.code, "not_configured");
  });

  it("token sai → unauthorized; URL không tới được → unreachable", async () => {
    await call("PUT", "/api/connection/gitlab", { baseUrl: gl.url, token: "glpat-WRONGWRONGWRONG" });
    assert.equal((await call("POST", "/api/connection/test", {})).json().error.code, "unauthorized");
    await call("PUT", "/api/connection/gitlab", { baseUrl: "http://127.0.0.1:1", token: TOKEN });
    assert.equal((await call("POST", "/api/connection/test", {})).json().error.code, "unreachable");
  });

  it("token đúng → ok, trả user/scope/số repo; token không xuất hiện trong response và log", async () => {
    const save = await call("PUT", "/api/connection/gitlab", { baseUrl: gl.url, token: TOKEN });
    const test = await call("POST", "/api/connection/test", {});
    const j = test.json();
    assert.equal(j.user.username, "review-bot");
    assert.deepEqual(j.scopes, ["api"]);
    assert.equal(j.projectCount, 3);
    const status = await call("GET", "/api/connection");
    assert.equal(status.json().gitlab.tokenHint, "1234");
    assert.equal(status.json().gitlab.source, "db");
    for (const body of [save.body, test.body, status.body, JSON.stringify(logs)]) assert.ok(!body.includes(TOKEN), "token bị lộ");
  });

  it("token được lưu mã hoá: file DB không chứa plaintext", () => {
    const raw = readFileSync(path.join(tmp, "t.db")).toString("latin1");
    assert.ok(!raw.includes(TOKEN) && !raw.includes("SUPERSECRETTOKEN"), "token nằm dạng rõ trong DB");
  });

  it("kiểm tra repo + tạo webhook tự động (Maintainer)", async () => {
    const chk = (await call("POST", "/api/repos/check", { url: "team/demo" })).json();
    assert.equal(chk.ok, true);
    assert.equal(chk.canCreateWebhook, true);
    const repo = (await call("POST", "/api/repos", { url: `${gl.url}/team/demo` })).json();
    const created = await call("POST", `/api/repos/${repo.id}/webhook/create`, {});
    assert.equal(created.statusCode, 204);
    const hook = gl.hooks[0] as { url: string; token: string; merge_requests_events: boolean };
    assert.equal(hook.merge_requests_events, true);
    assert.ok(hook.url.endsWith("/webhooks/gitlab"));
    const secret = (await call("GET", "/api/connection/webhook-secret")).json().secret;
    assert.equal(hook.token, secret);
  });

  it("webhook sai secret bị từ chối và hiện trong nhật ký; webhook đúng secret được ghi nhận", async () => {
    const repo = (await call("GET", "/api/repos")).json()[0];
    const body = { object_kind: "merge_request", project: { path_with_namespace: "team/demo" }, object_attributes: { iid: 5, action: "update", state: "opened" } };
    const bad = await call("POST", "/webhooks/gitlab", body, { "x-gitlab-token": "nope", "x-gitlab-event": "Merge Request Hook" });
    assert.equal(bad.statusCode, 401);
    let w = (await call("GET", `/api/repos/${repo.id}/webhook`)).json();
    assert.equal(w.status, "bad");
    assert.equal(w.events[0].detail, "Secret không khớp");

    const secret = (await call("GET", "/api/connection/webhook-secret")).json().secret;
    const ok = await call("POST", "/webhooks/gitlab", body, { "x-gitlab-token": secret, "x-gitlab-event": "Merge Request Hook" });
    assert.ok([200, 202].includes(ok.statusCode));
    await new Promise((r) => setTimeout(r, 300));
    w = (await call("GET", `/api/repos/${repo.id}/webhook`)).json();
    assert.equal(w.status, "ok");
    assert.equal(w.rejectedCount, 1);
    assert.equal((await call("GET", "/api/repos")).json()[0].webhook.status, "ok");
  });

  it("xoá kết nối → token biến mất", async () => {
    await call("DELETE", "/api/connection/gitlab");
    assert.equal((await call("GET", "/api/connection")).json().gitlab.tokenSet, false);
  });
});
