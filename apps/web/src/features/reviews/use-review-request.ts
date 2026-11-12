import type { RequestReviewResultDto } from "@mrd/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { requestReview, rerun } from "./api.js";

/** Giải thích kết quả xếp hàng bằng lời, để bấm nút không bao giờ "im lặng". */
export function describeResult(r: RequestReviewResultDto): string {
  switch (r.status) {
    case "queued": return "Đã xếp hàng review";
    case "duplicate": return "MR này đang được review ở commit hiện tại — mở lần đang chạy";
    case "already_reviewed": return "Commit này đã được review";
    case "skipped": return `Không review: ${r.reason}`;
  }
}

/**
 * Xếp hàng review (theo link MR, hoặc "review lại" theo id MR). Sau khi xếp hàng:
 * làm mới ngay danh sách (TanStack Query invalidate → refetch) và, nếu `open`, chuyển tới trang theo dõi run mới.
 */
export function useReviewRequest(opts: { open?: boolean } = {}) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [notice, setNotice] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: (t: { url: string } | { mrId: string }) => ("url" in t ? requestReview(t.url) : rerun(t.mrId)),
    onMutate: () => setNotice(null),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["inbox"] });
      void qc.invalidateQueries({ queryKey: ["runs"] });
      setNotice(describeResult(r));
      if (opts.open && "runId" in r) nav(`/reviews/${r.runId}`);
    },
  });
  return { ...m, notice, clearNotice: () => setNotice(null) };
}
