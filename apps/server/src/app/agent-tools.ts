import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { MrInfo } from "../modules/scm/index.js";
import type { Modules } from "./modules.js";

/** Ngữ cảnh của một lượt chat: tool chỉ thao tác trên đúng MR này. */
export interface AgentToolContext {
  mrId: string;
  repoId: string;
  frameworkId: string | null;
  /** Diff đầy đủ của MR (từ worktree đã chuẩn bị). */
  diff: string;
  workdir: string;
  mr: MrInfo;
}

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(ctx: AgentToolContext, args: Record<string, unknown>): Promise<string>;
}

const str = (v: unknown, max = 4000) => (typeof v === "string" ? v.slice(0, max) : "");
const obj = (props: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties: props, required, additionalProperties: false });

export const MCP_NAME = "mrd";

/**
 * Tool nội bộ cho agent chat, phơi qua MCP (HTTP) trên chính server này, mỗi lượt chat một token dùng một lần.
 * Đọc thì tự do; thao tác ghi (comment, chạy lại) chỉ tạo ĐỀ XUẤT chờ người duyệt.
 */
export function createAgentTools(m: Modules) {
  const sessions = new Map<string, AgentToolContext>();

  const tools: ToolDef[] = [
    {
      name: "get_review",
      description: "Kết quả review mới nhất của MR: điểm, grade, verdict, summary, gates, toàn bộ finding (mức độ, rule, file:dòng, lý do, bằng chứng, gợi ý).",
      inputSchema: obj({}),
      async run(ctx) {
        const r = await m.reviews.latestSucceeded(ctx.mrId);
        if (!r) return "MR này chưa có review nào hoàn tất.";
        return JSON.stringify({
          score: r.score, grade: r.grade, verdict: r.verdict, summary: r.summary, intent: r.intent, gates: r.gates, headSha: r.headSha, createdAt: r.createdAt,
          findings: r.findings.map((f) => ({ id: f.id, severity: f.severity, ruleId: f.ruleId, title: f.title, file: f.file, line: f.lineStart, why: f.why, evidence: f.evidence, suggestion: f.suggestion, feedback: f.feedback })),
        });
      },
    },
    {
      name: "get_diff",
      description: "Diff của MR so với nhánh đích. Truyền `file` để chỉ lấy diff của một file (nên dùng khi diff lớn).",
      inputSchema: obj({ file: { type: "string", description: "Đường dẫn file trong repo (tuỳ chọn)" } }),
      async run(ctx, a) {
        const file = str(a.file, 500);
        let d = ctx.diff;
        if (file) d = d.split(/^(?=diff --git )/m).filter((p) => p.startsWith(`diff --git a/${file} `) || p.includes(` b/${file}\n`)).join("") || `Không thấy file ${file} trong diff.`;
        return d.length > 40_000 ? `${d.slice(0, 40_000)}\n…(cắt bớt, hãy gọi lại với file cụ thể)` : d;
      },
    },
    {
      name: "get_framework",
      description: "Framework chấm điểm đang áp dụng cho repo: hạng mục, tiêu chí (id, tiêu đề, cách kiểm tra, mức mặc định), mức trừ điểm, gates, chính sách đăng comment.",
      inputSchema: obj({}),
      async run(ctx) {
        const settings = await m.settings.snapshot();
        const yaml = await m.harness.readRepoConfig(ctx.workdir).catch(() => null);
        const fw = await m.framework.resolve({ frameworkId: ctx.frameworkId ?? settings.defaultFramework, repoConfigYaml: yaml });
        const rb = fw.rubric;
        return JSON.stringify({ id: rb.id, name: rb.name, version: rb.version, language: rb.language, severity: rb.severity, gates: rb.gates, grades: rb.grades, publish: rb.publish, repoConfig: fw.repoConfig ? "có .asdlc.yml" : "không", repoConfigError: fw.repoConfigError, categories: rb.categories.map((c) => ({ id: c.id, name: c.name, weight: c.weight, criteria: c.criteria.map((k) => ({ id: k.id, title: k.title, check: k.check, defaultSeverity: k.defaultSeverity })) })) });
      },
    },
    {
      name: "get_harness",
      description: "Harness của repo mà lần review gần nhất đã nạp (AGENTS.md, CLAUDE.md, docs…): đường dẫn, loại, có nạp/cắt không, có được AI trích dẫn không, và độ phủ harness. Đọc nội dung file bằng công cụ Read.",
      inputSchema: obj({}),
      async run(ctx) {
        const r = await m.reviews.latestSucceeded(ctx.mrId);
        if (!r) return "MR này chưa có review nào hoàn tất nên chưa có thông tin harness.";
        return JSON.stringify({ report: r.harnessReport, load: r.harnessLoad });
      },
    },
    {
      name: "propose_comment",
      description: "ĐỀ XUẤT đăng một comment lên MR trên nền tảng (GitLab). Không đăng ngay: người dùng sẽ duyệt trong chat. Có `file`+`line` thì là inline comment, không thì là comment chung. Viết comment ngắn, cụ thể, tiếng Việt.",
      inputSchema: obj({ body: { type: "string" }, file: { type: "string" }, line: { type: "integer", minimum: 1 } }, ["body"]),
      async run(ctx, a) {
        const body = str(a.body).trim();
        if (body.length < 5) return "Lỗi: nội dung comment quá ngắn.";
        const file = str(a.file, 500) || undefined;
        const line = typeof a.line === "number" && a.line > 0 ? Math.floor(a.line) : undefined;
        await m.agent.addAction(ctx.mrId, "comment", { body, ...(file && line ? { file, line } : {}) });
        return "Đã tạo bản nháp comment, chờ người dùng duyệt. Hãy nói với người dùng là họ cần bấm Đăng.";
      },
    },
    {
      name: "propose_rerun",
      description: "ĐỀ XUẤT chạy lại review cho MR (tốn tiền AI). Không chạy ngay: người dùng phải xác nhận. Chỉ đề xuất khi thật sự cần (vd commit mới, bài học mới, review cũ lỗi).",
      inputSchema: obj({ reason: { type: "string" } }, ["reason"]),
      async run(ctx, a) {
        await m.agent.addAction(ctx.mrId, "rerun", { reason: str(a.reason, 300) });
        return "Đã tạo đề xuất chạy lại, chờ người dùng xác nhận.";
      },
    },
  ];

  const rpc = async (ctx: AgentToolContext, msg: { id?: unknown; method?: string; params?: Record<string, unknown> }) => {
    const ok = (result: unknown) => ({ jsonrpc: "2.0", id: msg.id, result });
    const err = (code: number, message: string) => ({ jsonrpc: "2.0", id: msg.id, error: { code, message } });
    switch (msg.method) {
      case "initialize": return ok({ protocolVersion: String(msg.params?.protocolVersion ?? "2025-03-26"), capabilities: { tools: {} }, serverInfo: { name: "asdlc-review", version: "1" } });
      case "ping": return ok({});
      case "tools/list": return ok({ tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
      case "tools/call": {
        const t = tools.find((x) => x.name === msg.params?.name);
        if (!t) return err(-32602, "Tool không tồn tại");
        try {
          return ok({ content: [{ type: "text", text: await t.run(ctx, (msg.params?.arguments ?? {}) as Record<string, unknown>) }] });
        } catch (e) {
          return ok({ isError: true, content: [{ type: "text", text: `Lỗi: ${(e as Error).message}` }] });
        }
      }
      default: return err(-32601, "Method không hỗ trợ");
    }
  };

  return {
    /** Mở phiên tool cho một lượt chat; gọi `close()` khi xong. */
    open(ctx: AgentToolContext) {
      const token = randomBytes(24).toString("hex");
      sessions.set(token, ctx);
      return { token, close: () => void sessions.delete(token) };
    },
    register(app: FastifyInstance) {
      app.post<{ Params: { token: string } }>("/mcp/agent/:token", async (req, reply) => {
        const ctx = sessions.get(req.params.token);
        if (!ctx) return reply.status(404).send({ error: "phiên không tồn tại" });
        const body = req.body as { id?: unknown; method?: string; params?: Record<string, unknown> } | undefined;
        if (!body || Array.isArray(body)) return reply.status(400).send({ error: "chỉ hỗ trợ một yêu cầu mỗi lần" });
        if (body.id === undefined) return reply.status(202).send();
        return reply.send(await rpc(ctx, body));
      });
    },
  };
}

export type AgentTools = ReturnType<typeof createAgentTools>;
