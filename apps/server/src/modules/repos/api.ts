import type { Db } from "../../kernel/db.js";
import { ModuleError } from "../../kernel/errors.js";
import type { EventBus } from "../../kernel/event-bus.js";
import { summarize } from "./domain/webhook-status.js";
import type { RegisterRepoInput, RepoDto, RepoPatch, WebhookEventInput, WebhookSummary } from "./domain/types.js";

export interface ReposDeps {
  db: Db;
  events: EventBus;
}

export interface ReposApi {
  list(): Promise<RepoDto[]>;
  get(id: string): Promise<RepoDto>;
  find(platform: string, fullPath: string): Promise<RepoDto | null>;
  /** Idempotent: tạo nếu chưa có, cập nhật webUrl/defaultBranch nếu đã có. */
  register(input: RegisterRepoInput): Promise<RepoDto>;
  update(id: string, patch: RepoPatch): Promise<RepoDto>;
  remove(id: string): Promise<void>;
  markPolled(id: string, at: Date): Promise<void>;
  /** Ghi một sự kiện webhook (kể cả bị từ chối). Tự dọn, giữ 50 dòng gần nhất mỗi repo. */
  logWebhook(repoKey: string, e: WebhookEventInput): Promise<void>;
  webhookSummary(repoKey: string): Promise<WebhookSummary>;
  /** Tóm tắt trạng thái webhook cho nhiều repo trong một lượt. */
  webhookStatuses(repoKeys: string[]): Promise<Record<string, WebhookSummary>>;
}

export function createReposModule(deps: ReposDeps): ReposApi {
  const { db } = deps;
  const changed = (repoId: string) => deps.events.publish("repos.repo.changed", { repoId });
  return {
    list: () => db.repository.findMany({ orderBy: { fullPath: "asc" } }),
    async get(id) {
      const r = await db.repository.findUnique({ where: { id } });
      if (!r) throw new ModuleError("repos", "not_found", `Không có repo ${id}`);
      return r;
    },
    find: (platform, fullPath) => db.repository.findUnique({ where: { platform_fullPath: { platform, fullPath } } }),
    async register(input) {
      const r = await db.repository.upsert({
        where: { platform_fullPath: { platform: input.platform, fullPath: input.fullPath } },
        create: { platform: input.platform, fullPath: input.fullPath, webUrl: input.webUrl, defaultBranch: input.defaultBranch ?? null },
        update: { webUrl: input.webUrl, defaultBranch: input.defaultBranch ?? undefined },
      });
      changed(r.id);
      return r;
    },
    async update(id, patch) {
      try {
        const r = await db.repository.update({ where: { id }, data: patch });
        changed(id);
        return r;
      } catch {
        throw new ModuleError("repos", "not_found", `Không có repo ${id}`);
      }
    },
    async remove(id) {
      await db.repository.delete({ where: { id } }).catch(() => undefined);
      changed(id);
    },
    async logWebhook(repoKey, e) {
      await db.webhookEvent.create({ data: { repoKey, event: e.event, result: e.result, detail: e.detail ?? null } });
      const old = await db.webhookEvent.findMany({ where: { repoKey }, orderBy: { at: "desc" }, skip: 50, select: { id: true } });
      if (old.length) await db.webhookEvent.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
    },
    async webhookSummary(repoKey) {
      const rows = await db.webhookEvent.findMany({ where: { repoKey }, orderBy: { at: "desc" }, take: 50 });
      return summarize(rows.map((r) => ({ id: r.id, at: r.at, event: r.event, result: r.result as WebhookEventInput["result"], detail: r.detail })));
    },
    async webhookStatuses(repoKeys) {
      const out: Record<string, WebhookSummary> = {};
      for (const k of repoKeys) out[k] = await this.webhookSummary(k);
      return out;
    },
    async markPolled(id, at) {
      await db.repository.update({ where: { id }, data: { lastPolledAt: at } });
    },
  };
}
