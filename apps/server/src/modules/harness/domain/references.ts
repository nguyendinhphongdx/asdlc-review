import path from "node:path";

const DOC_EXT = /\.(md|mdx|markdown|txt|adoc|rst|ya?ml)$/i;

/**
 * Các đường dẫn mà một file hướng dẫn/tài liệu dẫn tới: link markdown `[x](docs/a.md)`, import kiểu Claude `@docs/a.md`,
 * và đường dẫn trong dấu backtick `docs/a.md`. Không giả định vị trí nào: chỉ giữ cái trỏ tới file có thật trong repo.
 */
export function extractReferences(fromPath: string, content: string, tracked: ReadonlySet<string>): string[] {
  const raw = new Set<string>();
  for (const m of content.matchAll(/\]\(([^)\s#?]+)(?:[#?][^)]*)?\)/g)) raw.add(m[1]!);
  for (const m of content.matchAll(/(?:^|\s)@([\w./-]+\.[A-Za-z]{1,8})\b/g)) raw.add(m[1]!);
  for (const m of content.matchAll(/`([\w./-]+\.[A-Za-z]{1,8})`/g)) raw.add(m[1]!);
  const dir = path.posix.dirname(fromPath);
  const out = new Set<string>();
  for (const r of raw) {
    if (/^[a-z]+:\/\//i.test(r) || r.startsWith("mailto:") || !DOC_EXT.test(r)) continue;
    const candidates = [path.posix.normalize(path.posix.join(dir, r)), path.posix.normalize(r.replace(/^\.?\//, ""))];
    const hit = candidates.find((c) => !c.startsWith("..") && tracked.has(c));
    if (hit && hit !== fromPath) out.add(hit);
  }
  return [...out];
}
