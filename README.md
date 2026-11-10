# ASDLC Review

[![CI](../../actions/workflows/ci.yml/badge.svg)](../../actions/workflows/ci.yml)

Review merge request GitLab (GitHub: đang làm) bằng AI theo **framework ASDLC chung + harness riêng của từng repo** (README, AGENTS.md, CLAUDE.md, subagent, skill, tài liệu tính năng). Điểm 0–100 **do code tính** từ các finding, kèm thống kê, leaderboard và báo cáo cuối kỳ.

- Landing page: GitHub Pages của repo này · Bản dựng sẵn: [Releases](../../releases)

## Tính năng
- **Trigger:** webhook GitLab, comment `/review` hoặc `@mr-reviewer review`, dán link MR trên giao diện, API chat, poller (tuỳ chọn).
- **Pipeline:** hàng đợi → clone (bare + worktree) → nạp framework & harness → phân tích tĩnh (secret, debug code, test bị skip, suppress lint, TODO…) → AI tìm finding → chấm điểm → đăng comment (tóm tắt + inline) → lưu thống kê.
- **Chấm điểm tất định:** `deduction = severity × confidence × sizeFactor`, trọng số theo hạng mục, cổng chặn (lộ secret ≤30, lỗi bảo mật critical ≤49, có blocker ≤59). Xem [docs/SCORING.md](docs/SCORING.md).
- **AI đa nhà cung cấp:** `claude` CLI, `codex` CLI, hoặc API tương thích OpenAI.
- **Dashboard:** tổng quan, danh sách review & chi tiết finding, leaderboard (Bayesian), thành viên, repo, báo cáo .md/.csv, cài đặt.
- **Desktop:** vỏ Electron tuỳ chọn.

## Yêu cầu
| | |
|---|---|
| Node.js | 22+ |
| pnpm | 10+ |
| git | có trong PATH (dùng để clone) |
| AI | `claude` hoặc `codex` CLI đã đăng nhập, **hoặc** `OPENAI_API_KEY` |
| Redis | tuỳ chọn; đặt `REDIS_URL=memory` để dùng hàng đợi trong process |

## Cài đặt
```bash
git clone <url-repo> && cd asdlc-review
cp .env.example .env
pnpm install
pnpm redis          # tuỳ chọn: docker compose up -d redis
pnpm db:push        # tạo SQLite (cũng tự chạy khi server khởi động lần đầu)
pnpm build          # build web
pnpm dev            # server :4319 + web :5173 (proxy /api)
```
Chạy production: `pnpm build` rồi chạy server (`pnpm --filter @mrd/server start`); server phục vụ luôn web từ `WEB_DIST`.

## Cấu hình (`.env`)
| Biến | Ý nghĩa |
|---|---|
| `GITLAB_URL`, `GITLAB_TOKEN` | URL GitLab và PAT (scope `api`, `read_repository`) |
| `GITLAB_WEBHOOK_SECRET` | **Bắt buộc** để nhận webhook (không đặt → từ chối) |
| `BOT_MENTION` | Từ khoá trong comment để trigger review |
| `REVIEW_PROVIDER` | `claude-cli` \| `codex-cli` \| `openai-compatible` |
| `CLAUDE_MODEL`, `CLAUDE_MAX_BUDGET_USD` | Model và trần chi phí mỗi lần review |
| `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL` | Cho provider tương thích OpenAI |
| `REDIS_URL` | `redis://…` hoặc `memory` |
| `PUBLISH_COMMENTS` | `false` = chỉ chấm điểm, không comment lên MR |
| `INLINE_MIN_SEVERITY`, `MAX_INLINE_COMMENTS` | Điều khiển comment inline |
| `POLL_INTERVAL_MIN` | >0 bật poller (khi không nhận được webhook, ví dụ app desktop) |

## Kết nối GitLab
1. Tạo token, điền `.env`, đăng ký repo ở trang **Repository** (dán URL project).
2. Project → Settings → Webhooks: URL `https://<host>/webhooks/gitlab`, Secret token = `GITLAB_WEBHOOK_SECRET`, bật **Merge request events** và **Comments**.
3. Mở MR hoặc comment `/review` để thử.

## Harness riêng của repo
Repo có thể thêm `.asdlc.yml` (chọn framework, ghi đè trọng số, bỏ qua đường dẫn…). File này được đọc từ **commit gốc của nhánh đích**, không phải nhánh MR, để tác giả không tự nới tiêu chí; sửa nó trong MR sẽ bị gắn cờ. Provider AI không chọn được qua file này.

## Phát triển
```bash
pnpm verify    # arch + typecheck + test
```
Kiến trúc micro-module: [docs/MODULES.md](docs/MODULES.md) · tổng quan: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · quy tắc cho agent: [AGENTS.md](AGENTS.md).

## Phát hành (release)
```bash
git tag v0.1.0 && git push origin v0.1.0
```
Workflow `release.yml` chạy verify, build web, đóng gói `asdlc-review-<tag>.tar.gz` (+ sha256) và tạo GitHub Release. Giải nén rồi `pnpm install --prod=false && pnpm db:push` như phần Cài đặt.

## Workflows
| File | Khi nào | Làm gì |
|---|---|---|
| `ci.yml` | push `main`, PR | arch, typecheck, test, build |
| `pages.yml` | đổi `site/**` | deploy landing page lên GitHub Pages |
| `release.yml` | push tag `v*` | tạo GitHub Release kèm gói |

> Bật Pages: Settings → Pages → Source = **GitHub Actions**.

## Bảo mật
Diff/mô tả MR là dữ liệu không tin cậy; secret phát hiện được bị che và không lưu; token git chỉ truyền qua header từng lệnh; worktree bị gỡ `.claude/settings*.json`, `.mcp.json`, `.codex/config.toml` trước khi AI đọc.

## Giấy phép
Chưa chọn — thêm file `LICENSE` trước khi công khai.
