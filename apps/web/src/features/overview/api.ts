import type { OverviewStats } from "@mrd/contracts";
import { qs, request } from "../../kernel/http.js";
export const getOverview = (days: number) => request<OverviewStats>(`/api/overview${qs({ days })}`);
