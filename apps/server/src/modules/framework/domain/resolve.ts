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

/**
 * Kiểm tra `.asdlc.yml` so với framework nền. Trả các vi phạm (người dùng đọc được) và danh sách thay đổi.
 * Quy tắc: không được tắt rule `locked`; extraRules phải trỏ hạng mục có thật, id không trùng; trọng số/disable
 * phải trỏ id có thật. Phần vi phạm bị bỏ qua khi áp dụng (xem `buildRubric`).
 */
export function checkRepoConfig(base: FrameworkFile, cfg: RepoConfig | null): { errors: string[]; changes: string[] } {
  const errors: string[] = [];
  const changes: string[] = [];
  if (!cfg) return { errors, changes };
  const rules = new Map(base.categories.flatMap((c) => c.criteria.map((r) => [r.id, r] as const)));
  const cats = new Set(base.categories.map((c) => c.id));
  for (const id of cfg.disable ?? []) {
    const r = rules.get(id);
    if (!r) errors.push(`disable: không có rule "${id}"`);
    else if (r.locked) errors.push(`disable: không được tắt rule bảo mật bắt buộc ${id} (gate bảo mật luôn áp dụng)`);
    else changes.push(`Tắt rule ${id} — ${r.title}`);
  }
  for (const [id, w] of Object.entries(cfg.weights ?? {})) {
    if (!cats.has(id)) errors.push(`weights: không có hạng mục "${id}"`);
    else changes.push(`Trọng số ${id}: ${base.categories.find((c) => c.id === id)?.weight} → ${w}`);
  }
  const seen = new Set<string>();
  for (const r of cfg.extraRules ?? []) {
    if (rules.has(r.id) || seen.has(r.id)) errors.push(`extraRules: id "${r.id}" bị trùng`);
    else if (!cats.has(r.category)) errors.push(`extraRules: ${r.id} trỏ hạng mục không tồn tại "${r.category}"`);
    else changes.push(`Thêm rule ${r.id} (${r.defaultSeverity}) — ${r.title}`);
    seen.add(r.id);
  }
  return { errors, changes };
}

/** Áp `.asdlc.yml` lên framework nền. Hàm thuần; phần vi phạm (checkRepoConfig) bị bỏ qua, không làm hỏng review. */
export function buildRubric(base: FrameworkFile, repo: RepoConfig | null, versionLabel?: string): Rubric {
  const fw = structuredClone(base);
  const disabled = new Set((repo?.disable ?? []).filter((id) => !fw.categories.some((c) => c.criteria.some((r) => r.id === id && r.locked))));
  const known = new Set(fw.categories.flatMap((c) => c.criteria.map((r) => r.id)));
  for (const c of fw.categories) {
    const w = repo?.weights?.[c.id];
    if (w !== undefined) c.weight = w;
    c.criteria = c.criteria.filter((r) => r.enabled && !disabled.has(r.id));
  }
  for (const rule of repo?.extraRules ?? []) {
    if (known.has(rule.id)) continue;
    known.add(rule.id);
    fw.categories.find((c) => c.id === rule.category)?.criteria.push({ ...rule, enabled: true, locked: false });
  }
  return {
    id: fw.id,
    name: fw.name,
    version: versionLabel ?? fw.version,
    language: repo?.language ?? fw.language,
    severity: fw.severity as Rubric["severity"],
    gates: fw.gates.map(({ locked: _l, ...g }) => g),
    grades: [...fw.grades].sort((a, b) => b.min - a.min),
    sizeBaseline: fw.sizeBaseline,
    categories: fw.categories.map((c) => ({ ...c, criteria: c.criteria.map(({ enabled: _e, locked: _k, ...r }) => r) })),
    repoNotes: repo?.notes,
  };
}
