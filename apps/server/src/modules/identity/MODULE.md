# identity

## Trách nhiệm
Quản lý thành viên team và ánh xạ nhiều tài khoản (GitLab/GitHub/email) về một người, để thống kê và leaderboard theo người thay vì theo username.

## API
- `list`, `get`, `create`, `update`, `remove`.
- `resolve(platform, username)` → memberId hoặc null; `resolveOrCreate(...)` tự tạo thành viên khi chưa có.

## Sự kiện
Phát `identity.member.changed`. Không nhận.

## Dữ liệu
`Member`, `MemberIdentity` (prisma/schema/identity.prisma). Username được chuẩn hoá chữ thường.

## Port
Không cần port ngoài.

## Quyết định
- Một tài khoản chỉ thuộc một thành viên (kiểm bằng ràng buộc unique + kiểm trước khi ghi).
- Tự tạo thành viên cho tác giả chưa biết để leaderboard chạy ngay không cần cấu hình tay; admin gộp/sửa sau.
