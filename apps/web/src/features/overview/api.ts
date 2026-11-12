import type { InboxDto, OverviewStats, Paged, RunListItemDto } from "@mrd/contracts";
import { qs, request } from "../../kernel/http.js";
export const getOverview = (days: number) => request<OverviewStats>(`/api/overview${qs({ days })}`);
export const getInbox = () => request<InboxDto>("/api/inbox");
export const listFailedRuns = () => request<Paged<RunListItemDto>>(`/api/reviews${qs({ status: "failed", limit: 50 })}`);
