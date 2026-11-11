import type { ChatImageDto, ChatReplyDto, ChatStateDto, LessonDto, DiscoverMrDto, DiscoverProjectDto, FrameworkInfoDto, Paged, RequestReviewResultDto, RunDetailDto, RunListItemDto } from "@mrd/contracts";
import { qs, request } from "../../kernel/http.js";
export const listRuns = (p: { limit?: number; offset?: number; minScore?: number; maxScore?: number; status?: string }) =>
  request<Paged<RunListItemDto>>(`/api/reviews${qs(p)}`);
export const getRun = (id: string) => request<RunDetailDto>(`/api/reviews/${id}`);
export const requestReview = (url: string) => request<RequestReviewResultDto>("/api/reviews", { method: "POST", json: { url } });
export const rerun = (mrId: string) => request<RequestReviewResultDto>(`/api/mrs/${mrId}/rerun`, { method: "POST", json: {} });
export const setFeedback = (findingId: string, feedback: "agree" | "disagree" | "fixed" | null) =>
  request<void>(`/api/findings/${findingId}/feedback`, { method: "POST", json: { feedback } });
export const listFrameworks = () => request<FrameworkInfoDto[]>("/api/frameworks");
export const discoverProjects = (q: string) => request<DiscoverProjectDto[]>(`/api/discover/projects${qs({ q })}`);
export const discoverMrs = (project: string, state: string, q: string) => request<DiscoverMrDto[]>(`/api/discover/mrs${qs({ project, state, q })}`);
export { openRunStream } from "../../kernel/stream.js";
export const getChat = (mrId: string) => request<ChatStateDto>(`/api/mrs/${mrId}/chat`);
export const sendChat = (mrId: string, text: string, images: ChatImageDto[] = []) => request<ChatReplyDto>(`/api/mrs/${mrId}/chat`, { method: "POST", json: { text, images } });
export const approveLesson = (id: string) => request<LessonDto>(`/api/lessons/${id}/approve`, { method: "POST", json: {} });
export const rejectLesson = (id: string) => request<LessonDto>(`/api/lessons/${id}/reject`, { method: "POST", json: {} });
export const deleteLesson = (id: string) => request<void>(`/api/lessons/${id}`, { method: "DELETE" });
