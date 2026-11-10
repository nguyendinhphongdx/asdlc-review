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
    async run({ system, user, workdir }) {
      const args = [
        "-p", "--output-format", "json",
        "--json-schema", JSON.stringify(REVIEW_JSON_SCHEMA),
        "--tools", "Read,Grep,Glob",
        "--permission-mode", "dontAsk",
        "--setting-sources", "project",
        "--no-session-persistence",
        "--append-system-prompt", system,
        ...(o.model ? ["--model", o.model] : []),
        ...(o.maxBudgetUsd > 0 ? ["--max-budget-usd", String(o.maxBudgetUsd)] : []),
      ];
      const res = await run(o.bin, args, { cwd: workdir, input: user, timeoutMs: o.timeoutMs, allowFailure: true });
      let out: Record<string, unknown>;
      try {
        out = JSON.parse(res.stdout);
      } catch {
        throw new ModuleError("reviewer", "upstream_error", `claude CLI không trả JSON (exit ${res.code}): ${(res.stderr || res.stdout).slice(0, 500)}`);
      }
      if (out.is_error === true || (res.code !== 0 && !out.result && !out.structured_output)) {
        throw new ModuleError("reviewer", "upstream_error", `claude CLI lỗi: ${String(out.result ?? res.stderr).slice(0, 500)}`);
      }
      const payload = out.structured_output ?? out.result;
      const text = typeof payload === "string" ? payload : JSON.stringify(payload);
      return { text, model: o.model || "claude", costUsd: typeof out.total_cost_usd === "number" ? out.total_cost_usd : null };
    },
  };
}
