# reviews

## Trách nhiệm
Lưu và truy vấn lịch sử review: MR, từng lần chạy (run), finding và điểm theo hạng mục; cung cấp dữ kiện thô cho phân tích.

## API
- MR: `upsertMr`, `getMr`, `findMr`, `listMrs`.
- Run: `startRun`, `queueRun`, `beginRun`, `setProvider`, `setStage`, `completeRun`, `failRun`, `findRunByHead`, `latestRunByHead`, `saveActivity`, `failStale`, `latestSucceeded`, `getRun`, `listRuns`, `setFindingFeedback`, `ruleStats(frameworkId, limitRuns?)` (số finding + phản hồi agree/disagree/fixed theo rule trên các run thành công gần nhất của framework).
- `facts({ from, to })` → `MrFact[]` (dữ kiện thô, không tính metric).

Mỗi run lưu thêm `frameworkId`/`frameworkVersion` (chấm bằng bản nào), `omittedFiles`, `harnessReport` (JSON độ phủ harness lúc review), `overview` ("Đánh giá tổng quan" theo khung framework), `mrContext` (tiêu đề/mô tả MR + kết quả kiểm tra tài liệu theo chuẩn → `mrDescription` ở DTO) và `aiContext` (bộ nhớ repo, ghi chú MR, kết quả vòng trước đã nạp cho AI + kích thước từng nguồn → để tab "Ngữ cảnh AI" giải thích AI "biết gì").

## Sự kiện
Phát `reviews.run.status` (queued → running → từng stage), `reviews.run.completed`, `reviews.run.failed`, `reviews.run.cancelled` (người dùng dừng; `cancelRun` chỉ áp dụng cho run còn queued/running). Không nhận.

## Dữ liệu
`MergeRequest`, `ReviewRun`, `ReviewFinding`, `ReviewCategoryScore`, `DesignMapCache` (prisma/schema/reviews.prisma). `repositoryId` và `memberId` chỉ là ID chuỗi, không relation sang module khác.

## Port
Không cần port ngoài (thời gian qua `Clock` mặc định hệ thống).

## Quyết định
- Không tính điểm hay metric: chỉ ghi nhận kết quả do `scoring` tính và đưa dữ kiện cho `analytics`.
- `firstScore` của MR được ghi một lần ở lần review thành công đầu tiên, để đo chất lượng "khi nộp".
- `completeRun` ghi run + finding + điểm hạng mục + cập nhật MR trong một transaction (transaction nằm gọn trong module).

## Khu vực & thiết kế (review MR lớn)
Run lưu `areaReport` (JSON `AreaReportDto`: khu vực T0, đánh giá thiết kế T3, lượt review từng khu vực T4, mô tả thiết kế T2). Bảng `DesignMapCache` (repoId + baseSha + areaId → text) cache T2 qua `getDesignMap`/`saveDesignMap`; bản cũ hơn 60 ngày bị xoá khi ghi.

## Chi phí theo việc
Bảng `RunUsage`: mỗi dòng là một lần gọi AI (`kind` = review | synthesis | design_map | design | area | chat, `label` = khu vực/lượt hoặc câu hỏi chat) với 4 loại token, chi phí, thời lượng. Ghi bằng `recordUsage` (nuốt lỗi: thống kê không được làm hỏng review); chat gắn vào run thành công mới nhất của MR. `usageOfRun(runId)` cho tab Nhật ký, `usageTasks(range)` cho trang Usage. Tổng của run (`ReviewRun.costUsd/…Tokens`) vẫn giữ nguyên; review cũ không có dòng nào.
