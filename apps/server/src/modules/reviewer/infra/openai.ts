import { ModuleError } from "../../../kernel/errors.js";
import type { Provider } from "../domain/types.js";

export interface OpenAiOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

/** Tương thích OpenAI chat completions (OpenAI, Ollama, LM Studio, vLLM…). Không có công cụ đọc repo. */
export function openAiProvider(o: OpenAiOptions): Provider {
  const call = async (model: string, system: string, user: string, jsonMode: boolean) =>
    fetch(`${o.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(o.apiKey ? { Authorization: `Bearer ${o.apiKey}` } : {}) },
      body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }], ...(jsonMode ? { response_format: { type: "json_object" } } : {}) }),
      signal: AbortSignal.timeout(o.timeoutMs),
    });
  return {
    id: "openai-compatible",
    agentic: false,
    async run({ model, system, user }) {
      const mdl = model || o.model;
      if (!mdl) throw new ModuleError("reviewer", "not_configured", "Chưa chọn model cho provider OpenAI-compatible (Cài đặt → Review hoặc cài đặt repo)");
      let res = await call(mdl, system, user, true);
      if (res.status === 400) res = await call(mdl, system, user, false); // một số server không hỗ trợ response_format
      if (!res.ok) throw new ModuleError("reviewer", "upstream_error", `LLM API → ${res.status}: ${(await res.text()).slice(0, 400)}`);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new ModuleError("reviewer", "upstream_error", "LLM API trả về rỗng");
      return { text, model: mdl, costUsd: null };
    },
  };
}
