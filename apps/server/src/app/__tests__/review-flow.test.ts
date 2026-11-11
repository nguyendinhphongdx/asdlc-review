import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../../kernel/config.js";
import { run } from "../../kernel/exec.js";
import { silentLogger } from "../../kernel/logger.js";
import type { ReviewerApi } from "../../modules/reviewer/index.js";
import type { MrInfo, ScmApi } from "../../modules/scm/index.js";
import { buildContainer, type Container } from "../container.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(here, "../../..");
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } }).trim();

describe("workflow review end-to-end (git thật, DB thật, AI giả)", () => {
  let tmp: string;
  let c: Container;
  let headSha = "";
  let baseSha = "";
  const notes: string[] = [];
  const inline: { file: string; line: number }[] = [];

  before(async () => {
    tmp = mkdtempSync(path.join(tmpdir(), "mrd-it-"));
    const origin = path.join(tmp, "origin");
    mkdirSync(origin);
    git(origin, "init", "-q", "-b", "main");
    writeFileSync(path.join(origin, "README.md"), "# Demo\n");
    writeFileSync(path.join(origin, "CLAUDE.md"), "# Rules\n- MUST use logger, never console.log\n");
    git(origin, "add", "."), git(origin, "commit", "-qm", "init");
    baseSha = git(origin, "rev-parse", "HEAD");
    git(origin, "checkout", "-q", "-b", "feature");
    mkdirSync(path.join(origin, "src"));
    writeFileSync(path.join(origin, "src/pay.ts"), `export function pay() {\n  const key = "AKIAABCDEFGHIJKLMNOP";\n  console.log("paying", key);\n  return 1;\n}\n`);
    git(origin, "add", "."), git(origin, "commit", "-qm", "add pay");
    headSha = git(origin, "rev-parse", "HEAD");

    const cfg = loadConfig({ DATA_DIR: path.join(tmp, "data"), DATABASE_URL: `file:${path.join(tmp, "t.db")}`, REDIS_URL: "memory", PUBLISH_COMMENTS: "true" } as NodeJS.ProcessEnv);
    await run("npx", ["--no-install", "prisma", "db", "push", "--skip-generate", "--schema", "prisma/schema"], { cwd: SERVER_DIR, env: { DATABASE_URL: cfg.databaseUrl }, timeoutMs: 120_000 });

    const mr: MrInfo = {
      platform: "gitlab", projectPath: "team/demo", projectId: "1", projectWebUrl: "https://gl/team/demo", defaultBranch: "main", cloneUrl: origin, iid: 7, title: "Add pay", description: "",
      webUrl: "https://gl/team/demo/-/merge_requests/7", sourceBranch: "feature", targetBranch: "main", authorUsername: "Dev.An", authorName: "Dev An", state: "opened", draft: false,
      createdAt: new Date(), mergedAt: null, closedAt: null, headSha, baseSha, startSha: baseSha, headRef: "refs/heads/feature", commits: 1,
    };
    const scm = {
      isConfigured: () => true, getMergeRequest: async () => mr, gitAuth: () => ({ secrets: [] }),
      upsertSummaryNote: async (_m: MrInfo, body: string) => (notes.push(body), "https://gl/note/1"),
      postInline: async (_m: MrInfo, d: { file: string; line: number }) => (inline.push(d), true),
      parseUrl: () => null, parseProjectUrl: () => null, listOpen: async () => [], reply: async () => undefined, verifyWebhook: () => true, webhookConfigured: () => true, parseWebhook: () => null,
    } as unknown as ScmApi;
    const reviewer: ReviewerApi = {
      providers: async () => [],
      review: async () => ({
        review: { summary: "Thêm hàm thanh toán", intent: "Thêm pay()", strengths: [], harnessUsed: ["CLAUDE.md"], findings: [{ category: "conventions", ruleId: "CON-03", severity: "major", kind: "issue", title: "Dùng console.log thay vì logger", file: "src/pay.ts", lineStart: 3, lineEnd: null, why: "CLAUDE.md cấm console.log", evidence: null, suggestion: "Dùng logger", question: "Vì sao không dùng logger?", confidence: 0.9 }] },
        usage: { provider: "claude-cli", model: "fake", costUsd: 0.12, durationMs: 5 },
      }),
    };
    c = buildContainer({ ...cfg, frameworksDir: path.resolve(SERVER_DIR, "../../frameworks") }, silentLogger, { scm, reviewer });
    await c.startWorkers();
  });

  after(async () => {
    await c.stop();
    rmSync(tmp, { recursive: true, force: true });
  });

  const input = { platform: "gitlab", projectPath: "team/demo", iid: 7, trigger: "manual" } as const;
  const waitRuns = async (n: number) => {
    for (let i = 0; i < 100; i++) {
      const { items } = await c.modules.reviews.listRuns({});
      if (items.filter((r) => r.status !== "running").length >= n) return items;
      await wait(100);
    }
    throw new Error("quá thời gian chờ review");
  };

  it("chạy trọn pipeline: phân tích tĩnh + AI + chấm điểm + đăng comment + lưu", async () => {
    assert.equal((await c.workflows.requestReview(input)).status, "queued");
    const [run1] = await waitRuns(1);
    assert.equal(run1!.status, "succeeded", run1!.error ?? "");
    const d = await c.modules.reviews.getRun(run1!.id);

    assert.ok(d.findings.some((f) => f.source === "static" && f.ruleId === "SEC-01"), "phải bắt được secret");
    assert.ok(d.findings.some((f) => f.source === "ai" && f.ruleId === "CON-03"));
    assert.ok(!JSON.stringify(d.findings).includes("AKIAABCDEFGHIJKLMNOP"), "không được lưu secret thật");
    assert.ok(d.score! <= 30, `lộ secret → điểm bị chặn ≤ 30 (được ${d.score})`);
    assert.equal(d.grade, "F");
    assert.equal(d.verdict, "request_changes");
    assert.ok(d.gates.some((g) => g.id === "secret-leak"));
    assert.deepEqual(d.stageTimings && Object.keys(d.stageTimings).sort(), ["analysis", "clone", "framework", "harness", "publish", "review", "score"]);
    assert.ok(d.harnessFiles.includes("CLAUDE.md"));
    assert.equal(d.frameworkId, "asdlc");
    assert.equal(d.frameworkVersion, "1.0.0");
    assert.equal(typeof d.harnessReport?.score, "number");
    assert.ok(d.harnessReport!.items.find((i) => i.id === "instructions")!.points > 0, "CLAUDE.md được tính vào độ phủ");
    assert.equal(d.filesChanged, 1);
    assert.equal(d.mr.firstScore, d.score);
    assert.equal(notes.length, 1);
    assert.ok(notes[0]!.includes("mr-dashboard:summary") && notes[0]!.includes("Dùng console.log"));
    assert.ok(inline.some((i) => i.file === "src/pay.ts"));
  });

  it("không review lại cùng commit; ép review lại tạo vòng 2", async () => {
    assert.equal((await c.workflows.requestReview(input)).status, "already_reviewed");
    assert.equal((await c.workflows.requestReview({ ...input, force: true })).status, "queued");
    const items = await waitRuns(2);
    assert.equal(items.length, 2);
    assert.deepEqual(items.map((r) => r.round).sort(), [1, 2]);
  });

  it("tác giả được tạo thành viên và lên leaderboard", async () => {
    const members = await c.modules.identity.list();
    assert.equal(members.length, 1);
    assert.equal(members[0]!.identities[0]!.username, "dev.an");
    const lb = await c.modules.analytics.leaderboard({ from: new Date(Date.now() - 86_400_000), to: new Date(Date.now() + 86_400_000) });
    assert.equal(lb.length, 1);
    assert.equal(lb[0]!.name, "Dev An");
    assert.equal(lb[0]!.secretLeaks, 1);
    assert.equal(lb[0]!.mrCount, 1);
    assert.equal(lb[0]!.avgReviewRounds, 2);
  });

  it("chat command", async () => {
    assert.ok((await c.workflows.chatCommand({ text: "help" })).includes("review"));
    assert.ok((await c.workflows.chatCommand({ text: "leaderboard 7d" })).includes("Dev An"));
  });
});
