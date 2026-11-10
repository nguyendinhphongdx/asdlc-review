import type { Rubric } from "@mrd/contracts";
import { buildRubric, parseRepoConfig } from "./domain/resolve.js";
import type { RepoConfig } from "./domain/schema.js";
import { FsFrameworkSource } from "./infra/fs-source.js";

export interface FrameworkDeps {
  frameworksDir: string;
  defaultFrameworkId?: string;
}

export interface FrameworkInfo {
  id: string;
  name: string;
  version: string;
  categories: { id: string; name: string; weight: number; criteria: number }[];
}

export interface ResolveInput {
  /** Ghi đè từ cấu hình repo trong hệ thống (ưu tiên thấp hơn `.asdlc.yml`). */
  frameworkId?: string | null;
  /** Nội dung thô của `.asdlc.yml` (nếu repo có). */
  repoConfigYaml?: string | null;
}

export interface ResolveResult {
  rubric: Rubric;
  repoConfig: RepoConfig | null;
  repoConfigError?: string;
}

export interface FrameworkApi {
  list(): Promise<FrameworkInfo[]>;
  /** Trả về toàn bộ rubric (cho UI xem). */
  get(id: string): Promise<Rubric>;
  resolve(input: ResolveInput): Promise<ResolveResult>;
}

export function createFrameworkModule(deps: FrameworkDeps): FrameworkApi {
  const source = new FsFrameworkSource(deps.frameworksDir);
  const fallback = deps.defaultFrameworkId ?? "asdlc";
  return {
    async list() {
      return (await source.list()).map((f) => ({
        id: f.id,
        name: f.name,
        version: f.version,
        categories: f.categories.map((c) => ({ id: c.id, name: c.name, weight: c.weight, criteria: c.criteria.length })),
      }));
    },
    async get(id) {
      return buildRubric(await source.load(id), null);
    },
    async resolve(input) {
      const parsed = parseRepoConfig(input.repoConfigYaml);
      const id = parsed.config?.framework ?? input.frameworkId ?? fallback;
      const rubric = buildRubric(await source.load(id), parsed.config);
      return { rubric, repoConfig: parsed.config, repoConfigError: parsed.error };
    },
  };
}
