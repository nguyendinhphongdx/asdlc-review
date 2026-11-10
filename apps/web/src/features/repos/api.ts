import type { RepoDto } from "@mrd/contracts";
import { request } from "../../kernel/http.js";
export const listRepos = () => request<RepoDto[]>("/api/repos");
export const registerRepo = (url: string) => request<RepoDto>("/api/repos", { method: "POST", json: { url } });
export const patchRepo = (id: string, p: Partial<Pick<RepoDto, "enabled" | "autoReview" | "frameworkId" | "provider">>) => request<RepoDto>(`/api/repos/${id}`, { method: "PATCH", json: p });
export const removeRepo = (id: string) => request<void>(`/api/repos/${id}`, { method: "DELETE" });
