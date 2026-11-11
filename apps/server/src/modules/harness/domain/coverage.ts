import type { HarnessItemDto, HarnessReportDto } from "@mrd/contracts";
import path from "node:path";
import type { HarnessKind } from "./classify.js";

export interface CoverageInput {
  /** File harness tìm thấy (đường dẫn + loại). */
  discovered: { path: string; kind: HarnessKind }[];
  /** Nội dung các file đã nạp (để kiểm tra độ dài / có lệnh kiểm tra). */
  contents: { path: string; kind: HarnessKind; content: string }[];
  repoConfig: { present: boolean; valid: boolean; error?: string; hasDocs?: boolean; hasIgnore?: boolean };
  at?: Date;
}

const MIN_LINES = 15;
const lines = (s: string) => s.split("\n").filter((l) => l.trim()).length;
const COMMAND = /\b(pnpm|npm|yarn|bun|make|pytest|tox|go test|cargo|mvn|gradle|dotnet|bundle exec|rake|flutter|xcodebuild)\b[^\n]*\b(test|lint|typecheck|check|build|verify)\b/i;

/**
 * Độ phủ harness (0–100), tính tất định từ file tìm thấy. Công thức công khai (docs/HARNESS.md):
 * hướng dẫn cho agent 20 · tài liệu kiến trúc 20 · rule theo khu vực 15 · lệnh kiểm tra 15 · tài liệu tính năng 15 · `.asdlc.yml` 15.
 * Chỉ tính file có nội dung tối thiểu để file rỗng không làm tăng điểm. Điểm chỉ để gợi ý, không chặn MR.
 */
export function computeCoverage(input: CoverageInput): HarnessReportDto {
  const items: HarnessItemDto[] = [];
  const add = (i: Omit<HarnessItemDto, "status"> & { status?: HarnessItemDto["status"] }) =>
    items.push({ ...i, status: i.status ?? (i.points >= i.max ? "ok" : i.points > 0 ? "partial" : "missing") });
  const content = (p: string) => input.contents.find((c) => c.path === p)?.content ?? "";
  const isAgentFile = (p: string) => /^(AGENTS|CLAUDE|GEMINI)\.md$/.test(path.posix.basename(p));

  // 1. Hướng dẫn cho agent
  const root = input.discovered.find((d) => !d.path.includes("/") && isAgentFile(d.path));
  const rootLines = root ? lines(content(root.path)) : 0;
  add({
    id: "instructions", label: "AGENTS.md hoặc CLAUDE.md", max: 20,
    points: !root ? 0 : rootLines >= MIN_LINES ? 20 : 10,
    detail: !root ? "chưa có" : `có · ${rootLines} dòng`,
    hint: !root ? "Tạo AGENTS.md ngắn: kiến trúc, lệnh kiểm tra, điều cấm kỵ." : rootLines < MIN_LINES ? `Mới ${rootLines} dòng: bổ sung quy ước và điều cấm kỵ cụ thể.` : undefined,
  });

  // 2. Tài liệu kiến trúc
  // Nhận diện theo tên file HOẶC theo nội dung: tài liệu kiến trúc có thể nằm ở bất kỳ đâu (được dẫn từ AGENTS.md, README…).
  const archByContent = input.contents.filter((c) => c.kind === "docs" && lines(c.content) >= MIN_LINES && /(kiến trúc|architecture|ranh giới|boundar|layer|module)/i.test(c.content.slice(0, 4000)));
  const arch = [...new Map([...input.discovered.filter((d) => d.kind === "docs" && /(architect|adr|decision|structure|design)/i.test(d.path)), ...archByContent].map((d) => [d.path, d])).values()];
  const readme = input.discovered.find((d) => /^README(\.\w+)?$/i.test(d.path));
  add({
    id: "architecture", label: "Tài liệu kiến trúc (docs/ARCHITECTURE.md…)", max: 20,
    points: arch.length ? 20 : readme && lines(content(readme.path)) > 30 ? 8 : 0,
    detail: arch.length ? `có · ${arch.length} file` : readme ? "chỉ có README" : "chưa có",
    hint: arch.length ? undefined : "Mô tả các module, ranh giới và luồng dữ liệu chính trong docs/ARCHITECTURE.md.",
  });

  // 3. Rule theo khu vực code
  const scoped = input.discovered.filter((d) => d.kind === "instructions" && (d.path.includes("/") && (/\/rules?\//.test(d.path) || isAgentFile(d.path) || /^\.(cursor|clinerules|kiro|github)/.test(d.path))));
  add({
    id: "scoped-rules", label: "Rule theo thư mục (.claude/rules, .cursor/rules, AGENTS.md lồng nhau)", max: 15,
    points: scoped.length >= 3 ? 15 : scoped.length >= 1 ? 8 : 0,
    detail: scoped.length ? `${scoped.length} file` : "chưa có",
    hint: scoped.length >= 3 ? undefined : "Tách luật theo khu vực code (vd rule riêng cho tests/, api/) để agent chỉ nạp phần liên quan.",
  });

  // 4. Lệnh kiểm tra
  const instr = input.contents.filter((c) => c.kind === "instructions" || c.kind === "asdlc");
  const hasCmd = instr.some((c) => COMMAND.test(c.content));
  const mentionsTest = instr.some((c) => /\b(test|lint|typecheck)\b/i.test(c.content));
  add({
    id: "commands", label: "Lệnh kiểm tra (test/lint/typecheck) nêu rõ", max: 15,
    points: hasCmd ? 15 : mentionsTest ? 7 : 0,
    detail: hasCmd ? "có trong tài liệu hướng dẫn" : mentionsTest ? "nhắc nhưng chưa có lệnh cụ thể" : "chưa có",
    hint: hasCmd ? undefined : "Ghi lệnh chạy được, vd `pnpm test`, `pnpm lint`, để agent tự kiểm chứng.",
  });

  // 5. Tài liệu tính năng/spec
  const feat = input.discovered.filter((d) => d.kind === "docs" && /^docs?\//i.test(d.path) && /(feature|spec|requirement|prd|story)/i.test(d.path));
  add({
    id: "features", label: "Tài liệu tính năng/spec (docs/features…)", max: 15,
    points: feat.length >= 3 ? 15 : feat.length >= 1 ? 8 : 0,
    detail: feat.length ? `${feat.length} file` : "chưa có",
    hint: feat.length >= 3 ? undefined : "Thêm mô tả cho các module chính để agent hiểu ý định nghiệp vụ.",
  });

  // 6. .asdlc.yml
  const rc = input.repoConfig;
  const cfgPoints = !rc.present ? 0 : !rc.valid ? 3 : 9 + (rc.hasDocs ? 3 : 0) + (rc.hasIgnore ? 3 : 0);
  add({
    id: "asdlc-config", label: "Cấu hình review .asdlc.yml", max: 15, points: cfgPoints,
    detail: !rc.present ? "chưa có (không bắt buộc)" : rc.valid ? "có · hợp lệ" : "có nhưng không hợp lệ",
    hint: !rc.present ? "Khai báo docs và ignore để agent đọc đúng chỗ." : !rc.valid ? rc.error : !rc.hasDocs || !rc.hasIgnore ? "Khai báo docs và ignore để agent đọc đúng chỗ." : undefined,
  });

  const score = items.reduce((s, i) => s + i.points, 0);
  return { score, level: score >= 80 ? "good" : score >= 50 ? "fair" : "poor", items, repoConfig: { present: rc.present, valid: rc.valid, error: rc.error }, scannedAt: (input.at ?? new Date()).toISOString() };
}
