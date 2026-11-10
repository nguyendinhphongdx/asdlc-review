import type { Paged, RequestReviewResultDto, RunDetailDto, RunListItemDto } from "@mrd/contracts";
import { qs, request } from "../../kernel/http.js";
export const listRuns = (p: { limit?: number; offset?: number; minScore?: number; maxScore?: number; status?: string }) =>
  request<Paged<RunListItemDto>>(`/api/reviews${qs(p)}`);
export const getRun = (id: string) => request<RunDetailDto>(`/api/reviews/${id}`);
export const requestReview = (url: string) => request<RequestReviewResultDto>("/api/reviews", { method: "POST", json: { url } });
export const rerun = (mrId: string) => request<RequestReviewResultDto>(`/api/mrs/${mrId}/rerun`, { method: "POST", json: {} });
export const setFeedback = (findingId: string, feedback: "agree" | "disagree" | "fixed" | null) =>
  request<void>(`/api/findings/${findingId}/feedback`, { method: "POST", json: { feedback } });
