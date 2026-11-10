import type { Report } from "@mrd/contracts";

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function leaderboardCsv(rows: Report["leaderboard"]): string {
  const head = ["Hạng", "Tên", "Username", "MR", "Lần review", "Điểm lần đầu TB", "Điểm cuối TB", "Cải thiện", "Điểm xếp hạng", "Blocker", "Bảo mật", "Lộ secret", "Sai convention", "File TB", "Dòng đổi", "Vòng review TB", "Lead time (giờ)", "Đã merge"];
  const lines = rows.map((r, i) => [i + 1, r.name, r.usernames.join(" "), r.mrCount, r.runCount, r.avgFirstScore, r.avgFinalScore, r.improvement, r.rankScore, r.blockers, r.securityIssues, r.secretLeaks, r.conventionViolations, r.avgFilesChanged, r.linesChanged, r.avgReviewRounds, r.avgLeadTimeHours, r.mergedCount].map(cell).join(","));
  return "﻿" + [head.join(","), ...lines].join("\n");
}

export function reportMarkdown(r: Report, repoNames: Record<string, string> = {}): string {
  const o = r.overview;
  const d = (s: string) => s.slice(0, 10);
  const out = [`# Báo cáo review MR ${d(r.range.from)} → ${d(r.range.to)}`, ""];
  out.push("## Tổng quan", "", `- Số MR được review: **${o.totalMrs}** (${o.totalRuns} lần review)`, `- Điểm trung bình: **${o.avgScore ?? "–"}** · Tỷ lệ đạt: **${o.passRate ?? "–"}%**`, `- Lộ secret: **${o.secretLeaks}** · Vấn đề bảo mật: **${o.securityIssues}** · Sai convention: **${o.conventionViolations}**`, `- Thời gian review TB: ${o.avgReviewDurationSec ?? "–"}s · Lead time TB: ${o.avgLeadTimeHours ?? "–"} giờ · Chi phí AI: $${o.totalCostUsd}`, "");
  out.push("### Vấn đề theo mức độ", "", "| Mức | Số lượng |", "|:--|--:|", ...Object.entries(o.findingsBySeverity).map(([k, v]) => `| ${k} | ${v} |`), "");
  out.push("### Quy tắc bị vi phạm nhiều nhất", "", "| Rule | Mô tả | Lần |", "|:--|:--|--:|", ...o.topRules.map((t) => `| ${t.ruleId} | ${t.title.replace(/\|/g, "\\|")} | ${t.count} |`), "");
  out.push("## Bảng xếp hạng", "", "| # | Thành viên | MR | Điểm lần đầu | Điểm cuối | Cải thiện | Blocker | Secret | Convention |", "|--:|:--|--:|--:|--:|--:|--:|--:|--:|");
  r.leaderboard.forEach((x, i) => out.push(`| ${i + 1} | ${x.name} | ${x.mrCount} | ${x.avgFirstScore ?? "–"} | ${x.avgFinalScore ?? "–"} | ${x.improvement ?? "–"} | ${x.blockers} | ${x.secretLeaks} | ${x.conventionViolations} |`));
  out.push("", "## Theo repo", "", "| Repo | MR | Điểm TB | Blocker |", "|:--|--:|--:|--:|", ...r.byRepo.map((x) => `| ${repoNames[x.repoId] ?? x.repoId} | ${x.mrCount} | ${x.avgScore ?? "–"} | ${x.blockers} |`), "");
  out.push("## Xu hướng theo tuần", "", "| Tuần | Lần review | Điểm TB |", "|:--|--:|--:|", ...o.trend.map((t) => `| ${t.week} | ${t.runs} | ${t.avgScore ?? "–"} |`), "");
  return out.join("\n");
}
