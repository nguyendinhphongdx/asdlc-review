/** Tách các dòng `LESSON: ...` khỏi câu trả lời của agent. */
export function extractLessons(text: string): { reply: string; lessons: string[] } {
  const lessons: string[] = [];
  const kept: string[] = [];
  for (const line of text.split("\n")) {
    const m = /^\s*LESSON:\s*(.+?)\s*$/i.exec(line);
    if (m && m[1]!.length >= 8) lessons.push(m[1]!.slice(0, 400));
    else kept.push(line);
  }
  return { reply: kept.join("\n").trim(), lessons: [...new Set(lessons)].slice(0, 3) };
}
