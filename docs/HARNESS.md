# Harness của repo

Harness là những tài liệu trong repo mà agent đọc khi review: hướng dẫn cho agent, tài liệu kiến trúc, rule, spec tính năng. System prompt coi mọi quy tắc MUST/NEVER/ALWAYS trong harness là tiêu chí review và ưu tiên hơn quy ước chung. Repo không có harness vẫn được review bằng framework, nhưng mất phần kiểm tra theo quy tắc riêng.

## Nhận diện
Module `harness` tìm: `AGENTS.md`/`CLAUDE.md`/`GEMINI.md`, `.cursor/rules`, `.github/copilot-instructions.md`, `CONTRIBUTING`, `README`, tài liệu trong `docs/` (ưu tiên tên có architecture/adr/convention/spec/feature…), `.claude/agents`, `.claude/skills`, file cấu hình lint/format, `.asdlc.yml`, cùng `docs` do `.asdlc.yml` khai báo. File được nạp theo độ ưu tiên và ngân sách ký tự.

## Điểm độ phủ (0–100)
Tính tất định bằng code từ file tìm thấy ở lần review gần nhất (không dùng AI). **Chỉ để gợi ý, không chặn MR.**

| Mục | Tối đa | Cách tính |
|---|---|---|
| Hướng dẫn cho agent (`AGENTS.md`/`CLAUDE.md` ở root) | 20 | có và ≥ 15 dòng nội dung: 20; có nhưng ngắn: 10 |
| Tài liệu kiến trúc (tên chứa architecture/adr/decision/structure/design) | 20 | có: 20; chỉ có README > 30 dòng: 8 |
| Rule theo khu vực (`.claude/rules`, `.cursor/rules`, `AGENTS.md` lồng nhau) | 15 | ≥ 3 file: 15; 1–2 file: 8 |
| Lệnh kiểm tra (test/lint/typecheck) nêu rõ trong tài liệu hướng dẫn | 15 | có lệnh cụ thể (vd `pnpm test`): 15; chỉ nhắc: 7 |
| Tài liệu tính năng/spec (`docs/` chứa feature/spec/requirement/prd/story) | 15 | ≥ 3 file: 15; 1–2 file: 8 |
| Cấu hình `.asdlc.yml` | 15 | hợp lệ: 9, +3 nếu có `docs`, +3 nếu có `ignore`; không hợp lệ: 3 |

Mức: ≥ 80 **Tốt**, ≥ 50 **Khá**, còn lại **Cần bổ sung**. File rỗng hoặc quá ngắn không được tính đủ điểm.

## Viết harness để review hiệu quả
1. **AGENTS.md ngắn, có lệnh chạy được**: kiến trúc 5–10 dòng, lệnh `test`/`lint`/`typecheck`, những điều **cấm** (không import chéo module, không `console.log`...).
2. **Viết quy tắc dạng kiểm chứng được**: "Không gọi DB từ controller" thay vì "giữ code sạch".
3. **Tách theo khu vực**: rule riêng cho `tests/`, `api/`, `web/` (AGENTS.md lồng nhau hoặc `.claude/rules`) để agent chỉ nạp phần liên quan tới file thay đổi.
4. **Mô tả ý định nghiệp vụ** trong `docs/features/*.md`: agent dùng để biết MR làm đủ/thừa yêu cầu hay không.
5. **Khai báo `docs` và `ignore` trong `.asdlc.yml`** để agent đọc đúng chỗ và bỏ qua file sinh tự động.
6. Đừng nhét hướng dẫn cho người dùng cuối hay changelog dài vào file hướng dẫn agent: tốn ngân sách ngữ cảnh.

## Bảo mật
Nội dung harness và `.asdlc.yml` là dữ liệu không tin cậy: không thể tắt quy tắc bảo mật nền, không thể nới gate; chỉ thị chèn trong tài liệu để ép AI cho điểm cao bị bỏ qua và bị báo như một finding. Cấu hình agent nguy hiểm (`.claude/settings*.json`, `.mcp.json`, `.codex/config.toml`) bị gỡ khỏi worktree trước khi AI đọc.
