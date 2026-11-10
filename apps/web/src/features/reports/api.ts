import type { Report } from "@mrd/contracts";
import { qs, request } from "../../kernel/http.js";
export const getReport = (days: number) => request<Report>(`/api/reports${qs({ days })}`);
export const exportUrl = (days: number, fmt: "md" | "csv") => (fmt === "md" ? `/api/reports/export.md${qs({ days })}` : `/api/reports/export.csv${qs({ days })}`);
