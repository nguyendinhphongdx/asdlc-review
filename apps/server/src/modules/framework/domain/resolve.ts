import YAML from "yaml";
import type { Rubric } from "@mrd/contracts";
import { RepoConfigSchema, type FrameworkFile, type RepoConfig } from "./schema.js";

export interface ParsedRepoConfig {
  config: RepoConfig | null;
  error?: string;
}

export function parseRepoConfig(yaml: string | undefined | null): ParsedRepoConfig {
  if (!yaml?.trim()) return { config: null };
  try {
    return { config: RepoConfigSchema.parse(YAML.parse(yaml) ?? {}) };
  } catch (err) {
    return { config: null, error: `.asdlc.yml không hợp lệ: ${(err as Error).message.slice(0, 400)}` };
  }
}

/** Áp `.asdlc.yml` lên framework nền: đổi trọng số, tắt tiêu chí, thêm tiêu chí riêng. Hàm thuần. */
export function buildRubric(base: FrameworkFile, repo: RepoConfig | null): Rubric {
  const fw = structuredClone(base);
  const disabled = new Set(repo?.disable ?? []);
  for (const c of fw.categories) {
    const w = repo?.weights?.[c.id];
    if (w !== undefined) c.weight = w;
    c.criteria = c.criteria.filter((r) => !disabled.has(r.id));
  }
  for (const rule of repo?.extraRules ?? []) {
    fw.categories.find((c) => c.id === rule.category)?.criteria.push(rule);
  }
  return {
    id: fw.id,
    name: fw.name,
    version: fw.version,
    language: repo?.language ?? fw.language,
    severity: fw.severity as Rubric["severity"],
    gates: fw.gates,
    grades: [...fw.grades].sort((a, b) => b.min - a.min),
    sizeBaseline: fw.sizeBaseline,
    categories: fw.categories,
    repoNotes: repo?.notes,
  };
}
