# Roadmap — các tính năng còn lại

Mỗi milestone đi qua 5 bước theo thứ tự: **BA → Design → Code → Docs → Test**, và chỉ "xong" khi qua cổng ở cuối mỗi bước (xem [Quy trình](#quy-trình-chung-cho-mọi-milestone)). Quy tắc kiến trúc trong `AGENTS.md` / `docs/MODULES.md` áp dụng cho mọi milestone: module độc lập, port + adapter ở `app/`, `pnpm verify` phải xanh.

Trạng thái hiện tại: backend, web UI (shadcn/Tailwind), Electron, CI/release đã có, **mới chạy trên dữ liệu demo**; chưa chạy thật với GitLab + LLM.

---

## M0 — Đưa vào dùng thật (chặn mọi thứ khác)

**BA**
- Người dùng (team lead) cấu hình GitLab bằng một Group/Project Access Token của bot, thêm repo, và thấy một MR thật được review.
- Tiêu chí chấp nhận: dán link MR → trong ≤ 5 phút có điểm, finding, comment trên MR dưới tên bot; push commit mới → review lại, không đăng trùng comment.

**Design**
- Màn hình *Cài đặt → Kết nối*: nhập GitLab URL + token, nút "Kiểm tra kết nối" (hiện quyền token, người dùng bot, repo thấy được), trạng thái webhook từng repo.
- Màn hình *Repo → Thêm repo* có bước hướng dẫn tạo webhook (URL + secret để copy).
- Trạng thái trống/lỗi: token sai, hết hạn, thiếu scope, webhook chưa nhận sự kiện nào.

**Code**
- `scm`: endpoint `testConnection`, kiểm tra scope; lưu token qua `settings` (mã hoá, không log, không trả về client).
- `repos`/`app`: tự kiểm tra webhook, nút tạo webhook qua API nếu token có quyền.
- Chạy end-to-end với một repo thử + LLM thật; sửa các chỗ vỡ phát hiện được (timeout, diff lớn, retry).
- Hiển thị lỗi pipeline theo từng stage trên UI (đã có `stageTimings`).

**Docs**: `docs/SETUP.md` (tạo token, scope tối thiểu, webhook, biến môi trường, Redis/SQLite, backup), cập nhật README.

**Test**: test hợp đồng cho adapter GitLab với fixture ghi lại từ API thật; một kịch bản E2E có script (`scripts/e2e-gitlab.ts`) chạy tay với repo thử; kiểm thử idempotent (cùng head SHA, webhook gửi lặp).

---

## M1 — Framework & harness nhìn thấy và chỉnh được

**BA**
- Team lead xem agent đang chấm theo rule nào, chỉnh trọng số/ngưỡng, tắt rule không phù hợp, và biết repo nào đã có harness tốt hay chưa.
- Tiêu chí: sửa rule trên UI → review kế tiếp dùng rule mới; mọi thay đổi có lịch sử; repo vẫn override được qua `.asdlc.yml`.

**Design**
- Trang *Framework*: danh sách hạng mục + rule (id, mức độ, câu hỏi kiểm tra), trọng số, cổng chặn; chế độ xem và chế độ sửa; so sánh bản mặc định với bản đã chỉnh.
- Trang *Harness của repo*: tài liệu tìm thấy, điểm "độ phủ harness" (có AGENTS.md? rules? tài liệu kiến trúc?), gợi ý tài liệu còn thiếu.
- Trình xem `.asdlc.yml` hợp lệ/không + preview rubric sau khi gộp.

**Code**
- `framework`: lưu bản chỉnh trong DB (bảng riêng), phiên bản hoá rubric; API list/get/update/diff.
- `harness`: tính điểm độ phủ, trả về danh sách gợi ý.
- Gắn phiên bản framework vào mỗi review run để so sánh công bằng.
- Nhiều framework (mặc định, web, backend, mobile) chọn theo repo.

**Docs**: `docs/FRAMEWORK.md` (cấu trúc rubric, cách viết rule tốt), `docs/HARNESS.md` (cách viết AGENTS.md/rules để review hiệu quả), `.asdlc.yml` tham chiếu đầy đủ.

**Test**: validate schema rubric; test gộp `.asdlc.yml` (hợp lệ/sai/độc hại); test phiên bản hoá không làm đổi điểm các review cũ.

---

## M2 — Context phong phú cho agent

**BA**
- Review hiểu *ý định*: đọc issue/spec liên kết, thảo luận trên MR, và lịch sử.
- Tiêu chí: MR có "Closes #123" → agent so khớp với yêu cầu trong issue; không hỏi lại điều đã được trả lời trong thread; không đăng lại góp ý mà tác giả đã từ chối có lý do.

**Design**
- Trong chi tiết review: khối "Context đã dùng" (issue, thread, file harness) để người xem kiểm chứng.
- Cài đặt: bật/tắt từng nguồn context, ngân sách ký tự.

**Code**
- `scm`: port lấy issue liên kết, discussions của MR.
- `reviews`: lấy lịch sử finding của tác giả/repo → đưa các lỗi lặp lại vào prompt (có ngân sách).
- `reviewer`: thêm các khối context mới, giữ nguyên quy tắc dữ liệu không tin cậy.
- Phản hồi của người dùng (đúng/sai/đã sửa) quay lại làm tín hiệu cho các lần sau.

**Docs**: cập nhật `docs/ARCHITECTURE.md` (luồng context), cách viết mô tả MR/issue để review tốt hơn.

**Test**: prompt snapshot test; test chống prompt injection qua issue/comment; đo chất lượng bằng một bộ MR mẫu có nhãn (precision của finding).

---

## M3 — Vận hành và độ tin cậy

**BA**
- Admin biết hệ thống có khoẻ không, tốn bao nhiêu, và kiểm soát chi phí AI.

**Design**
- Trang *Hàng đợi/Hoạt động*: job đang chạy, thất bại, thử lại thủ công; trang *Chi phí*: theo repo/người/tháng, hạn mức và cảnh báo.

**Code**
- Giới hạn chi phí theo tháng/repo, bỏ qua MR nháp hoặc file sinh tự động (cấu hình được), giới hạn kích thước diff.
- Health check, metrics cơ bản, log có cấu trúc, retry/backoff, dọn workspace.
- Sao lưu/khôi phục dữ liệu; migration Prisma có kiểm tra.

**Docs**: `docs/OPERATIONS.md` (triển khai Docker, nâng cấp, sao lưu, xử lý sự cố).

**Test**: test hàng đợi (retry, idempotent, huỷ); test chịu tải nhẹ (nhiều MR cùng lúc); test hạn mức chi phí.

---

## M4 — Người dùng, phân quyền, thông báo

**BA**
- Thành viên đăng nhập xem điểm của mình; lead xem cả team; thông báo khi review xong hoặc có blocker.

**Design**
- Đăng nhập, trang cá nhân ("điểm của tôi", xu hướng, lỗi hay gặp), cài đặt thông báo, vai trò (admin/lead/member).

**Code**
- OAuth GitLab cho đăng nhập người dùng (luồng bot vẫn dùng token), `identity` ánh xạ tài khoản ↔ thành viên, phân quyền theo vai trò.
- Thông báo qua Slack/Teams/email/webhook (adapter ở `app/`, module `notifications` mới).

**Docs**: mô hình quyền, cấu hình OAuth app, tích hợp thông báo.

**Test**: test quyền truy cập từng route; test adapter thông báo với mock; test bảo mật phiên/CSRF.

---

## M5 — Hỗ trợ GitHub

**BA**: cùng trải nghiệm như GitLab cho repo GitHub (PR thay vì MR).
**Design**: không đổi giao diện, chỉ thêm lựa chọn nền tảng và thuật ngữ PR/MR.
**Code**: adapter `scm` cho GitHub (App hoặc token, webhook, review comments); ánh xạ khái niệm.
**Docs**: `docs/SETUP.md` mục GitHub.
**Test**: bộ test hợp đồng dùng chung cho cả hai adapter.

---

## M6 — Đóng gói và phát hành

**BA**: cài app như phần mềm thông thường, tự cập nhật, chạy được cả dạng server.
**Design**: màn hình lần chạy đầu (wizard: kết nối GitLab → thêm repo → review thử).
**Code**: ký số và notarize app macOS, bản Windows/Linux, tự cập nhật; Docker image + compose cho dạng server; wizard lần đầu.
**Docs**: hướng dẫn cài đặt từng nền tảng, CHANGELOG, quy trình release.
**Test**: smoke test bản đóng gói trên CI; kiểm tra nâng cấp từ bản trước giữ nguyên dữ liệu.

---

## M7 — Đánh giá chất lượng review (liên tục)

**BA**: tin được kết quả review; biết khi nào rubric/prompt làm kết quả tệ đi.
**Code**: bộ MR mẫu có nhãn + script chạy đánh giá (precision/recall của finding, độ ổn định điểm khi chạy lại); so sánh nhiều model/provider; thống kê tỉ lệ finding bị đánh dấu sai.
**Docs**: `docs/EVALS.md`.
**Test**: chạy bộ đánh giá trước mỗi thay đổi prompt/rubric; không làm giảm chỉ số thì mới merge.

---

## Quy trình chung cho mọi milestone

| Bước | Sản phẩm | Cổng để sang bước sau |
|---|---|---|
| **BA** | User story, tiêu chí chấp nhận, ngoài phạm vi, rủi ro | Bạn duyệt tiêu chí chấp nhận |
| **Design** | Artboard trên design canvas (dùng đúng token hiện có, cả sáng/tối, trạng thái trống/lỗi/đang tải) | Bạn duyệt thiết kế |
| **Code** | Module mới/mở rộng đúng luật kiến trúc, contract trong `@mrd/contracts`, UI theo thiết kế | `pnpm verify` xanh |
| **Docs** | Cập nhật `docs/`, `MODULE.md`, README | Người mới làm theo được, không cần hỏi |
| **Test** | Unit + integration + (nếu có) E2E, kiểm tra thủ công trên UI thật | Tiêu chí chấp nhận ở bước BA đều đạt |

## Thứ tự đề xuất

`M0 → M1 → M2` là lõi: không có chúng thì chưa dùng thật được. `M3` song song với M2 khi có người dùng thật đầu tiên. `M4`, `M5`, `M6` theo nhu cầu (GitHub nếu team dùng GitHub, đóng gói khi cần phát cho người ngoài). `M7` bắt đầu từ M1 và chạy liên tục.
