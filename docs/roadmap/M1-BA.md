# M1 — Framework & harness nhìn thấy và chỉnh được: phân tích nghiệp vụ (BA)

Trạng thái: **chờ duyệt** (cổng để sang bước Code của design; xem [M1-DESIGN.md](M1-DESIGN.md)).

## Mục tiêu
Team lead biết agent đang chấm theo rule nào, chỉnh được bộ tiêu chí mà không sửa code, chọn bộ tiêu chí phù hợp cho từng repo, và biết repo nào có harness tốt hay chưa.

## Hiện trạng (đã kiểm tra trong code)
- Một framework duy nhất `frameworks/asdlc/framework.yaml` (7 hạng mục, ~40 rule, severity, gate, xếp loại), đọc từ file; module `framework` có `list/get/resolve`.
- Repo ghi đè bằng `.asdlc.yml` (đọc từ base commit). Mỗi repo có thể chọn `frameworkId` nhưng chỉ có một framework để chọn.
- Trang **Framework** (chỉ xem) đã có: quy trình, hạng mục/rule, cách chấm điểm.
- Chưa có: sửa rule/trọng số/ngưỡng trên UI, lịch sử thay đổi, nhiều framework, điểm "độ phủ harness", trình xem `.asdlc.yml`, ghi nhận phiên bản framework vào từng review.

## Người dùng
- **Team lead / admin**: chỉnh framework, gán framework cho repo.
- **Tác giả MR**: muốn biết MR của mình bị chấm theo tiêu chí nào và sửa harness của repo để review tốt hơn.

## User story và tiêu chí chấp nhận

**US-1. Xem framework đang dùng**
- AC1: trang Framework liệt kê các framework (mặc định + tự tạo), mỗi cái có phiên bản, số hạng mục/rule, số repo đang dùng.
- AC2: xem được từng rule: id, mức độ, câu kiểm tra, câu hỏi cho tác giả, đang bật hay tắt.

**US-2. Chỉnh framework**
- AC3: admin sửa được trọng số hạng mục, mức độ mặc định của rule, bật/tắt rule, điểm trừ theo severity, gate, ngưỡng xếp loại; thêm/sửa rule tự viết (id, tên, câu kiểm tra, câu hỏi).
- AC4: mọi giá trị được kiểm tra hợp lệ trước khi lưu (trọng số > 0, id duy nhất, gate trỏ tới rule/hạng mục có thật); lỗi nêu rõ trường nào sai.
- AC5: **bản mặc định có sẵn không bị sửa trực tiếp**: sửa = tạo một bản sao ("fork") có thể chỉnh; luôn có nút "Khôi phục về mặc định" và so sánh khác biệt với bản gốc.
- AC6: mỗi lần lưu tạo một **phiên bản mới** (số tăng dần, người sửa, thời điểm, ghi chú); xem được lịch sử và quay lại phiên bản cũ.
- AC7: sau khi lưu, **review kế tiếp** dùng rule mới; các review đã chấm giữ nguyên điểm cũ và ghi rõ chấm bằng framework/phiên bản nào.

**US-3. Chọn framework cho repo**
- AC8: mỗi repo chọn một framework (mặc định hoặc bản tự tạo); đổi có hiệu lực từ review kế tiếp.
- AC9: có ít nhất 3 mẫu framework dựng sẵn để fork: **Web** (frontend), **Backend/API**, **Mobile**; mỗi mẫu khác nhau ở trọng số/rule phù hợp lĩnh vực.
- AC10: `.asdlc.yml` của repo vẫn ghi đè được (ưu tiên: `.asdlc.yml` > framework gán cho repo > mặc định) và UI hiển thị rubric **sau khi gộp**.

**US-4. Harness của repo**
- AC11: mỗi repo có trang "Harness" cho biết tìm thấy tài liệu nào (AGENTS.md, CLAUDE.md, rules, tài liệu kiến trúc, `.asdlc.yml`), và **điểm độ phủ harness** (0–100) kèm danh sách gợi ý còn thiếu.
- AC12: điểm độ phủ tính tất định bằng code (không dùng AI), công thức công khai trong `docs/HARNESS.md`.
- AC13: trình xem `.asdlc.yml`: báo hợp lệ/không, chỉ rõ dòng/trường sai, và preview rubric sau khi gộp; nội dung `.asdlc.yml` coi là dữ liệu không tin cậy (không cho nới gate hay tắt rule bảo mật quá mức quy định ở framework gốc).

**US-5. Tài liệu**
- AC14: `docs/FRAMEWORK.md` (cấu trúc rubric, cách viết rule tốt), `docs/HARNESS.md` (cách viết AGENTS.md/rules để review hiệu quả, công thức độ phủ), tham chiếu `.asdlc.yml` đầy đủ.

## Ngoài phạm vi (M1)
Chỉnh prompt hệ thống của AI; chạy lại (re-score) hàng loạt review cũ bằng framework mới; chia sẻ framework giữa nhiều tổ chức; phân quyền ai được sửa (M4: hiện coi mọi người dùng là admin); gợi ý rule bằng AI.

## Rủi ro
| Rủi ro | Giảm thiểu |
|---|---|
| Sửa rule làm điểm các review cũ và leaderboard đổi theo, mất tính so sánh | Lưu `frameworkId + version` trong từng review run; không tính lại điểm cũ (AC7) |
| Người dùng tắt hết rule bảo mật / nới gate, điểm mất ý nghĩa | Gate `secret-leak` và `critical-security` không tắt được; hiển thị cảnh báo khi điểm tối đa có thể đạt thay đổi |
| `.asdlc.yml` độc hại cố tắt rule hoặc chèn chỉ thị vào prompt | Giữ cơ chế hiện có: đọc từ base commit, validate bằng schema, giới hạn quyền ghi đè (AC13) |
| Framework tự viết rule mơ hồ, AI báo nhiều finding rác | Hướng dẫn viết rule tốt, hiển thị ví dụ; thống kê tỉ lệ finding theo rule sẽ làm ở M7 |
| Điểm độ phủ harness bị "game" (tạo file rỗng) | Chỉ tính file có nội dung tối thiểu; điểm chỉ là gợi ý, không dùng chặn MR |

## Quyết định cần bạn chốt
- **D1 — Nơi lưu framework tự tạo.** (A, đề xuất) DB, bảng riêng `framework` có phiên bản; mặc định vẫn là file YAML trong repo mã nguồn, chỉ đọc. (B) Ghi trực tiếp vào file YAML: đơn giản nhưng không có lịch sử/người sửa và không dùng được khi chạy bản đóng gói.
- **D2 — Mẫu dựng sẵn.** (A, đề xuất) 3 mẫu Web/Backend/Mobile, tôi soạn nội dung ban đầu để bạn rà. (B) Chỉ bản mặc định, bạn tự fork.
- **D3 — Giới hạn quyền ghi đè của `.asdlc.yml`.** (A, đề xuất) Chỉ được: thêm docs/ignore/ghi chú, đổi mức độ rule, thêm rule; **không** được tắt rule bảo mật hay nới gate. (B) Giữ như hiện tại (cho phép nhiều hơn).

## Cách nghiệm thu
Duyệt từng AC1–AC14 bằng test tự động (validate rubric, gộp `.asdlc.yml` hợp lệ/sai/độc hại, phiên bản hoá không đổi điểm cũ, công thức độ phủ) và kiểm tra trên UI thật.
