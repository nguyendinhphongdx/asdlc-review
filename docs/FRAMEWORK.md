# Framework: bộ tiêu chí review

Framework là bộ tiêu chí mà agent dùng để review và mà `modules/scoring` dùng để chấm điểm. Điểm luôn do code tính từ finding; AI chỉ báo finding.

## Các loại framework
| Loại | Nơi lưu | Sửa được |
|---|---|---|
| **Mặc định** (`asdlc`) | `frameworks/asdlc/framework.yaml` | Không (chỉ đọc) |
| **Mẫu** (`web`, `backend`, `mobile`) | `frameworks/<id>/framework.yaml` | Không (chỉ đọc) |
| **Tự tạo** (fork) | DB (`CustomFramework`, `FrameworkVersion`) | Có, mỗi lần lưu là một phiên bản |

Muốn chỉnh: **Framework → Tạo từ mẫu** (hoặc "Tạo bản chỉnh sửa" từ bản đang xem). Bản fork sao chép nội dung của bản gốc tại thời điểm fork.

## Cấu trúc
```yaml
id: asdlc
name: ASDLC Core Review Framework
version: 1.0.0
severity: { blocker: { deduction: 35, label: Blocker, description: "..." }, ... }   # điểm trừ theo mức độ
gates:                                  # trần điểm tổng
  - { id: secret-leak, when: { ruleIds: [SEC-01] }, capTotal: 30, reason: "...", locked: true }
grades: [ { grade: A, min: 90 }, ... ]  # phải có ngưỡng 0
sizeBaseline: 200                       # minor/nit được chia cho sqrt(dòng thay đổi / baseline)
categories:
  - id: security
    name: Bảo mật
    weight: 16                          # trọng số trong điểm tổng
    criteria:
      - { id: SEC-01, title: ..., check: ..., why: ..., defaultSeverity: blocker, enabled: true, locked: true }
```
Điểm mỗi hạng mục bắt đầu 100, trừ theo `severity × độ tin cậy`; điểm tổng là trung bình có trọng số; sau đó áp gate. Chi tiết công thức: [SCORING.md](SCORING.md).

## Quy tắc bảo mật nền (`locked`)
Rule `SEC-01` (lộ secret) và gate `secret-leak`, `critical-security` luôn áp dụng. Với bản fork và với `.asdlc.yml`: không tắt rule, không hạ mức độ, không xoá gate, không nới trần gate. Server kiểm tra; cờ `locked` do server giữ, client không đổi được.

## Phiên bản
Mỗi lần lưu bản fork tạo phiên bản mới (số tăng dần, người sửa, ghi chú). Có thể xem phiên bản cũ và **khôi phục** (tạo phiên bản mới có nội dung cũ). Mỗi review ghi lại framework và phiên bản dùng để chấm (`frameworkId`, `frameworkVersion`); review đã chấm **không bị tính lại** khi framework đổi.

## Chọn framework cho repo
Repo → Framework. Thứ tự ưu tiên khi chấm: **`.asdlc.yml` của repo** > framework gán cho repo > framework mặc định hệ thống. Nếu framework gán cho repo bị xoá, review dùng mặc định; không thể xoá framework đang có repo dùng.

## `.asdlc.yml` (ở root repo)
Đọc từ **commit gốc của nhánh đích**, không đọc bản do MR gửi lên. Coi là dữ liệu không tin cậy.
```yaml
framework: backend            # chọn framework nền (tuỳ chọn)
language: vi
weights: { security: 25 }     # đổi trọng số hạng mục
disable: [CON-03]             # tắt rule thường (KHÔNG tắt được rule locked)
extraRules:                   # thêm rule riêng; id không được trùng
  - { id: ACM-02, category: conventions, title: Dùng logger, check: "Không dùng console.log", why: "...", defaultSeverity: major }
docs: [docs/ARCHITECTURE.md, docs/features/**]   # tài liệu agent nên đọc
ignore: [dist/**, "**/*.generated.ts"]
notes: "Ghi chú thêm cho agent"
```
Phần vi phạm (tắt rule locked, id trùng, hạng mục/rule không tồn tại) **bị bỏ qua**; review vẫn chạy và comment tổng ghi cảnh báo. Dùng **Repository → Harness → trình xem `.asdlc.yml`** để kiểm tra trước khi commit.

## Viết rule tốt
- **Cụ thể và kiểm chứng được từ code**: "Endpoint POST tạo giao dịch phải nhận Idempotency-Key" tốt hơn "code phải sạch".
- **Một rule một ý.** Rule gộp nhiều ý sinh finding mơ hồ.
- **`why` là câu hỏi cho tác giả**: "Nếu client retry thì giao dịch có bị tạo hai lần không?".
- **Chọn mức độ theo hậu quả**: blocker/critical cho mất dữ liệu, bảo mật; major cho vi phạm bắt buộc; minor/nit cho gu.
- Đừng thêm quá nhiều rule: AI ưu tiên ít finding giá trị cao. Thống kê tỉ lệ finding theo rule sẽ có ở M7.
