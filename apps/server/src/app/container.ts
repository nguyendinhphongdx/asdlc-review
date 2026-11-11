import { createAnalysisModule } from "../modules/analysis/index.js";
import { createAnalyticsModule } from "../modules/analytics/index.js";
import { createFrameworkModule } from "../modules/framework/index.js";
import { createHarnessModule } from "../modules/harness/index.js";
import { createIdentityModule } from "../modules/identity/index.js";
import { createPublisherModule } from "../modules/publisher/index.js";
import { createQueueModule } from "../modules/queue/index.js";
import { createReposModule } from "../modules/repos/index.js";
import { createReviewerModule } from "../modules/reviewer/index.js";
import { createReviewsModule } from "../modules/reviews/index.js";
import { createScmModule } from "../modules/scm/index.js";
import { createScoringModule } from "../modules/scoring/index.js";
import { createSecretsModule } from "../modules/secrets/index.js";
import path from "node:path";
import { createSettingsModule } from "../modules/settings/index.js";
import { createWorkspaceModule } from "../modules/workspace/index.js";
import type { Config } from "../kernel/config.js";
import { createDb } from "../kernel/db.js";
import { createEventBus } from "../kernel/event-bus.js";
import type { Logger } from "../kernel/logger.js";
import { createCredentials } from "./credentials.js";
import { resolveMasterKey } from "./secret-key.js";
import { memberDirectoryAdapter, paramsAdapter, runFactsAdapter } from "./adapters/analytics.js";
import type { AppSettings, Modules } from "./modules.js";
import { createChatCommand } from "./workflows/chat-command.js";
import { createHandleScmEvent } from "./workflows/handle-event.js";
import { POLL_QUEUE, REVIEW_QUEUE } from "./workflows/mappers.js";
import { createPollOpenMrs } from "./workflows/poll-open-mrs.js";
import { createRegisterRepo } from "./workflows/register-repo.js";
import { createRequestReview } from "./workflows/request-review.js";
import { createProgressHub } from "./progress.js";
import { createReviewMergeRequest } from "./workflows/review-merge-request.js";

/** Composition root: dựng module, nối port↔adapter, dựng workflow. */
export function buildContainer(config: Config, log: Logger, overrides: Partial<Modules> = {}) {
  const events = createEventBus(log.child("events"));
  const db = createDb(config.databaseUrl);

  const settings = createSettingsModule({
    db, events,
    defaults: {
      reviewProvider: config.REVIEW_PROVIDER, defaultFramework: "asdlc",
      passScore: 70, skipDrafts: true, diffBudgetChars: config.DIFF_BUDGET_CHARS,
      workDir: "", triggerMode: "polling", pollIntervalMin: config.POLL_INTERVAL_MIN > 0 ? config.POLL_INTERVAL_MIN : 5,
    },
  });
  // Thư mục clone/làm việc: mặc định trong DATA_DIR, đổi được trên UI (cache cập nhật khi cài đặt đổi).
  let workDir = "";
  const dirs = () => (workDir ? { reposDir: path.join(workDir, "repos"), runsDir: path.join(workDir, "runs") } : { reposDir: config.reposDir, runsDir: config.runsDir });
  const refreshDirs = () => settings.get("workDir").then((v) => { workDir = v; }).catch(() => undefined);
  events.subscribe("settings.changed", () => void refreshDirs());
  const identity = createIdentityModule({ db, events });
  const reviews = createReviewsModule({ db, events });

  const master = resolveMasterKey(config.MRD_SECRET_KEY, config.dataDir);
  const secrets = createSecretsModule({ db, masterKey: master.key });
  const credentials = createCredentials(config, secrets);

  const modules: Modules = {
    secrets,
    scm: createScmModule({ gitlab: credentials.gitlab, github: credentials.github, botMention: config.BOT_MENTION }),
    workspace: createWorkspaceModule({ reposDir: () => dirs().reposDir, runsDir: () => dirs().runsDir, keepWorktrees: config.KEEP_WORKTREES }),
    harness: createHarnessModule(),
    framework: createFrameworkModule({ frameworksDir: config.frameworksDir, db }),
    analysis: createAnalysisModule(),
    reviewer: createReviewerModule({
      claude: { bin: config.CLAUDE_BIN, model: config.CLAUDE_MODEL, maxBudgetUsd: config.CLAUDE_MAX_BUDGET_USD },
      codex: { bin: config.CODEX_BIN, model: config.CODEX_MODEL },
      openai: { baseUrl: config.OPENAI_BASE_URL, apiKey: config.OPENAI_API_KEY, model: config.OPENAI_MODEL },
      timeoutMs: config.REVIEW_TIMEOUT_MIN * 60_000,
      logger: log.child("reviewer"),
    }),
    scoring: createScoringModule(),
    publisher: createPublisherModule(),
    queue: createQueueModule({ redisUrl: config.REDIS_URL, concurrency: config.REVIEW_CONCURRENCY, logger: log.child("queue") }),
    identity,
    repos: createReposModule({ db, events }),
    reviews,
    settings,
    analytics: createAnalyticsModule({ facts: runFactsAdapter(reviews), members: memberDirectoryAdapter(identity), params: paramsAdapter(settings) }),
    ...overrides, // dùng cho test: thay module thật bằng bản giả
  };

  const app: AppSettings = { publicUrl: config.PUBLIC_URL, contextBudgetChars: config.CONTEXT_BUDGET_CHARS, diffBudgetChars: config.DIFF_BUDGET_CHARS, botMention: config.BOT_MENTION };
  const progress = createProgressHub(events);
  const requestReview = createRequestReview(modules, log.child("request"));
  const workflows = {
    requestReview,
    reviewMergeRequest: createReviewMergeRequest(modules, app, log.child("review"), progress),
    handleScmEvent: createHandleScmEvent(modules, requestReview, log.child("event")),
    pollOpenMrs: createPollOpenMrs(modules, requestReview, log.child("poll")),
    chatCommand: createChatCommand(modules, requestReview, { publicUrl: config.PUBLIC_URL }),
    registerRepo: createRegisterRepo(modules),
  };

  return {
    modules, workflows, events, db, credentials, progress, publicUrl: config.PUBLIC_URL,
    storage: { dirs, defaults: { dataDir: config.dataDir, reposDir: config.reposDir, runsDir: config.runsDir } },
    /** Bật worker xử lý hàng đợi và poller (nếu cấu hình). */
    async startWorkers() {
      await refreshDirs();
      const r = await modules.secrets.load();
      if (r.failed.length) log.warn("không giải mã được secret (sai khoá?)", { keys: r.failed });
      modules.queue.process(REVIEW_QUEUE, workflows.reviewMergeRequest as never);
      // Poller luôn được đăng ký (tick mỗi phút) để đổi chế độ/chu kỳ trên UI có hiệu lực ngay, không cần khởi động lại.
      let lastPoll = 0;
      modules.queue.process(POLL_QUEUE, (async () => {
        const s = await settings.snapshot();
        if (s.triggerMode !== "polling" || Date.now() - lastPoll < s.pollIntervalMin * 60_000 - 5_000) return;
        lastPoll = Date.now();
        await workflows.pollOpenMrs();
      }) as never, { concurrency: 1 });
      await modules.queue.repeat(POLL_QUEUE, "poll-open-mrs", {}, 60_000);
    },
    async stop() {
      await modules.queue.close();
      await db.$disconnect();
    },
  };
}
export type Container = ReturnType<typeof buildContainer>;
