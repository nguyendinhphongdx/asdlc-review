# M1 — Thiết kế

Trạng thái: **chờ duyệt** (cổng để sang bước Code). Tiêu chí: [M1-BA.md](M1-BA.md).

Thiết kế nằm trên design canvas "ASDLC Review UI" (3 artboard mới, dùng đúng token hiện có):
https://claude.ai/artifact/2pgrS1L3bx5aH5NvdToR2p

| Artboard | Màn hình / trạng thái | Tiêu chí |
|---|---|---|
| **M1 · Framework** (`Framework.dc.html`) | Danh sách framework (mặc định, 3 mẫu Web/Backend/Mobile, bản fork) + xem bản mặc định chỉ đọc; chọn framework cho repo và thứ tự ưu tiên `.asdlc.yml` > framework của repo > mặc định | AC1, AC2, AC5, AC8–AC10 |
| **M1 · Chỉnh framework** (`FrameworkEdit.dc.html`) | Sửa bản fork: banner thay đổi chưa lưu, trọng số, bật/tắt rule, thêm rule tự viết (có lỗi hợp lệ hoá), gate và xếp loại, so sánh với bản gốc, hộp xác nhận lưu (tác động + ghi chú), lịch sử phiên bản và khôi phục | AC3–AC7 |
| **M1 · Harness của repo** (`Harness.dc.html`) | Độ phủ harness 0–100 và gợi ý; trình xem `.asdlc.yml` hợp lệ + rubric sau khi gộp; `.asdlc.yml` lỗi (nêu dòng, lý do); repo chưa có harness | AC11–AC13 |

## Quyết định thiết kế
- Bản mặc định luôn chỉ đọc; muốn chỉnh phải "Tạo bản chỉnh sửa (fork)". Có so sánh với bản gốc và khôi phục.
- Rule và gate bảo mật nền (SEC-01, critical-security) hiển thị là "bắt buộc/khoá", không tắt hay nới được; lý do nêu ngay cạnh.
- Mỗi lần lưu là một phiên bản mới; hộp xác nhận nêu số repo bị ảnh hưởng và hứa rõ "review đã chấm giữ nguyên điểm".
- Điểm độ phủ harness chỉ để gợi ý, không chặn MR; mỗi mục thiếu có gợi ý hành động cụ thể.
- `.asdlc.yml` lỗi không làm hỏng review: bị bỏ qua, comment tổng ghi cảnh báo.

## Chưa vẽ
Màn hình xem YAML thô, hộp "Tạo từ mẫu", chọn nhiều repo cùng lúc, khung nhìn điện thoại. Ngoài ra các artboard mới chưa được tôi mở xem trên canvas sau khi publish (ảnh chụp tách rời mất style nên không kiểm được), bạn xem giúp bố cục.
