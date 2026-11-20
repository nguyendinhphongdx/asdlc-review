import assert from "node:assert/strict";
import { test } from "node:test";
import { createAgentTools, type AgentToolContext } from "../agent-tools.js";
import type { Modules } from "../modules.js";

function setup(draft: string | null, commentUrl: string | null = null) {
  const run = { id: "run1", commentDraft: draft, commentUrl };
  const posted: { runId: string; body: string }[] = [];
  const m = { reviews: { latestSucceeded: async () => run, setCommentDraft: async (_id: string, t: string) => { run.commentDraft = t; } } } as unknown as Modules;
  const tools = createAgentTools(m, { postSummary: async (runId, body) => { posted.push({ runId, body }); return { url: "https://x/note/1" }; } });
  const { token } = tools.open({ mrId: "mr1" } as AgentToolContext);
  return { run, posted, tools, token };
}

// Gọi qua MCP đúng như agent: tools/call → text.
async function rpc(tools: ReturnType<typeof createAgentTools>, ctxToken: string, name: string, args: Record<string, unknown> = {}) {
  const out: { body?: unknown } = {};
  const app = { post: (_p: string, h: (req: unknown, reply: unknown) => Promise<unknown>) => { out.body = h; } };
  tools.register(app as never);
  const handler = out.body as (req: unknown, reply: unknown) => Promise<{ result?: { content: { text: string }[] } }>;
  const reply = { status: () => ({ send: (x: unknown) => x }), send: (x: unknown) => x };
  const res = await handler({ params: { token: ctxToken }, body: { id: 1, method: "tools/call", params: { name, arguments: args } } }, reply);
  return res.result!.content[0]!.text;
}

test("edit_summary_comment ghi đè bản nháp; get_summary_comment đọc lại đúng nội dung", async () => {
  const { run, tools, token } = setup("bản cũ");
  assert.match(await rpc(tools, token, "edit_summary_comment", { body: "## Bản mới\nngắn gọn" }), /Đã cập nhật bản nháp/);
  assert.equal(run.commentDraft, "## Bản mới\nngắn gọn");
  assert.equal(JSON.parse(await rpc(tools, token, "get_summary_comment")).draft, "## Bản mới\nngắn gọn");
});

test("edit_summary_comment từ chối nội dung quá ngắn", async () => {
  const { run, tools, token } = setup("bản cũ");
  assert.match(await rpc(tools, token, "edit_summary_comment", { body: "ok" }), /quá ngắn/);
  assert.equal(run.commentDraft, "bản cũ");
});

test("post_summary_comment đăng đúng nội dung đang ở ô soạn; ô trống thì không đăng", async () => {
  const a = setup("nội dung đã sửa");
  assert.match(await rpc(a.tools, a.token, "post_summary_comment"), /Đã đăng/);
  assert.deepEqual(a.posted, [{ runId: "run1", body: "nội dung đã sửa" }]);
  const b = setup("  ");
  assert.match(await rpc(b.tools, b.token, "post_summary_comment"), /trống/);
  assert.equal(b.posted.length, 0);
});
