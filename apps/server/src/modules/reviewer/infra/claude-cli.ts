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
    async ask({ system, user, workdir, images, tools, onStep }) {
      const withImages = Boolean(images?.length);
      const stream = withImages || Boolean(tools);
      // Ảnh đi qua stdin dạng stream-json (khối image base64). Khi có tool, dùng stream-json để lấy từng bước (suy luận, gọi tool).
      const args = ["-p", ...(stream ? ["--input-format", "stream-json", "--output-format", "stream-json", "--verbose"] : ["--output-format", "json"]), ...(tools ? ["--tools", "Read,Grep,Glob", "--allowedTools", `mcp__${tools.mcpName}__*`, "--mcp-config", JSON.stringify({ mcpServers: { [tools.mcpName]: { type: "http", url: tools.mcpUrl } } }), "--strict-mcp-config", "--setting-sources", "project"] : ["--tools", ""]), "--permission-mode", "dontAsk", "--no-session-persistence", "--append-system-prompt", system, ...(o.model ? ["--model", o.model] : [])];
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
    async run({ system, user, workdir, onActivity }) {
      const args = [
        "-p", "--output-format", "stream-json", "--verbose",
        "--json-schema", JSON.stringify(REVIEW_JSON_SCHEMA),
        "--tools", "Read,Grep,Glob",
        "--permission-mode", "dontAsk",
        "--setting-sources", "project",
        "--no-session-persistence",
        "--append-system-prompt", system,
        ...(o.model ? ["--model", o.model] : []),
        ...(o.maxBudgetUsd > 0 ? ["--max-budget-usd", String(o.maxBudgetUsd)] : []),
      ];
      let final: Record<string, unknown> | undefined;
      let lastThink = 0;
      const rel = (p: unknown) => String(p ?? "").replace(`${workdir}/`, "");
      const onLine = (line: string) => {
        let ev: { type?: string; message?: { content?: { type?: string; name?: string; input?: Record<string, unknown> }[] } } & Record<string, unknown>;
        try { ev = JSON.parse(line); } catch { return; }
        if (ev.type === "result") { final = ev; return; }
        if (ev.type !== "assistant") return;
        for (const b of ev.message?.content ?? []) {
          if (b.type === "tool_use") {
            const i = b.input ?? {};
            if (b.name === "Read") onActivity?.({ kind: "tool", message: `Đọc ${rel(i.file_path)}` });
            else if (b.name === "Grep") onActivity?.({ kind: "tool", message: `Tìm "${String(i.pattern ?? "").slice(0, 80)}"${i.path ? ` trong ${rel(i.path)}` : ""}` });
            else if (b.name === "Glob") onActivity?.({ kind: "tool", message: `Liệt kê ${String(i.pattern ?? "")}` });
            else if (b.name === "StructuredOutput") onActivity?.({ kind: "ai", message: "Đang tổng hợp kết quả review" });
          } else if (b.type === "thinking" && Date.now() - lastThink > 8000) {
            lastThink = Date.now();
            onActivity?.({ kind: "ai", message: "AI đang suy luận…" });
          }
        }
      };
      const res = await run(o.bin, args, { cwd: workdir, input: user, timeoutMs: o.timeoutMs, allowFailure: true, onStdoutLine: onLine });
      if (!final) throw new ModuleError("reviewer", "upstream_error", `claude CLI không trả kết quả (exit ${res.code}): ${(res.stderr || res.stdout).slice(-500)}`);
      const out: Record<string, unknown> = final;
      if (out.is_error === true || (res.code !== 0 && !out.result && !out.structured_output)) {
        throw new ModuleError("reviewer", "upstream_error", `claude CLI lỗi: ${String(out.result ?? res.stderr).slice(0, 500)}`);
      }
      const payload = out.structured_output ?? out.result;
      const text = typeof payload === "string" ? payload : JSON.stringify(payload);
      return { text, model: o.model || "claude", costUsd: typeof out.total_cost_usd === "number" ? out.total_cost_usd : null };
    },
  };
}
