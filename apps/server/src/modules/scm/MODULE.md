# scm

## Trách nhiệm
Làm việc với nền tảng Git (GitLab, GitHub): lấy thông tin MR/PR, liệt kê MR mở, đăng/cập nhật comment, xác thực và chuẩn hoá webhook thành `ScmEvent`.

## API
- `parseUrl`, `getMergeRequest`, `listOpen`, `isConfigured`.
- `upsertSummaryNote`, `postInline`, `reply`.
- `gitAuth(platform)` → header + secret để clone qua HTTPS.
- `verifyWebhook`, `webhookConfigured`, `parseWebhook` → `ScmEvent`.

## Sự kiện
Không phát, không nhận.

## Dữ liệu
Không có bảng.

## Port
Không cần port.

## Quyết định
- Thêm nền tảng mới = thêm một `PlatformClient` + parser webhook, không đụng module khác.
- Module chỉ chuẩn hoá sự kiện; quyết định "có review hay không" là chính sách của `app/workflows`.
- Webhook không cấu hình secret thì luôn bị từ chối (an toàn mặc định).
