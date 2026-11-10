import type { Db } from "../../kernel/db.js";
import { ModuleError } from "../../kernel/errors.js";
import type { EventBus } from "../../kernel/event-bus.js";
import type { RegisterRepoInput, RepoDto, RepoPatch } from "./domain/types.js";

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
    async markPolled(id, at) {
      await db.repository.update({ where: { id }, data: { lastPolledAt: at } });
    },
  };
}
