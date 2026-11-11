import { ModuleError } from "../../../kernel/errors.js";
import { run } from "../../../kernel/exec.js";
import { REVIEW_JSON_SCHEMA } from "../domain/schema.js";
import type { Provider } from "../domain/types.js";

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
    async ask({ system, user, workdir, images }) {
      const withImages = Boolean(images?.length);
      // Ảnh đi qua stdin dạng stream-json (khối image base64): không cần bật công cụ đọc file.
      const args = ["-p", ...(withImages ? ["--input-format", "stream-json", "--output-format", "stream-json", "--verbose"] : ["--output-format", "json"]), "--tools", "", "--permission-mode", "dontAsk", "--no-session-persistence", "--append-system-prompt", system, ...(o.model ? ["--model", o.model] : [])];
      const res = await run(o.bin, args, { cwd: workdir, input: withImages ? `${JSON.stringify({ type: "user", message: { role: "user", content: [...images!.map((i) => ({ type: "image", source: { type: "base64", media_type: i.mediaType, data: i.data } })), { type: "text", text: user }] } })}\n` : user, timeoutMs: Math.min(o.timeoutMs, 180_000), allowFailure: true });
      let out: Record<string, unknown> = {};
      try { out = JSON.parse(res.stdout.trim().split("\n").filter(Boolean).pop() ?? "{}"); } catch { /* xử lý bên dưới */ }
      if (out.is_error === true || typeof out.result !== "string") throw new ModuleError("reviewer", "upstream_error", `claude CLI lỗi (exit ${res.code}): ${String(out.result ?? (res.stderr || res.stdout)).slice(0, 300)}`);
      return { text: out.result, costUsd: typeof out.total_cost_usd === "number" ? out.total_cost_usd : null };
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
