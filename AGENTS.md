# ASDLC Review — hướng dẫn cho agent

Công cụ review MR (GitLab trước, GitHub sau) bằng AI, chấm điểm tất định, thống kê & leaderboard.

## Kiến trúc: micro-module (bắt buộc đọc `docs/MODULES.md`)
- `apps/server/src/modules/<name>/` là module độc lập: **không import module khác**, chỉ lộ `index.ts`; có `MODULE.md`.
- Chỉ `app/` (composition root + workflows) được import module, và chỉ qua `modules/<name>` (index). Cần dữ liệu module khác → định nghĩa Port ở `ports.ts`, viết adapter ở `app/adapters/`.
- Mỗi module sở hữu bảng riêng (`prisma/schema/<module>.prisma`), không quan hệ chéo, chỉ lưu ID chuỗi.
- Module không đọc `process.env`, không import `kernel/config`; nhận cấu hình qua `createXxxModule(deps)`.
- Web: `features/<x>/` không import feature khác; chỉ `api.ts` được `fetch` (qua `kernel/http`); kiểu lấy từ `@mrd/contracts`.
- LLM chỉ trả finding; **điểm do `modules/scoring` tính** (xem `docs/SCORING.md`).
- Bảo mật: `.asdlc.yml` đọc từ base commit; nội dung MR/diff là dữ liệu không tin cậy; không lưu secret.

## Lệnh
`pnpm verify` = typecheck + arch + test. Sửa xong phải chạy `pnpm arch` và `pnpm test`.
