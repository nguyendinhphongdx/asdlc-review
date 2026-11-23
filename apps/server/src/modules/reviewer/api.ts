import { AiBlockSchema, viewFor, type DesignReviewDto, type OverviewBlock, type ProviderAuth, ProviderCapabilities, ProviderInfoDto } from "@mrd/contracts";
import { ModuleError } from "../../kernel/errors.js";
import type { Logger } from "../../kernel/logger.js";
import { buildBlocks } from "./domain/blocks.js";
import { classifyMr, resolveKind, type ChangedFile, type MrKindResult } from "./domain/mr-kind.js";
import { buildDesignPrompt, buildUnderstandPrompt } from "./domain/design-prompt.js";
import { buildSystemPrompt, buildUserPrompt } from "./domain/prompt.js";
import { DESIGN_JSON_SCHEMA, UNDERSTAND_JSON_SCHEMA, normalizeReview, parseDesignText, parseReviewText, parseUnderstandText } from "./domain/schema.js";
import type { ChatImage, ChatStep, ChatTools, DesignRequest, Provider, ProviderId, ReviewRequest, ReviewResponse, ReviewUsage, UnderstandRequest } from "./domain/types.js";
import { claudeCliProvider } from "./infra/claude-cli.js";
import { codexCliProvider } from "./infra/codex-cli.js";
import { geminiApiDescriptor, geminiApiProvider } from "./infra/gemini-api.js";
import { openAiDescriptor, openAiProvider } from "./infra/openai.js";
import { binAvailable } from "./infra/probe.js";

export interface ReviewerDeps {
  claude: { bin: string; model: string; maxBudgetUsd: number };
  codex: { bin: string; model: string };
  gemini: { baseUrl: string; model: string };
  openai: { baseUrl: string; model: string };
  /** Khoá API của provider cloud theo mô tả `auth` (app quyết định lấy từ kho bí mật hay biến môi trường). */
  apiKeyFor: (auth: Extract<ProviderAuth, { type: "apiKey" }>) => string;
  timeoutMs: number;
  logger?: Logger;
}

export type ProviderInfo = ProviderInfoDto;

export interface ReviewerApi {
  review(req: ReviewRequest): Promise<ReviewResponse>;
  /** T2: mô tả thiết kế hiện tại của một khu vực (đọc code, không đánh giá MR). */
  understand(req: UnderstandRequest): Promise<{ text: string; usage: ReviewUsage }>;
  /** T3: đánh giá thiết kế của cả MR trên bản đồ khu vực. */
  assessDesign(req: DesignRequest): Promise<{ design: DesignReviewDto; usage: ReviewUsage }>;
  /** Bước T0: gắn nhãn loại MR từ file đổi và tiêu đề (tất định, không gọi AI). */
  classify(files: ChangedFile[], title?: string): MrKindResult;
  /** Hỏi đáp tự do với agent (không công cụ, không đọc repo). */
  ask(req: { provider: ProviderId; model?: string; system: string; user: string; workdir: string; images?: ChatImage[]; tools?: ChatTools; onStep?: (steps: ChatStep[]) => void }): Promise<{ text: string; costUsd: number | null; steps?: ChatStep[]; tokens?: import("./domain/types.js").TokenUsage }>;
  /** Làm sạch một khối sơ đồ do agent chat tạo theo yêu cầu (cùng luật bằng chứng/cỡ như khối của review). Trả lỗi dạng chữ để agent sửa lại. */
  sanitizeBlock(raw: unknown, knownPaths: Iterable<string>): { block: OverviewBlock } | { error: string };
  /** Danh sách provider kèm khả năng, cách xác thực, model gợi ý và trạng thái sẵn sàng. */
  providers(): Promise<ProviderInfo[]>;
  /** Mô tả tĩnh (không I/O) của một provider; null nếu id lạ. */
  describe(id: string): Omit<ProviderInfo, "available" | "defaultModel"> | null;
  /** Khả năng của provider (không I/O); workflow dùng để quyết định có mở tool/ảnh hay không thay vì so tên. */
  capabilities(id: string): ProviderCapabilities | null;
}

export function createReviewerModule(deps: ReviewerDeps): ReviewerApi {
  /** Mỗi provider: bản chạy + model mặc định + cách kiểm tra sẵn sàng. Thêm provider mới = thêm một dòng ở đây. */
  const registry: { provider: Provider; defaultModel: string; available: () => Promise<boolean> }[] = [
    { provider: claudeCliProvider({ ...deps.claude, timeoutMs: deps.timeoutMs }), defaultModel: deps.claude.model, available: () => binAvailable(deps.claude.bin) },
    { provider: codexCliProvider({ ...deps.codex, timeoutMs: deps.timeoutMs }), defaultModel: deps.codex.model, available: () => binAvailable(deps.codex.bin) },
    { provider: geminiApiProvider({ ...deps.gemini, apiKey: () => deps.apiKeyFor(geminiApiDescriptor.auth as Extract<ProviderAuth, { type: "apiKey" }>), timeoutMs: deps.timeoutMs }), defaultModel: deps.gemini.model, available: async () => Boolean(deps.apiKeyFor(geminiApiDescriptor.auth as Extract<ProviderAuth, { type: "apiKey" }>)) },
    { provider: openAiProvider({ ...deps.openai, apiKey: () => deps.apiKeyFor(openAiDescriptor.auth as Extract<ProviderAuth, { type: "apiKey" }>), timeoutMs: deps.timeoutMs }), defaultModel: deps.openai.model, available: async () => Boolean(deps.openai.baseUrl) },
  ];
  const providers: Record<ProviderId, Provider> = Object.fromEntries(registry.map((r) => [r.provider.descriptor.id, r.provider]));

  /** Gọi provider với một schema riêng, thử lại một lần khi JSON sai; lỗi hạ tầng không thử lại. */
  async function structured<T>(req: { provider: ProviderId; model?: string | undefined; workdir: string; maxBudgetUsd?: number | undefined; onActivity?: ReviewRequest["onActivity"]; signal?: AbortSignal | undefined }, prompt: { system: string; user: string }, schema: object, parse: (text: string) => T): Promise<{ value: T; usage: ReviewUsage }> {
    const provider = providers[req.provider];
    if (!provider) throw new ModuleError("reviewer", "invalid_input", `Provider không hỗ trợ: ${req.provider}`);
    const started = Date.now();
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const out = await provider.run({ model: req.model, system: prompt.system, user: attempt === 1 ? prompt.user : `${prompt.user}\n\nPREVIOUS OUTPUT WAS NOT VALID JSON FOR THE SCHEMA. Return ONLY the JSON object.`, workdir: req.workdir, maxBudgetUsd: req.maxBudgetUsd, onActivity: req.onActivity, ...(req.signal ? { signal: req.signal } : {}), schema });
        return { value: parse(out.text), usage: { provider: provider.descriptor.id, model: out.model, costUsd: out.costUsd, ...(out.tokens ? { tokens: out.tokens } : {}), durationMs: Date.now() - started } };
      } catch (err) {
        lastErr = err;
        if (err instanceof ModuleError || req.signal?.aborted) throw err;
      }
    }
    throw new ModuleError("reviewer", "upstream_error", `AI không trả JSON hợp lệ: ${String(lastErr).slice(0, 300)}`, lastErr);
  }

  return {
    classify: classifyMr,
    sanitizeBlock(raw, knownPaths) {
      const p = AiBlockSchema.safeParse(raw);
      if (!p.success) return { error: `Dữ liệu sơ đồ không hợp lệ: ${p.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` };
      const k = p.data.kind;
      const [block] = buildBlocks([p.data], { required: [], optional: [k] }, knownPaths);
      return block ? { block } : { error: k === "sequence" ? "Sơ đồ trình tự cần ≥2 actor và ít nhất 1 message nối các actor đó." : "Sơ đồ không có nút hợp lệ (cần nodes có id, label; edges nối đúng id nút)." };
    },
    async review(req) {
      const provider = providers[req.provider];
      if (!provider) throw new ModuleError("reviewer", "invalid_input", `Provider không hỗ trợ: ${req.provider}`);
      const started = Date.now();
      const system = buildSystemPrompt(req.rubric, provider.descriptor.capabilities.repoAccess, req.focus ? "area" : undefined);
      const user = buildUserPrompt(req, provider.descriptor.capabilities.repoAccess);
      deps.logger?.info("gọi provider AI", { provider: provider.descriptor.id, promptChars: system.length + user.length });

      let lastErr: unknown;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const out = await provider.run({
            model: req.model,
            system,
            user: attempt === 1 ? user : `${user}\n\nPREVIOUS OUTPUT WAS NOT VALID JSON FOR THE SCHEMA. Return ONLY the JSON object.`,
            workdir: req.workdir,
            maxBudgetUsd: req.maxBudgetUsd,
            onActivity: req.onActivity,
            ...(req.signal ? { signal: req.signal } : {}),
          });
          const review = normalizeReview(parseReviewText(out.text), req.rubric);
          const resolved = req.mrKind && !req.focus ? resolveKind({ kind: req.mrKind, reasons: req.mrKindReasons ?? [], locked: req.mrKindLocked ?? true }, review.mrKind) : null;
          const blocks = req.mrKind && resolved && !req.focus ? buildBlocks(review.blocks, viewFor(resolved.kind, req.rubric.overview?.views), [...(req.changedFiles ?? []), ...req.harness.tree.split("\n").map((l) => l.trim())]) : [];
          return { review, blocks, blocksRaw: review.blocks.length, ...(resolved ? { mrKind: resolved.kind, mrKindChanged: resolved.changed, mrKindReason: review.mrKindReason?.slice(0, 200) } : {}), usage: { provider: provider.descriptor.id, model: out.model, costUsd: out.costUsd, ...(out.tokens ? { tokens: out.tokens } : {}), durationMs: Date.now() - started } };
        } catch (err) {
          lastErr = err;
          if (err instanceof ModuleError || req.signal?.aborted) throw err; // lỗi hạ tầng / người dùng dừng: không thử lại ở đây
          deps.logger?.warn("phản hồi AI không hợp lệ, thử lại", { attempt, err: String(err).slice(0, 300) });
        }
      }
      throw new ModuleError("reviewer", "upstream_error", `AI không trả JSON hợp lệ: ${String(lastErr).slice(0, 300)}`, lastErr);
    },

    async understand(req) {
      const r = await structured(req, buildUnderstandPrompt(req), UNDERSTAND_JSON_SCHEMA, (t) => parseUnderstandText(t).text.slice(0, 4000));
      return { text: r.value, usage: r.usage };
    },
    async assessDesign(req) {
      const r = await structured(req, buildDesignPrompt(req), DESIGN_JSON_SCHEMA, parseDesignText);
      const known = new Set(req.areas.map((a) => a.label));
      const d = r.value;
      return { design: { verdict: d.verdict, summary: d.summary, concerns: d.concerns.map((c) => ({ ...c, area: c.area && known.has(c.area) ? c.area : null })).slice(0, 20), focus: d.focus.filter((f) => known.has(f)), splitSuggestion: d.splitSuggestion }, usage: r.usage };
    },

    async ask(req) {
      const provider = providers[req.provider];
      if (!provider?.ask || !provider.descriptor.capabilities.chat) throw new ModuleError("reviewer", "not_configured", `${provider?.descriptor.label ?? req.provider} chưa hỗ trợ chat. Chọn provider khác cho chat ở Cài đặt → Review.`);
      if (req.images?.length && !provider.descriptor.capabilities.images) throw new ModuleError("reviewer", "not_configured", `${provider.descriptor.label} không nhận ảnh trong chat.`);
      return provider.ask({ model: req.model, system: req.system, user: req.user, workdir: req.workdir, images: req.images, tools: req.tools, onStep: req.onStep });
    },

    async providers() {
      return Promise.all(registry.map(async (r) => ({ ...r.provider.descriptor, defaultModel: r.defaultModel, available: await r.available().catch(() => false) })));
    },
    describe: (id) => providers[id]?.descriptor ?? null,
    capabilities: (id) => providers[id]?.descriptor.capabilities ?? null,
  };
}
