import { randomBytes } from "node:crypto";
import type { FrameworkOp, Severity } from "@mrd/contracts";
import type { FastifyInstance } from "fastify";
import { mcpRpc, obj, str, type RpcMsg, type ToolDef } from "./agent-tools.js";
import type { Modules } from "./modules.js";

/** Ngữ cảnh một lượt chat về framework. `scope` là khoá lưu hội thoại/đề xuất (`fw:<id>`). */
export interface FrameworkToolContext { scope: string; frameworkId: string }

const SEV = ["blocker", "critical", "major", "minor", "nit"];
const OP_SCHEMA = {
  type: "array",
  description: "Danh sách thay đổi. Mỗi phần tử có `op` là một trong: add_rule {category,id,title,check,why?,severity,enabled?}; update_rule {id,title?,check?,why?,severity?,enabled?,category?}; remove_rule {id}; add_category {id,name,weight}; update_category {id,name?,weight?}; remove_category {id}; set_deduction {severity,deduction}; set_gate_cap {id,capTotal}; set_grade_min {grade,min}.",
  items: { type: "object", properties: { op: { type: "string", enum: ["add_rule", "update_rule", "remove_rule", "add_category", "update_category", "remove_category", "set_deduction", "set_gate_cap", "set_grade_min"] }, severity: { type: "string", enum: SEV } }, required: ["op"] },
};

/** Chỉ nhận các thao tác đúng hình dạng; mọi thứ khác bị loại để agent sửa lại. */
function parseOps(v: unknown): { ops: FrameworkOp[]; error?: string } {
  if (!Array.isArray(v) || !v.length) return { ops: [], error: "`ops` phải là mảng không rỗng." };
  if (v.length > 30) return { ops: [], error: "Tối đa 30 thay đổi mỗi đề xuất." };
  const s = (x: unknown, n = 2000) => (typeof x === "string" ? x.slice(0, n) : undefined);
  const sev = (x: unknown) => (typeof x === "string" && SEV.includes(x) ? (x as Severity) : undefined);
  const out: FrameworkOp[] = [];
  for (const [i, raw] of v.entries()) {
    const o = (raw ?? {}) as Record<string, unknown>;
    const bad = (m: string) => ({ ops: [] as FrameworkOp[], error: `Thay đổi #${i + 1} (${String(o.op)}): ${m}` });
    const id = s(o.id, 24);
    switch (o.op) {
      case "add_rule": {
        const category = s(o.category, 24), title = s(o.title, 200), check = s(o.check), severity = sev(o.severity);
        if (!category || !id || !title || !check || !severity) return bad("thiếu category/id/title/check/severity hợp lệ");
        out.push({ op: "add_rule", category, id, title, check, why: s(o.why), severity, ...(typeof o.enabled === "boolean" ? { enabled: o.enabled } : {}) });
        break;
      }
      case "update_rule": {
        if (!id) return bad("thiếu id");
        out.push({ op: "update_rule", id, ...(s(o.title, 200) !== undefined ? { title: s(o.title, 200) } : {}), ...(s(o.check) !== undefined ? { check: s(o.check) } : {}), ...(s(o.why) !== undefined ? { why: s(o.why) } : {}), ...(sev(o.severity) ? { severity: sev(o.severity)! } : {}), ...(typeof o.enabled === "boolean" ? { enabled: o.enabled } : {}), ...(s(o.category, 24) ? { category: s(o.category, 24)! } : {}) });
        break;
      }
      case "remove_rule":
      case "remove_category":
        if (!id) return bad("thiếu id");
        out.push({ op: o.op, id });
        break;
      case "add_category":
        if (!id || !s(o.name, 100) || typeof o.weight !== "number") return bad("thiếu id/name/weight");
        out.push({ op: "add_category", id, name: s(o.name, 100)!, weight: o.weight });
        break;
      case "update_category":
        if (!id) return bad("thiếu id");
        out.push({ op: "update_category", id, ...(s(o.name, 100) ? { name: s(o.name, 100)! } : {}), ...(typeof o.weight === "number" ? { weight: o.weight } : {}) });
        break;
      case "set_deduction":
        if (!sev(o.severity) || typeof o.deduction !== "number") return bad("thiếu severity/deduction");
        out.push({ op: "set_deduction", severity: sev(o.severity)!, deduction: o.deduction });
        break;
      case "set_gate_cap":
        if (!id || typeof o.capTotal !== "number") return bad("thiếu id/capTotal");
        out.push({ op: "set_gate_cap", id, capTotal: o.capTotal });
        break;
      case "set_grade_min":
        if (typeof o.grade !== "string" || typeof o.min !== "number") return bad("thiếu grade/min");
        out.push({ op: "set_grade_min", grade: o.grade as never, min: o.min });
        break;
      default: return bad("op không hỗ trợ");
    }
  }
  return { ops: out };
}

/**
 * Tool cho chat cải thiện/xây framework (MCP qua HTTP, token dùng một lần mỗi lượt).
 * Đọc tự do; sửa framework chỉ tạo ĐỀ XUẤT chờ người duyệt (server hợp lệ hoá, rule bảo mật bị khoá vẫn được giữ).
 */
export function createFrameworkTools(m: Modules) {
  const sessions = new Map<string, FrameworkToolContext>();

  const tools: ToolDef<FrameworkToolContext>[] = [
    {
      name: "get_framework",
      description: "Nội dung đầy đủ của framework đang bàn: hạng mục + trọng số, từng rule (id, tiêu đề, cách kiểm tra, lý do, mức mặc định, bật/tắt, bị khoá hay không), mức trừ điểm, gates, xếp loại, chính sách đăng comment.",
      inputSchema: obj({}),
      async run(ctx) {
        const d = await m.framework.detail(ctx.frameworkId);
        return JSON.stringify({ id: d.id, name: d.name, version: d.version, kind: d.kind, readOnly: d.readOnly, severity: d.severity, gates: d.gates, grades: d.grades, sizeBaseline: d.sizeBaseline, publish: d.publish, categories: d.categories });
      },
    },
    {
      name: "get_rule_stats",
      description: "Thống kê thực tế của framework trên các review gần nhất: mỗi rule được báo bao nhiêu finding, bao nhiêu bị người dùng đánh 'không đồng ý' (báo nhầm), 'đồng ý', 'đã sửa'; kèm các rule chưa từng kích hoạt. Dùng để biết rule nào ồn, rule nào thừa/thiếu.",
      inputSchema: obj({ runs: { type: "integer", minimum: 5, maximum: 200, description: "Số review gần nhất (mặc định 50)" } }),
      async run(ctx, a) {
        const n = typeof a.runs === "number" ? Math.min(200, Math.max(5, Math.floor(a.runs))) : 50;
        const [st, d] = await Promise.all([m.reviews.ruleStats(ctx.frameworkId, n), m.framework.detail(ctx.frameworkId)]);
        const seen = new Set(st.rules.map((r) => r.ruleId));
        const silent = d.categories.flatMap((c) => c.criteria).filter((r) => r.enabled && !seen.has(r.id)).map((r) => r.id);
        if (!st.runs) return "Chưa có review nào dùng framework này nên chưa có số liệu.";
        return JSON.stringify({ runsAnalyzed: st.runs, rules: st.rules.slice(0, 60), enabledRulesNeverTriggered: silent });
      },
    },
    {
      name: "get_usage",
      description: "Các repo đang dùng framework này và bài học (sổ tay) mà team đã ghi cho từng repo: nguồn tín hiệu về điều team thật sự quan tâm / thường bị báo nhầm.",
      inputSchema: obj({}),
      async run(ctx) {
        const [repos, settings] = await Promise.all([m.repos.list(), m.settings.snapshot()]);
        const users = repos.filter((r) => (r.frameworkId ?? settings.defaultFramework) === ctx.frameworkId).slice(0, 15);
        const out = [];
        for (const r of users) out.push({ repo: r.fullPath, lessons: (await m.agent.notebook(r.id)).slice(0, 15) });
        return JSON.stringify({ repos: out });
      },
    },
    {
      name: "preview_changes",
      description: "Kiểm tra thử một danh sách thay đổi (KHÔNG lưu, KHÔNG gửi cho người dùng): trả lỗi hợp lệ hoá (vd rule bảo mật bị khoá, mã trùng, tổng trọng số) và diff so với hiện tại. Gọi trước khi propose_edit để sửa lỗi.",
      inputSchema: obj({ ops: OP_SCHEMA }, ["ops"]),
      async run(ctx, a) {
        const p = parseOps(a.ops);
        if (p.error) return `Lỗi: ${p.error}`;
        return JSON.stringify(await m.framework.previewPatch(ctx.frameworkId, p.ops));
      },
    },
    {
      name: "propose_edit",
      description: "ĐỀ XUẤT áp các thay đổi lên framework thành phiên bản mới. Không áp ngay: người dùng duyệt trong chat. Nếu framework đang chỉ đọc (mặc định/mẫu), đề xuất sẽ tạo bản chỉnh sửa (fork) mới tên `forkName` rồi áp vào đó. Chỉ gọi khi preview_changes đã không còn lỗi.",
      inputSchema: obj({ reason: { type: "string", description: "Vì sao đề xuất (1-3 câu, tiếng Việt)" }, ops: OP_SCHEMA, forkName: { type: "string", description: "Tên bản chỉnh sửa mới (bắt buộc khi framework chỉ đọc)" } }, ["reason", "ops"]),
      async run(ctx, a) {
        const p = parseOps(a.ops);
        if (p.error) return `Lỗi: ${p.error}`;
        const d = await m.framework.detail(ctx.frameworkId);
        const forkName = str(a.forkName, 80).trim();
        if (d.readOnly && !forkName) return "Lỗi: framework này chỉ đọc, hãy truyền forkName (tên bản chỉnh sửa mới).";
        const prev = await m.framework.previewPatch(ctx.frameworkId, p.ops);
        if (prev.errors.length) return `Lỗi hợp lệ hoá, hãy sửa rồi gọi lại: ${prev.errors.join("; ")}`;
        if (!prev.changes.length) return "Các thay đổi này không làm đổi gì so với hiện tại.";
        await m.agent.addAction(ctx.scope, "framework_edit", { reason: str(a.reason, 400), ops: p.ops, changes: prev.changes.slice(0, 60), ...(d.readOnly ? { forkName } : {}) });
        return "Đã tạo đề xuất sửa framework, chờ người dùng duyệt. Hãy nói với người dùng là họ cần bấm Áp dụng.";
      },
    },
  ];

  return {
    open(ctx: FrameworkToolContext) {
      const token = randomBytes(24).toString("hex");
      sessions.set(token, ctx);
      return { token, close: () => void sessions.delete(token) };
    },
    register(app: FastifyInstance) {
      app.post<{ Params: { token: string } }>("/mcp/framework/:token", async (req, reply) => {
        const ctx = sessions.get(req.params.token);
        if (!ctx) return reply.status(404).send({ error: "phiên không tồn tại" });
        const body = req.body as RpcMsg | undefined;
        if (!body || Array.isArray(body)) return reply.status(400).send({ error: "chỉ hỗ trợ một yêu cầu mỗi lần" });
        if (body.id === undefined) return reply.status(202).send();
        return reply.send(await mcpRpc(tools, ctx, body));
      });
    },
  };
}

export type FrameworkTools = ReturnType<typeof createFrameworkTools>;
