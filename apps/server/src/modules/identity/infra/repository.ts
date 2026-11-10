import type { Db } from "../../../kernel/db.js";
import { normUsername, type IdentityRef, type MemberDto, type MemberInput } from "../domain/types.js";

type Row = { id: string; displayName: string; email: string | null; team: string | null; role: string | null; active: boolean; identities: { platform: string; username: string }[] };
const toDto = (m: Row): MemberDto => ({ id: m.id, displayName: m.displayName, email: m.email, team: m.team, role: m.role, active: m.active, identities: m.identities.map((i) => ({ platform: i.platform, username: i.username })) });

export class MemberRepository {
  constructor(private db: Db) {}
  private include = { identities: true } as const;

  async list(): Promise<MemberDto[]> {
    return (await this.db.member.findMany({ include: this.include, orderBy: { displayName: "asc" } })).map(toDto);
  }
  async get(id: string): Promise<MemberDto | null> {
    const m = await this.db.member.findUnique({ where: { id }, include: this.include });
    return m ? toDto(m) : null;
  }
  async findByIdentity(ref: IdentityRef): Promise<string | null> {
    const row = await this.db.memberIdentity.findUnique({ where: { platform_username: { platform: ref.platform, username: normUsername(ref.username) } } });
    return row?.memberId ?? null;
  }
  async create(input: MemberInput): Promise<MemberDto> {
    const m = await this.db.member.create({
      data: {
        displayName: input.displayName, email: input.email ?? null, team: input.team ?? null, role: input.role ?? null, active: input.active ?? true,
        identities: { create: (input.identities ?? []).map((i) => ({ platform: i.platform, username: normUsername(i.username) })) },
      },
      include: this.include,
    });
    return toDto(m);
  }
  async update(id: string, patch: Partial<MemberInput>): Promise<MemberDto> {
    await this.db.member.update({
      where: { id },
      data: { displayName: patch.displayName, email: patch.email, team: patch.team, role: patch.role, active: patch.active },
    });
    if (patch.identities) {
      await this.db.memberIdentity.deleteMany({ where: { memberId: id } });
      await this.db.memberIdentity.createMany({ data: patch.identities.map((i) => ({ memberId: id, platform: i.platform, username: normUsername(i.username) })) });
    }
    return (await this.get(id))!;
  }
  async remove(id: string) {
    await this.db.member.delete({ where: { id } });
  }
}
