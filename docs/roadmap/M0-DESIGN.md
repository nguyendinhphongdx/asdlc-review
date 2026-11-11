# M0 — Thiết kế

Trạng thái: **chờ duyệt** (cổng để sang bước Code).

Thiết kế nằm trên design canvas "ASDLC Review UI" (3 artboard mới, dùng đúng token hiện có, có chế độ sáng/tối qua prop `theme`):
https://claude.ai/artifact/2pgrS1L3bx5aH5NvdToR2p

| Artboard | Màn hình / trạng thái | Tiêu chí (BA) |
|---|---|---|
| **M0 · Cài đặt → Kết nối** (`Connect.dc.html`) | Thẻ GitLab ở 3 trạng thái (đã kết nối, token thiếu scope, lần đầu); thẻ Webhook (URL, secret ẩn/hiện/sao chép/tạo lại) | AC1, AC2, AC3, AC6 |
| **M0 · Repository & webhook** (`Repos.dc.html`) | Danh sách repo có cột trạng thái webhook; wizard thêm repo 3 bước (chọn repo, tạo webhook tự động hoặc thủ công, chờ sự kiện đầu tiên); hoạt động webhook kể cả sự kiện bị từ chối | AC4, AC5, AC6, AC7 |
| **M0 · Review chạy thật** (`Pipeline.dc.html`) | Timeline pipeline theo stage với lỗi + "Thử lại"; cảnh báo diff vượt ngân sách (chỉ review một phần); danh sách với trạng thái Lỗi / Bỏ qua · MR nháp / Một phần; Cài đặt → Review (bỏ qua Draft, đăng comment, ngân sách diff, timeout) | AC8–AC13 |

## Quyết định thiết kế
- Token chỉ hiện 4 ký tự cuối, có nút "Thay token"; không có cách xem lại.
- Lỗi kết nối nêu nguyên nhân cụ thể và bước sửa (thiếu scope, hết hạn, URL không tới được), kèm link hướng dẫn.
- Webhook "chưa nhận sự kiện" là trạng thái cảnh báo (vàng), "sai secret" là lỗi (đỏ) — hai trường hợp cần cách xử lý khác nhau.
- Review một phần luôn kèm huy hiệu "Một phần" để người xem không hiểu nhầm điểm là của cả MR.
- Mọi trạng thái trống/lỗi/đang chờ được vẽ, không chỉ trạng thái thành công.

## Chưa vẽ (sẽ làm theo ở bước Code nếu bạn đồng ý)
Trạng thái đang tải của nút "Kiểm tra kết nối"; hộp xác nhận "Xoá kết nối"; khung nhìn điện thoại.
