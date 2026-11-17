# reviewer

## Trách nhiệm
Dựng prompt từ rubric + harness + diff, chạy provider AI (Claude CLI, Codex CLI, Gemini API (Google cloud), API tương thích OpenAI) và trả về `RawReview` đã kiểm tra schema và chuẩn hoá.

## API
- `review(ReviewRequest)` → `{ review, usage }`.
- `providers()` → danh sách provider **tự mô tả** (`ProviderInfoDto`: kind cli/cloud, `capabilities`, `auth`, model gợi ý, `available`). `describe(id)` / `capabilities(id)` đọc mô tả không I/O.

`ReviewRequest` ngoài rubric/harness/diff còn nhận `notebook` (bộ nhớ repo), `notes` (ghi chú người về MR) và `previousRound` (góp ý vòng trước kèm trạng thái fixed/dismissed/open). Prompt đưa vào AI để kiểm tra lại thay vì bắt đầu từ đầu và không nêu lại mục đã bị bỏ qua. AI cũng trả `overview` theo khung `rubric.overview` (từng mục: text/bullets/verdict, giới hạn từ, hướng dẫn riêng); schema JSON sinh từ khung này.

`classify(files, title)` (T0, không gọi AI) chỉ **gợi ý** loại MR (`MrKind`); loại suy ra từ file (docs/test/deps/config) là `locked`, còn lại AI chốt cuối qua `mrKind` + `mrKindReason` (`resolveKind` kiểm giá trị, `review()` trả `mrKind`/`mrKindChanged`). Với loại cần sơ đồ (đổi luồng, tính năng mới, refactor, đổi API), prompt yêu cầu AI trả `blocks` (flow/architecture/sequence); `review()` trả thêm `blocks` đã làm sạch: bỏ bằng chứng trỏ tới file không có trong diff/cây repo, nút trùng, cạnh trỏ vào nút lạ, khối không được yêu cầu cho loại MR đó. Bảng "loại MR → khối" là `DEFAULT_VIEWS` (framework ghi đè ở bước O6).

`classify(files, title)` (T0, không gọi AI) chỉ **gợi ý** loại MR (`MrKind`); loại suy ra từ file (docs/test/deps/config) là `locked`, còn lại AI chốt cuối qua `mrKind` + `mrKindReason` (`resolveKind` kiểm giá trị, `review()` trả `mrKind`/`mrKindChanged`). Với loại cần sơ đồ (đổi luồng, tính năng mới, refactor, đổi API), prompt yêu cầu AI trả `blocks` (flow/architecture/sequence); `review()` trả thêm `blocks` đã làm sạch: bỏ bằng chứng trỏ tới file không có trong diff/cây repo, nút trùng, cạnh trỏ vào nút lạ, khối không được yêu cầu cho loại MR đó. Bảng "loại MR → khối" là `DEFAULT_VIEWS` (framework ghi đè ở bước O6).

## Sự kiện
Không phát, không nhận.

## Dữ liệu
Không có bảng.

## Port
Không cần port ngoài (I/O qua `infra/`: tiến trình CLI, HTTP).

## Quyết định
- AI chỉ trả findings; không bao giờ tự cho điểm.
- Agent CLI chạy trong worktree chỉ-đọc, chỉ cho phép Read/Grep/Glob, `permission-mode dontAsk`, chỉ nạp setting `project`; file có thể thực thi lệnh đã bị `workspace` gỡ.
- Prompt coi diff/file repo là dữ liệu không tin cậy (chống prompt injection).
- Provider HTTP không có công cụ đọc repo: harness được nhồi đủ nội dung vào prompt.
- AI không giữ phiên giữa các vòng (`--no-session-persistence`): mọi "trí nhớ" đến từ bộ nhớ repo, ghi chú MR và `previousRound` trong prompt.
- Thử lại một lần khi JSON sai schema; lỗi hạ tầng (CLI, mạng) không thử lại ở đây.

## Provider tự mô tả (quy ước mở rộng)
Mỗi provider khai báo một `ProviderDescriptor` cạnh bản cài đặt (`infra/*.ts`): `capabilities` (review, chat, repoAccess, chatTools, images), `auth` (`none` hoặc `apiKey{keyId, envName, optional}`) và `models` gợi ý. Code khác **không so tên provider** mà đọc khả năng: prompt đưa harness vào hay để agent tự đọc theo `repoAccess`; chat mở công cụ theo `chatTools`; ảnh theo `images`.
Thêm provider mới = viết `infra/<tên>.ts` (provider + descriptor) và thêm một dòng vào `registry` ở `api.ts`. Cài đặt (`providerModels`, `aiRoles`), ô nhập khoá (`/api/ai-keys/:keyId`) và giao diện chọn provider/model tự có, không cần thêm khoá cài đặt hay sửa web.
