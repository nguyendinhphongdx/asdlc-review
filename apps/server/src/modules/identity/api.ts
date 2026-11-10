import type { Clock } from "../../kernel/clock.js";
import type { Db } from "../../kernel/db.js";
import { ModuleError } from "../../kernel/errors.js";
import type { EventBus } from "../../kernel/event-bus.js";
import { MEMBER_CHANGED } from "./events.js";
import { normUsername, type IdentityRef, type MemberDto, type MemberInput } from "./domain/types.js";
import { MemberRepository } from "./infra/repository.js";

export interface IdentityDeps {
  db: Db;
  events: EventBus;
  clock?: Clock;
}

export interface IdentityApi {
  list(): Promise<MemberDto[]>;
  get(id: string): Promise<MemberDto>;
  create(input: MemberInput): Promise<MemberDto>;
  update(id: string, patch: Partial<MemberInput>): Promise<MemberDto>;
  remove(id: string): Promise<void>;
  /** Tìm thành viên theo tài khoản nền tảng. */
  resolve(platform: string, username: string): Promise<string | null>;
  /** Như `resolve`, nhưng tự tạo thành viên mới (đánh dấu theo username) khi chưa có. */
  resolveOrCreate(platform: string, username: string, displayName?: string): Promise<string>;
}

export function createIdentityModule(deps: IdentityDeps): IdentityApi {
  const repo = new MemberRepository(deps.db);
  const changed = (memberId: string) => deps.events.publish(MEMBER_CHANGED, { memberId });
  const clean = (identities?: IdentityRef[]) => identities?.filter((i) => i.username.trim()).map((i) => ({ platform: i.platform, username: normUsername(i.username) }));

  const ensureFree = async (identities: IdentityRef[] | undefined, selfId?: string) => {
    for (const i of identities ?? []) {
      const owner = await repo.findByIdentity(i);
      if (owner && owner !== selfId) throw new ModuleError("identity", "conflict", `Tài khoản ${i.platform}:${i.username} đã thuộc thành viên khác`);
    }
  };

  return {
    list: () => repo.list(),
    async get(id) {
      const m = await repo.get(id);
      if (!m) throw new ModuleError("identity", "not_found", `Không có thành viên ${id}`);
      return m;
    },
    async create(input) {
      if (!input.displayName.trim()) throw new ModuleError("identity", "invalid_input", "displayName bắt buộc");
      const identities = clean(input.identities);
      await ensureFree(identities);
      const m = await repo.create({ ...input, identities });
      changed(m.id);
      return m;
    },
    async update(id, patch) {
      if (!(await repo.get(id))) throw new ModuleError("identity", "not_found", `Không có thành viên ${id}`);
      const identities = clean(patch.identities);
      await ensureFree(identities, id);
      const m = await repo.update(id, { ...patch, identities });
      changed(id);
      return m;
    },
    async remove(id) {
      await repo.remove(id);
      changed(id);
    },
    resolve: (platform, username) => repo.findByIdentity({ platform, username }),
    async resolveOrCreate(platform, username, displayName) {
      const hit = await repo.findByIdentity({ platform, username });
      if (hit) return hit;
      const m = await repo.create({ displayName: displayName || username, identities: [{ platform, username }] });
      changed(m.id);
      return m.id;
    },
  };
}
