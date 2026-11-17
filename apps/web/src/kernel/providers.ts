import type { ProviderInfoDto } from "@mrd/contracts";
import { useQuery } from "@tanstack/react-query";
import { request } from "./http.js";

/**
 * Danh sách provider AI do server mô tả (khả năng, cách xác thực, model gợi ý). Mọi màn hình chọn provider/model đọc từ đây
 * thay vì tự giữ danh sách — thêm provider ở server là giao diện tự có.
 */
export const useProviders = () => useQuery({ queryKey: ["providers"], queryFn: () => request<ProviderInfoDto[]>("/api/providers") });

/** Provider review đang chọn ở Cài đặt chung (để repo "theo cài đặt chung" biết danh sách model nào để gợi ý). */
export const useGlobalReviewProvider = () =>
  useQuery({ queryKey: ["settings"], queryFn: () => request<{ reviewProvider: string }>("/api/settings"), select: (s) => s.reviewProvider });
