import type { FrameworkInfoDto, Rubric } from "@mrd/contracts";
import { request } from "../../kernel/http.js";
export const listFrameworks = () => request<FrameworkInfoDto[]>("/api/frameworks");
export const getFramework = (id: string) => request<Rubric>(`/api/frameworks/${encodeURIComponent(id)}`);
