import type { LeaderboardRow, Paged, RunListItemDto } from "@mrd/contracts";
import { qs, request } from "../../kernel/http.js";
export const getLeaderboard = (days: number) => request<LeaderboardRow[]>(`/api/leaderboard${qs({ days })}`);
export const getRecentRuns = (limit = 8) => request<Paged<RunListItemDto>>(`/api/reviews${qs({ limit, status: "succeeded" })}`);
