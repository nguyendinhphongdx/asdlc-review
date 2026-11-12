import { useQuery } from "@tanstack/react-query";
import { getHealth } from "./api.js";

/** Phiên bản app (từ server) để hiện ở sidebar. */
export function useAppVersion(): string {
  return useQuery({ queryKey: ["health"], queryFn: getHealth, staleTime: 3_600_000 }).data?.version ?? "";
}
