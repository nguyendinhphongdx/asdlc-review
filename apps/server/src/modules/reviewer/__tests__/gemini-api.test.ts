import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { geminiApiProvider } from "../infra/gemini-api.js";

type Call = { url: string; headers: Record<string, string>; body: { systemInstruction: { parts: { text: string }[] }; contents: { parts: { text: string }[] }[]; generationConfig: Record<string, unknown> } };
const fake = (status: number, payload: unknown, calls: Call[] = []): typeof fetch =>
  (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    return new Response(typeof payload === "string" ? payload : JSON.stringify(payload), { status });
  }) as unknown as typeof fetch;
const make = (f: typeof fetch, key = "AIza-test-key") => geminiApiProvider({ apiKey: () => key, baseUrl: "https://g.test/v1beta/", model: "gemini-2.5-pro", timeoutMs: 5000, fetchImpl: f });
const input = { system: "SYS", user: "USR", workdir: "." };

describe("gemini-api provider", () => {
  it("gọi generateContent: khoá ở header (không ở URL), system/user đúng chỗ, JSON mode + đủ token", async () => {
    const calls: Call[] = [];
    const out = await make(fake(200, { candidates: [{ content: { parts: [{ text: '{"summary":' }, { text: '"ok"}' }] } }] }, calls)).run({ ...input, model: "gemini-2.5-flash" });
    assert.equal(out.text, '{"summary":"ok"}');
    assert.equal(out.model, "gemini-2.5-flash");
    assert.equal(out.costUsd, null);
    const c = calls[0]!;
    assert.equal(c.url, "https://g.test/v1beta/models/gemini-2.5-flash:generateContent");
    assert.ok(!c.url.includes("AIza"), "khoá không được nằm trong URL");
    assert.equal(c.headers["x-goog-api-key"], "AIza-test-key");
    assert.equal(c.body.systemInstruction.parts[0]!.text, "SYS");
    assert.equal(c.body.contents[0]!.parts[0]!.text, "USR");
    assert.equal(c.body.generationConfig.responseMimeType, "application/json");
    assert.ok(Number(c.body.generationConfig.maxOutputTokens) >= 16_000);
  });

  it("bỏ qua phần 'thought' của model suy luận", async () => {
    const out = await make(fake(200, { candidates: [{ content: { parts: [{ text: "nghĩ...", thought: true }, { text: '{"a":1}' }] } }] })).run(input);
    assert.equal(out.text, '{"a":1}');
  });

  it("thiếu khoá → not_configured, không gọi mạng", async () => {
    const calls: Call[] = [];
    await assert.rejects(() => make(fake(200, {}, calls), "").run(input), (e: Error) => /Gemini API key/.test(e.message));
    assert.equal(calls.length, 0);
  });

  it("lỗi HTTP: nêu mã + lý do + gợi ý (key sai, quota)", async () => {
    await assert.rejects(() => make(fake(400, { error: { message: "API key not valid. Please pass a valid API key." } })).run(input), (e: Error) => /400/.test(e.message) && /không hợp lệ/.test(e.message));
    await assert.rejects(() => make(fake(429, { error: { message: "Quota exceeded" } })).run(input), (e: Error) => /429/.test(e.message) && /quota/i.test(e.message));
  });

  it("bị chặn hoặc rỗng → báo lỗi rõ lý do", async () => {
    await assert.rejects(() => make(fake(200, { promptFeedback: { blockReason: "SAFETY" } })).run(input), (e: Error) => /SAFETY/.test(e.message));
    await assert.rejects(() => make(fake(200, { candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [] } }] })).run(input), (e: Error) => /MAX_TOKENS/.test(e.message));
  });
});
