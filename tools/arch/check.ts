/**
 * Kiểm tra luật kiến trúc micro-module (docs/MODULES.md). Chạy: `pnpm arch`.
 * Không phụ thuộc thư viện ngoài; chỉ dùng cú pháp TS có thể "strip types".
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SERVER = path.join(ROOT, "apps/server/src");
const WEB = path.join(ROOT, "apps/web/src");
const CONTRACTS = path.join(ROOT, "packages/contracts/src");
const PRISMA = path.join(ROOT, "apps/server/prisma/schema");

interface Violation {
  rule: string;
  file: string;
  message: string;
  warn?: boolean;
}
const violations: Violation[] = [];
const add = (rule: string, file: string, message: string, warn = false) =>
  violations.push({ rule, file: path.relative(ROOT, file), message, warn });

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const IMPORT_RE = /(?:import|export)\s+(type\s+)?(?:[^'";]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

interface Imp {
  spec: string;
  typeOnly: boolean;
}
function importsOf(src: string): Imp[] {
  const out: Imp[] = [];
  for (const m of src.matchAll(IMPORT_RE)) out.push({ spec: (m[2] ?? m[3])!, typeOnly: Boolean(m[1]) });
  return out;
}

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// ---------------- server ----------------
const modulesDir = path.join(SERVER, "modules");
const moduleNames = existsSync(modulesDir) ? readdirSync(modulesDir).filter((n) => !n.startsWith(".") && statSync(path.join(modulesDir, n)).isDirectory()) : [];

for (const file of walk(SERVER)) {
  const rel = path.relative(SERVER, file).split(path.sep).join("/");
  const raw = readFileSync(file, "utf8");
  const code = stripComments(raw);
  const lines = raw.split("\n").length;
  if (lines > 400) add("M11", file, `File ${lines} dòng (> 400)`);
  else if (lines > 300) add("M11", file, `File ${lines} dòng (> 300)`, true);

  const self = rel.startsWith("modules/") ? rel.split("/")[1]! : null;
  const layer = self ? rel.split("/")[2] : null; // domain | infra | application | ...

  for (const { spec, typeOnly } of importsOf(code)) {
    const isRel = spec.startsWith(".");
    const target = isRel ? path.relative(SERVER, path.resolve(path.dirname(file), spec)).split(path.sep).join("/") : null;

    if (target && target.startsWith("..")) {
      if (self) add("R6", file, `Module import ra ngoài src/: ${spec}`);
      continue;
    }

    if (self) {
      // R1, R2
      if (target?.startsWith("modules/")) {
        const other = target.split("/")[1]!;
        if (other !== self) add("R1", file, `Module "${self}" import module "${other}" (${spec}). Dùng Port + adapter ở app/adapters.`);
      }
      if (target?.startsWith("app/") || target === "app") add("R2", file, `Module import app/: ${spec}`);
      if (target?.startsWith("kernel/")) {
        const k = target.split("/")[1]!.replace(/\.js$/, "");
        if (["config"].includes(k)) add("M12", file, `Module không được import kernel/config (nhận cấu hình qua deps): ${spec}`);
        if (["exec", "db"].includes(k) && layer !== "infra" && !typeOnly) add("R3", file, `kernel/${k} chỉ được import giá trị từ infra/ (import type thì được): ${spec}`);
      }
      if (spec === "@prisma/client" && layer !== "infra") add("R3", file, `@prisma/client chỉ dùng trong infra/`);
      // M7 domain thuần
      if (layer === "domain") {
        if (target && /^modules\/[^/]+\/(infra|application)/.test(target)) add("M7", file, `domain/ import ${spec}`);
        if (/^(node:)?(fs|child_process|net|http|https)(\/promises)?$/.test(spec)) add("M7", file, `domain/ import module I/O: ${spec}`);
        if (spec === "@prisma/client") add("M7", file, `domain/ import Prisma`);
      }
    } else if (rel.startsWith("kernel/")) {
      if (target?.startsWith("modules/") || target?.startsWith("app/")) add("R3", file, `kernel import ngược lên ${spec}`);
    } else if (rel.startsWith("app/") || rel === "main.ts") {
      // R4: chỉ import qua cổng index của module
      if (target?.startsWith("modules/")) {
        const parts = target.split("/");
        const okDeep = parts.length === 2 || (parts.length === 3 && /^index(\.js)?$/.test(parts[2]!));
        if (!okDeep) add("R4", file, `Import sâu vào module: ${spec} (chỉ được import "modules/<tên>")`);
      }
    }
  }

  if (self && /process\.env/.test(code)) add("M12", file, "Module không đọc process.env (nhận qua deps)");
  if (self && /(^|\/)(index|api|ports)\.ts$/.test(rel)) {
    if (/:\s*any\b|\bas\s+any\b|@ts-ignore|@ts-nocheck/.test(raw)) add("R16", file, "Cấm any/ts-ignore trong index/api/ports");
  }
}

// M10 + khuôn module
for (const m of moduleNames) {
  const dir = path.join(modulesDir, m);
  if (!existsSync(path.join(dir, "index.ts"))) add("M3", dir, "Thiếu index.ts (cổng công khai)");
  if (!existsSync(path.join(dir, "MODULE.md"))) add("M10", dir, "Thiếu MODULE.md");
  else {
    const md = readFileSync(path.join(dir, "MODULE.md"), "utf8");
    for (const h of ["Trách nhiệm", "API", "Sự kiện", "Dữ liệu", "Port", "Quyết định"]) {
      if (!md.includes(h)) add("M10", path.join(dir, "MODULE.md"), `Thiếu mục "${h}"`);
    }
  }
}

// R8, R9: sở hữu dữ liệu
const owner = new Map<string, string>(); // model -> module (theo tên file schema)
if (existsSync(PRISMA)) {
  for (const f of readdirSync(PRISMA)) {
    if (!f.endsWith(".prisma") || f === "base.prisma") continue;
    const mod = f.replace(".prisma", "");
    const text = readFileSync(path.join(PRISMA, f), "utf8");
    for (const m of text.matchAll(/^model\s+(\w+)\s*\{/gm)) owner.set(m[1]!, mod);
  }
  for (const f of readdirSync(PRISMA)) {
    if (!f.endsWith(".prisma") || f === "base.prisma") continue;
    const mod = f.replace(".prisma", "");
    const text = readFileSync(path.join(PRISMA, f), "utf8");
    for (const block of text.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
      for (const line of block[2]!.split("\n")) {
        const t = line.trim().match(/^\w+\s+(\w+)(\[\])?\??\s/);
        if (t && owner.has(t[1]!) && owner.get(t[1]!) !== mod) add("R9", path.join(PRISMA, f), `Model ${block[1]} tham chiếu ${t[1]} của module "${owner.get(t[1]!)}" (chỉ lưu ID chuỗi)`);
      }
    }
  }
  const lowerFirst = (s: string) => s[0]!.toLowerCase() + s.slice(1);
  for (const file of walk(SERVER)) {
    const rel = path.relative(SERVER, file).split(path.sep).join("/");
    const self = rel.startsWith("modules/") ? rel.split("/")[1]! : null;
    const code = stripComments(readFileSync(file, "utf8"));
    for (const [model, mod] of owner) {
      if (self === mod) continue;
      const re = new RegExp(`\\.${lowerFirst(model)}\\.(find\\w*|create\\w*|update\\w*|delete\\w*|upsert|count|aggregate|groupBy)\\b`);
      if (re.test(code)) add("R8", file, `Truy cập bảng ${model} của module "${mod}" từ ngoài module`);
    }
  }
}

// ---------------- contracts ----------------
for (const file of walk(CONTRACTS)) {
  for (const { spec } of importsOf(readFileSync(file, "utf8"))) {
    if (spec.includes("apps/") || spec.startsWith("@mrd/") && spec !== "@mrd/contracts") add("R6", file, `contracts import ${spec}`);
  }
}

// ---------------- web ----------------
for (const file of walk(WEB)) {
  const rel = path.relative(WEB, file).split(path.sep).join("/");
  const code = stripComments(readFileSync(file, "utf8"));
  const self = rel.startsWith("features/") ? rel.split("/")[1]! : null;
  for (const { spec } of importsOf(code)) {
    if (!spec.startsWith(".")) continue;
    const target = path.relative(WEB, path.resolve(path.dirname(file), spec)).split(path.sep).join("/");
    if (self && target.startsWith("features/") && target.split("/")[1] !== self) add("R17", file, `feature "${self}" import feature khác: ${spec}`);
    if (self && target.startsWith("app/")) add("R17", file, `feature import app/: ${spec}`);
  }
  if (self && /\bfetch\(/.test(code) && !/\/api\.ts$/.test(rel)) add("R18", file, "Component không fetch trực tiếp; dùng features/<x>/api.ts");
}

// ---------------- báo cáo ----------------
const errors = violations.filter((v) => !v.warn);
const warns = violations.filter((v) => v.warn);
for (const v of [...errors, ...warns]) console.log(`${v.warn ? "WARN " : "FAIL "}[${v.rule}] ${v.file}: ${v.message}`);
console.log(`\narch: ${moduleNames.length} module, ${errors.length} lỗi, ${warns.length} cảnh báo`);
process.exit(errors.length ? 1 : 0);
