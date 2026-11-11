/** Thứ tự stage của pipeline review và nhãn tiếng Việt. */
export const STAGES = [
  { id: "clone", label: "Clone repository" },
  { id: "framework", label: "Nạp framework" },
  { id: "harness", label: "Nạp harness" },
  { id: "analysis", label: "Phân tích tĩnh" },
  { id: "review", label: "Review bằng AI" },
  { id: "score", label: "Chấm điểm" },
  { id: "publish", label: "Đăng comment" },
] as const;
export const stageLabel = (id: string | null | undefined) => STAGES.find((s) => s.id === id)?.label ?? id ?? "";
