# scm

## Trách nhiệm
Làm việc với nền tảng Git (GitLab, GitHub): lấy thông tin MR/PR, liệt kê MR mở, đăng/cập nhật comment, xác thực và chuẩn hoá webhook thành `ScmEvent`.

## API
- `parseUrl`, `getMergeRequest`, `listOpen`, `isConfigured`.
- `upsertSummaryNote`, `postInline`, `reply`.
- `gitAuth(platform)` → header + secret để clone qua HTTPS.
- `testConnection`, `checkProject`, `createWebhook` (GitLab): kiểm tra token/scope/hạn/repo và tạo webhook; không ném lỗi khi kiểm tra, trả mã lỗi (`unreachable`, `unauthorized`, `missing_scope`, `expired`, `no_projects`).
- `verifyWebhook`, `webhookConfigured`, `parseWebhook` → `ScmEvent`.

## Sự kiện
Không phát, không nhận.

## Dữ liệu
Không có bảng.

## Port
Không cần port.

## Quyết định
- Thông tin đăng nhập là hàm `() => creds` do `app/` truyền vào: đổi token trên UI có hiệu lực ngay, module không đọc env/DB.
- Thêm nền tảng mới = thêm một `PlatformClient` + parser webhook, không đụng module khác.
- Module chỉ chuẩn hoá sự kiện; quyết định "có review hay không" là chính sách của `app/workflows`.
- Webhook không cấu hình secret thì luôn bị từ chối (an toàn mặc định).
