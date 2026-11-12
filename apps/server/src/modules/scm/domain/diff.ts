import type { FileDiff } from "./types.js";

/** Điền số dòng thêm/xoá từ nội dung unified diff. */
export function countDiff(f: Omit<FileDiff, "additions" | "deletions">): FileDiff {
  let additions = 0, deletions = 0;
  for (const l of f.diff.split("\n")) {
    if (l.startsWith("+") && !l.startsWith("+++")) additions++;
    else if (l.startsWith("-") && !l.startsWith("---")) deletions++;
  }
  return { ...f, additions, deletions };
}
