# framework

## Trách nhiệm
Giữ bộ tiêu chí (rubric) ASDLC dạng dữ liệu YAML và áp cấu hình riêng của repo (`.asdlc.yml`) để ra `Rubric` cuối cùng.

## API
- `list()`, `get(id)`: xem framework.
- `resolve({ frameworkId?, repoConfigYaml? })` → `{ rubric, repoConfig, repoConfigError? }`.

## Sự kiện
Không phát, không nhận.

## Dữ liệu
Không có bảng. Đọc `frameworks/<id>/framework.yaml` (thư mục truyền qua `deps.frameworksDir`).

## Port
Không cần port ngoài.

## Quyết định
- Hiểu `.asdlc.yml` là việc của module này; `harness` chỉ tìm và đưa nội dung thô.
- `Rubric` nằm ở `packages/contracts` vì là vocabulary chung giữa framework → reviewer → scoring.
