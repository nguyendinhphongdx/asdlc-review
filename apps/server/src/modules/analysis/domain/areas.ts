import type { AreaFileDto, ChangeAreaDto, FileRole } from "@mrd/contracts";
import { isGenerated, isTestFile, type ChangedFile } from "./detectors.js";
import type { DiffFile } from "./diff.js";

/** Thư mục chứa nhiều gói con: khu vực là `<thư mục>/<gói>`. */
const CONTAINERS = new Set(["apps", "packages", "services", "libs", "lib", "modules", "crates", "projects", "plugins", "cmd", "internal"]);
/** Thư mục kỹ thuật không mang ý nghĩa khu vực: bỏ qua khi lấy khoá. */
const SKIP = new Set(["src", "app", "source", "main", "java", "kotlin", "python", "__tests__", "tests", "test", "spec", "specs"]);
/** Dưới đây là đơn vị có nghĩa: thêm một tầng nữa vào khoá (modules/reviewer, features/settings…). */
const UNITS = new Set(["modules", "features", "routes", "pages", "controllers", "handlers", "domains", "components", "views", "screens", "plugins", "packages"]);

const RISK_PATH: [RegExp, number, string][] = [
  [/(^|\/)(auth|authn|authz|login|session|oauth|jwt|permission|rbac|acl)[^/]*/i, 0.5, "đụng xác thực/phân quyền"],
  [/(payment|billing|invoice|checkout|wallet|stripe|money|price)/i, 0.5, "đụng tiền/thanh toán"],
  [/(secret|crypto|encrypt|token|password|credential|\.env)/i, 0.4, "đụng bí mật/mã hoá"],
  [/(^|\/)(migrations?|prisma\/schema|schema\.prisma|\.sql$)/i, 0.45, "đổi schema/migration dữ liệu"],
  [/(^|\/)(\.github\/workflows|\.gitlab-ci|Dockerfile|docker-compose|terraform|k8s|helm|\.circleci)/i, 0.35, "đổi CI/hạ tầng"],
];

export function fileRole(p: string): FileRole {
  if (isGenerated(p)) return "generated";
  if (isTestFile(p)) return "test";
  if (/\.(md|mdx|txt|rst|adoc)$/i.test(p) || /(^|\/)docs?\//i.test(p)) return "docs";
  if (/(^|\/)(migrations?)\//i.test(p) || /\.sql$/i.test(p) || /(^|\/)schema\.prisma$|\.prisma$/i.test(p)) return "migration";
  if (/(\.ya?ml|\.json|\.toml|\.ini|\.env[^/]*|\.lock)$/i.test(p) || /(^|\/)(\.github|\.gitlab|\.circleci)\//.test(p) || /(^|\/)(Dockerfile|Makefile)[^/]*$/.test(p) || /(^|\/)(tsconfig|vite\.config|eslint|prettier|jest\.config|vitest\.config)[^/]*$/i.test(p)) return "config";
  return "logic";
}

/** Khoá khu vực của một file (test đi cùng code nguồn: bỏ tầng `__tests__`/`tests`). */
export function areaKey(path: string, role: FileRole): string {
  if (role === "docs") return "docs";
  if (role === "generated") return "generated";
  const segs = path.split("/");
  const dirs = segs.slice(0, -1);
  if (!dirs.length) return role === "config" ? "config" : "(root)";
  if (role === "config" && (dirs[0]?.startsWith(".") || dirs.length === 0)) return "config";
  const out: string[] = [];
  let i = 0;
  if (CONTAINERS.has(dirs[0]!) && dirs.length > 1) { out.push(dirs[0]!, dirs[1]!); i = 2; } else { out.push(dirs[0]!); i = 1; }
  while (i < dirs.length && SKIP.has(dirs[i]!)) i++;
  if (i < dirs.length && UNITS.has(dirs[i]!) && i + 1 < dirs.length) { out.push(dirs[i]!, dirs[i + 1]!); }
  else if (i < dirs.length && !SKIP.has(dirs[i]!) && out.length < 3) out.push(dirs[i]!);
  return out.join("/");
}

const labelOf = (id: string) => (id === "docs" ? "Tài liệu" : id === "config" ? "Cấu hình & CI" : id === "(root)" ? "Thư mục gốc" : id);

/** Import tương đối trong dòng thêm vào → đường dẫn đích (không đuôi) để so với file của các khu vực khác. */
function importedStems(file: DiffFile): string[] {
  const dir = file.path.split("/").slice(0, -1);
  const out: string[] = [];
  for (const a of file.added) {
    const m = a.text.match(/(?:from|import|require\()\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/);
    if (!m?.[1]) continue;
    const parts = [...dir];
    for (const seg of m[1].split("/")) {
      if (seg === ".") continue;
      if (seg === "..") parts.pop();
      else parts.push(seg);
    }
    out.push(parts.join("/").replace(/\.(js|ts|tsx|jsx|mjs|cjs)$/, ""));
  }
  return out;
}

const stem = (p: string) => p.replace(/\.[a-z0-9]+$/i, "").replace(/\/index$/, "");

export interface AreaOptions {
  /** Số khu vực tối đa; nhỏ hơn thì gộp khu vực nhỏ nhất vào "Khác". */
  maxAreas?: number;
  diffFiles?: DiffFile[];
  ignore?: string[];
}

/**
 * Gom file đổi thành khu vực thay đổi, tính rủi ro và quan hệ phụ thuộc giữa các khu vực.
 * Không gọi AI, không đọc repo: chỉ dựa vào đường dẫn, số dòng và dòng import trong diff.
 */
export function buildAreas(files: ChangedFile[], opts: AreaOptions = {}): ChangeAreaDto[] {
  const maxAreas = opts.maxAreas ?? 8;
  const byKey = new Map<string, AreaFileDto[]>();
  const fileArea = new Map<string, string>();
  for (const f of files) {
    const role = fileRole(f.path);
    if (role === "generated") continue;
    const key = areaKey(f.path, role);
    byKey.set(key, [...(byKey.get(key) ?? []), { path: f.path, additions: f.additions, deletions: f.deletions, role }]);
  }

  // Gộp khu vực nhỏ nhất vào "Khác" nếu nhiều hơn maxAreas (giữ docs/config nếu không phải nhỏ nhất).
  const size = (fs: AreaFileDto[]) => fs.reduce((s, f) => s + f.additions + f.deletions, 0);
  while (byKey.size > maxAreas) {
    const smallest = [...byKey.entries()].filter(([k]) => k !== "other").sort((a, b) => size(a[1]) - size(b[1]))[0];
    if (!smallest) break;
    byKey.delete(smallest[0]);
    byKey.set("other", [...(byKey.get("other") ?? []), ...smallest[1]]);
  }
  for (const [k, fs] of byKey) for (const f of fs) fileArea.set(f.path, k);

  const stemToArea = new Map<string, string>();
  for (const [k, fs] of byKey) for (const f of fs) stemToArea.set(stem(f.path), k);

  const areas: ChangeAreaDto[] = [...byKey.entries()].map(([id, fs]) => {
    const reasons = new Set<string>();
    let risk = 0;
    for (const f of fs) {
      if (f.role === "docs") continue;
      for (const [re, w, why] of RISK_PATH) if (re.test(f.path)) { risk = Math.max(risk, w); reasons.add(why); }
    }
    const lines = size(fs);
    const sizeRisk = Math.min(0.3, lines / 1500);
    if (sizeRisk >= 0.15) reasons.add(`thay đổi lớn (${lines} dòng)`);
    const logic = fs.filter((f) => f.role === "logic");
    const noTests = logic.length > 0 && !fs.some((f) => f.role === "test") && logic.reduce((s, f) => s + f.additions, 0) >= 20;
    if (noTests) reasons.add("đổi code mà không đổi test");
    const dependsOn = new Set<string>();
    for (const df of opts.diffFiles ?? []) {
      if (fileArea.get(df.path) !== id) continue;
      for (const s of importedStems(df)) {
        const target = stemToArea.get(s);
        if (target && target !== id) dependsOn.add(target);
      }
    }
    return {
      id, label: labelOf(id), files: fs.sort((a, b) => a.path.localeCompare(b.path)),
      additions: fs.reduce((s, f) => s + f.additions, 0), deletions: fs.reduce((s, f) => s + f.deletions, 0),
      risk: Math.min(1, Number((risk + sizeRisk + (noTests ? 0.1 : 0)).toFixed(2))), riskReasons: [...reasons], noTests, dependsOn: [...dependsOn],
    };
  });
  // Rủi ro cao trước, rồi theo cỡ.
  return areas.sort((a, b) => b.risk - a.risk || b.additions + b.deletions - (a.additions + a.deletions));
}

export interface SplitDecision { split: boolean; reason: string }
/** MR đủ lớn/đủ nhiều khu vực thì review theo khu vực; nhỏ thì giữ một lượt (rẻ hơn). */
export function shouldSplit(input: { files: number; lines: number; areas: number; omitted: number; maxFiles?: number; maxLines?: number }): SplitDecision {
  const maxFiles = input.maxFiles ?? 15;
  const maxLines = input.maxLines ?? 1200;
  if (input.omitted > 0) return { split: true, reason: `diff vượt ngân sách (${input.omitted} file sẽ bị bỏ nếu review một lượt)` };
  if (input.areas >= 2 && (input.files > maxFiles || input.lines > maxLines)) return { split: true, reason: `MR lớn (${input.files} file, ${input.lines} dòng, ${input.areas} khu vực)` };
  return { split: false, reason: input.areas < 2 ? "chỉ một khu vực" : "MR nhỏ, review một lượt" };
}

/** Tách diff đầy đủ thành từng khối theo file (khoá = đường dẫn mới). */
export function splitDiffByFile(diff: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of diff.split(/^(?=diff --git )/m)) {
    const name = part.match(/^diff --git a\/.+? b\/(.+?)\r?\n/)?.[1];
    if (name) out.set(name, part);
  }
  return out;
}

/**
 * Gói diff của một khu vực thành các phần ≤ budget ký tự (tham lam, file nhỏ trước).
 * File lớn hơn budget không nhét vừa: trả trong `omitted` (agent có công cụ đọc thẳng file).
 */
export function packDiff(paths: string[], byFile: Map<string, string>, budget: number): { chunks: { files: string[]; diff: string }[]; omitted: string[] } {
  const items = paths.flatMap((p) => { const d = byFile.get(p); return d ? [{ p, d }] : []; }).sort((a, b) => a.d.length - b.d.length);
  const chunks: { files: string[]; diff: string }[] = [];
  const omitted: string[] = [];
  let cur: { files: string[]; diff: string } | null = null;
  for (const it of items) {
    if (it.d.length > budget) { omitted.push(it.p); continue; }
    if (!cur || cur.diff.length + it.d.length > budget) { cur = { files: [], diff: "" }; chunks.push(cur); }
    cur.files.push(it.p);
    cur.diff += it.d;
  }
  return { chunks, omitted };
}

/**
 * Bản tóm lược diff cho tầng thiết kế/tổng hợp: theo khu vực, mỗi file một dòng thống kê kèm vài dòng tiêu đề hunk
 * (tên hàm/lớp bị đụng tới). Không chứa thân diff nên rẻ; agent có công cụ thì tự mở file khi cần.
 */
export function buildDigest(areas: ChangeAreaDto[], byFile: Map<string, string>, maxChars = 30_000): string {
  const out: string[] = [];
  for (const a of areas) {
    out.push(`## ${a.label} (+${a.additions}/-${a.deletions}, rủi ro ${a.risk}${a.riskReasons.length ? `: ${a.riskReasons.join("; ")}` : ""}${a.dependsOn.length ? `; import tới ${a.dependsOn.join(", ")}` : ""})`);
    for (const f of a.files) {
      const hunks = (byFile.get(f.path)?.split("\n") ?? []).filter((l) => l.startsWith("@@")).slice(0, 6).map((l) => l.replace(/^@@ [^@]*@@\s?/, "").trim()).filter(Boolean);
      out.push(`- ${f.path} [${f.role}] +${f.additions}/-${f.deletions}${hunks.length ? ` — ${hunks.join(" | ").slice(0, 240)}` : ""}`);
    }
    out.push("");
  }
  const text = out.join("\n");
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n…(đã cắt bớt)` : text;
}
