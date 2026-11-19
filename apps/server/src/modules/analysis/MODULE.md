# analysis

## Trách nhiệm
Phát hiện tất định các vấn đề có thể nhận biết bằng luật từ diff (secret, code debug, test bị skip, tắt lint, MR quá lớn, thiếu test, mô tả trống).

## API
- `analyze({ diff, files, mrDescription?, ignore? })` → `{ findings, changedLines, ignoredFiles }`.
- `areas({ files, diff?, maxAreas? })` → `ChangeAreaDto[]` (T0): gom file theo module/thư mục (test đi cùng code nguồn, file sinh tự động bị bỏ), tính rủi ro (đường dẫn nhạy cảm, cỡ, đổi code không đổi test) và phụ thuộc giữa các khu vực (từ dòng import thêm vào trong diff). Sắp xếp rủi ro giảm dần; quá `maxAreas` (8) thì gộp khu vực nhỏ nhất vào `other`.
- `shouldSplit({ files, lines, areas, omitted })` → có review theo khu vực không (diff vượt ngân sách, hoặc >15 file/>1200 dòng với ≥2 khu vực).
- `splitDiff(diff)` / `packDiff(paths, byFile, budget)` / `digest(areas, byFile)`: tách diff theo file, gói diff một khu vực thành các phần vừa ngân sách (file quá lớn trả trong `omitted`), tóm lược diff (file + tiêu đề hunk) cho tầng thiết kế.

## Sự kiện
Không phát, không nhận.

## Dữ liệu
Không có.

## Port
Không cần port.

## Quyết định
- Finding tĩnh có `source: "static"` và confidence cao; được đưa cho reviewer AI làm bằng chứng và tính điểm như finding thường.
- Category phát ra bám phân loại mặc định của framework ASDLC; `scoring` ưu tiên map theo `ruleId` trong rubric.
- Evidence của secret luôn bị che, không bao giờ ghi giá trị thật.
