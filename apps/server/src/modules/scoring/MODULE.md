# scoring

## Trách nhiệm
Biến danh sách finding và rubric thành điểm 0–100, grade, gate và verdict một cách tất định.

## API
- `score({ rubric, findings, changedLines })` → `ScoreResult` (hàm thuần, đồng bộ).

## Sự kiện
Không phát, không nhận.

## Dữ liệu
Không có.

## Port
Không cần port.

## Quyết định
- LLM không tự cho điểm: điểm chỉ do module này tính (docs/SCORING.md).
- Finding `question`/`praise` và confidence < 0.4 không trừ điểm; gate cần confidence ≥ 0.5.
- minor/nit được chia theo √(changedLines/baseline) để MR lớn không bị phạt dồn.
