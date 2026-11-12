import type { DateRange, LeaderboardRow, OverviewStats, Report, UsageFilterDto, UsageReportDto } from "@mrd/contracts";
import { applyFilter, computeUsage } from "./domain/usage.js";
import { leaderboardCsv, reportMarkdown } from "./domain/export.js";
import { computeByRepo, computeLeaderboard, computeOverview } from "./domain/metrics.js";
import type { MemberDirectory, Params, RunFactsSource, UsageSource } from "./ports.js";

export interface AnalyticsDeps {
  facts: RunFactsSource;
  members: MemberDirectory;
  params: Params;
  usage: UsageSource;
}

export interface AnalyticsApi {
  overview(range: DateRange): Promise<OverviewStats>;
  leaderboard(range: DateRange): Promise<LeaderboardRow[]>;
  report(range: DateRange): Promise<Report>;
  exportMarkdown(range: DateRange, repoNames?: Record<string, string>): Promise<string>;
  exportCsv(range: DateRange): Promise<string>;
  /** Chi phí/token các lượt review theo ngày, repo, model…; `filter` thu hẹp kết quả (tuỳ chọn bộ lọc luôn lấy từ toàn khoảng). */
  usage(range: DateRange, filter?: UsageFilterDto): Promise<UsageReportDto>;
}

export function createAnalyticsModule(deps: AnalyticsDeps): AnalyticsApi {
  const load = async (range: DateRange) => {
    const [mrs, members, passScore] = await Promise.all([deps.facts.facts(range), deps.members.list(), deps.params.passScore()]);
    return { mrs, members, passScore };
  };
  const report = async (range: DateRange): Promise<Report> => {
    const { mrs, members, passScore } = await load(range);
    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      overview: computeOverview(mrs, range, passScore),
      leaderboard: computeLeaderboard(mrs, members),
      byRepo: computeByRepo(mrs),
    };
  };
  return {
    async overview(range) {
      const { mrs, passScore } = await load(range);
      return computeOverview(mrs, range, passScore);
    },
    async leaderboard(range) {
      const { mrs, members } = await load(range);
      return computeLeaderboard(mrs, members);
    },
    report,
    async usage(range, filter = {}) {
      const span = range.to.getTime() - range.from.getTime();
      const rows = await deps.usage.rows({ from: new Date(range.from.getTime() - span), to: range.to });
      const inRange = rows.filter((r) => r.createdAt >= range.from);
      const uniq = (f: (r: (typeof rows)[number]) => string | null) => [...new Set(inRange.map(f).filter((v): v is string => !!v))].sort();
      const options = {
        repos: [...new Map(inRange.map((r) => [r.repositoryId, r.repoName])).entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
        providers: uniq((r) => r.provider), models: uniq((r) => r.model), frameworks: uniq((r) => r.frameworkId),
      };
      return computeUsage(applyFilter(rows, filter), range, filter, options);
    },
    exportMarkdown: async (range, names) => reportMarkdown(await report(range), names),
    exportCsv: async (range) => leaderboardCsv((await report(range)).leaderboard),
  };
}
