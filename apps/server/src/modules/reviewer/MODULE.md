# reviewer

## Trách nhiệm
Dựng prompt từ rubric + harness + diff, chạy provider AI (Claude CLI, Codex CLI, Gemini API (Google cloud), API tương thích OpenAI) và trả về `RawReview` đã kiểm tra schema và chuẩn hoá.

## API
- `review(ReviewRequest)` → `{ review, usage }`.
- `providers()` → danh sách provider và trạng thái sẵn sàng.

`ReviewRequest` ngoài rubric/harness/diff còn nhận `notebook` (bộ nhớ repo), `notes` (ghi chú người về MR) và `previousRound` (góp ý vòng trước kèm trạng thái fixed/dismissed/open). Prompt đưa vào AI để kiểm tra lại thay vì bắt đầu từ đầu và không nêu lại mục đã bị bỏ qua. AI cũng trả `overview` theo khung `rubric.overview` (từng mục: text/bullets/verdict, giới hạn từ, hướng dẫn riêng); schema JSON sinh từ khung này.

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
