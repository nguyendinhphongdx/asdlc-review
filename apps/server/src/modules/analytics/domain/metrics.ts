import type { LeaderboardRow, OverviewStats, RepoBreakdownRow } from "@mrd/contracts";
import type { MemberRef, MrFactRow, RunFact } from "../ports.js";

const avg = (xs: number[]): number | null => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const hours = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 3_600_000;
const isIssue = (f: RunFact["findings"][number]) => f.kind === "issue";

const first = (m: MrFactRow): RunFact | undefined => m.runs[0];
const last = (m: MrFactRow): RunFact | undefined => m.runs[m.runs.length - 1];

/**
 * Quy ước: số lượng vi phạm đếm trên LẦN REVIEW ĐẦU của mỗi MR trong kỳ (chất lượng "khi nộp"),
 * điểm "cuối" lấy lần review gần nhất, số vòng = số lần review thành công.
 */
function violations(mrs: MrFactRow[]) {
  const firstRuns = mrs.map(first).filter((r): r is RunFact => Boolean(r));
  const issues = firstRuns.flatMap((r) => r.findings.filter(isIssue));
  return {
    issues,
    blockers: issues.filter((f) => f.severity === "blocker").length,
    securityIssues: issues.filter((f) => f.category === "security").length,
    secretLeaks: issues.filter((f) => f.ruleId === "SEC-01").length,
    conventionViolations: issues.filter((f) => f.category === "conventions").length,
  };
}

export function weekStart(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}

export function computeOverview(mrs: MrFactRow[], range: { from: Date; to: Date }, passScore: number): OverviewStats {
  const runs = mrs.flatMap((m) => m.runs);
  const v = violations(mrs);
  const bySeverity: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const rules = new Map<string, { count: number; titles: Map<string, number> }>();
  for (const f of v.issues) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
    byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
    if (f.ruleId) {
      const r = rules.get(f.ruleId) ?? { count: 0, titles: new Map() };
      r.count++;
      r.titles.set(f.title, (r.titles.get(f.title) ?? 0) + 1);
      rules.set(f.ruleId, r);
    }
  }
  const lastScores = mrs.map((m) => last(m)?.score).filter((s): s is number => s != null);
  const grades: Record<string, number> = {};
  for (const m of mrs) {
    const g = last(m)?.grade;
    if (g) grades[g] = (grades[g] ?? 0) + 1;
  }
  const weeks = new Map<string, number[]>();
  for (const r of runs) {
    const w = weekStart(r.createdAt);
    weeks.set(w, [...(weeks.get(w) ?? []), ...(r.score != null ? [r.score] : [])]);
  }
  const runsPerWeek = new Map<string, number>();
  for (const r of runs) runsPerWeek.set(weekStart(r.createdAt), (runsPerWeek.get(weekStart(r.createdAt)) ?? 0) + 1);

  return {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    totalRuns: runs.length,
    totalMrs: mrs.length,
    avgScore: avg(runs.map((r) => r.score).filter((s): s is number => s != null)),
    passRate: lastScores.length ? Math.round((lastScores.filter((s) => s >= passScore).length / lastScores.length) * 1000) / 10 : null,
    findingsBySeverity: bySeverity,
    findingsByCategory: byCategory,
    secretLeaks: v.secretLeaks,
    securityIssues: v.securityIssues,
    conventionViolations: v.conventionViolations,
    avgReviewDurationSec: avg(runs.map((r) => r.durationMs).filter((d): d is number => d != null).map((d) => d / 1000)),
    avgLeadTimeHours: avg(mrs.filter((m) => m.mergedAt).map((m) => hours(m.openedAt, m.mergedAt!))),
    totalCostUsd: Math.round(sum(runs.map((r) => r.costUsd ?? 0)) * 100) / 100,
    trend: [...runsPerWeek.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([week, n]) => ({ week, runs: n, avgScore: avg(weeks.get(week) ?? []) })),
    topRules: [...rules.entries()]
      .map(([ruleId, r]) => ({ ruleId, count: r.count, title: [...r.titles.entries()].sort((a, b) => b[1] - a[1])[0]![0] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    gradeDistribution: grades,
  };
}

/** Bayesian average: kéo điểm của người ít MR về trung bình team (C = số "MR ảo" ở mức trung bình team). */
export const bayesian = (scores: number[], teamMean: number, c = 5): number => Math.round(((c * teamMean + sum(scores)) / (c + scores.length)) * 10) / 10;

export function computeLeaderboard(mrs: MrFactRow[], members: MemberRef[]): LeaderboardRow[] {
  const byMemberId = new Map(members.map((m) => [m.id, m]));
  const groups = new Map<string, MrFactRow[]>();
  for (const m of mrs) {
    const key = m.memberId && byMemberId.has(m.memberId) ? `m:${m.memberId}` : `u:${m.authorUsername.toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  const firstScores = mrs.map((m) => first(m)?.score).filter((s): s is number => s != null);
  const teamMean = firstScores.length ? sum(firstScores) / firstScores.length : 0;

  const rows = [...groups.entries()].map(([key, list]): LeaderboardRow => {
    const member = key.startsWith("m:") ? byMemberId.get(key.slice(2)) : undefined;
    const fs = list.map((m) => first(m)?.score).filter((s): s is number => s != null);
    const ls = list.map((m) => last(m)?.score).filter((s): s is number => s != null);
    const v = violations(list);
    const lastRuns = list.map(last).filter((r): r is RunFact => Boolean(r));
    const merged = list.filter((m) => m.mergedAt);
    const avgFirst = avg(fs);
    const avgFinal = avg(ls);
    return {
      memberId: member?.id ?? null,
      name: member?.name ?? list[0]!.authorUsername,
      usernames: member?.usernames ?? [...new Set(list.map((m) => m.authorUsername))],
      mrCount: list.length,
      runCount: sum(list.map((m) => m.runs.length)),
      avgFirstScore: avgFirst,
      avgFinalScore: avgFinal,
      improvement: avgFirst != null && avgFinal != null ? Math.round((avgFinal - avgFirst) * 10) / 10 : null,
      rankScore: fs.length ? bayesian(fs, teamMean) : null,
      blockers: v.blockers,
      securityIssues: v.securityIssues,
      secretLeaks: v.secretLeaks,
      conventionViolations: v.conventionViolations,
      avgFilesChanged: avg(lastRuns.map((r) => r.filesChanged)) ?? 0,
      linesChanged: sum(lastRuns.map((r) => r.additions + r.deletions)),
      avgReviewRounds: avg(list.map((m) => m.runs.length)) ?? 0,
      avgLeadTimeHours: avg(merged.map((m) => hours(m.openedAt, m.mergedAt!))),
      mergedCount: merged.length,
    };
  });
  return rows.sort((a, b) => (b.rankScore ?? -1) - (a.rankScore ?? -1) || b.mrCount - a.mrCount);
}

export function computeByRepo(mrs: MrFactRow[]): RepoBreakdownRow[] {
  const groups = new Map<string, MrFactRow[]>();
  for (const m of mrs) groups.set(m.repositoryId, [...(groups.get(m.repositoryId) ?? []), m]);
  return [...groups.entries()]
    .map(([repoId, list]) => ({
      repoId,
      mrCount: list.length,
      avgScore: avg(list.map((m) => last(m)?.score).filter((s): s is number => s != null)),
      blockers: violations(list).blockers,
    }))
    .sort((a, b) => b.mrCount - a.mrCount);
}
