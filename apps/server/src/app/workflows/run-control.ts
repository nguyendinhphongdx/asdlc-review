/**
 * Sổ các run đang chạy trong tiến trình này, mỗi run một AbortController: bấm "Dừng" thì huỷ tín hiệu,
 * tiến trình AI đang chạy bị kill và workflow tự đánh dấu run là đã dừng.
 */
export function createRunControl() {
  const live = new Map<string, AbortController>();
  return {
    register(runId: string): AbortSignal {
      const c = new AbortController();
      live.set(runId, c);
      return c.signal;
    },
    release(runId: string): void {
      live.delete(runId);
    },
    /** true nếu run đang chạy ở đây và đã được ra lệnh dừng; false nếu không có (đang xếp hàng hoặc ở tiến trình khác). */
    abort(runId: string): boolean {
      const c = live.get(runId);
      if (!c) return false;
      c.abort();
      return true;
    },
  };
}
export type RunControl = ReturnType<typeof createRunControl>;
