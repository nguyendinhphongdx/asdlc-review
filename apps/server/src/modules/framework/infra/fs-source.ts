import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { ModuleError } from "../../../kernel/errors.js";
import { FrameworkFileSchema, type FrameworkFile } from "../domain/schema.js";

export class FsFrameworkSource {
  private cache = new Map<string, FrameworkFile>();
  constructor(private dir: string) {}

  async list(): Promise<FrameworkFile[]> {
    if (!existsSync(this.dir)) return [];
    const entries = await readdir(this.dir, { withFileTypes: true });
    const out: FrameworkFile[] = [];
    for (const e of entries) if (e.isDirectory()) out.push(await this.load(e.name));
    return out;
  }

  async load(id: string): Promise<FrameworkFile> {
    const hit = this.cache.get(id);
    if (hit) return hit;
    if (!/^[a-z0-9._-]+$/i.test(id)) throw new ModuleError("framework", "invalid_input", `Framework id không hợp lệ: ${id}`);
    const file = path.join(this.dir, id, "framework.yaml");
    if (!existsSync(file)) throw new ModuleError("framework", "not_found", `Không có framework "${id}"`);
    const parsed = FrameworkFileSchema.parse(YAML.parse(await readFile(file, "utf8")));
    this.cache.set(id, parsed);
    return parsed;
  }
}
