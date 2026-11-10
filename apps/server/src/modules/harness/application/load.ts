import { classify, MAX_FILE_CHARS, nestedInstructionAdjust, relevanceBoost, summarizeTree, type HarnessKind } from "../domain/classify.js";
import { fileSize, listTrackedFiles, readAtRef, readText } from "../infra/fs.js";

export interface HarnessFile {
  path: string;
  kind: HarnessKind;
  size: number;
  priority: number;
  content: string;
  truncated: boolean;
}

export interface Harness {
  files: HarnessFile[];
  /** Tất cả file harness tìm thấy (kể cả không nạp được nội dung vì hết ngân sách). */
  discovered: { path: string; kind: HarnessKind }[];
  tree: string;
  totalFiles: number;
}

export interface LoadOptions {
  changedFiles: string[];
  budgetChars: number;
  /** Glob tài liệu bổ sung (từ `.asdlc.yml` → docs). */
  extraDocGlobs?: string[];
}

const CONFIG_NAMES = [".asdlc.yml", ".asdlc.yaml"];

export async function readRepoConfig(dir: string, opts: { ref?: string } = {}): Promise<string | null> {
  if (opts.ref) {
    for (const n of CONFIG_NAMES) {
      const t = await readAtRef(dir, opts.ref, n);
      if (t) return t;
    }
    return null;
  }
  const tracked = new Set(await listTrackedFiles(dir));
  for (const n of CONFIG_NAMES) if (tracked.has(n)) return (await readText(dir, n)) || null;
  return null;
}

export async function loadHarness(dir: string, opts: LoadOptions): Promise<Harness> {
  const all = await listTrackedFiles(dir);
  const candidates: Omit<HarnessFile, "content" | "truncated">[] = [];
  for (const p of all) {
    const c = classify(p, opts.extraDocGlobs);
    if (!c) continue;
    const size = await fileSize(dir, p);
    if (size === 0 || size > 2_000_000) continue;
    let priority = c.priority;
    if (c.kind === "docs") priority += relevanceBoost(p, opts.changedFiles);
    if (c.kind === "instructions") priority += nestedInstructionAdjust(p, opts.changedFiles);
    candidates.push({ path: p, kind: c.kind, size, priority });
  }
  candidates.sort((a, b) => b.priority - a.priority || a.size - b.size);

  const files: HarnessFile[] = [];
  let used = 0;
  for (const c of candidates) {
    if (used >= opts.budgetChars) break;
    const max = Math.min(MAX_FILE_CHARS[c.kind], opts.budgetChars - used);
    const text = await readText(dir, c.path);
    const content = text.length > max ? text.slice(0, max) : text;
    files.push({ ...c, content, truncated: text.length > max });
    used += content.length;
  }
  return { files, discovered: candidates.map((c) => ({ path: c.path, kind: c.kind })), tree: summarizeTree(all), totalFiles: all.length };
}
