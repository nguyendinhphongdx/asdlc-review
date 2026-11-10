import type { DateRange, LeaderboardRow, OverviewStats, Report } from "@mrd/contracts";
import { leaderboardCsv, reportMarkdown } from "./domain/export.js";
import { computeByRepo, computeLeaderboard, computeOverview } from "./domain/metrics.js";
import type { MemberDirectory, Params, RunFactsSource } from "./ports.js";

export interface AnalyticsDeps {
  facts: RunFactsSource;
  members: MemberDirectory;
  params: Params;
}

export interface AnalyticsApi {
  overview(range: DateRange): Promise<OverviewStats>;
  leaderboard(range: DateRange): Promise<LeaderboardRow[]>;
  report(range: DateRange): Promise<Report>;
  exportMarkdown(range: DateRange, repoNames?: Record<string, string>): Promise<string>;
  exportCsv(range: DateRange): Promise<string>;
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
    exportMarkdown: async (range, names) => reportMarkdown(await report(range), names),
    exportCsv: async (range) => leaderboardCsv((await report(range)).leaderboard),
  };
}
