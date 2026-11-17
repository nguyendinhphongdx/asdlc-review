import type { MrKind } from "@mrd/contracts";

export interface ChangedFile { path: string; additions: number; deletions: number }
/** `locked`: loại suy ra chắc chắn từ danh sách file (toàn docs/test/manifest/config), AI không được đổi. */
export interface MrKindResult { kind: MrKind; reasons: string[]; locked: boolean }
/** Loại AI được chọn khi đọc diff (không gồm loại khoá theo file). */
export const AI_KINDS: readonly MrKind[] = ["new-feature", "flow-change", "refactor", "bugfix", "schema-change", "api-change"];
const LOCKED: readonly MrKind[] = ["docs", "test-only", "deps", "config-infra"];

/** Chốt loại cuối: loại khoá giữ nguyên; AI chọn loại hợp lệ thì theo AI, không thì theo gợi ý. */
export function resolveKind(hint: MrKindResult, ai: string | null | undefined): { kind: MrKind; changed: boolean } {
  if (hint.locked || !ai || !(AI_KINDS as readonly string[]).includes(ai) || ai === hint.kind) return { kind: hint.kind, changed: false };
  return { kind: ai as MrKind, changed: true };
}

const DOC = /(^|\/)(docs?|documentation)\/|\.(md|mdx|rst|txt|adoc)$|(^|\/)(LICENSE|CHANGELOG|README)[^/]*$/i;
const TEST = /(^|\/)(__tests__|tests?|spec|e2e|fixtures?)\/|\.(test|spec)\.[a-z]+$|_test\.(go|py)$/i;
const MANIFEST = /(^|\/)(package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock|go\.(mod|sum)|Cargo\.(toml|lock)|requirements[^/]*\.txt|poetry\.lock|Gemfile(\.lock)?|composer\.(json|lock)|pom\.xml|build\.gradle(\.kts)?|Podfile(\.lock)?|pubspec\.(yaml|lock))$/;
const CONFIG = /(^|\/)(\.github|\.gitlab|\.circleci|\.husky|k8s|helm|terraform|infra|deploy)\/|(^|\/)(Dockerfile[^/]*|docker-compose[^/]*|\.gitlab-ci\.yml|tsconfig[^/]*\.json|\.eslintrc[^/]*|vite\.config\.[a-z]+|\.env(\.[a-z]+)?)$|\.(ya?ml|toml|tf|ini)$/i;
const SCHEMA = /(^|\/)(migrations?|prisma)\/|\.prisma$|\.sql$|(^|\/)schema\.(rb|graphql)$/i;
const API = /(^|\/)(routes?|controllers?|endpoints?|openapi|swagger|graphql)\/|\.proto$|(^|\/)(http|routes?|controller)\.[a-z]+$|(^|\/)packages\/contracts\//i;
const SOURCE = /\.(tsx?|jsx?|mjs|cjs|py|go|rs|java|kt|swift|rb|php|cs|cpp|c|h|vue|svelte|dart|scala)$/i;

/**
 * Gắn nhãn loại MR từ đường dẫn file, số dòng và tiêu đề (không gọi AI). Thứ tự ưu tiên: toàn bộ file cùng loại
 * (docs/test/deps/config) → có file schema/migration → có file API → tiêu đề (refactor/fix/feat) → mặc định "flow-change".
 */
export function classifyMr(files: ChangedFile[], title = ""): MrKindResult {
  const r = classifyRaw(files, title);
  return { ...r, locked: LOCKED.includes(r.kind) };
}

function classifyRaw(files: ChangedFile[], title: string): { kind: MrKind; reasons: string[] } {
  const paths = files.map((f) => f.path);
  const all = (re: RegExp) => paths.length > 0 && paths.every((p) => re.test(p));
  const lines = files.reduce((s, f) => s + f.additions + f.deletions, 0);
  if (!paths.length) return { kind: "docs", reasons: ["không có file thay đổi"] };
  if (all(DOC)) return { kind: "docs", reasons: ["mọi file là tài liệu"] };
  if (all(TEST)) return { kind: "test-only", reasons: ["mọi file là test"] };
  if (paths.every((p) => MANIFEST.test(p) || DOC.test(p)) && paths.some((p) => MANIFEST.test(p))) return { kind: "deps", reasons: ["chỉ đổi manifest/lockfile phụ thuộc"] };
  if (paths.every((p) => CONFIG.test(p) || MANIFEST.test(p) || DOC.test(p)) && !paths.some((p) => SOURCE.test(p))) return { kind: "config-infra", reasons: ["chỉ đổi cấu hình/hạ tầng"] };
  const schema = paths.filter((p) => SCHEMA.test(p));
  if (schema.length) return { kind: "schema-change", reasons: [`đụng schema/migration: ${schema.slice(0, 2).join(", ")}`] };
  const api = paths.filter((p) => API.test(p));
  if (api.length) return { kind: "api-change", reasons: [`đụng route/hợp đồng API: ${api.slice(0, 2).join(", ")}`] };
  const t = title.toLowerCase();
  if (/\b(refactor|rename|restructure|clean ?up|tách|di chuyển|dọn)\b/.test(t)) return { kind: "refactor", reasons: ["tiêu đề nói refactor"] };
  if (/^(fix|bugfix|hotfix)\b|\b(fix(es|ed)?|sửa lỗi|vá lỗi)\b/.test(t) && lines <= 200) return { kind: "bugfix", reasons: ["tiêu đề nói sửa lỗi, thay đổi nhỏ"] };
  if (/^(feat|feature)\b|\b(add|adds|implement|introduce|thêm|triển khai)\b/.test(t)) return { kind: "new-feature", reasons: ["tiêu đề nói thêm tính năng"] };
  return { kind: "flow-change", reasons: ["đổi mã nguồn, không khớp loại nào khác"] };
}
