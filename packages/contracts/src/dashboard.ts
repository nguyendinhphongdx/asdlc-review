export interface DateRange {
  from: Date;
  to: Date;
}

export interface LeaderboardRow {
  memberId: string | null;
  name: string;
  usernames: string[];
  mrCount: number;
  runCount: number;
  avgFirstScore: number | null;
  avgFinalScore: number | null;
  improvement: number | null;
  rankScore: number | null;
  blockers: number;
  securityIssues: number;
  secretLeaks: number;
  conventionViolations: number;
  avgFilesChanged: number;
  linesChanged: number;
  avgReviewRounds: number;
  avgLeadTimeHours: number | null;
  mergedCount: number;
}

export interface OverviewStats {
  from: string;
  to: string;
  totalRuns: number;
  totalMrs: number;
  avgScore: number | null;
  passRate: number | null;
  findingsBySeverity: Record<string, number>;
  findingsByCategory: Record<string, number>;
  secretLeaks: number;
  securityIssues: number;
  conventionViolations: number;
  avgReviewDurationSec: number | null;
  avgLeadTimeHours: number | null;
  totalCostUsd: number;
  trend: { week: string; runs: number; avgScore: number | null }[];
  topRules: { ruleId: string; title: string; count: number }[];
  gradeDistribution: Record<string, number>;
}

export interface RepoBreakdownRow {
  repoId: string;
  mrCount: number;
  avgScore: number | null;
  blockers: number;
}

export interface Report {
  range: { from: string; to: string };
  overview: OverviewStats;
  leaderboard: LeaderboardRow[];
  byRepo: RepoBreakdownRow[];
}
