# analysis

## Trách nhiệm
Phát hiện tất định các vấn đề có thể nhận biết bằng luật từ diff (secret, code debug, test bị skip, tắt lint, MR quá lớn, thiếu test, mô tả trống).

## API
- `analyze({ diff, files, mrDescription?, ignore? })` → `{ findings, changedLines, ignoredFiles }`.

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
