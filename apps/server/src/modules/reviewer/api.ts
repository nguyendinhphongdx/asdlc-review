import { viewFor, type ProviderAuth, ProviderCapabilities, ProviderInfoDto } from "@mrd/contracts";
import { ModuleError } from "../../kernel/errors.js";
import type { Logger } from "../../kernel/logger.js";
import { buildBlocks } from "./domain/blocks.js";
import { classifyMr, resolveKind, type ChangedFile, type MrKindResult } from "./domain/mr-kind.js";
import { buildSystemPrompt, buildUserPrompt } from "./domain/prompt.js";
import { normalizeReview, parseReviewText } from "./domain/schema.js";
import type { ChatImage, ChatStep, ChatTools, Provider, ProviderId, ReviewRequest, ReviewResponse } from "./domain/types.js";
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
  /** Bước T0: gắn nhãn loại MR từ file đổi và tiêu đề (tất định, không gọi AI). */
  classify(files: ChangedFile[], title?: string): MrKindResult;
  /** Hỏi đáp tự do với agent (không công cụ, không đọc repo). */
  ask(req: { provider: ProviderId; model?: string; system: string; user: string; workdir: string; images?: ChatImage[]; tools?: ChatTools; onStep?: (steps: ChatStep[]) => void }): Promise<{ text: string; costUsd: number | null; steps?: ChatStep[] }>;
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

  return {
    classify: classifyMr,
    async review(req) {
      const provider = providers[req.provider];
      if (!provider) throw new ModuleError("reviewer", "invalid_input", `Provider không hỗ trợ: ${req.provider}`);
      const started = Date.now();
      const system = buildSystemPrompt(req.rubric, provider.descriptor.capabilities.repoAccess);
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
          });
          const review = normalizeReview(parseReviewText(out.text), req.rubric);
          const resolved = req.mrKind ? resolveKind({ kind: req.mrKind, reasons: req.mrKindReasons ?? [], locked: req.mrKindLocked ?? true }, review.mrKind) : null;
          const blocks = req.mrKind && resolved ? buildBlocks(review.blocks, viewFor(resolved.kind, req.rubric.overview?.views), [...(req.changedFiles ?? []), ...req.harness.tree.split("\n").map((l) => l.trim())]) : [];
          return { review, blocks, blocksRaw: review.blocks.length, ...(resolved ? { mrKind: resolved.kind, mrKindChanged: resolved.changed, mrKindReason: review.mrKindReason?.slice(0, 200) } : {}), usage: { provider: provider.descriptor.id, model: out.model, costUsd: out.costUsd, ...(out.tokens ? { tokens: out.tokens } : {}), durationMs: Date.now() - started } };
        } catch (err) {
          lastErr = err;
          if (err instanceof ModuleError) throw err; // lỗi hạ tầng không thử lại ở đây
          deps.logger?.warn("phản hồi AI không hợp lệ, thử lại", { attempt, err: String(err).slice(0, 300) });
        }
      }
      throw new ModuleError("reviewer", "upstream_error", `AI không trả JSON hợp lệ: ${String(lastErr).slice(0, 300)}`, lastErr);
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
