# framework

## Trách nhiệm
Giữ các bộ tiêu chí (rubric): bản mặc định + mẫu từ file YAML (chỉ đọc) và bản tự tạo (fork) trong DB có lịch sử phiên bản. Áp `.asdlc.yml` của repo để ra `Rubric` cuối cùng; kiểm tra các giới hạn bảo mật nền.

## API
- `list()`, `detail(id, version?)`, `get(id)` (rubric hiện hành đã lọc rule tắt).
- `fork({baseId, name})`, `update(id, edit)` (tạo phiên bản mới), `restore(id, version)`, `remove(id)`, `diffFromBase(id)`.
- `previewPatch(id, ops)` (kiểm tra thử, không lưu; dùng được cho bản chỉ đọc) và `patch(id, ops, note)` (áp danh sách thay đổi nhỏ `FrameworkOp[]` thành phiên bản mới, qua cùng `validateEdit` nên rule/gate locked vẫn được giữ). Dùng bởi chat AI cải thiện framework.
- Rubric có thêm `overview` (khung "Đánh giá tổng quan": hướng dẫn chung + các mục có thứ tự, kiểu text/bullets/verdict, số từ tối đa, hướng dẫn từng mục, nhãn verdict) và `mrDescription` (chuẩn mô tả MR: danh sách tài liệu bắt buộc/không bắt buộc theo `pattern`, điểm phạt). Thiếu thì dùng `DEFAULT_OVERVIEW`/`DEFAULT_MR_DESCRIPTION`. `.asdlc.yml` không ghi đè được hai phần này.
- `previewConfig({yaml, frameworkId?})` → hợp lệ/lỗi/thay đổi.
- `resolve({ frameworkId?, repoConfigYaml? })` → `{ rubric, repoConfig, repoConfigError? }`; `rubric.version` là nhãn phiên bản dùng để chấm.

## Sự kiện
Không phát, không nhận.

## Dữ liệu
`CustomFramework`, `FrameworkVersion` (prisma/schema/framework.prisma): nội dung từng phiên bản là JSON của `FrameworkFile`. Bản mặc định/mẫu: `frameworks/<id>/framework.yaml` (thư mục truyền qua `deps.frameworksDir`).

## Port
Không cần port ngoài. "Có repo nào đang dùng framework này không" do `app/` kiểm tra (chặn xoá) vì module không biết `repos`.

## Quyết định
- Bản mặc định/mẫu không sửa trực tiếp: muốn chỉnh phải fork. Lịch sử cho phép khôi phục (tạo phiên bản mới, không ghi đè).
- Cờ `locked` (SEC-01, gate secret-leak/critical-security) do server giữ; chỉnh sửa và `.asdlc.yml` không tắt/hạ/nới được. Phần vi phạm của `.asdlc.yml` bị bỏ qua và báo trong `repoConfigError`, review vẫn chạy.
- Framework gán cho repo bị xoá thì `resolve` dùng mặc định.
- Hiểu `.asdlc.yml` là việc của module này; `harness` chỉ tìm và đưa nội dung thô.
- `Rubric` nằm ở `packages/contracts` vì là vocabulary chung giữa framework → reviewer → scoring.
