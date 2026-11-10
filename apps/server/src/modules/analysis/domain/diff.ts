export interface AddedLine {
  line: number;
  text: string;
}
export interface DiffFile {
  path: string;
  added: AddedLine[];
  isNew: boolean;
  isDeleted: boolean;
}

/** Parse unified diff thành các dòng được thêm (kèm số dòng ở file mới). */
export function parseDiff(diff: string): DiffFile[] {
  const files: DiffFile[] = [];
  let cur: DiffFile | null = null;
  let newLine = 0;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("diff --git ")) {
      const m = raw.match(/ b\/(.+)$/);
      cur = { path: m?.[1] ?? "", added: [], isNew: false, isDeleted: false };
      files.push(cur);
      continue;
    }
    if (!cur) continue;
    if (raw.startsWith("new file mode")) cur.isNew = true;
    else if (raw.startsWith("deleted file mode")) cur.isDeleted = true;
    else if (raw.startsWith("+++ ")) {
      const p = raw.slice(4).trim();
      if (p !== "/dev/null") cur.path = p.replace(/^b\//, "");
    } else if (raw.startsWith("@@")) {
      const m = raw.match(/\+(\d+)(?:,\d+)?/);
      newLine = m ? Number(m[1]) : 0;
    } else if (raw.startsWith("+") && !raw.startsWith("+++")) {
      cur.added.push({ line: newLine, text: raw.slice(1) });
      newLine++;
    } else if (raw.startsWith(" ")) newLine++;
  }
  return files;
}
