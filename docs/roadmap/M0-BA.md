# M0 — Đưa vào dùng thật: phân tích nghiệp vụ (BA)

Trạng thái: **chờ duyệt** (cổng để sang bước Design).

## Mục tiêu
Một team lead có thể kết nối GitLab, thêm repo, và thấy MR thật được review bằng LLM với comment đăng lên MR — không cần sửa code hay đọc log.

## Hiện trạng (đã kiểm tra trong code)
- Token/secret chỉ đọc từ biến môi trường (`GITLAB_URL`, `GITLAB_TOKEN`, `GITLAB_WEBHOOK_SECRET`); module `settings` **cố ý không** lưu secret. Chưa có `.env` thì server chỉ cảnh báo "chưa thể lấy MR để review".
- Đã có: lấy MR, liệt kê MR mở, đăng/cập nhật comment tổng + inline, xác thực webhook (từ chối nếu chưa có secret), clone qua HTTPS bằng header token.
- Chưa có: kiểm tra kết nối, hiển thị trạng thái cấu hình trên UI, hướng dẫn webhook, bằng chứng chạy với GitLab + LLM thật.

## Người dùng
- **Team lead / admin**: cài đặt, kết nối, thêm repo.
- **Tác giả MR**: nhận comment review trên MR.

## User story và tiêu chí chấp nhận

**US-1. Kết nối GitLab**
Là admin, tôi cấu hình URL + token của bot và biết ngay nó dùng được hay không.
- AC1: *Cài đặt → Kết nối* hiện trạng thái: đã/chưa cấu hình token, URL, tên tài khoản bot, scope và ngày hết hạn của token (nếu API trả về).
- AC2: nút "Kiểm tra kết nối" trả kết quả trong ≤ 10 giây với lý do cụ thể khi lỗi: URL không tới được, token sai/hết hạn, thiếu scope `api`, không thấy repo nào.
- AC3: token không bao giờ xuất hiện trong response API, log, hay UI (chỉ hiện 4 ký tự cuối).

**US-2. Thêm repo và webhook**
Là admin, tôi thêm một repo và biết webhook đã hoạt động chưa.
- AC4: thêm repo bằng đường dẫn `group/project`; hệ thống xác nhận token truy cập được repo.
- AC5: UI hiển thị URL webhook + secret để copy kèm hướng dẫn từng bước; hiển thị "sự kiện gần nhất nhận được lúc …" hoặc "chưa nhận sự kiện nào".
- AC6: webhook sai secret bị từ chối và hiện trong hoạt động gần đây của repo.
- AC7 (tuỳ chọn, nếu token đủ quyền): nút tạo webhook tự động.

**US-3. Review một MR thật từ đầu đến cuối**
Là admin, tôi dán link MR thật và thấy kết quả.
- AC8: dán link → trong ≤ 5 phút (MR ≤ 500 dòng thay đổi) có điểm, finding, và comment tổng trên MR dưới tên bot; inline comment cho finding mức ≥ ngưỡng đã cấu hình.
- AC9: push commit mới lên MR → review lại tự động qua webhook; comment tổng được **cập nhật** (không tạo mới), inline không đăng trùng finding đã nêu.
- AC10: gửi lại cùng một sự kiện webhook (cùng head SHA) không tạo review thứ hai.
- AC11: mọi lỗi giữa chừng hiển thị stage nào lỗi và lý do, trên chi tiết review; job lỗi tạm thời được thử lại, lỗi vĩnh viễn thì dừng.

**US-3b. Giới hạn an toàn khi chạy thật**
- AC12: diff vượt ngân sách → vẫn review phần ưu tiên và ghi rõ file bị bỏ qua trong báo cáo/comment.
- AC13: MR nháp (Draft) mặc định bị bỏ qua, có thể đổi trong cài đặt.

**US-4. Tài liệu cài đặt**
- AC14: người chưa biết dự án làm theo `docs/SETUP.md` và review được MR đầu tiên mà không cần hỏi (kiểm tra bằng cách một người khác làm thử).

## Ngoài phạm vi (M0)
OAuth đăng nhập người dùng (M4), GitHub (M5), chỉnh framework trên UI (M1), context issue/thread (M2), hạn mức chi phí (M3), đóng gói/ký số (M6).

## Rủi ro
| Rủi ro | Giảm thiểu |
|---|---|
| Chưa từng chạy với LLM và GitLab thật, nhiều lỗi ẩn | Chạy E2E sớm với repo thử, sửa lỗi theo vòng |
| Token lộ qua log/response | Kiểm thử tự động tìm token trong log và response |
| Chi phí LLM bất ngờ khi thử | Dùng MR nhỏ, hiển thị chi phí mỗi review (đã có) |
| `claude-cli` làm provider mặc định cần CLI đã đăng nhập trên máy chạy | Kiểm tra provider khả dụng ở bước "Kiểm tra kết nối", báo lỗi rõ |
| App desktop không có `.env` | Quyết định D1 bên dưới |

## Quyết định cần bạn chốt

**D1 — Nơi lưu token.** Hiện `settings` quy định secret chỉ nằm trong env. Với app desktop, người dùng không muốn sửa file `.env`.
- **A (đề xuất): lưu token trong DB, mã hoá bằng khoá nằm ngoài DB** (keychain của hệ điều hành cho desktop, biến môi trường `MRD_SECRET_KEY` cho server). Nhập token ngay trên UI. Cần sửa quy định trong `settings/MODULE.md` và thêm module `secrets` riêng.
- **B: giữ nguyên chỉ env.** UI chỉ hiển thị trạng thái và hướng dẫn, người dùng tự sửa `.env`. Đơn giản, an toàn, nhưng khó dùng với desktop.

**D2 — Provider LLM cho lần chạy thật.** `claude-cli` (dùng CLI đã đăng nhập, không cần API key) hay gọi API trực tiếp bằng key?

**Đã chốt:** D1 = **A** (token lưu DB, mã hoá bằng khoá ngoài DB; cần module `secrets` mới và sửa quy định trong `settings/MODULE.md`). D2 = **`claude-cli`**.

## Cách nghiệm thu
Chạy script E2E trên repo thử rồi duyệt từng AC1–AC14; mỗi AC có bằng chứng (ảnh chụp, link comment trên MR, hoặc test tự động).
