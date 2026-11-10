# ASDLC Review — Kiến trúc

Công cụ review MR/PR tự động cho các repo phát triển theo ASDLC (AI-assisted SDLC):
nhận trigger, clone repo, nạp **framework chung + harness riêng của repo**, review bằng AI
theo bộ tiêu chí chi tiết, chấm điểm trên thang 100, comment lại cho tác giả và thống kê
cho leaderboard và báo cáo cuối kỳ.

## 1. Tổng quan luồng

```
 Trigger                         Queue (BullMQ/Redis)              Pipeline (worker)
┌──────────────────────┐        ┌───────────────────┐   ┌────────────────────────────────────┐
│ GitLab webhook (MR)  │──┐     │                   │   │ 1. fetch   MR info + diff refs     │
│ GitLab note "/review"│──┤     │  review  (jobId = │   │ 2. upsert  repo / member / MR      │
│ GitHub webhook (PR)  │──┼────▶│  mr:headSha →     │──▶│ 3. clone   bare cache + worktree   │
│ Manual (UI / API)    │──┤     │  dedupe)          │   │ 4. load    framework + harness     │
│ Chat command         │──┤     │                   │   │ 5. static  secret scan, diff stats │
│ Poller (định kỳ)     │──┘     │  poll (repeat)    │   │ 6. review  provider AI → findings  │
└──────────────────────┘        └───────────────────┘   │ 7. score   tất định theo rubric    │
                                                        │ 8. persist SQLite (Prisma)         │
                                                        │ 9. publish comment summary+inline  │
                                                        └────────────────────────────────────┘
                                                                         │
                       Dashboard (React) ◀── REST API (Fastify) ◀────────┘
                       overview · reviews · leaderboard · members · repos · reports
```

## 2. Thành phần

| Thành phần | Vị trí | Vai trò |
|---|---|---|
| Desktop shell | `apps/desktop` | Electron: khởi động server con, mở cửa sổ dashboard, tray |
| Server | `apps/server` | Fastify API + webhook + BullMQ worker + Prisma/SQLite |
| Web | `apps/web` | Dashboard React + Vite + Tailwind, gọi REST API |
| Contracts | `packages/contracts` | Kiểu dữ liệu + zod schema dùng chung |
| Framework | `frameworks/<id>/` | Bộ tiêu chí (YAML) + prompt; có thể có nhiều framework |

**Vì sao Electron mà không phải Tauri:** toàn bộ core (BullMQ, Prisma, gọi `claude`/`codex`/`git`)
là Node. Tauri sẽ cần thêm Node sidecar (hai runtime, đóng gói Prisma engine phức tạp).
UI là React thuần, server là process riêng, nên có thể đổi vỏ sang Tauri, hoặc chạy server
headless trên máy chủ (`pnpm --filter server start`) mà không phải sửa code.

## 3. Trigger

| Nguồn | Endpoint | Ghi chú |
|---|---|---|
| GitLab MR webhook | `POST /webhooks/gitlab` | `open`, `reopen`, `update` (có commit mới); `merge`/`close` chỉ cập nhật trạng thái để tính metric. Xác thực bằng header `X-Gitlab-Token`. |
| GitLab comment | cùng endpoint (Note Hook) | Comment `/review` hoặc `@<bot> review` trên MR |
| GitHub | `POST /webhooks/github` | `pull_request`, `issue_comment`; xác thực HMAC `X-Hub-Signature-256` |
| Manual | `POST /api/reviews` `{ url }` | Từ UI: dán link MR |
| Chat | `POST /api/chat/command` `{ text, user }` | `review <url>`, `status <url>`, `leaderboard [7d|30d]`; tích hợp Slack/Telegram/Google Chat bằng một adapter mỏng gọi endpoint này |
| Poller | BullMQ repeatable job | Dành cho desktop không nhận được webhook (NAT): quét MR mở của repo bật `autoReview`, enqueue khi `headSha` chưa được review |

Khử trùng lặp: `jobId = <mrKey>:<headSha>`, nên cùng một commit không bị review hai lần
(trừ khi trigger thủ công với `force`).

## 4. Workspace & harness

- **Clone:** mỗi repo có một bare cache `data/repos/<id>.git`; mỗi lần review tạo
  `git worktree` riêng tại `data/runs/<runId>` (checkout `headSha`) để chạy song song an toàn.
  Token truyền qua `-c http.extraHeader` cho từng lệnh, không ghi vào `.git/config`.
- **Diff:** `git diff <baseSha>...<headSha>` (merge-base), kèm `--numstat`.
- **Harness loader** quét và phân loại:
  - `instructions`: `AGENTS.md`, `CLAUDE.md` (root + lồng nhau), `.cursor/rules/**`, `.github/copilot-instructions.md`, `.windsurfrules`, `CONTRIBUTING.md`
  - `agents`: `.claude/agents/*.md`, `.agents/**`
  - `skills`: `.claude/skills/**/SKILL.md`, `.claude/commands/*.md`
  - `docs`: `README*`, `docs/**` (ưu tiên `architecture`, `adr`, `spec`, `feature`, tài liệu khớp tên file thay đổi)
  - `config`: eslint/prettier/tsconfig/editorconfig/biome/ruff/golangci...
  - `asdlc`: `.asdlc.yml` (cấu hình riêng của repo)
- Ngân sách context theo ký tự, ưu tiên `instructions` → `asdlc` → docs liên quan → skills/agents → config.

### `.asdlc.yml` (đặt ở root repo được review)

```yaml
framework: asdlc            # framework nền
weights: { security: 20, performance: 4 }   # ghi đè trọng số
disable: [CON-06]           # tắt tiêu chí
extraRules:                 # tiêu chí riêng của repo
  - id: PRJ-01
    category: architecture
    title: Mọi truy cập DB qua repository layer
    check: Không gọi prisma trực tiếp trong controller
    why: Tại sao controller cần biết về ORM?
    defaultSeverity: major
ignore: ["**/*.generated.ts", "migrations/**"]
docs: ["docs/features/**"]  # tài liệu tính năng cần đọc
```

## 5. Provider AI (đa nhà cung cấp)

Interface `ReviewProvider.review(ctx) → RawReview` (JSON theo schema cố định, validate bằng zod).

| Provider | Cách chạy | Đọc harness |
|---|---|---|
| `claude-cli` | `claude -p --output-format json --json-schema …` trong worktree, chỉ cho phép tool đọc | Native: tự nạp `CLAUDE.md`, có thể tự mở skill/agent/docs |
| `codex-cli` | `codex exec -s read-only -C <worktree> --output-schema … -o <file>` | Native `AGENTS.md`, tự duyệt repo |
| `openai-compatible` | HTTP chat completions (OpenAI, Ollama, LM Studio, vLLM…) | Server gói sẵn harness + diff vào prompt |

Agent CLI có quyền đọc toàn repo nên review "tại sao" sâu hơn; provider HTTP dùng context pack.
Có thể cấu hình provider mặc định và provider riêng theo repo.

## 6. Chấm điểm

Xem [SCORING.md](SCORING.md). Nguyên tắc: **LLM tìm vấn đề và đưa bằng chứng; điểm do code tính
tất định** từ findings + rubric để công bằng, tái lập được và giải thích được.

## 7. Dữ liệu (SQLite / Prisma)

`Member` ─< `MemberIdentity` (username GitLab/GitHub/email): một người nhiều tài khoản.
`Repository` ─< `MergeRequest` ─< `ReviewRun` ─< `Finding`, `CategoryScore`.
`Setting`: cấu hình runtime (provider, token…) chỉnh từ UI.

## 8. Metric

Theo từng run: điểm, grade, gate, số file/dòng/commit thay đổi, số finding theo category/severity,
số vi phạm convention, số vấn đề security, số lần lộ secret, thời gian review, token/chi phí.
Theo MR: điểm lần đầu (first-pass), điểm cuối, số vòng review, lead time (tạo → merge),
time-to-first-review. Theo thành viên/kỳ: xem SCORING.md §Leaderboard.

## 9. Lộ trình

- **MVP (hiện tại):** GitLab end-to-end, GitHub cơ bản, 3 provider, dashboard, leaderboard, báo cáo Markdown/CSV.
- **Tiếp theo:** adapter Slack/Telegram, review đa agent theo category (song song), phản hồi
  của tác giả vào finding (đồng ý / không đồng ý để hiệu chỉnh độ chính xác), calibration set,
  phát hiện "fix lại lỗi cũ", đóng gói Electron (bundle server bằng esbuild).
