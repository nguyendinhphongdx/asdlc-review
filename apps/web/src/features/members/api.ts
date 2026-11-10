import type { MemberDto } from "@mrd/contracts";
import { request } from "../../kernel/http.js";
export interface MemberInputDto { displayName: string; email?: string | null; team?: string | null; role?: string | null; active?: boolean; identities?: { platform: string; username: string }[] }
export const listMembers = () => request<MemberDto[]>("/api/members");
export const createMember = (m: MemberInputDto) => request<MemberDto>("/api/members", { method: "POST", json: m });
export const updateMember = (id: string, m: Partial<MemberInputDto>) => request<MemberDto>(`/api/members/${id}`, { method: "PATCH", json: m });
export const deleteMember = (id: string) => request<void>(`/api/members/${id}`, { method: "DELETE" });
