# analytics

## Trách nhiệm
Tính metric, bảng xếp hạng (leaderboard) và báo cáo kỳ từ dữ kiện review thô; xuất Markdown/CSV.

## API
- `overview(range)`, `leaderboard(range)`, `report(range)`, `exportMarkdown(range)`, `exportCsv(range)`.

## Sự kiện
Không phát, không nhận (đọc theo yêu cầu, không giữ trạng thái).

## Dữ liệu
Không có bảng riêng; tính trực tiếp từ dữ kiện nhận qua port. Nếu khối lượng lớn, có thể thêm bảng tổng hợp và đăng ký sự kiện `reviews.run.completed` mà không đổi API.

## Port
- `RunFactsSource.facts(range)`: dữ kiện MR + run + finding (adapter gọi `reviews.facts`).
- `MemberDirectory.list()`: thành viên và username (adapter gọi `identity.list`).
- `Params.passScore()`: ngưỡng đạt (adapter gọi `settings`).

## Quyết định
- Số vi phạm đếm trên lần review ĐẦU của mỗi MR trong kỳ (đo chất lượng khi nộp); điểm "cuối" lấy lần review gần nhất.
- Xếp hạng bằng Bayesian average của điểm lần đầu (C = 5) để người ít MR không vượt người nhiều MR ổn định.
- Hàm tính là thuần (`domain/metrics.ts`), test không cần DB.
