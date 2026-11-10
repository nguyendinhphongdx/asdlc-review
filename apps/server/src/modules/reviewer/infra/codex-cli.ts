import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ModuleError } from "../../../kernel/errors.js";
import { run } from "../../../kernel/exec.js";
import { REVIEW_JSON_SCHEMA } from "../domain/schema.js";
import type { Provider } from "../domain/types.js";

export interface CodexCliOptions {
  bin: string;
  model: string;
  timeoutMs: number;
}

export function codexCliProvider(o: CodexCliOptions): Provider {
  return {
    id: "codex-cli",
    agentic: true,
    async run({ system, user, workdir }) {
      const tmp = await mkdtemp(path.join(tmpdir(), "mrd-codex-"));
      try {
        const schemaFile = path.join(tmp, "schema.json");
        const outFile = path.join(tmp, "out.json");
        await writeFile(schemaFile, JSON.stringify(REVIEW_JSON_SCHEMA));
        const args = ["exec", "-s", "read-only", "-C", workdir, "--skip-git-repo-check", "--ephemeral", "--output-schema", schemaFile, "-o", outFile, ...(o.model ? ["-m", o.model] : []), "-"];
        const res = await run(o.bin, args, { cwd: workdir, input: `${system}\n\n${user}`, timeoutMs: o.timeoutMs, allowFailure: true });
        const text = await readFile(outFile, "utf8").catch(() => "");
        if (!text.trim()) throw new ModuleError("reviewer", "upstream_error", `codex CLI không trả kết quả (exit ${res.code}): ${(res.stderr || res.stdout).slice(-500)}`);
        return { text, model: o.model || "codex", costUsd: null };
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    },
  };
}
