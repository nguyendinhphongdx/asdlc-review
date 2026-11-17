# settings

## Trách nhiệm
Lưu cấu hình runtime có thể chỉnh từ UI (provider mặc định, bật/tắt comment, ngưỡng đạt...), ghi đè mặc định lấy từ env.

## API
- `snapshot()`, `get(key)`, `update(patch)` (validate bằng zod theo từng khoá).

## Sự kiện
Phát `settings.changed`. Không nhận.

## Dữ liệu
`Setting` (prisma/schema/settings.prisma): key → JSON.

## Port
Không cần port ngoài.

## Quyết định
- Chỉ cho phép các khoá khai báo trong `domain/keys.ts`. Secret (token, API key) không đi qua đây: chúng nằm trong module `secrets` (mã hoá) hoặc env.
- Mặc định do app truyền vào (`deps.defaults`), module không đọc env.

## Khoá dạng bản đồ
`providerModels` (model theo id provider) và `aiRoles` (vai trò dùng AI như `chat` → provider/model) là bản đồ mở: thêm provider hay vai trò mới không cần thêm khoá. Cập nhật gộp từng mục. Cài đặt kiểu cũ (`claudeModel`, `chatProvider`…) được chuyển tự động khi đọc (`migrateLegacy`). App chọn provider/model cho một vai trò qua `resolveAi` (`app/workflows/mappers.ts`).
