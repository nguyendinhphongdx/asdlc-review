import type { UsageFilterDto, UsageReportDto } from "@mrd/contracts";
import { qs, request } from "../../kernel/http.js";

export interface UsageQuery extends UsageFilterDto { days?: number; from?: string; to?: string }
const join = (a?: string[]) => (a?.length ? a.join(",") : undefined);
const params = (q: UsageQuery) => ({ days: q.from ? undefined : q.days, from: q.from, to: q.to, repos: join(q.repoIds), providers: join(q.providers), models: join(q.models), frameworks: join(q.frameworks), status: q.status && q.status !== "all" ? q.status : undefined });
export const getUsage = (q: UsageQuery) => request<UsageReportDto>(`/api/usage${qs(params(q))}`);
export const usageCsvUrl = (r: UsageReportDto) => {
  const rows = [["ngày", "chi phí USD", "số run", "run lỗi", "token vào", "token ra", "token cache"], ...r.byDay.map((d) => [d.date, d.costUsd.toFixed(4), d.runs, d.failed, d.input, d.output, d.cache])];
  return URL.createObjectURL(new Blob([rows.map((x) => x.join(",")).join("\n")], { type: "text/csv" }));
};
