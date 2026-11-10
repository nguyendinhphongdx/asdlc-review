import type { RepoDto, Report } from "@mrd/contracts";
import { qs, request } from "../../kernel/http.js";
export const getReport = (days: number) => request<Report>(`/api/reports${qs({ days })}`);
export const exportUrl = (days: number, fmt: "md" | "csv") => (fmt === "md" ? `/api/reports/export.md${qs({ days })}` : `/api/reports/export.csv${qs({ days })}`);
export const getRepoNames = async () => Object.fromEntries((await request<RepoDto[]>("/api/repos")).map((r) => [r.id, r.fullPath]));
