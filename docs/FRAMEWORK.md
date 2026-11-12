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

## Đánh giá tổng quan (`overview`) và chuẩn mô tả MR (`mrDescription`)
Hai phần này nằm trong framework nên tuỳ biến sâu theo đội; `.asdlc.yml` của repo không ghi đè được.
```yaml
overview:
  guide: "Giọng văn chung cho cả phần tổng quan"
  sections:
    - { id: what, title: MR này làm gì, kind: text, maxWords: 90, guide: "…", enabled: true }
    - { id: simpler, title: Có cách đơn giản hơn?, kind: verdict, verdicts: [Không, "Có, đáng thử trước", "Có, nên làm thay"], maxWords: 100, guide: "…" }
mrDescription:
  penalty: 5                            # mức phạt mỗi tài liệu bắt buộc thiếu (0–30): ≥8 → major, ≥3 → minor, còn lại nit; 0 = chỉ cảnh báo, không finding
  docs:
    - { kind: Tài liệu thiết kế, required: true, pattern: "docs/.*\\.md|notion\\.so", hint: "Dán link thiết kế" }
```
- **Overview**: mỗi mục có thứ tự, bật/tắt, kiểu (`text` đoạn văn, `bullets` gạch đầu dòng, `verdict` chọn một nhãn kèm lý do), giới hạn từ và hướng dẫn riêng. Mặc định có 5 mục (MR làm gì, cách giải quyết, vì sao chọn cách này, có cách đơn giản hơn không, nhìn từ xa) và một mục "Đề xuất" tắt sẵn. Sửa ở Framework → Chỉnh sửa.
- **Chuẩn mô tả MR**: mỗi tài liệu có `pattern` (regex, không phân biệt hoa thường) dò trong phần mô tả MR. Thiếu tài liệu `required` thì (khi `penalty` > 0) sinh một finding tĩnh với mức độ suy từ `penalty`, rồi được chấm như finding thường; trang review hiện mô tả MR kèm trạng thái từng tài liệu. Mặc định không đòi tài liệu nào.

## Bộ nhớ của AI
AI không giữ phiên giữa các lần review. "Trí nhớ" đến từ ba tầng, đều nạp vào prompt và ghi lại ở tab **Ngữ cảnh AI** của từng review:
| Tầng | Ở đâu | Nội dung |
|---|---|---|
| Framework | Framework | Tiêu chí, khung tổng quan, chuẩn mô tả MR (tuỳ biến toàn đội) |
| Repo | Repository → **Bộ nhớ** | Quy ước, kiến trúc, thứ cần bỏ qua, thuật ngữ; có thể giới hạn theo path (glob). Chỉ mục **đã duyệt** mới nạp; AI đề xuất thì chờ bạn duyệt. Ngân sách tham khảo ~4k token. Mâu thuẫn với harness (AGENTS.md…) thì harness thắng |
| MR | Review → **Ngữ cảnh AI** | Ghi chú của người về riêng MR đó, và danh sách góp ý vòng trước kèm trạng thái (đã xử lý / bỏ qua / còn mở) để vòng sau kiểm tra lại và không nêu lại mục đã bỏ qua |

Điểm vẫn do code tính; bộ nhớ chỉ ảnh hưởng điều AI quan sát và báo.

## Đăng comment lên MR (`publish`)
Mỗi framework có mục `publish`: `comments` (tự đăng comment tổng + inline lên MR), `inlineMinSeverity`, `maxInline`. **Mặc định tắt** ở mọi bản dựng sẵn: review chỉ chấm điểm và hiện trên dashboard. Muốn bật, tạo bản chỉnh sửa (fork) rồi bật ở Framework → Chỉnh sửa → "Đăng comment lên MR". `.asdlc.yml` của repo không bật được mục này.

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
- Đừng thêm quá nhiều rule: AI ưu tiên ít finding giá trị cao. Số finding và tỉ lệ bị báo nhầm theo rule xem được qua chat AI ở trang Framework.

## Chat AI cải thiện & xây framework
Nút chat nổi ở trang **Framework** (cùng kiểu trợ lý ở trang MR). Agent (cần provider `claude-cli` để dùng tool; provider khác chỉ trả lời từ ngữ cảnh) có các tool: `get_framework`, `get_rule_stats` (finding/báo nhầm theo rule), `get_usage` (repo đang dùng + bài học của team), `preview_changes` (kiểm tra thử), `propose_edit`.
- **Chỉ đề xuất**: `propose_edit` tạo thẻ chờ duyệt kèm diff; chỉ khi bấm **Áp dụng** server mới lưu thành phiên bản mới (ghi chú `AI: …`). Framework mặc định/mẫu (chỉ đọc) được fork thành bản chỉnh sửa tên do agent đề xuất.
- **Luật bảo mật giữ nguyên**: thay đổi đi qua cùng `validateEdit` như khi sửa tay, nên không xoá/tắt/hạ rule locked (SEC-01) hay nới gate locked.
- Điểm vẫn do code tính; agent không tự đổi điểm. Hội thoại lưu theo từng framework (`fw:<id>`).
