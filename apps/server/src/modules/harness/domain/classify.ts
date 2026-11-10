import path from "node:path";
import { minimatch } from "minimatch";

export type HarnessKind = "instructions" | "asdlc" | "docs" | "skills" | "agents" | "config";

interface Rule {
  kind: HarnessKind;
  priority: number;
  test: (p: string, base: string) => boolean;
}

const RULES: Rule[] = [
  { kind: "asdlc", priority: 100, test: (p) => p === ".asdlc.yml" || p === ".asdlc.yaml" || p.startsWith(".asdlc/") },
  { kind: "instructions", priority: 95, test: (_p, b) => b === "AGENTS.md" || b === "CLAUDE.md" || b === "GEMINI.md" },
  {
    kind: "instructions",
    priority: 90,
    test: (p) =>
      p.startsWith(".cursor/rules/") || p === ".cursorrules" || p === ".windsurfrules" || p === ".github/copilot-instructions.md" ||
      p.startsWith(".github/instructions/") || p.startsWith(".clinerules") || p.startsWith(".kiro/steering/"),
  },
  { kind: "instructions", priority: 85, test: (_p, b) => /^(CONTRIBUTING|CONVENTIONS?|STYLEGUIDE|CODING[_-]?STANDARDS?)(\.\w+)?$/i.test(b) },
  { kind: "agents", priority: 60, test: (p) => /^\.claude\/agents\/.+\.md$/.test(p) || /^\.agents?\/.+\.md$/.test(p) },
  { kind: "skills", priority: 55, test: (p) => /(^|\/)\.claude\/skills\/.+\/SKILL\.md$/.test(p) || /^\.claude\/commands\/.+\.md$/.test(p) },
  { kind: "docs", priority: 80, test: (p, b) => /^README(\.\w+)?$/i.test(b) && !p.includes("/") },
  {
    kind: "docs",
    priority: 70,
    test: (p) => /^docs?\//i.test(p) && /(architect|adr|decision|convention|guideline|design|structure|standard|feature|spec)/i.test(p) && /\.(md|mdx|txt|adoc)$/i.test(p),
  },
  { kind: "docs", priority: 40, test: (p) => /^docs?\//i.test(p) && /\.(md|mdx|txt|adoc)$/i.test(p) },
  { kind: "docs", priority: 35, test: (_p, b) => /^README(\.\w+)?$/i.test(b) },
  {
    kind: "config",
    priority: 30,
    test: (_p, b) =>
      /^(\.eslintrc(\.\w+)?|eslint\.config\.\w+|\.prettierrc(\.\w+)?|prettier\.config\.\w+|biome\.jsonc?|tsconfig(\.\w+)?\.json|\.editorconfig|ruff\.toml|pyproject\.toml|\.golangci\.ya?ml|\.rubocop\.yml|checkstyle\.xml|\.stylelintrc(\.\w+)?|commitlint\.config\.\w+|\.commitlintrc(\.\w+)?|\.gitlab-ci\.yml|package\.json)$/.test(b),
  },
];

export const MAX_FILE_CHARS: Record<HarnessKind, number> = { asdlc: 20_000, instructions: 40_000, docs: 25_000, skills: 12_000, agents: 12_000, config: 6_000 };

export function classify(p: string, extraDocGlobs: string[] = []): { kind: HarnessKind; priority: number } | null {
  if (p.includes("node_modules/") || p.includes("vendor/")) return null;
  const base = path.posix.basename(p);
  for (const r of RULES) if (r.test(p, base)) return { kind: r.kind, priority: r.priority };
  if (extraDocGlobs.some((g) => minimatch(p, g, { dot: true }))) return { kind: "docs", priority: 75 };
  return null;
}

/** Tài liệu có tên trùng với thư mục/file bị thay đổi được ưu tiên hơn. */
export function relevanceBoost(docPath: string, changedFiles: string[]): number {
  const stop = new Set(["src", "index", "test", "spec", "main", "components", "utils", "lib", "app"]);
  const tokens = new Set(changedFiles.flatMap((f) => f.split(/[/._-]/).map((t) => t.toLowerCase()).filter((t) => t.length > 3 && !stop.has(t))));
  let hits = 0;
  for (const t of docPath.toLowerCase().split(/[/._-]/)) if (tokens.has(t)) hits++;
  return Math.min(hits * 8, 30);
}

/** CLAUDE.md/AGENTS.md lồng nhau nằm trên đường dẫn của file thay đổi → ưu tiên cao hơn. */
export function nestedInstructionAdjust(p: string, changedFiles: string[]): number {
  if (!p.includes("/")) return 0;
  const d = path.posix.dirname(p);
  return changedFiles.some((cf) => cf.startsWith(`${d}/`)) ? 3 : -20;
}

/** Cây thư mục rút gọn (2 cấp) kèm số file. */
export function summarizeTree(files: string[]): string {
  const counts = new Map<string, number>();
  for (const f of files) {
    const parts = f.split("/");
    const key = parts.length > 2 ? `${parts[0]}/${parts[1]}/` : parts.length === 2 ? `${parts[0]}/` : f;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(0, 300).map(([k, n]) => (k.endsWith("/") ? `${k} (${n})` : k)).join("\n");
}
