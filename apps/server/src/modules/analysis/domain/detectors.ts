import type { Finding } from "@mrd/contracts";
import { minimatch } from "minimatch";
import type { DiffFile } from "./diff.js";

export interface ChangedFile {
  path: string;
  additions: number;
  deletions: number;
  binary: boolean;
}

export interface AnalysisInput {
  files: ChangedFile[];
  diffFiles: DiffFile[];
  mrDescription?: string;
  ignore?: string[];
}

type Draft = Omit<Finding, "source">;
const mk = (d: Partial<Draft> & Pick<Draft, "category" | "ruleId" | "severity" | "title">): Finding => ({
  kind: "issue",
  why: "",
  confidence: 0.9,
  ...d,
  source: "static",
});

const GENERATED = [
  "**/package-lock.json", "**/pnpm-lock.yaml", "**/yarn.lock", "**/bun.lockb", "**/Cargo.lock", "**/poetry.lock", "**/composer.lock", "**/Gemfile.lock", "**/go.sum",
  "**/*.min.js", "**/*.min.css", "**/*.map", "**/dist/**", "**/build/**", "**/__snapshots__/**", "**/*.snap", "**/*.generated.*", "**/generated/**", "**/vendor/**", "**/node_modules/**",
];
export const isGenerated = (p: string, extra: string[] = []) => [...GENERATED, ...extra].some((g) => minimatch(p, g, { dot: true }));
export const isTestFile = (p: string) => /(\.|_)(test|spec)\.[a-z]+$|(^|\/)(__tests__|tests?|spec)\//i.test(p);
const isDoc = (p: string) => /\.(md|mdx|txt|rst|adoc)$/i.test(p);

const mask = (s: string) => (s.length <= 8 ? "****" : `${s.slice(0, 4)}…(${s.length} ký tự, đã che)`);

const SECRET_PATTERNS: { name: string; re: RegExp; confidence: number }[] = [
  { name: "AWS access key", re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/, confidence: 0.95 },
  { name: "Private key", re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/, confidence: 0.98 },
  { name: "GitLab token", re: /\bglpat-[0-9A-Za-z_-]{20,}\b/, confidence: 0.98 },
  { name: "GitHub token", re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/, confidence: 0.98 },
  { name: "Slack token", re: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/, confidence: 0.95 },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/, confidence: 0.9 },
  { name: "Anthropic/OpenAI key", re: /\bsk-(?:ant-)?[A-Za-z0-9_-]{24,}\b/, confidence: 0.9 },
  { name: "Stripe key", re: /\b[sr]k_live_[0-9A-Za-z]{16,}\b/, confidence: 0.95 },
  { name: "Chuỗi kết nối có mật khẩu", re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@'"]+:[^\s@'"/]{4,}@[^\s'"]+/i, confidence: 0.75 },
  {
    name: "Gán thông tin nhạy cảm cứng",
    re: /\b(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|private[_-]?key)\w*\s*[:=]\s*["'`]([^"'`\s]{8,})["'`]/i,
    confidence: 0.7,
  },
];
const PLACEHOLDER = /(example|changeme|change_me|your[_-]?|xxx+|\*{3,}|<[^>]+>|\$\{|process\.env|env\(|getenv|placeholder|dummy|sample|test|fake|redacted|\.\.\.)/i;

function detectSecrets(input: AnalysisInput): Finding[] {
  const out: Finding[] = [];
  for (const f of input.files) {
    if (/(^|\/)\.env(\.[\w.-]+)?$/.test(f.path) && !/\.(example|sample|template|dist)$/.test(f.path))
      out.push(mk({ category: "security", ruleId: "SEC-01", severity: "blocker", title: `File môi trường được commit: ${f.path}`, file: f.path, why: "File .env thường chứa credential thật.", suggestion: "Gỡ khỏi git, thêm vào .gitignore, rotate mọi giá trị đã lộ.", confidence: 0.85 }));
    if (/(^|\/)(id_rsa|id_ed25519)$|\.(pem|p12|pfx|jks|keystore)$/i.test(f.path))
      out.push(mk({ category: "security", ruleId: "SEC-01", severity: "blocker", title: `File khoá/chứng chỉ được commit: ${f.path}`, file: f.path, suggestion: "Gỡ khỏi git và rotate khoá.", confidence: 0.8 }));
  }
  for (const df of input.diffFiles) {
    if (df.isDeleted || /\.(lock|snap)$/.test(df.path) || isDoc(df.path)) continue;
    for (const l of df.added) {
      for (const p of SECRET_PATTERNS) {
        const m = l.text.match(p.re);
        if (!m) continue;
        const value = m[1] ?? m[0];
        if (PLACEHOLDER.test(l.text) && p.confidence < 0.9) continue;
        if (isTestFile(df.path) && p.confidence < 0.9) continue;
        out.push(mk({
          category: "security", ruleId: "SEC-01", severity: "blocker", title: `Nghi lộ secret: ${p.name}`, file: df.path, lineStart: l.line,
          why: "Secret trong mã nguồn sẽ nằm vĩnh viễn trong lịch sử git.", evidence: `${p.name}: ${mask(value)}`,
          suggestion: "Chuyển sang biến môi trường/secret manager, rotate giá trị đã lộ, xoá khỏi lịch sử git.", confidence: p.confidence,
        }));
        break;
      }
    }
  }
  return out;
}

const DEBUG_RE = /(\bconsole\.(log|debug|trace)\s*\(|\bdebugger\s*;?\s*$|\bvar_dump\s*\(|\bSystem\.out\.println\s*\(|\bprint_r\s*\(|\bbinding\.pry\b|\bpdb\.set_trace\s*\(|\bbreakpoint\s*\(\))/;
const SKIP_RE = /(\b(it|test|describe|context)\.(only|skip)\s*\(|\b(xit|xdescribe|fdescribe|fit)\s*\(|@Ignore\b|@Disabled\b|pytest\.mark\.skip|\bt\.Skip\()/;
const SUPPRESS_RE = /(@ts-ignore|@ts-nocheck|eslint-disable(?!-next-line\s+\S+\s+--)|#\s*type:\s*ignore|#\s*noqa\b|#\s*pylint:\s*disable|\/\/\s*nolint\b|@SuppressWarnings)/;
const TODO_RE = /\b(TODO|FIXME|HACK|XXX)\b/;

function detectHygiene(input: AnalysisInput): Finding[] {
  const out: Finding[] = [];
  for (const df of input.diffFiles) {
    if (df.isDeleted || isGenerated(df.path, input.ignore) || isDoc(df.path)) continue;
    const test = isTestFile(df.path);
    let debugCount = 0;
    let todoCount = 0;
    for (const l of df.added) {
      if (!test && !/(^|\/)(scripts?|tools?|bin|cli)\//.test(df.path) && DEBUG_RE.test(l.text) && !/^\s*(\/\/|#|\*)/.test(l.text) && debugCount++ < 3)
        out.push(mk({ category: "maintainability", ruleId: "MNT-03", severity: "minor", title: "Còn code debug", file: df.path, lineStart: l.line, evidence: l.text.trim().slice(0, 160), why: "Code debug làm nhiễu log và có thể lộ dữ liệu.", suggestion: "Xoá hoặc thay bằng logger có cấp độ.", confidence: 0.8 }));
      if (test && SKIP_RE.test(l.text))
        out.push(mk({ category: "testing", ruleId: "TST-04", severity: /\.only\s*\(|\bf(it|describe)\(/.test(l.text) ? "critical" : "major", title: "Test bị skip/only", file: df.path, lineStart: l.line, evidence: l.text.trim().slice(0, 160), why: ".only làm CI bỏ qua các test còn lại; .skip che giấu test hỏng.", suggestion: "Bỏ .only/.skip hoặc giải thích rõ vì sao tắt test.", question: "Vì sao test này bị tắt?", confidence: 0.9 }));
      if (SUPPRESS_RE.test(l.text) && !/\.md$/.test(df.path))
        out.push(mk({ category: "conventions", ruleId: "CON-05", severity: "minor", title: "Tắt kiểm tra lint/type", file: df.path, lineStart: l.line, evidence: l.text.trim().slice(0, 160), why: "Che lỗi thay vì sửa gốc.", question: "Vì sao phải tắt kiểm tra ở đây?", suggestion: "Sửa nguyên nhân hoặc ghi rõ lý do kèm phạm vi hẹp nhất.", confidence: 0.85 }));
      if (!test && TODO_RE.test(l.text) && todoCount++ < 2)
        out.push(mk({ category: "correctness", ruleId: "COR-06", severity: "minor", title: "Còn TODO/FIXME trong code mới", file: df.path, lineStart: l.line, evidence: l.text.trim().slice(0, 160), why: "Có thể là logic chưa hoàn thiện do AI để lại.", question: "Phần này đã hoàn thiện chưa, hay còn là placeholder?", confidence: 0.6 }));
    }
  }
  return out;
}

export function detectScope(input: AnalysisInput, meaningfulLines: number): Finding[] {
  const out: Finding[] = [];
  if (meaningfulLines > 800)
    out.push(mk({ category: "scope", ruleId: "SCO-03", severity: "major", title: `MR quá lớn (${meaningfulLines} dòng thay đổi)`, why: "MR lớn khó review kỹ, dễ lọt lỗi.", suggestion: "Tách thành các MR nhỏ, mỗi MR một mục đích.", question: "Có thể tách MR này thành các bước merge độc lập không?", confidence: 1 }));
  else if (meaningfulLines > 400)
    out.push(mk({ category: "scope", ruleId: "SCO-03", severity: "minor", title: `MR khá lớn (${meaningfulLines} dòng thay đổi)`, why: "MR trên ~400 dòng logic giảm chất lượng review.", suggestion: "Cân nhắc tách MR.", confidence: 1 }));
  const desc = (input.mrDescription ?? "").trim();
  if (desc.length < 20)
    out.push(mk({ category: "scope", ruleId: "SCO-01", severity: "minor", title: "Mô tả MR trống hoặc quá ngắn", why: "Reviewer cần biết mục tiêu, bối cảnh và cách kiểm thử.", suggestion: "Bổ sung mục tiêu, cách test, link issue/spec.", confidence: 1 }));
  const src = input.files.filter((f) => !f.binary && !isTestFile(f.path) && !isGenerated(f.path, input.ignore) && !isDoc(f.path) && /\.(tsx?|jsx?|py|go|rs|java|kt|rb|php|cs|swift|vue|svelte)$/.test(f.path));
  const srcAdds = src.reduce((s, f) => s + f.additions, 0);
  if (srcAdds >= 60 && !input.files.some((f) => isTestFile(f.path)))
    out.push(mk({ category: "testing", ruleId: "TST-01", severity: "major", title: `Thêm ${srcAdds} dòng code nhưng không có test nào thay đổi`, why: "Không có bằng chứng thay đổi này đúng và không gây hồi quy.", suggestion: "Thêm test cho logic mới/đã sửa.", question: "Test nào chứng minh thay đổi này đúng?", confidence: 0.5 }));
  return out;
}

const HARNESS_FILE = /(^|\/)(\.asdlc\.ya?ml|AGENTS\.md|CLAUDE\.md|\.claude\/(agents|skills|commands)\/.+|\.cursor\/rules\/.+|\.github\/copilot-instructions\.md|eslint\.config\.\w+|\.eslintrc(\.\w+)?|tsconfig(\.\w+)?\.json|biome\.jsonc?|\.gitlab-ci\.ya?ml|\.github\/workflows\/.+)$/;

/** MR sửa luật/harness/CI: cần người xác nhận vì có thể là cách lách quy tắc (HAR-03). */
export function detectHarnessChange(input: AnalysisInput): Finding[] {
  const touched = input.files.filter((f) => HARNESS_FILE.test(f.path) && f.deletions > 0);
  if (!touched.length) return [];
  return [mk({ category: "harness", ruleId: "HAR-03", severity: "minor", title: `MR sửa quy tắc/cấu hình kiểm tra (${touched.map((f) => f.path).slice(0, 3).join(", ")})`, why: "Nới lỏng rule, lint hoặc CI là cách dễ nhất để code hiện tại 'qua' kiểm tra.", question: "Vì sao quy tắc/cấu hình này bị thay đổi trong MR này?", confidence: 0.5 })];
}

export function analyze(input: AnalysisInput): { findings: Finding[]; changedLines: number; ignoredFiles: string[] } {
  const ignored = input.files.filter((f) => isGenerated(f.path, input.ignore)).map((f) => f.path);
  const meaningful = input.files.filter((f) => !f.binary && !isGenerated(f.path, input.ignore) && !isDoc(f.path));
  const changedLines = meaningful.reduce((s, f) => s + f.additions + f.deletions, 0);
  const diffFiles = input.diffFiles.filter((d) => !isGenerated(d.path, input.ignore));
  const scoped = { ...input, diffFiles };
  return {
    findings: [...detectSecrets(scoped), ...detectHygiene(scoped), ...detectScope(scoped, changedLines), ...detectHarnessChange(input)],
    changedLines,
    ignoredFiles: ignored,
  };
}
