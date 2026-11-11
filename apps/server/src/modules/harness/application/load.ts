import { classify, MAX_FILE_CHARS, nestedInstructionAdjust, relevanceBoost, summarizeTree, type HarnessKind } from "../domain/classify.js";
import { extractReferences } from "../domain/references.js";
import { fileSize, listTrackedFiles, readAtRef, readText } from "../infra/fs.js";

export interface HarnessFile {
  path: string;
  kind: HarnessKind;
  size: number;
  priority: number;
  content: string;
  truncated: boolean;
}

/** Báo cáo nạp cho từng file harness tìm thấy: nạp đủ / cắt / không nạp (kèm lý do). */
export interface HarnessLoadItem { path: string; kind: HarnessKind; size: number; priority: number; loaded: boolean; truncated: boolean; chars: number; reason?: string; /** File dẫn tới file này (nếu được tìm thấy qua liên kết thay vì theo mẫu đường dẫn). */ via?: string }

export interface Harness {
  files: HarnessFile[];
  /** Mọi file harness tìm thấy và trạng thái nạp của từng file. */
  load: HarnessLoadItem[];
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
  const oversized: HarnessLoadItem[] = [];
  for (const p of all) {
    const c = classify(p, opts.extraDocGlobs);
    if (!c) continue;
    const size = await fileSize(dir, p);
    if (size === 0) continue;
    if (size > 2_000_000) { oversized.push({ path: p, kind: c.kind, size, priority: c.priority, loaded: false, truncated: false, chars: 0, reason: "File quá lớn (> 2 MB)" }); continue; }
    let priority = c.priority;
    if (c.kind === "docs") priority += relevanceBoost(p, opts.changedFiles);
    if (c.kind === "instructions") priority += nestedInstructionAdjust(p, opts.changedFiles);
    candidates.push({ path: p, kind: c.kind, size, priority });
  }
  candidates.sort((a, b) => b.priority - a.priority || a.size - b.size);

  const files: HarnessFile[] = [];
  const load: HarnessLoadItem[] = [];
  let used = 0;
  const tracked = new Set(all);
  const seen = new Set(candidates.map((c) => c.path));
  const viaOf = new Map<string, string>();
  const MAX_REFERENCED = 150;
  let referenced = 0;
  // Hàng đợi: file theo mẫu trước, rồi file được dẫn tới (bất kể nằm ở đâu), theo chiều rộng, tối đa 3 tầng.
  const queue: (Omit<HarnessFile, "content" | "truncated"> & { depth: number })[] = candidates.map((c) => ({ ...c, depth: 0 }));
  for (let qi = 0; qi < queue.length; qi++) {
    const c = queue[qi]!;
    const item = { path: c.path, kind: c.kind, size: c.size, priority: c.priority, ...(viaOf.has(c.path) ? { via: viaOf.get(c.path) } : {}) };
    if (used >= opts.budgetChars) { load.push({ ...item, loaded: false, truncated: false, chars: 0, reason: "Vượt trần ngữ cảnh an toàn (CONTEXT_BUDGET_CHARS)" }); continue; }
    const max = Math.min(MAX_FILE_CHARS[c.kind], opts.budgetChars - used);
    const text = await readText(dir, c.path);
    const content = text.length > max ? text.slice(0, max) : text;
    files.push({ ...c, content, truncated: text.length > max });
    load.push({ ...item, loaded: true, truncated: text.length > max, chars: content.length, ...(text.length > max ? { reason: "Bị cắt do vượt trần" } : {}) });
    used += content.length;
    if (c.depth < 3 && referenced < MAX_REFERENCED) {
      for (const ref of extractReferences(c.path, content, tracked)) {
        if (seen.has(ref) || referenced >= MAX_REFERENCED) continue;
        seen.add(ref);
        const size = await fileSize(dir, ref);
        if (size === 0 || size > 2_000_000) continue;
        referenced++;
        viaOf.set(ref, c.path);
        queue.push({ path: ref, kind: "docs", size, priority: 20, depth: c.depth + 1 });
      }
    }
  }
  return { files, load: [...load, ...oversized], discovered: [...queue, ...oversized].map((c) => ({ path: c.path, kind: c.kind })), tree: summarizeTree(all), totalFiles: all.length };
}
