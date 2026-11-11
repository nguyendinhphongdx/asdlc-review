# repos

## Trách nhiệm
Sổ đăng ký các repo được theo dõi và cấu hình theo từng repo (framework, provider AI, bật/tắt, tự động review).

## API
- `list`, `get`, `find(platform, fullPath)`, `register` (idempotent), `update`, `remove`, `markPolled`.
- `logWebhook`, `webhookSummary`, `webhookStatuses`: nhật ký sự kiện webhook và trạng thái ok/none/bad.

## Sự kiện
Phát `repos.repo.changed`. Không nhận.

## Dữ liệu
`Repository`, `WebhookEvent` (prisma/schema/repos.prisma). `WebhookEvent` khoá theo `repoKey` chuỗi (không quan hệ), giữ 50 dòng gần nhất mỗi repo.

## Port
Không cần port ngoài.

## Quyết định
- Repo được đăng ký tự động khi gặp lần đầu (webhook/manual); admin chỉnh cấu hình sau.
- Không chứa chính sách "có review MR này không": đó là việc của workflow `request-review`.
