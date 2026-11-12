# reviews

## Trách nhiệm
Lưu và truy vấn lịch sử review: MR, từng lần chạy (run), finding và điểm theo hạng mục; cung cấp dữ kiện thô cho phân tích.

## API
- MR: `upsertMr`, `getMr`, `findMr`, `listMrs`.
- Run: `startRun`, `queueRun`, `beginRun`, `setProvider`, `setStage`, `completeRun`, `failRun`, `findRunByHead`, `latestRunByHead`, `saveActivity`, `failStale`, `latestSucceeded`, `getRun`, `listRuns`, `setFindingFeedback`.
- `facts({ from, to })` → `MrFact[]` (dữ kiện thô, không tính metric).

Mỗi run lưu thêm `frameworkId`/`frameworkVersion` (chấm bằng bản nào), `omittedFiles`, `harnessReport` (JSON độ phủ harness lúc review).

## Sự kiện
Phát `reviews.run.status` (queued → running → từng stage), `reviews.run.completed`, `reviews.run.failed`. Không nhận.

## Dữ liệu
`MergeRequest`, `ReviewRun`, `ReviewFinding`, `ReviewCategoryScore` (prisma/schema/reviews.prisma). `repositoryId` và `memberId` chỉ là ID chuỗi, không relation sang module khác.

## Port
Không cần port ngoài (thời gian qua `Clock` mặc định hệ thống).

## Quyết định
- Không tính điểm hay metric: chỉ ghi nhận kết quả do `scoring` tính và đưa dữ kiện cho `analytics`.
- `firstScore` của MR được ghi một lần ở lần review thành công đầu tiên, để đo chất lượng "khi nộp".
- `completeRun` ghi run + finding + điểm hạng mục + cập nhật MR trong một transaction (transaction nằm gọn trong module).
