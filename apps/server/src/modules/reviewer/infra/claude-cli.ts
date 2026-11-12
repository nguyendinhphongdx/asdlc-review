import { ModuleError } from "../../../kernel/errors.js";
import { run } from "../../../kernel/exec.js";
import { REVIEW_JSON_SCHEMA } from "../domain/schema.js";
import type { ChatStep, Provider } from "../domain/types.js";

export interface ClaudeCliOptions {
  bin: string;
  model: string;
  maxBudgetUsd: number;
  timeoutMs: number;
}

export function claudeCliProvider(o: ClaudeCliOptions): Provider {
  return {
    id: "claude-cli",
    agentic: true,
    async ask({ model, system, user, workdir, images, tools, onStep }) {
      const mdl = model || o.model;
      const withImages = Boolean(images?.length);
      const stream = withImages || Boolean(tools);
      // Ảnh đi qua stdin dạng stream-json (khối image base64). Khi có tool, dùng stream-json để lấy từng bước (suy luận, gọi tool).
      const args = ["-p", ...(stream ? ["--input-format", "stream-json", "--output-format", "stream-json", "--verbose"] : ["--output-format", "json"]), ...(tools ? ["--tools", "Read,Grep,Glob", "--allowedTools", `mcp__${tools.mcpName}__*`, "--mcp-config", JSON.stringify({ mcpServers: { [tools.mcpName]: { type: "http", url: tools.mcpUrl } } }), "--strict-mcp-config", "--setting-sources", "project"] : ["--tools", ""]), "--permission-mode", "dontAsk", "--no-session-persistence", "--append-system-prompt", system, ...(mdl ? ["--model", mdl] : [])];
      const steps: ChatStep[] = [];
      const byId = new Map<string, Extract<ChatStep, { kind: "tool" }>>();
      const rel = (v: unknown): unknown => (typeof v === "string" ? v.replace(`${workdir}/`, "") : v);
      const onLine = (line: string) => {
        let ev: { type?: string; message?: { content?: { type?: string; id?: string; name?: string; input?: Record<string, unknown>; thinking?: string; tool_use_id?: string; content?: unknown; is_error?: boolean }[] } };
        try { ev = JSON.parse(line); } catch { return; }
        for (const b of ev.message?.content ?? []) {
          if (ev.type === "assistant" && b.type === "thinking" && b.thinking) { steps.push({ kind: "thinking", text: b.thinking }); onStep?.(steps); }
          else if (ev.type === "assistant" && b.type === "tool_use") {
            const input = Object.fromEntries(Object.entries(b.input ?? {}).map(([k, v]) => [k, rel(v)]));
            const st: Extract<ChatStep, { kind: "tool" }> = { kind: "tool", id: b.id ?? String(steps.length), name: String(b.name ?? "").replace(/^mcp__[^_]+__/, ""), input };
            byId.set(st.id, st); steps.push(st); onStep?.(steps);
          } else if (ev.type === "user" && b.type === "tool_result") {
            const st = byId.get(String(b.tool_use_id));
            if (st) {
              const c = Array.isArray(b.content) ? b.content.map((x) => (x as { text?: string }).text ?? "").join("\n") : String(b.content ?? "");
              st.output = c.slice(0, 4000); st.error = b.is_error === true; onStep?.(steps);
            }
          }
        }
      };
      const userBlocks = [...(images ?? []).map((i) => ({ type: "image", source: { type: "base64", media_type: i.mediaType, data: i.data } })), { type: "text", text: user }];
      const res = await run(o.bin, args, { cwd: workdir, input: stream ? `${JSON.stringify({ type: "user", message: { role: "user", content: userBlocks } })}\n` : user, timeoutMs: Math.min(o.timeoutMs, tools ? 420_000 : 180_000), allowFailure: true, ...(stream ? { onStdoutLine: onLine } : {}) });
      let out: Record<string, unknown> = {};
      try { out = JSON.parse(res.stdout.trim().split("\n").filter(Boolean).pop() ?? "{}"); } catch { /* xử lý bên dưới */ }
      if (out.is_error === true || typeof out.result !== "string") throw new ModuleError("reviewer", "upstream_error", `claude CLI lỗi (exit ${res.code}): ${String(out.result ?? (res.stderr || res.stdout)).slice(0, 300)}`);
      return { text: out.result, costUsd: typeof out.total_cost_usd === "number" ? out.total_cost_usd : null, steps };
    },
    async run({ model, system, user, workdir, maxBudgetUsd, onActivity }) {
      const mdl = model || o.model;
      // Trần theo lần gọi (lấy từ Cài đặt) ưu tiên hơn giá trị khởi tạo; 0 = không giới hạn.
      const budget = maxBudgetUsd ?? o.maxBudgetUsd;
      const args = [
        "-p", "--output-format", "stream-json", "--verbose",
        "--json-schema", JSON.stringify(REVIEW_JSON_SCHEMA),
        "--tools", "Read,Grep,Glob",
        "--permission-mode", "dontAsk",
        "--setting-sources", "project",
        "--no-session-persistence",
        "--append-system-prompt", system,
        ...(mdl ? ["--model", mdl] : []),
        ...(budget > 0 ? ["--max-budget-usd", String(budget)] : []),
      ];
      let final: Record<string, unknown> | undefined;
      const rel = (p: unknown) => String(p ?? "").replace(`${workdir}/`, "");
      const clip = (t: string, n: number) => t.replace(/\s+/g, " ").trim().slice(0, n);
      const onLine = (line: string) => {
        let ev: { type?: string; message?: { content?: { type?: string; name?: string; text?: string; thinking?: string; content?: unknown; is_error?: boolean; input?: Record<string, unknown> }[] } } & Record<string, unknown>;
        try { ev = JSON.parse(line); } catch { return; }
        if (ev.type === "result") { final = ev; return; }
        if (ev.type === "system" && ev.subtype === "init") { onActivity?.({ kind: "ai", message: `Khởi động ${String(ev.model ?? "claude")}` }); return; }
        for (const b of ev.message?.content ?? []) {
          if (ev.type === "assistant" && b.type === "tool_use") {
            const i = b.input ?? {};
            if (b.name === "Read") onActivity?.({ kind: "tool", message: `Đọc ${rel(i.file_path)}` });
            else if (b.name === "Grep") onActivity?.({ kind: "tool", message: `Tìm "${String(i.pattern ?? "").slice(0, 80)}"${i.path ? ` trong ${rel(i.path)}` : ""}` });
            else if (b.name === "Glob") onActivity?.({ kind: "tool", message: `Liệt kê ${String(i.pattern ?? "")}` });
            else if (b.name === "StructuredOutput") onActivity?.({ kind: "ai", message: "Đang tổng hợp kết quả review" });
          } else if (ev.type === "assistant" && b.type === "thinking" && b.thinking) {
            onActivity?.({ kind: "ai", message: `Suy luận: ${clip(b.thinking, 220)}` });
          } else if (ev.type === "assistant" && b.type === "text" && b.text) {
            onActivity?.({ kind: "ai", message: `AI: ${clip(b.text, 220)}` });
          } else if (ev.type === "user" && b.type === "tool_result" && b.is_error) {
            onActivity?.({ kind: "tool", message: `Tool lỗi: ${clip(typeof b.content === "string" ? b.content : JSON.stringify(b.content ?? ""), 160)}` });
          }
        }
      };
      const res = await run(o.bin, args, { cwd: workdir, input: user, timeoutMs: o.timeoutMs, allowFailure: true, onStdoutLine: onLine });
      if (!final) throw new ModuleError("reviewer", "upstream_error", `claude CLI không trả kết quả (exit ${res.code}): ${(res.stderr || res.stdout).slice(-500)}`);
      const out: Record<string, unknown> = final;
      if (out.is_error === true || (res.code !== 0 && !out.result && !out.structured_output)) {
        const cost = typeof out.total_cost_usd === "number" ? ` (đã tốn $${out.total_cost_usd.toFixed(2)})` : "";
        // Vượt trần chi phí: thử lại chỉ tốn thêm tiền mà vẫn lỗi, nên dùng mã riêng (không tự thử lại).
        if (out.subtype === "error_max_budget_usd") {
          throw new ModuleError("reviewer", "quota_exceeded", `Vượt trần chi phí $${budget} cho một lần review${cost}. MR/prompt quá lớn: chia nhỏ MR hoặc tăng/bỏ trần ở Cài đặt → Giới hạn khi review (0 = không giới hạn).`);
        }
        // Claude CLI có thể thoát lỗi mà result rỗng: nêu subtype/errors của sự kiện kết quả thay vì "không có đầu ra".
        const errs = Array.isArray(out.errors) ? (out.errors as unknown[]).map(String).join("; ") : "";
        const detail = String(out.result || errs || res.stderr || "không có đầu ra (tiến trình bị dừng đột ngột?)");
        throw new ModuleError("reviewer", "upstream_error", `claude CLI lỗi (exit ${res.code}${out.subtype ? `, ${String(out.subtype)}` : ""})${cost}: ${detail}`.slice(0, 600));
      }
      const payload = out.structured_output ?? out.result;
      const text = typeof payload === "string" ? payload : JSON.stringify(payload);
      return { text, model: mdl || "claude", costUsd: typeof out.total_cost_usd === "number" ? out.total_cost_usd : null };
    },
  };
}
