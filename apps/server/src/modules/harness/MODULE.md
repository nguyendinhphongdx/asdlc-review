# harness

## Trách nhiệm
Tìm, phân loại, xếp hạng và nạp (theo ngân sách ký tự) mọi tài liệu quy trình/quy tắc của một repo đã checkout: README, AGENTS.md, CLAUDE.md, rules, subagent, skill, tài liệu kiến trúc/tính năng, cấu hình lint.

## API
- `readRepoConfig(dir, { ref? })` → nội dung thô `.asdlc.yml` (tại `ref` nếu có) hoặc `null`.
- `load(dir, { changedFiles, budgetChars, extraDocGlobs? })` → `{ files, discovered, tree, totalFiles }`.

## Sự kiện
Không phát, không nhận.

## Dữ liệu
Không có bảng; chỉ đọc thư mục checkout (qua `git ls-files`).

## Port
Không cần port.

## Quyết định
- Không hiểu nội dung `.asdlc.yml` (việc của `framework`); chỉ đưa nội dung thô.
- Ưu tiên: asdlc > AGENTS/CLAUDE > rules > README > docs kiến trúc > docs khác > skills/agents > config. CLAUDE.md lồng nhau trên đường dẫn file thay đổi được cộng điểm, thư mục khác bị trừ.
- `.asdlc.yml` nên đọc tại commit gốc của nhánh đích (đã merge), vì bản trong MR do chính tác giả viết và có thể bị chỉnh để lách chấm điểm.
