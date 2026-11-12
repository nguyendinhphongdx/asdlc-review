import type { ChatStateDto, FrameworkChangeDto, FrameworkDetailDto, FrameworkEditInput, FrameworkInfoDto } from "@mrd/contracts";
import { qs, request } from "../../kernel/http.js";

const base = (id: string) => `/api/frameworks/${encodeURIComponent(id)}`;
export const listFrameworks = () => request<FrameworkInfoDto[]>("/api/frameworks");
export const getFramework = (id: string, version?: number) => request<FrameworkDetailDto>(`${base(id)}${qs({ version })}`);
export const getFrameworkDiff = (id: string, version?: number) => request<FrameworkChangeDto[]>(`${base(id)}/diff${qs({ version })}`);
export const forkFramework = (baseId: string, name: string) => request<FrameworkDetailDto>("/api/frameworks", { method: "POST", json: { baseId, name } });
export const updateFramework = (id: string, input: FrameworkEditInput) => request<FrameworkDetailDto>(base(id), { method: "PUT", json: input });
export const restoreFramework = (id: string, version: number) => request<FrameworkDetailDto>(`${base(id)}/restore`, { method: "POST", json: { version } });
export const deleteFramework = (id: string) => request<void>(base(id), { method: "DELETE" });

// Chat AI cải thiện/xây framework (đề xuất sửa chờ duyệt; duyệt qua /api/actions/:id/approve).
export const getFrameworkChat = (id: string) => request<ChatStateDto>(`${base(id)}/chat`);
export const sendFrameworkChat = (id: string, text: string) => request<{ reply: string }>(`${base(id)}/chat`, { method: "POST", json: { text, images: [] } });
export const approveFrameworkEdit = (actionId: string) => request<{ note: string; frameworkId: string }>(`/api/actions/${actionId}/approve`, { method: "POST", json: {} });
export const dismissFrameworkEdit = (actionId: string) => request<unknown>(`/api/actions/${actionId}/dismiss`, { method: "POST", json: {} });
