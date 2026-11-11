import type { Db } from "../../../kernel/db.js";
import { ModuleError } from "../../../kernel/errors.js";
import { FrameworkFileSchema, type FrameworkFile } from "../domain/schema.js";

export interface StoredVersion {
  version: number;
  note: string;
  author: string;
  createdAt: Date;
}
export interface StoredFramework {
  id: string;
  name: string;
  baseId: string;
  currentVersion: number;
  updatedAt: Date;
}

/** Framework tự tạo (fork) + lịch sử phiên bản trong DB của module. */
export class DbFrameworkStore {
  constructor(private db: Db) {}

  async list(): Promise<StoredFramework[]> {
    return this.db.customFramework.findMany({ orderBy: { updatedAt: "desc" } });
  }
  async find(id: string): Promise<StoredFramework | null> {
    return this.db.customFramework.findUnique({ where: { id } });
  }
  async load(id: string, version?: number): Promise<{ file: FrameworkFile; meta: StoredFramework; version: number } | null> {
    const meta = await this.find(id);
    if (!meta) return null;
    const v = version ?? meta.currentVersion;
    const row = await this.db.frameworkVersion.findUnique({ where: { frameworkId_version: { frameworkId: id, version: v } } });
    if (!row) throw new ModuleError("framework", "not_found", `Không có phiên bản ${v} của "${id}"`);
    return { file: FrameworkFileSchema.parse(JSON.parse(row.content)), meta, version: v };
  }
  async versions(id: string): Promise<StoredVersion[]> {
    const rows = await this.db.frameworkVersion.findMany({ where: { frameworkId: id }, orderBy: { version: "desc" }, select: { version: true, note: true, author: true, createdAt: true } });
    return rows;
  }
  async create(id: string, name: string, baseId: string, file: FrameworkFile, author: string, note: string): Promise<void> {
    await this.db.customFramework.create({ data: { id, name, baseId, currentVersion: 1, versions: { create: { version: 1, content: JSON.stringify(file), note, author } } } });
  }
  /** Ghi phiên bản mới (tăng số) và trả số phiên bản. */
  async addVersion(id: string, file: FrameworkFile, author: string, note: string): Promise<number> {
    return this.db.$transaction(async (tx) => {
      const cur = await tx.customFramework.findUniqueOrThrow({ where: { id } });
      const version = cur.currentVersion + 1;
      await tx.frameworkVersion.create({ data: { frameworkId: id, version, content: JSON.stringify(file), note, author } });
      await tx.customFramework.update({ where: { id }, data: { currentVersion: version, name: file.name } });
      return version;
    });
  }
  async remove(id: string): Promise<void> {
    await this.db.customFramework.delete({ where: { id } }).catch(() => undefined);
  }
}
