# Kế hoạch: Review v2 — "hiểu trước, soi sau", tiết kiệm token

Trạng thái: **đề xuất, chưa làm**. Mục tiêu: review giống một tech lead: hiểu vấn đề → hiểu thiết kế hiện tại → đánh giá thiết kế của MR → đi từng khu vực → mới soi code/convention; báo cáo thể hiện đúng thứ tự đó; tốn ít token hơn rõ rệt.

## 1. Chẩn đoán (từ code hiện tại)

| # | Thực trạng | Hệ quả |
|---|---|---|
| 1 | Một lần gọi AI duy nhất (`reviewer.review`) nhận **toàn bộ** diff + rubric + harness + notes và trả mọi thứ cùng lúc. | Model bị kéo vào diff ngay; "overview" chỉ là một mục điền sau cùng, không dẫn đường cho phần soi code. |
| 2 | Prompt dặn "Examine the diff" ở bước 3; bước hiểu thiết kế chỉ là "đọc harness". Không có bước *hiểu luồng hiện tại của hệ thống trước khi MR đổi nó*. | Review bám dòng thay đổi, bỏ lỡ lỗi kiến trúc/luồng/tác động lan. |
| 3 | `checks`: model phải ghi **một dòng cho mọi rule** của rubric (hàng chục rule) ở mọi MR. | Tốn output token, nhiều dòng "na" vô ích. |
| 4 | Harness inline tới 200k ký tự + cả danh sách file để agent tự đọc thêm; diff cả MR đưa vào một prompt. | Input phình, agent đọc lặp, không cache được. |
| 5 | Review lại (vòng 2+) vẫn gửi lại toàn bộ diff + harness; chỉ thêm "vòng trước". | Trả tiền lại cho phần không đổi. |
| 6 | Một model mạnh làm hết việc, kể cả phân loại file, tóm tắt, soi convention máy móc. | Dùng model đắt cho việc rẻ. |
| 7 | Kiểm tra tất định (regex/secrets, mô tả MR) đã có nhưng **không** định hướng AI (không cho biết file nào rủi ro). | AI tự đoán lại thứ máy biết sẵn. |

## 2. Quy trình đích: 5 tầng, từ tổng quát đến chi tiết

```
T0  Chuẩn bị tất định (0 token)      phân loại file, bản đồ rủi ro, đồ thị tác động, delta so vòng trước
T1  Hiểu vấn đề            (rẻ)      MR muốn giải quyết gì, tiêu chí chấp nhận, có đủ spec chưa
T2  Hiểu thiết kế hiện tại (vừa)     luồng/khu vực MR đụng tới TRƯỚC khi đổi (đọc code gốc, ADR, docs)
T3  Đánh giá thiết kế của MR (mạnh)  đúng luồng chuẩn không, đặt đúng lớp/module, phụ thuộc, tương thích, rủi ro, phương án thay thế
T4  Soi chi tiết theo khu vực (vừa)  mỗi "khu vực" một lượt: logic, edge case, test, bảo mật, hiệu năng
T5  Convention & rubric   (rẻ/máy)   chỉ rule liên quan, phần lớn kiểm tra bằng máy; AI chỉ phán rule cần ngữ nghĩa
→   Tổng hợp                          ghép thành báo cáo top-down + chấm điểm tất định (giữ nguyên scoring)
```

Nguyên tắc: **mỗi tầng nhận đầu ra cô đọng của tầng trước, không nhận lại toàn bộ dữ liệu thô.** T2 trả "bản mô tả luồng hiện tại" (≤ 400 từ), T3 chỉ dùng bản đó + tóm tắt thay đổi, không cần cả diff.

### T0 — Chuẩn bị tất định (module `analysis`, mở rộng)
- **Phân loại file** theo vai trò: sinh tự động/lockfile/vendored (bỏ), config/migration/CI (rủi ro cao), test, docs, code logic. Dùng cho mọi tầng sau.
- **Bản đồ rủi ro** (điểm 0..1 mỗi file): chạm auth/tiền/dữ liệu/migration, kích thước thay đổi, file hay lỗi trong lịch sử (từ bộ nhớ repo), thiếu test đi kèm, finding tĩnh. Quyết định file nào được đào sâu ở T4, file nào chỉ đọc lướt.
- **Gom thành "khu vực thay đổi"** (change areas): nhóm file theo module/thư mục/feature (dùng đường dẫn + import; ví dụ `modules/reviewer`, `web/features/settings`). Mỗi MR thường 1–5 khu vực. Đây là đơn vị của T2–T4.
- **Đồ thị tác động nhẹ**: với mỗi symbol export bị đổi chữ ký/xoá, `grep` nơi dùng (không cần AI). Danh sách "người gọi bị ảnh hưởng" đưa thẳng cho T3/T4.
- **Delta so vòng trước**: so `headSha` với vòng đã review; chỉ phần diff mới + file mà finding "open" nằm trong đó là cần xem lại.
- **Test đi kèm**: file nguồn đổi mà không có test đổi → cờ.

### T1 — Hiểu vấn đề
Đầu vào: tiêu đề, mô tả, ghi chú người, link issue/spec (nếu có), tóm tắt T0 (không có diff). Model rẻ.
Đầu ra (`understanding`): mục tiêu, phạm vi dự kiến, tiêu chí chấp nhận suy ra, **câu hỏi còn mở / thiếu thông tin**, và liệu diff có khớp phạm vi (scope creep) — phần "khớp" kiểm sau ở T3.
Ngắn mạch: MR nhỏ/tầm thường (ví dụ ≤ 3 file, không file rủi ro cao) → gộp T1+T2 thành một lượt.

### T2 — Hiểu thiết kế hiện tại
Đầu vào: danh sách khu vực (T0) + harness *đã lọc theo khu vực* (không phải toàn bộ), có công cụ đọc repo.
Việc: với mỗi khu vực, đọc **code gốc ở base** (không phải diff), tìm: luồng chính, ranh giới module, hợp đồng (API/type), nơi gọi, ADR/quy ước thiết kế liên quan.
Đầu ra (`designMap`, cache theo `baseSha`+khu vực): mô tả luồng hiện tại, các ràng buộc "đúng chuẩn" của hệ thống (ví dụ: module không import module khác), điểm mở rộng. **Cache được**: cùng khu vực + cùng base thì vòng sau và MR khác dùng lại → giảm token lớn nhất.

### T3 — Đánh giá thiết kế của MR (tầng quan trọng nhất, model mạnh)
Đầu vào: `understanding` + `designMap` + **tóm tắt thay đổi theo khu vực** (danh sách hunk/ký hiệu đổi, chưa phải diff đầy đủ) + người gọi bị ảnh hưởng.
Trả lời như tech lead:
- Cách giải quyết có **đúng luồng thiết kế chuẩn** không? Đặt đúng lớp/module chưa? Có tái tạo thứ đã có?
- Tác động lan: ai bị ảnh hưởng, tương thích ngược, migration, cấu hình, quan sát được (log/metric).
- Có phương án đơn giản hơn không; rủi ro/đánh đổi; thứ tự deploy.
- Có phần nào cần tách MR.
Đầu ra (`designReview`): verdict thiết kế (chấp nhận / chấp nhận có điều kiện / cần làm lại), các **mối quan tâm cấp thiết kế** (mỗi cái gắn khu vực, mức độ, lý do), và **trọng tâm cho T4** ("khu vực nào cần soi kỹ nhất, soi cái gì").

### T4 — Soi chi tiết theo khu vực
Mỗi khu vực một lượt (song song được), chỉ nhận: diff của khu vực đó + `designMap` khu vực đó + trọng tâm do T3 giao + bộ nhớ liên quan (đã lọc theo đường dẫn). Khu vực rủi ro thấp: đọc lướt, ngưỡng finding cao; rủi ro cao: đọc sâu bằng công cụ.
Đầu ra: finding có file/dòng/bằng chứng/gợi ý như hiện nay + `confidence`. Chỉ báo điều **đã xác minh**.

### T5 — Convention & rubric
- Tách rule thành 3 loại (trong `framework.yaml`, thêm trường `check.mode`):
  1. `static` — máy kiểm tra hoàn toàn (regex, glob, số liệu): 0 token.
  2. `semantic` — cần AI phán, áp dụng theo `appliesTo` (glob/khu vực).
  3. `manual` — chỉ nhắc, không tự chấm.
- AI chỉ nhận các rule `semantic` **liên quan tới khu vực đã đổi**; `checks` chỉ liệt kê rule thật sự được xét, rule còn lại máy tự điền "na — không áp dụng cho các khu vực này". Giảm mạnh output và input.
- Gộp vào lượt T4 của khu vực tương ứng thay vì lượt riêng khi MR nhỏ.

### Tổng hợp & chấm điểm
Giữ nguyên nguyên tắc: **điểm do `modules/scoring` tính từ finding** (xem `docs/SCORING.md`). Thêm: finding cấp thiết kế (T3) có `category: design`, tính vào điểm như finding thường; verdict thiết kế có thể là **cổng** (gate) tuỳ framework.

## 3. Báo cáo: thể hiện đúng tư duy tech lead

Thứ tự section mới (cả trên dashboard lẫn comment đăng lên MR):

1. **Kết luận** — một câu + điểm + verdict (ý kiến tổng).
2. **Vấn đề & phạm vi** — MR giải quyết gì, thiếu thông tin gì, có lệch phạm vi không (T1).
3. **Thiết kế hiện tại** — sơ đồ/đoạn mô tả luồng mà MR đụng tới, gắn với tài liệu/ADR đã dùng (T2). Collapsed mặc định.
4. **Đánh giá thiết kế** — đúng luồng chuẩn chưa, tác động lan (kèm danh sách người gọi bị ảnh hưởng), rủi ro, đề xuất (T3). **Đây là phần đầu tiên người đọc thấy sau kết luận.**
5. **Theo khu vực** — mỗi khu vực một thẻ: trạng thái, finding của khu vực, độ sâu đã soi ("soi kỹ" / "đọc lướt") và lý do (T4).
6. **Convention & checklist** — chỉ các rule đã xét; rule máy kiểm tra ghi rõ "kiểm bằng máy" (T5).
7. **Việc cần làm** — danh sách hành động ưu tiên cho tác giả (gom từ mọi tầng).
8. **Minh bạch** — đã đọc những file nào, bỏ qua gì và vì sao, token/chi phí theo từng tầng.

Dashboard: thanh "tiến trình tư duy" ở đầu trang (T1→T5) hiển thị trạng thái và thời gian từng tầng, thay cho log phẳng hiện tại. Comment GitLab: phần 1–2–4 hiện sẵn, phần còn lại gập.

## 4. Tiết kiệm token (đo được)

| Biện pháp | Ước tính tác động | Ghi chú |
|---|---|---|
| Phân tầng model: triage/T1/T5 dùng model rẻ, T3 dùng model mạnh, T2/T4 vừa | giảm 40–60% chi phí | thêm vai trò AI mới `triage`, `deep` vào `aiRoles` (đã có sẵn cơ chế) |
| `designMap` cache theo `baseSha`+khu vực | giảm lớn cho MR nối tiếp/vòng 2+ | bảng mới ở module `reviews` hoặc `agent` |
| Review lại chỉ trên delta + finding open | vòng 2+ giảm 70–90% | cần `baseSha` vòng trước |
| Checklist chỉ rule liên quan; rule `static` do máy | giảm output và input prompt | thay đổi `framework.yaml` + `scoring.checklist` |
| Không inline harness 200k; lọc theo khu vực, ưu tiên trích đoạn | giảm input | `harness.load` đã có lọc theo file đổi, siết thêm |
| Prompt caching phần ổn định (system + rubric + harness) | giảm input lặp | Claude CLI/API; xếp phần ổn định lên đầu, phần đổi cuối |
| Bỏ qua/gộp file vô giá trị (sinh tự động, lockfile, snapshot) | giảm input | T0 |
| Ngân sách token theo MR + tự hạ cấp: quá ngưỡng thì giảm độ sâu T4 và báo rõ trên báo cáo | kiểm soát trần | thay `maxBudgetUsd` thuần chi phí bằng ngân sách theo tầng |
| Ghi nhận token/chi phí **theo tầng** vào `stageTimings`/usage | đo hiệu quả | để so trước/sau |

## 5. Thay đổi kiến trúc (giữ luật micro-module)

- **Module `reviewer`**: tách `review()` thành các lệnh theo tầng (`understand`, `mapDesign`, `assessDesign`, `inspectArea`, `judgeRules`) + schema JSON riêng cho từng tầng (nhỏ, dễ kiểm). Giữ `review()` cũ như chế độ "nhanh" (một lượt) để so sánh/ rollback.
- **Module `analysis`**: thêm `classify`, `riskMap`, `changeAreas`, `impact`. Thuần tất định, không gọi AI.
- **Điều phối ở `app/workflows`**: `review-merge-request.ts` chuyển thành pipeline tầng (T0..T5), chạy khu vực song song, ghi tiến trình từng tầng. Workflow là nơi duy nhất nối các module (đúng luật).
- **Cache `designMap`**: module sở hữu bảng riêng (đề xuất `reviews` hoặc module mới `designmap` nhỏ), chỉ lưu id chuỗi; truy cập qua Port ở `ports.ts`.
- **Contracts**: `RunDetailDto` thêm `understanding`, `designMap`, `designReview`, `areas[]`, `tierUsage[]` (token/chi phí/thời gian mỗi tầng). `RawReview` cũ giữ cho chế độ nhanh.
- **Framework**: thêm cấu hình tầng (`pipeline:` bật/tắt tầng, model theo tầng, độ sâu theo rủi ro), `rule.check.mode`, `rule.appliesTo`, mục "design principles" của repo (bản mô tả luồng chuẩn do team viết, đọc ở T2/T3).
- **Web**: trang review dựng lại theo thứ tự mục 3; bản đồ khu vực (thẻ + độ rủi ro); tiến trình tầng; so sánh token trước/sau.

## 6. Lộ trình (mỗi bước tự phát hành được, đo lại sau mỗi bước)

| Bước | Nội dung | Rủi ro | Kết quả đo được |
|---|---|---|---|
| **0. Đo nền** | Ghi token/chi phí/thời gian theo tầng hiện tại; bộ 10–15 MR mẫu ("golden set") + finding kỳ vọng để so chất lượng | thấp | số liệu nền để chứng minh cải thiện |
| **1. T0 tất định** | phân loại file, rủi ro, khu vực, tác động, delta; hiển thị bản đồ khu vực trên dashboard | thấp | không đổi AI; thấy ngay giá trị |
| **2. Tiết kiệm nhanh** | checklist chỉ rule liên quan + rule `static`; bỏ file vô giá trị; xếp prompt cho cache; review lại chỉ delta | thấp–vừa | giảm token mà chưa đổi cách review |
| **3. T1+T3 (hiểu & thiết kế)** | thêm 2 lượt: hiểu vấn đề, đánh giá thiết kế (chưa cần T2 đầy đủ: dùng harness + code quanh khu vực); báo cáo có mục "Vấn đề & phạm vi" và "Đánh giá thiết kế" | vừa | review phát hiện lỗi thiết kế; so golden set |
| **4. T2 + cache** | `designMap` theo khu vực + cache theo base | vừa | giảm token vòng 2+/MR liên tiếp |
| **5. T4 theo khu vực** | soi chi tiết từng khu vực, song song, độ sâu theo rủi ro, trọng tâm từ T3 | vừa–cao | chất lượng finding cao hơn, ít trùng |
| **6. Báo cáo mới + tiến trình tầng** | dựng lại trang review/comment theo mục 3 | thấp | trải nghiệm đọc |
| **7. Phân tầng model + ngân sách** | vai trò `triage`/`deep`, trần theo tầng, tự hạ cấp | thấp | chi phí/MR giảm có kiểm soát |

Sau mỗi bước chạy golden set; chỉ giữ bước nếu chất lượng không giảm. Chế độ cũ (một lượt) giữ tới khi bước 5 vượt nó trên golden set.

## 7. Tiêu chí thành công

- Token/MR trung bình **giảm ≥ 40%**, vòng 2+ **giảm ≥ 70%** (so số đo nền).
- Trên golden set: tìm được **≥ 80% lỗi cấp thiết kế** đã gắn nhãn (hiện gần như 0 vì không có tầng này), tỉ lệ finding bị người "disagree" **không tăng**.
- Báo cáo trả lời được ba câu mà không cần xem diff: MR làm gì? Có hợp thiết kế hiện tại không? Rủi ro/tác động ở đâu?
- Mọi điểm vẫn do `scoring` tính, tái lập được từ finding.

## 8. Rủi ro và cách giảm

- **Nhiều lượt gọi → chậm hơn/đắt hơn nếu làm ẩu.** Giảm: ngắn mạch MR nhỏ, song song khu vực, cache, đo từng bước.
- **Tóm tắt giữa các tầng làm mất chi tiết.** Giảm: T4 luôn đọc diff gốc của khu vực; tầng trên chỉ định hướng, không thay thế bằng chứng.
- **AI bịa "luồng thiết kế".** Giảm: `designMap` bắt buộc trích dẫn file/symbol; mục nào không trích được ghi "chưa xác minh"; cho phép người sửa/ghim `designMap` (ghi vào Bộ nhớ repo).
- **Phức tạp pipeline.** Giảm: từng tầng là hàm thuần có schema riêng + test; workflow là danh sách tầng.
- **Injection qua nội dung MR.** Giữ nguyên quy tắc: diff/MR/tài liệu là dữ liệu không tin cậy ở mọi tầng; tầng trước không được chuyển "chỉ thị" từ nội dung thành lệnh cho tầng sau (đầu ra tầng là dữ liệu có schema).

## 9. Câu hỏi cần chốt trước khi làm

1. Ưu tiên trước: **tiết kiệm token** (bước 2) hay **chất lượng thiết kế** (bước 3)? Đề xuất: làm 0 → 1 → 2 trước vì rẻ, an toàn, rồi 3.
2. Có chấp nhận review **chậm hơn một chút** (nhiều lượt tuần tự) đổi lấy chất lượng? Hay cần giữ dưới X phút?
3. "Luồng thiết kế chuẩn" của từng repo lấy từ đâu: tài liệu có sẵn (ADR/README), hay cần một mục mới do team viết trong Bộ nhớ/`.asdlc.yml`? Đề xuất: cả hai, ưu tiên mục team viết.
4. Golden set: bạn có thể chỉ 10–15 MR thật (kèm "lỗi đáng ra phải bắt") để làm chuẩn đo không?
5. Có muốn comment đăng lên GitLab theo thứ tự mới ngay từ bước 3, hay giữ định dạng cũ tới bước 6?

## 10. Tổng quan động: AI chọn cách trình bày theo loại MR

Hiện tại `overview` là vài mục cố định (`text`/`bullets`/`verdict`, framework quyết). Mọi MR đều kể bằng lời, trong khi MR đổi luồng cần *thấy* luồng. Thiết kế mới: tổng quan là **danh sách khối có kiểu** (blocks); AI chọn và điền khối phù hợp với MR, giao diện vẽ từ dữ liệu có cấu trúc.

### 10.1 Danh mục khối

| Khối | Dùng khi | Nội dung có cấu trúc |
|---|---|---|
| `summary`, `bullets`, `verdict` | luôn có (giữ như nay) | text / danh sách / nhãn kết luận |
| `flow` | đổi hoặc thêm luồng xử lý | nút (bước/hàm/dịch vụ), cạnh, nhóm; mỗi nút `added/changed/removed/unchanged`; chế độ trước/sau |
| `sequence` | luồng API, sự kiện, bất đồng bộ giữa nhiều bên | tác nhân + thông điệp có thứ tự |
| `architecture` | đổi ranh giới module, phụ thuộc | thành phần, cạnh phụ thuộc, cạnh vi phạm quy tắc (vd module import module) |
| `state` | đổi máy trạng thái / vòng đời | trạng thái, chuyển trạng thái |
| `data_model` | đổi schema, migration | thực thể, trường thêm/đổi/xoá, rủi ro dữ liệu cũ |
| `api_contract` | đổi endpoint, kiểu dữ liệu | bảng endpoint/field, cờ breaking |
| `diff_map` | MR lớn, nhiều khu vực | thanh/treemap theo khu vực kèm rủi ro (không dùng biểu đồ tròn) |
| `matrix` | tương thích, rủi ro × khu vực | bảng ô màu |
| `rollout` | cần thứ tự triển khai | các bước, phụ thuộc, cách hoàn tác |
| `checklist`, `table`, `metrics` | bổ trợ | hàng/cột hoặc ô số |

Mọi nút/cạnh/hàng phải có `evidence` (file, symbol); không có thì đánh dấu "chưa xác minh". Giới hạn cỡ: tối đa ~12 nút mỗi sơ đồ, ~6 khối mỗi MR.

### 10.2 Chọn khối thế nào
1. **T0 (tất định) gắn nhãn loại MR**: `new-feature`, `flow-change`, `refactor`, `bugfix`, `schema-change`, `api-change`, `config/infra`, `deps`, `docs`, `test-only`, từ đường dẫn, loại file, thay đổi import/export, route, migration, schema.
2. **Framework khai báo `overview.views`**: ánh xạ loại MR → danh sách khối `required`/`optional` và thứ tự. Ví dụ `flow-change`: `summary` → `flow` (bắt buộc) → `architecture`(nếu đụng ranh giới) → `verdict`.
3. **AI điền khối bắt buộc và chọn khối tuỳ chọn**; không đủ căn cứ thì bỏ khối thay vì bịa. MR nhỏ (docs, test, bugfix một dòng) chỉ có `summary` + `verdict`, không vẽ gì.
4. **Sơ đồ lấy từ `designMap`** (tầng T2, cache theo base): "trước" là bản đồ đã lưu, "sau" là bản đồ áp thay đổi của MR (T3). Nhất quán và rẻ hơn vẽ lại từ đầu.

### 10.3 Hiển thị
- Tab Tổng quan có thanh chọn view (Tóm tắt · Luồng · Kiến trúc · Dữ liệu · API · Rủi ro), chỉ hiện view MR có; mở sẵn view theo loại MR.
- Giao diện **vẽ từ dữ liệu có cấu trúc bằng SVG** (không nhúng HTML hay Mermaid thô do AI viết, tránh injection); có nút "Sao chép dạng Mermaid" để dán vào tài liệu.
- Tương tác: bấm nút → nhảy tới file trong tab Thay đổi hoặc hỏi chat về nút đó; bật/tắt Trước/Sau; nút đổi màu theo thêm/sửa/xoá; cạnh vi phạm quy tắc nổi bật.

### 10.4 Kỹ thuật
- **Contracts**: `OverviewBlock` (union theo `kind`); `RunDetailDto.overview` thành mảng khối. Mục cũ (`text`/`bullets`/`verdict`) tự chuyển thành khối tương ứng để review cũ vẫn hiển thị.
- **Schema JSON cho AI** (strict, dùng chung Claude/Codex): một hình khối chung với mọi trường bắt buộc và nullable (`kind`, `title`, `text`, `bullets`, `nodes`, `edges`, `rows`…), kiểm lại bằng zod theo `kind`. Tránh `oneOf` vì không phải CLI nào cũng hỗ trợ.
- **Framework**: thêm `overview.views` và danh mục khối bật/tắt; editor framework có màn cấu hình.
- **Web**: bộ vẽ SVG nhỏ (layout phân tầng cho `flow`/`architecture`, bảng cho `api_contract`/`data_model`), không thêm thư viện nặng nếu bộ tự viết đủ.

### 10.5 Lộ trình riêng (độc lập, làm trước được)
| Bước | Nội dung |
|---|---|
| O1 | Contracts khối + bộ vẽ cho `summary`/`bullets`/`verdict`; chuyển dữ liệu cũ; không đổi hành vi |
| O2 | Bộ vẽ SVG `flow`/`architecture` với dữ liệu mẫu (fixture), có tương tác |
| O3 | T0 gắn nhãn loại MR (có test với MR mẫu) |
| O4 | Prompt + schema để AI sinh khối theo `views` của framework |
| O5 | Trước/Sau từ `designMap`, bấm nút → diff/chat |
| O6 | Màn cấu hình `views` trong editor framework |
| O7 | Chat hiểu tổng quan: `get_overview` cho tool chat, nút "Hỏi chat về nút này" gửi sẵn câu hỏi, chat trả Markdown/Mermaid (đã vẽ được), nút "Ghim vào sơ đồ" khi người dùng sửa |

**Trạng thái:** O5 xong: chế độ "Trước" được suy từ trạng thái nút/cạnh của "Sau" (`deriveBefore`: mới = chưa có, xoá = còn), không tốn thêm token; khi tầng T2 có `designMap` thì thay bằng bản đồ đã cache. O6 đã làm (`overview.views` trong framework, bảng chọn ở tab Tổng quan của trang Framework, chỉnh được ở màn sửa). O5 làm một nửa: bấm nút sơ đồ → mở file trong tab Thay đổi và gửi câu hỏi sẵn sang chat đã xong; "Trước" từ `designMap` chờ tầng T2 (chưa có), tạm thời AI tự điền `beforeNodes`. O3 và O4 đã làm (`modules/reviewer/domain/{mr-kind,blocks}.ts`; bảng loại MR → khối là `DEFAULT_VIEWS` trong contracts, framework ghi đè bằng `overview.views`). O1 và O2 đã làm (`packages/contracts/src/overview.ts`, `apps/web/src/features/reviews/overview/`). Xem thử bằng `?overview=demo` trên trang review. Chat đã nhận phần tổng quan trong ngữ cảnh và được dặn trả Mermaid, không trả HTML thô.
