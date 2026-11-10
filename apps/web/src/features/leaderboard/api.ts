import type { LeaderboardRow } from "@mrd/contracts";
import { qs, request } from "../../kernel/http.js";
export const getLeaderboard = (days: number) => request<LeaderboardRow[]>(`/api/leaderboard${qs({ days })}`);
