import type { UsageTaskKind } from "@mrd/contracts";

/** Tên và giải thích từng loại việc AI (dùng ở tab Nhật ký của review và trang Usage). */
export const TASK_LABEL: Record<UsageTaskKind, { label: string; hint: string }> = {
  review: { label: "Review chính", hint: "Một lượt review cho cả MR (MR vừa và nhỏ)" },
  synthesis: { label: "Tổng hợp", hint: "Lượt cuối của MR lớn: ghép finding, vẽ tổng quan và checklist" },
  design_map: { label: "Đọc thiết kế hiện tại", hint: "T2: đọc code gốc để mô tả thiết kế của từng khu vực" },
  design: { label: "Đánh giá thiết kế", hint: "T3: đánh giá thiết kế toàn MR" },
  area: { label: "Review từng khu vực", hint: "T4: review chi tiết theo dòng của từng khu vực" },
  chat: { label: "Chat với agent", hint: "Hỏi đáp về MR; tính vào review mới nhất của MR" },
};
