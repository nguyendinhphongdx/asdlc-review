# Chấm điểm & Metric

## 1. Nguyên tắc

1. **LLM không tự cho điểm.** LLM trả về danh sách finding có bằng chứng (file, dòng, rule, vì sao,
   gợi ý sửa, câu hỏi "tại sao" cho tác giả, độ tin cậy). Điểm do code tính → cùng findings luôn ra cùng điểm.
2. **Mọi finding gắn với một tiêu chí** trong framework (`ruleId`), nên thống kê được "vi phạm convention",
   "lỗi bảo mật", v.v.
3. **Kết hợp phân tích tĩnh:** secret scan, debug code, test bị skip… chạy tất định trước, rồi đưa cho
   LLM làm bằng chứng. Finding tĩnh có `confidence = 1`.
4. **Công bằng theo kích thước MR:** lỗi vặt (minor/nit) được chuẩn hoá theo kích thước,
   lỗi nặng thì không.

## 2. Công thức

```
deduction(f) = severity.deduction × confidence(f) × sizeFactor(f)
sizeFactor(f) = 1                                    nếu severity ∈ {blocker, critical, major}
              = 1 / max(1, sqrt(changedLines / 200)) nếu severity ∈ {minor, nit}

score(category) = max(0, 100 − Σ deduction(f ∈ category))
total           = Σ weight_c × score_c / Σ weight_c
total           = min(total, cap của mọi gate bị kích hoạt)
```

- Finding loại `question` / `praise` không trừ điểm (vẫn được comment cho tác giả).
- Finding có `confidence < 0.4` không trừ điểm, chỉ hiển thị là "cần xác nhận".
- Finding trùng nhau (cùng file + dòng + rule) chỉ tính một lần.

| Severity | Trừ | | Gate | Trần điểm |
|---|---|---|---|---|
| blocker | 35 | | Lộ secret (SEC-01) | 30 |
| critical | 25 | | Security ≥ critical | 49 |
| major | 12 | | Có blocker | 59 |
| minor | 4 | | | |
| nit | 1 | | | |

Grade: A ≥ 90 · B ≥ 80 · C ≥ 70 · D ≥ 60 · F < 60.
Verdict: `request_changes` nếu có gate hoặc finding ≥ major; `comment` nếu có minor; ngược lại `approve`.

## 3. Leaderboard (theo kỳ)

| Metric | Ý nghĩa |
|---|---|
| `mrCount` | Số MR có ít nhất một lần review trong kỳ |
| `avgFirstScore` | Điểm trung bình **lần review đầu**: đo chất lượng khi nộp, chống "nộp bừa rồi sửa theo AI" |
| `avgFinalScore` | Điểm trung bình lần review gần nhất |
| `improvement` | `avgFinal − avgFirst` |
| `rankScore` | **Bayesian average** của first-score: `(C·m + Σs) / (C + n)`, C = 5, m = trung bình toàn team: điểm của người có ít MR bị kéo về trung bình, nên cùng mức điểm thì người có nhiều MR hơn xếp trên |
| `blockers`, `securityIssues`, `secretLeaks`, `conventionViolations` | Tổng finding theo loại |
| `avgFilesChanged`, `linesChanged`, `avgReviewRounds` | Quy mô và số vòng sửa |
| `avgLeadTimeHours` | Thời gian từ tạo MR đến merge |

## 4. Báo cáo cuối kỳ

`GET /api/reports?from=&to=` → tổng quan team, theo thành viên, theo repo, top vi phạm theo rule,
xu hướng theo tuần. Xuất `…/export.md` (Markdown) và `…/export.csv`.
