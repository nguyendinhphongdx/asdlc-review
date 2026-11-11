import { SEVERITY_RANK, type Finding, type LeaderboardRow, type ReviewReport, type Severity } from "@mrd/contracts";
import { dict } from "./i18n.js";

export const SUMMARY_MARKER = "<!-- mr-dashboard:summary -->";
export const INLINE_MARKER = "<!-- mr-dashboard:finding -->";

type RF = ReviewReport["findings"][number];
const where = (f: Finding) => (f.file ? `\`${f.file}${f.lineStart ? `:${f.lineStart}` : ""}\`` : "");
const bar = (n: number) => `${"█".repeat(Math.round(n / 10))}${"░".repeat(10 - Math.round(n / 10))}`;
const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const isActionable = (f: Finding) => f.kind === "issue" && f.confidence >= 0.4;

function findingBlock(f: RF, t: ReturnType<typeof dict>): string {
  const parts = [`**${f.title}**${f.ruleId ? ` · \`${f.ruleId}\`` : ""} ${where(f)}`.trim()];
  if (f.why) parts.push(`${t.why}: ${f.why}`);
  if (f.evidence) parts.push("```\n" + f.evidence + "\n```");
  if (f.suggestion) parts.push(`${t.suggestion}: ${f.suggestion}`);
  if (f.question) parts.push(`❓ ${f.question}`);
  if (f.confidence < 0.7) parts.push(`_(độ tin cậy ${Math.round(f.confidence * 100)}%)_`);
  return parts.join("\n\n");
}

export function renderSummary(r: ReviewReport): string {
  const t = dict(r.language);
  const s = r.score;
  const issues = r.findings.filter(isActionable);
  const heavy = issues.filter((f) => SEVERITY_RANK[f.severity] >= SEVERITY_RANK.major).sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  const light = issues.filter((f) => SEVERITY_RANK[f.severity] < SEVERITY_RANK.major);
  const questions = r.findings.filter((f) => f.question && (f.kind === "question" || f.kind === "issue"));

  const out: string[] = [SUMMARY_MARKER, `## ${t.title}`, ""];
  out.push(`| ${t.score} | ${t.grade} | |`, "|:--:|:--:|:--|", `| **${s.total}/100** | **${s.grade}** | ${t.verdict[s.verdict]} |`, "");
  if (r.summary) out.push(`### ${t.summary}`, r.summary, "");
  if (r.intent) out.push(`**${t.intent}:** ${r.intent}`, "");
  if (r.omittedFiles?.length) out.push(`> ℹ️ ${t.partial(r.omittedFiles.length)}: ${r.omittedFiles.slice(0, 10).map((f) => `\`${f}\``).join(", ")}${r.omittedFiles.length > 10 ? ", …" : ""}`, "");
  if (s.gates.length) out.push(`> ⚠️ **${t.gates}:** ${s.gates.map((g) => `${g.reason} (≤ ${g.cap})`).join("; ")}`, "");

  out.push(`### ${t.categories}`, `| ${t.category} | ${t.score} | | ${t.weight} |`, "|:--|--:|:--|--:|");
  for (const c of s.categories) out.push(`| ${esc(c.name)} | ${c.score} | \`${bar(c.score)}\` | ${c.weight} |`);
  out.push("");

  out.push(`### ${t.findings}`);
  if (!heavy.length) out.push(t.none, "");
  for (const sev of ["blocker", "critical", "major"] as Severity[]) {
    const group = heavy.filter((f) => f.severity === sev);
    if (!group.length) continue;
    out.push(`#### ${t.severity[sev]} (${group.length})`, "");
    group.forEach((f, i) => out.push(`${i + 1}. ${findingBlock(f, t).replace(/\n/g, "\n   ")}`, ""));
  }
  if (light.length) {
    out.push(`<details><summary>${t.minor} (${light.length})</summary>`, "");
    for (const f of light) out.push(`- ${t.severity[f.severity]} ${f.title} ${where(f)}${f.suggestion ? ` — ${f.suggestion}` : ""}`);
    out.push("", "</details>", "");
  }
  if (questions.length) {
    out.push(`### ${t.questions}`);
    for (const f of questions.slice(0, 8)) out.push(`- ${f.question} ${where(f)}`);
    out.push("");
  }
  if (r.strengths.length) out.push(`### ${t.strengths}`, ...r.strengths.slice(0, 5).map((x) => `- ${x}`), "");

  out.push("---");
  out.push(`<sub>${t.stats}: ${r.stats.filesChanged} ${t.files}, +${r.stats.additions}/−${r.stats.deletions} · ${r.frameworkLabel} · ${r.provider} · ${r.stats.durationSec}s · commit \`${r.mr.headSha.slice(0, 8)}\``);
  if (r.harnessFiles.length) out.push(`<br>${t.harness}: ${r.harnessFiles.slice(0, 8).map((x) => `\`${x}\``).join(", ")}${r.harnessFiles.length > 8 ? ` +${r.harnessFiles.length - 8}` : ""}`);
  out.push(`<br>${t.rescore}${r.dashboardUrl ? ` · [${t.dashboard}](${r.dashboardUrl})` : ""} · ${t.footer}</sub>`);
  return out.join("\n");
}

export function selectInline(findings: RF[], minSeverity: Severity, max: number): RF[] {
  return findings
    .filter((f) => f.file && f.lineStart && isActionable(f) && SEVERITY_RANK[f.severity] >= SEVERITY_RANK[minSeverity])
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.confidence - a.confidence)
    .slice(0, max);
}

export function renderInline(f: RF, language: string): string {
  const t = dict(language);
  return `${INLINE_MARKER}\n${t.severity[f.severity]} · ${findingBlock(f, t)}`;
}

export interface StatusView {
  total: number;
  grade: string;
  verdict: "approve" | "comment" | "request_changes";
  dashboardUrl?: string;
}

export function renderStatus(v: StatusView | null, language: string): string {
  const t = dict(language);
  if (!v) return t.noReview;
  return `**${t.status}** — ${v.total}/100 (${v.grade}) · ${t.verdict[v.verdict]}${v.dashboardUrl ? ` · [${t.dashboard}](${v.dashboardUrl})` : ""}`;
}

export function renderLeaderboard(rows: LeaderboardRow[], language: string): string {
  const t = dict(language);
  const lines = [`**${t.leaderboard}**`, "", `| ${t.rank} | ${t.member} | ${t.mrs} | ${t.avg} |`, "|--:|:--|--:|--:|"];
  rows.slice(0, 10).forEach((r, i) => lines.push(`| ${i + 1} | ${esc(r.name)} | ${r.mrCount} | ${r.avgFirstScore ?? "–"} |`));
  return lines.join("\n");
}
