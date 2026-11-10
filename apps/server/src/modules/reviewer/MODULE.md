# reviewer

## Trách nhiệm
Dựng prompt từ rubric + harness + diff, chạy provider AI (Claude CLI, Codex CLI, API tương thích OpenAI) và trả về `RawReview` đã kiểm tra schema và chuẩn hoá.

## API
- `review(ReviewRequest)` → `{ review, usage }`.
- `providers()` → danh sách provider và trạng thái sẵn sàng.

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
- Thử lại một lần khi JSON sai schema; lỗi hạ tầng (CLI, mạng) không thử lại ở đây.
