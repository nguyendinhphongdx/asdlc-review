import { ModuleError } from "../../../kernel/errors.js";
import type { Provider, ProviderDescriptor } from "../domain/types.js";

export interface OpenAiOptions {
  baseUrl: string;
  apiKey: () => string;
  model: string;
  timeoutMs: number;
}

export const openAiDescriptor: ProviderDescriptor = {
  id: "openai-compatible", label: "OpenAI-compatible API", kind: "cloud",
  capabilities: { review: true, chat: true, repoAccess: false, chatTools: false, images: false },
  auth: { type: "apiKey", optional: true, keyId: "openai", envName: "OPENAI_API_KEY", note: "Server nội bộ (Ollama, LM Studio…) thường không cần khoá. Địa chỉ server đặt bằng biến OPENAI_BASE_URL." },
  models: [{ value: "gpt-5.5", label: "GPT-5.5" }, { value: "gpt-5.4", label: "GPT-5.4" }, { value: "gpt-5.4-mini", label: "GPT-5.4 mini" }],
};

/** Tương thích OpenAI chat completions (OpenAI, Ollama, LM Studio, vLLM…). Không có công cụ đọc repo. */
export function openAiProvider(o: OpenAiOptions): Provider {
  const call = async (model: string, system: string, user: string, jsonMode: boolean) =>
    fetch(`${o.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(o.apiKey() ? { Authorization: `Bearer ${o.apiKey()}` } : {}) },
      body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }], ...(jsonMode ? { response_format: { type: "json_object" } } : {}) }),
      signal: AbortSignal.timeout(o.timeoutMs),
    });
  return {
    descriptor: openAiDescriptor,
    /** Chat: văn bản tự do, không công cụ đọc repo. */
    async ask({ model, system, user }) {
      const mdl = model || o.model;
      if (!mdl) throw new ModuleError("reviewer", "not_configured", "Chưa chọn model cho provider OpenAI-compatible (Cài đặt → Review)");
      const res = await call(mdl, system, user, false);
      if (!res.ok) throw new ModuleError("reviewer", "upstream_error", `LLM API → ${res.status}: ${(await res.text()).slice(0, 400)}`);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new ModuleError("reviewer", "upstream_error", "LLM API trả về rỗng");
      return { text, costUsd: null };
    },
    async run({ model, system, user }) {
      const mdl = model || o.model;
      if (!mdl) throw new ModuleError("reviewer", "not_configured", "Chưa chọn model cho provider OpenAI-compatible (Cài đặt → Review hoặc cài đặt repo)");
      let res = await call(mdl, system, user, true);
      if (res.status === 400) res = await call(mdl, system, user, false); // một số server không hỗ trợ response_format
      if (!res.ok) throw new ModuleError("reviewer", "upstream_error", `LLM API → ${res.status}: ${(await res.text()).slice(0, 400)}`);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new ModuleError("reviewer", "upstream_error", "LLM API trả về rỗng");
      return { text, model: mdl, costUsd: null, ...(data.usage ? { tokens: { inputTokens: data.usage.prompt_tokens ?? 0, outputTokens: data.usage.completion_tokens ?? 0, cacheReadTokens: 0, cacheWriteTokens: 0 } } : {}) };
    },
  };
}
