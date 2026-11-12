import { ModuleError } from "../../kernel/errors.js";
import type { Logger } from "../../kernel/logger.js";
import { buildSystemPrompt, buildUserPrompt } from "./domain/prompt.js";
import { normalizeReview, parseReviewText } from "./domain/schema.js";
import type { ChatImage, ChatStep, ChatTools, Provider, ProviderId, ReviewRequest, ReviewResponse } from "./domain/types.js";
import { claudeCliProvider } from "./infra/claude-cli.js";
import { codexCliProvider } from "./infra/codex-cli.js";
import { openAiProvider } from "./infra/openai.js";
import { binAvailable } from "./infra/probe.js";

export interface ReviewerDeps {
  claude: { bin: string; model: string; maxBudgetUsd: number };
  codex: { bin: string; model: string };
  openai: { baseUrl: string; apiKey: string; model: string };
  timeoutMs: number;
  logger?: Logger;
}

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  agentic: boolean;
  model: string;
  available: boolean;
}

export interface ReviewerApi {
  review(req: ReviewRequest): Promise<ReviewResponse>;
  /** Hỏi đáp tự do với agent (không công cụ, không đọc repo). */
  ask(req: { provider: ProviderId; model?: string; system: string; user: string; workdir: string; images?: ChatImage[]; tools?: ChatTools; onStep?: (steps: ChatStep[]) => void }): Promise<{ text: string; costUsd: number | null; steps?: ChatStep[] }>;
  providers(): Promise<ProviderInfo[]>;
}

export function createReviewerModule(deps: ReviewerDeps): ReviewerApi {
  const providers: Record<ProviderId, Provider> = {
    "claude-cli": claudeCliProvider({ ...deps.claude, timeoutMs: deps.timeoutMs }),
    "codex-cli": codexCliProvider({ ...deps.codex, timeoutMs: deps.timeoutMs }),
    "openai-compatible": openAiProvider({ ...deps.openai, timeoutMs: deps.timeoutMs }),
  };

  return {
    async review(req) {
      const provider = providers[req.provider];
      if (!provider) throw new ModuleError("reviewer", "invalid_input", `Provider không hỗ trợ: ${req.provider}`);
      const started = Date.now();
      const system = buildSystemPrompt(req.rubric, provider.agentic);
      const user = buildUserPrompt(req, provider.agentic);
      deps.logger?.info("gọi provider AI", { provider: provider.id, promptChars: system.length + user.length });

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
          return { review, usage: { provider: provider.id, model: out.model, costUsd: out.costUsd, durationMs: Date.now() - started } };
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
      if (!provider?.ask) throw new ModuleError("reviewer", "not_configured", "Provider này chưa hỗ trợ chat. Hãy chọn Claude Code CLI ở Cài đặt.");
      if (req.images?.length && provider.id !== "claude-cli") throw new ModuleError("reviewer", "not_configured", "Gửi ảnh trong chat chỉ hỗ trợ Claude Code CLI.");
      return provider.ask({ model: req.model, system: req.system, user: req.user, workdir: req.workdir, images: req.images, tools: req.tools, onStep: req.onStep });
    },

    async providers() {
      return [
        { id: "claude-cli", label: "Claude Code CLI", agentic: true, model: deps.claude.model, available: await binAvailable(deps.claude.bin) },
        { id: "codex-cli", label: "Codex CLI", agentic: true, model: deps.codex.model || "(mặc định)", available: await binAvailable(deps.codex.bin) },
        { id: "openai-compatible", label: "OpenAI-compatible API", agentic: false, model: deps.openai.model, available: Boolean(deps.openai.model) },
      ];
    },
  };
}
