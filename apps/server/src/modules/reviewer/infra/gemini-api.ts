import { ModuleError } from "../../../kernel/errors.js";
import type { Provider, ProviderDescriptor } from "../domain/types.js";

export interface GeminiApiOptions {
  /** Đọc mỗi lần gọi: khoá có thể được nhập/đổi trên giao diện khi app đang chạy. */
  apiKey: () => string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  /** Chỉ để test. */
  fetchImpl?: typeof fetch;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { code?: number; message?: string; status?: string };
}

export const geminiApiDescriptor: ProviderDescriptor = {
  id: "gemini-api", label: "Gemini API (Google cloud)", kind: "cloud",
  capabilities: { review: true, chat: true, repoAccess: false, chatTools: false, images: false },
  auth: { type: "apiKey", optional: false, keyId: "gemini", envName: "GEMINI_API_KEY", note: "Lấy ở Google AI Studio." },
  models: [{ value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (mạnh nhất)" }, { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash (nhanh)" }, { value: "gemini-3-flash-preview", label: "Gemini 3 Flash (nhanh, rẻ)" }],
};

/** Google Gemini API (cloud, generateContent). Không có công cụ đọc repo: diff và harness nằm sẵn trong prompt. */
export function geminiApiProvider(o: GeminiApiOptions): Provider {
  const doFetch = o.fetchImpl ?? fetch;
  /** Một lượt generateContent: `json` bật chế độ trả JSON (review); tắt cho chat văn bản tự do. */
  const generate = async ({ model, system, user, json }: { model?: string; system: string; user: string; json: boolean }) => {
      const mdl = model || o.model;
      const key = o.apiKey();
      if (!key) throw new ModuleError("reviewer", "not_configured", "Chưa có Gemini API key (Cài đặt → Review → ô Gemini API key, hoặc biến GEMINI_API_KEY)");
      if (!mdl) throw new ModuleError("reviewer", "not_configured", "Chưa chọn model Gemini (Cài đặt → Review)");
      // Khoá đặt ở header, không đưa vào URL để khỏi lọt vào log.
      const res = await doFetch(`${o.baseUrl.replace(/\/$/, "")}/models/${encodeURIComponent(mdl)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          // Mặc định Gemini cắt ở ~8K token, không đủ cho review dài nên JSON bị cụt.
          generationConfig: { ...(json ? { responseMimeType: "application/json" } : {}), maxOutputTokens: 32_768 },
        }),
        signal: AbortSignal.timeout(o.timeoutMs),
      });
      const raw = await res.text();
      let data: GeminiResponse = {};
      try { data = JSON.parse(raw) as GeminiResponse; } catch { /* xử lý bên dưới */ }
      if (!res.ok) {
        const msg = data.error?.message ?? raw.slice(0, 300);
        const hint = res.status === 429 ? " (hết quota/rate limit: thử lại sau hoặc đổi model/gói)" : res.status === 400 && /api key/i.test(msg) ? " (API key không hợp lệ)" : res.status === 403 ? " (key không có quyền dùng model này)" : "";
        throw new ModuleError("reviewer", "upstream_error", `Gemini API → ${res.status}: ${msg.slice(0, 400)}${hint}`);
      }
      if (data.promptFeedback?.blockReason) throw new ModuleError("reviewer", "upstream_error", `Gemini từ chối prompt (${data.promptFeedback.blockReason})`);
      const cand = data.candidates?.[0];
      const text = (cand?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
      if (!text.trim()) throw new ModuleError("reviewer", "upstream_error", `Gemini trả về rỗng${cand?.finishReason ? ` (finishReason: ${cand.finishReason})` : ""}`);
      return { text, model: mdl, costUsd: null, ...(data.usageMetadata ? { tokens: { inputTokens: data.usageMetadata.promptTokenCount ?? 0, outputTokens: data.usageMetadata.candidatesTokenCount ?? 0, cacheReadTokens: 0, cacheWriteTokens: 0 } } : {}) };
  };
  return {
    descriptor: geminiApiDescriptor,
    run: (i) => generate({ ...i, json: true }),
    /** Chat: trả lời từ ngữ cảnh trong prompt, không công cụ đọc repo, không ảnh. */
    async ask(i) {
      const out = await generate({ ...i, json: false });
      return { text: out.text, costUsd: null };
    },
  };
}
