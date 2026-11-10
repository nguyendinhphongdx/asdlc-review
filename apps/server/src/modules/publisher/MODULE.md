# publisher

## Trách nhiệm
Dựng nội dung (Markdown) của comment tổng hợp, comment inline và câu trả lời chat từ kết quả review; không gửi đi đâu.

## API
- `renderSummary(report)`, `renderInline(report, { minSeverity, max })`, `renderStatus`, `renderLeaderboard`.
- `summaryMarker`, `inlineMarker` để nền tảng tìm lại comment cũ khi cập nhật.

## Sự kiện
Không phát, không nhận.

## Dữ liệu
Không có.

## Port
Không cần port.

## Quyết định
- Tách "dựng nội dung" khỏi "gửi": việc gửi là của `scm`, ghép hai bên là của `app/workflows`.
- Hỗ trợ `vi` và `en`; minor/nit gộp trong `<details>` để comment gọn.
