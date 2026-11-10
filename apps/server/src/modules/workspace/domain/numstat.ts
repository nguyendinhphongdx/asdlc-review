export interface NumstatEntry {
  file: string;
  additions: number;
  deletions: number;
  binary: boolean;
}

/** `src/{a => b}/x.ts` hoặc `a => b` → đường dẫn mới. */
export function normalizeRenamePath(p: string): string {
  const brace = p.match(/^(.*)\{(.*) => (.*)\}(.*)$/);
  if (brace) return `${brace[1]}${brace[3]}${brace[4]}`.replace(/\/\//g, "/");
  const arrow = p.split(" => ");
  return arrow.length === 2 ? arrow[1]! : p;
}

export function parseNumstat(raw: string): NumstatEntry[] {
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [a = "0", d = "0", ...rest] = line.split("\t");
      const binary = a === "-";
      return { file: normalizeRenamePath(rest.join("\t")), additions: binary ? 0 : Number(a), deletions: binary ? 0 : Number(d), binary };
    });
}

export const safeName = (s: string) => s.replace(/[^a-zA-Z0-9._-]+/g, "__");

/** Cắt diff theo ngân sách ký tự, ưu tiên giữ nguyên các file nhỏ; trả thêm danh sách file bị lược. */
export function truncateDiff(diff: string, budget: number): { text: string; omitted: string[] } {
  if (diff.length <= budget) return { text: diff, omitted: [] };
  const parts = diff.split(/^(?=diff --git )/m);
  const sized = parts.map((p, i) => ({ p, i, len: p.length, name: p.match(/^diff --git a\/(.+?) b\//)?.[1] ?? `#${i}` }));
  const keep = new Set<number>();
  let used = 0;
  for (const s of [...sized].sort((a, b) => a.len - b.len)) {
    if (used + s.len > budget) continue;
    keep.add(s.i);
    used += s.len;
  }
  return { text: sized.filter((s) => keep.has(s.i)).map((s) => s.p).join(""), omitted: sized.filter((s) => !keep.has(s.i)).map((s) => s.name) };
}
