# M2 — Agent chat-centric và biết học

## Mục tiêu
Màn review là **một cuộc trò chuyện với agent** quanh MR: agent chạy review (tiến trình hiện ngay trong chat), trả lời câu hỏi về finding, nhận chỉnh sửa của con người, và **tích luỹ bài học** để các lần review sau chặt hơn. Điểm số vẫn do code tính (`modules/scoring`), agent không tự đổi điểm.

## Nguyên tắc
- Học **có kiểm soát**: bài học agent đề xuất ở trạng thái `proposed`; con người **duyệt** mới thành `active` và mới vào prompt review.
- Bài học thuộc **một repo** (sổ tay của repo). Chưa có thăng cấp lên framework dùng chung (để M2c).
- Chat **không có công cụ** (không đọc/ghi repo, không đăng lên MR): chỉ dựa vào kết quả review đã lưu + sổ tay → an toàn, rẻ.
- Nội dung MR/diff là dữ liệu không tin cậy; bài học chỉ do người dùng viết hoặc duyệt.

## Luồng
1. Mở MR → thấy hội thoại; khi run đang chạy, tiến trình SSE hiện như tin nhắn của agent.
2. Người dùng hỏi ("vì sao finding này nghiêm trọng?") → agent trả lời dựa trên run gần nhất.
3. Người dùng ra lệnh: `review lại` (xếp hàng review ép), `nhớ: <điều cần nhớ>` (thành bài học `active` ngay vì chính người dùng viết).
4. Khi người dùng chỉnh/giải thích, agent kèm dòng `LESSON: …`; hệ thống tách thành bài học `proposed`, hiện nút **Duyệt / Bỏ**.
5. (M2b) Finding bị bấm "Không đồng ý" sẽ gợi ý tạo bài học (tín hiệu học từ phản hồi).
6. Review kế tiếp nạp **sổ tay đang bật** của repo vào prompt ("Team lessons").

## Thiết kế kỹ thuật
- Module mới `modules/agent` (độc lập, không import module khác): bảng `AgentMessage` (mrId, role, text, createdAt) và `AgentLesson` (repoId, text, status, source, mrId?, createdAt).
- `reviewer` có thêm `ask()` (claude-cli, không tool) và nhận `notebook` trong `ReviewRequest`.
- `app/workflows/agent-chat.ts` điều phối: lưu tin nhắn → lệnh/hỏi đáp → tách `LESSON:`.
- API: `GET/POST /api/mrs/:id/chat`, `GET /api/repos/:id/lessons`, `POST /api/lessons/:id/{approve,reject}`, `DELETE /api/lessons/:id`.
- Web: `features/reviews/chat.tsx` (khung chat + log SSE + bài học đề xuất).

## Lộ trình tiếp
- M2b: đề xuất bài học tự động từ finding bị bác lặp lại / lỗi lặp lại.
- M2c: thăng cấp bài học dùng chung nhiều repo lên framework; đối chiếu comment của người thật trên GitLab sau review.
