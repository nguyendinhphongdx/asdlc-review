# secrets

## Trách nhiệm
Lưu secret do người dùng nhập từ UI (token GitLab, secret webhook) dưới dạng mã hoá, và đọc lại cho app dùng. Không hiểu secret dùng để làm gì.

## API
- `load()`: nạp + giải mã toàn bộ vào bộ nhớ lúc khởi động (secret hỏng/sai khoá bị liệt kê, không làm sập).
- `peek(key)`: đọc đồng bộ từ bộ nhớ. `hint(key)`: 4 ký tự cuối.
- `set(key, value)`, `delete(key)`. `canStore`: có khoá mã hoá hợp lệ hay không.

## Sự kiện
Không phát, không nhận.

## Dữ liệu
`Secret` (prisma/schema/secrets.prisma): `key`, `ciphertext` (base64 của iv|tag|dữ liệu, AES-256-GCM), `updatedAt`.

## Port
Không cần port.

## Quyết định
- Khoá mã hoá do `app/` cấp (biến `MRD_SECRET_KEY`, hoặc file `secret.key` tự tạo quyền 0600 trong thư mục dữ liệu; app desktop dùng keychain hệ điều hành). Khoá **không** nằm trong DB: lộ file DB không lộ token.
- API không có hàm nào trả toàn bộ danh sách giá trị; controller ở `app/` quyết định field nào được ra client (token thì không bao giờ ra, chỉ `hint`).
- Thay quy định cũ "secret chỉ nằm trong env" của `settings`: `settings` vẫn không giữ secret; nơi duy nhất giữ secret là module này. Biến môi trường vẫn được dùng làm giá trị dự phòng (ưu tiên DB).
