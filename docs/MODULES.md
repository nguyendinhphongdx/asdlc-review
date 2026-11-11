# Kiến trúc Micro-Module

Mục tiêu: mỗi module là một "microservice thu nhỏ" chạy chung một process. Module **tự sở hữu logic và dữ liệu**
của mình, chỉ lộ ra ngoài qua **một cổng duy nhất** (public API). Không module nào chứa logic của module khác,
cũng không biết module khác tồn tại. Muốn tách một module ra thành service thật, chỉ cần thay lớp wiring.

> Thay thế cấu trúc phẳng theo kỹ thuật (`platforms/`, `pipeline/`, `harness/`…) đã viết ở bản nháp đầu.
> Code đã có sẽ được chuyển vào đúng module (xem §9).

## 1. Nguyên tắc cốt lõi

1. **Module không import module.** Không có đường phụ thuộc nào giữa `modules/A` và `modules/B`, kể cả qua public API.
2. **Chỉ `app/` mới biết nhiều module.** `app/` là composition root + điều phối (use case): gọi public API của từng
   module theo thứ tự và ánh xạ DTO. Không chứa logic nghiệp vụ.
3. **Cần dữ liệu/hành vi của module khác → khai báo Port.** Module tự định nghĩa interface nó cần (`ports.ts`),
   adapter ở `app/adapters/` nối port đó với public API của module kia. (Hexagonal.)
4. **Mỗi module sở hữu dữ liệu của nó.** Chỉ module chủ mới đọc/ghi bảng của nó. Bảng không có FK/relation sang module khác,
   chỉ lưu ID (chuỗi) tham chiếu.
5. **Trao đổi chỉ bằng DTO thuần** (zod schema / plain object). Không truyền entity Prisma, class có hành vi, hay hàm nội bộ ra ngoài.
6. **Vocabulary chung tối thiểu** nằm ở `packages/contracts` (Severity, Finding, ReviewRequest…): ổn định, không có logic, giống file `.proto`.
7. **Lõi thuần, rìa bẩn.** Logic nghiệp vụ (`domain/`) không I/O, test không cần mock. I/O (DB, git, HTTP, process) nằm ở `infra/`.
8. **Giao tiếp bất đồng bộ qua sự kiện** khi bên phát không cần biết bên nhận (event bus trong process, sự kiện quá khứ `xyz.happened`).

## 2. Cấu trúc thư mục

```
MRDashboard/
├─ packages/
│  └─ contracts/                 # DTO + zod dùng chung (không logic, không phụ thuộc gì)
│     └─ src/{finding,review,rubric,mr,events,index}.ts
│
├─ apps/
│  ├─ server/
│  │  ├─ prisma/                 # schema chia file theo module (prismaSchemaFolder)
│  │  │  └─ schema/{base,identity,repos,reviews}.prisma
│  │  └─ src/
│  │     ├─ main.ts              # bootstrap: load config → build container → start
│  │     │
│  │     ├─ kernel/              # hạ tầng kỹ thuật dùng chung, KHÔNG nghiệp vụ
│  │     │  ├─ config.ts  logger.ts  errors.ts  result.ts
│  │     │  ├─ event-bus.ts      # typed in-process pub/sub
│  │     │  ├─ exec.ts           # spawn có timeout/redact
│  │     │  └─ db.ts             # tạo PrismaClient, transaction helper
│  │     │
│  │     ├─ modules/             # ★ mỗi thư mục = một micro-module
│  │     │  ├─ scm/              # GitLab/GitHub: lấy MR, comment, webhook
│  │     │  ├─ workspace/        # clone, worktree, diff
│  │     │  ├─ harness/          # nạp README/AGENTS/CLAUDE/skills/agents/docs
│  │     │  ├─ framework/        # rubric ASDLC + áp `.asdlc.yml`
│  │     │  ├─ analysis/         # phân tích tĩnh (secret, debug, test skip…)
│  │     │  ├─ reviewer/         # provider AI (claude-cli, codex-cli, openai) + prompt
│  │     │  ├─ scoring/          # tính điểm tất định từ findings + rubric
│  │     │  ├─ publisher/        # render comment (summary/inline), không gửi
│  │     │  ├─ queue/            # BullMQ bọc generic: enqueue/handler/dedupe/repeat
│  │     │  ├─ identity/         # member, danh tính GitLab/GitHub, team
│  │     │  ├─ repos/            # sổ đăng ký repo + cấu hình theo repo
│  │     │  ├─ reviews/          # lưu MR, run, finding, score (lịch sử review)
│  │     │  ├─ analytics/        # metric, leaderboard, báo cáo kỳ
│  │     │  └─ settings/         # cấu hình runtime chỉnh từ UI
│  │     │
│  │     └─ app/                 # ★ nơi duy nhất được import nhiều module
│  │        ├─ container.ts      # dựng module + nối port↔adapter
│  │        ├─ adapters/         # adapter hiện thực port của module này bằng API module khác
│  │        ├─ workflows/        # use case điều phối
│  │        │  ├─ review-merge-request.ts   # clone→harness→analysis→reviewer→scoring→lưu→publish
│  │        │  ├─ request-review.ts         # nhận trigger → validate → enqueue
│  │        │  ├─ chat-command.ts           # review|status|leaderboard
│  │        │  └─ poll-open-mrs.ts
│  │        └─ http/             # Fastify: gom route của từng module + webhook + static web
│  │
│  ├─ web/                       # dashboard React
│  │  └─ src/
│  │     ├─ kernel/              # http client, query client, ui primitives, layout
│  │     ├─ features/            # ★ mỗi feature = 1 module FE, cùng quy tắc
│  │     │  ├─ overview/ reviews/ leaderboard/ members/ repos/ reports/ settings/
│  │     │  │  ├─ api.ts  hooks.ts  components/  page.tsx  index.ts
│  │     └─ app/                 # router + ghép feature
│  │
│  └─ desktop/                   # Electron shell mỏng: spawn server, cửa sổ, tray (không logic)
│
├─ frameworks/                   # rubric dạng dữ liệu (YAML), nạp bởi module framework
├─ docs/
└─ tools/arch/                   # luật kiến trúc dạng máy kiểm: script tự viết `tools/arch/check.ts` (không phụ thuộc thư viện)
```

### Bên trong một module (khuôn bắt buộc)

```
modules/<name>/
├─ index.ts          # ★ CỔNG DUY NHẤT: export createXxxModule(deps), interface XxxApi, DTO, event types
├─ MODULE.md         # trách nhiệm (1 câu), API, event phát/nhận, dữ liệu sở hữu, port cần, quyết định
├─ api.ts            # interface công khai + implement (facade): validate input → gọi application
├─ ports.ts          # interface module CẦN từ bên ngoài (Clock, MemberDirectory, RunFactsSource…)
├─ events.ts         # event module PHÁT RA (tên + payload zod)
├─ domain/           # logic thuần (không import infra, không I/O)
├─ application/      # use case của chính module, ghép domain + port
├─ infra/            # hiện thực I/O: repository Prisma, client HTTP, spawn git…
├─ http.ts           # (tùy chọn) route REST của module, nhận XxxApi qua tham số
└─ __tests__/        # test chạy độc lập, chỉ dùng fake của ports
```

Quy ước: ngoài module, chỉ được `import … from "modules/<name>"` (tức `index.ts`) — và chỉ trong `app/`.

## 3. Tiêu chí để được gọi là một module

| # | Tiêu chí | Cách kiểm |
|---|---|---|
| M1 | **Một trách nhiệm, mô tả được trong 1 câu** ở `MODULE.md` | Review |
| M2 | **Không import module khác** (kể cả `index.ts`) | `pnpm arch` |
| M3 | **Chỉ lộ `index.ts`**; `domain/application/infra` là private | `pnpm arch` |
| M4 | **Sở hữu dữ liệu**: bảng của mình, không relation chéo module | Script kiểm schema + dùng model |
| M5 | **Port rõ ràng**: mọi phụ thuộc ngoài đi qua `ports.ts` | Review + test với fake |
| M6 | **Test độc lập**: chạy được không cần Redis, mạng, module khác, DB thật (dùng fake/in-memory hoặc SQLite tạm) | CI chạy `test` từng module riêng |
| M7 | **Domain thuần**: `domain/` không import `infra`, `kernel/exec`, `fs`, `fetch`, Prisma | `pnpm arch` |
| M8 | **API có kiểu và validate** ở biên bằng zod, trả DTO thuần, lỗi có mã (`ModuleError`) | Test |
| M9 | **Idempotent & an toàn khi gọi lại** các lệnh ghi quan trọng (có khoá tự nhiên) | Test |
| M10 | **Có `MODULE.md`** đủ 6 mục; PR đổi API phải đổi tài liệu | Lint kiểm file tồn tại |
| M11 | **Kích thước**: file ≤ 300 dòng, hàm ≤ 60 dòng; module quá ~3000 dòng thì cân nhắc tách | Lint |
| M12 | **Không singleton ẩn**: không đọc `process.env`, không import `config` toàn cục; nhận cấu hình qua tham số `createXxxModule(deps)` | `pnpm arch` |

## 4. Rule chi tiết (kiểm tự động trong CI)

**Phụ thuộc**
- R1 `modules/*` ↛ `modules/*` (khác tên). 
- R2 `modules/*` ↛ `app/*`.
- R3 `modules/*` chỉ được import `kernel/*` (loại an toàn: `event-bus`, `errors`, `result`, `logger`) và `packages/contracts`.
  `kernel/exec`, `kernel/db` chỉ được import từ `modules/*/infra/`.
- R4 Mã ngoài module chỉ import qua `modules/<name>` (index), cấm import đường dẫn sâu.
- R5 `app/` là nơi duy nhất import nhiều module; `app/adapters/*` mới được biết cả hai phía của một port.
- R6 `packages/contracts` không import gì từ `apps/*`.
- R7 Không vòng phụ thuộc ở mọi cấp.

**Dữ liệu**
- R8 Mỗi model Prisma có chủ (tên file schema = tên module). Chỉ `modules/<chủ>/infra/` được gọi `prisma.<model>`.
- R9 Cấm `@relation` giữa model của hai module; tham chiếu chéo bằng cột ID chuỗi, kiểm tồn tại qua port khi cần.
- R10 Transaction chỉ trong một module. Quy trình nhiều module dùng bước bù trừ (idempotent + retry), không dùng transaction xuyên module.

**Hành vi**
- R11 Domain thuần (xem M7); thời gian, random, ID đi qua port (`Clock`, `IdGen`) để test tất định.
- R12 Module không đọc env/cấu hình toàn cục; mọi thứ truyền qua `createXxxModule(deps)`.
- R13 API công khai trả DTO thuần và ném `ModuleError(module, code, msg)`; không ném lỗi thô ra ngoài.
- R14 Sự kiện: tên quá khứ (`review.run.completed`), payload nhỏ chỉ chứa ID + dữ kiện; handler lỗi không làm hỏng bên phát.
- R15 `app/workflows/*` không chứa quy tắc nghiệp vụ: chỉ gọi tuần tự, ánh xạ DTO, xử lý lỗi/thử lại. Quy tắc nghiệp vụ nào xuất hiện ở đây → chuyển vào module chủ.
- R16 Không dùng `any`, `ts-ignore` trong `index.ts`/`api.ts`/`ports.ts`.

**Frontend** (`apps/web`)
- R17 `features/A` ↛ `features/B`; ghép feature chỉ ở `app/`.
- R18 Feature chỉ gọi server qua `kernel/http` + `features/A/api.ts`; component không `fetch` trực tiếp.
- R19 Kiểu dữ liệu lấy từ `packages/contracts`, không khai báo lại.

### Cách thực thi tự động
`tools/arch/` gồm:
1. `tools/arch/check.ts` (`pnpm arch`): mã hoá R1–R7, R12, M3, M7 (cấm theo đường dẫn).
2. `check-data-ownership.ts`: parse `schema/*.prisma` và quét `prisma.<model>`; kiểm R8, R9.
3. `check-module-docs.ts`: kiểm M10 và cấu trúc thư mục khuôn module.
4. Script `pnpm arch` chạy cả ba, đưa vào CI và pre-commit. Hook `.claude`/AGENTS.md của chính repo này cũng ghi các rule này để AI vibecoding không phá kiến trúc.

## 5. Danh mục module

| Module | Trách nhiệm (1 câu) | Dữ liệu sở hữu | API công khai (rút gọn) | Event phát | Port cần |
|---|---|---|---|---|---|
| **scm** | Nói chuyện với GitLab/GitHub, chuẩn hoá MR và webhook | không | `parseUrl`, `getMergeRequest`, `listOpen`, `upsertSummaryNote`, `postInline`, `verifyWebhook`, `parseWebhook`→`ScmEvent`, `gitAuth` | – | `Clock` |
| **workspace** | Chuẩn bị bản checkout cô lập và diff cho một commit | cache đĩa | `prepare({cloneUrl, auth, baseRef, headSha})`→`{dir, diff, numstat, dispose}` | – | – |
| **harness** | Đọc và xếp hạng tài liệu/quy tắc quy trình có trong thư mục repo | không | `load(dir, changedFiles, budget)`→`Harness` (kèm nội dung `.asdlc.yml` thô) | – | – |
| **framework** | Giữ rubric ASDLC và áp cấu hình riêng của repo | file YAML | `list`, `resolve(frameworkId, repoConfigYaml?)`→`Rubric` | – | – |
| **analysis** | Phát hiện vấn đề tất định từ diff/file (secret, debug, test bị skip…) | không | `analyze({diff, files})`→`Finding[]` | – | – |
| **reviewer** | Chạy provider AI và trả `RawReview` hợp lệ | không | `review(ReviewRequest)`→`RawReview`, `providers()` | – | `ProcessRunner`, `HttpClient` |
| **scoring** | Biến findings + rubric thành điểm/grade/gate/verdict | không | `score({rubric, findings, changedLines})`→`ScoreResult` (hàm thuần) | – | – |
| **publisher** | Dựng nội dung comment từ kết quả review | không | `renderSummary`, `renderInline`, `renderChatReply` | – | – |
| **queue** | Hàng đợi job generic có khử trùng, retry, lặp lịch | Redis | `enqueue(name, data, {dedupeKey})`, `process(name, handler)`, `repeat(name, every)` | `queue.job.failed` | – |
| **identity** | Quản lý thành viên và ánh xạ username→người | `Identity*` | `resolve(platform, username)`, `list/upsert/merge` | `identity.member.changed` | – |
| **repos** | Sổ repo được theo dõi và cấu hình theo repo (framework, provider, auto-review) | `Repo*` | `register`, `get(platform, path)`, `list`, `update` | `repos.repo.changed` | – |
| **reviews** | Lưu và truy vấn lịch sử MR/run/finding/điểm | `Review*` | `startRun`, `finishRun`, `getRun`, `listRuns`, `latestForMr`, `findingsOf`, `facts(range)` | `reviews.run.completed` | `Clock` |
| **analytics** | Tính metric, leaderboard, báo cáo kỳ | cache tổng hợp (tuỳ) | `overview(range)`, `leaderboard(range)`, `report(range)`, `exportMd/Csv` | – | `RunFactsSource`, `MemberDirectory` |
| **settings** | Lưu cấu hình runtime chỉnh từ UI | `Setting*` | `get`, `set`, `snapshot` | `settings.changed` | – |
| **secrets** | Lưu secret nhập từ UI (token GitLab, secret webhook) mã hoá AES-256-GCM; khoá ngoài DB | `Secret` | `load`, `peek`, `hint`, `set`, `delete` | – | – |

Ranh giới dễ nhầm:
- **Quyết định "có review MR này không"** (draft, tắt auto-review, trùng commit) là chính sách điều phối → `app/workflows/request-review.ts` gọi `repos` + `reviews`, không để trong `scm` hay `queue`.
- **Chia điểm theo kích thước MR, gate** → hoàn toàn trong `scoring`. `reviews` chỉ lưu kết quả.
- **Cách tính "first-pass score", rank Bayesian** → `analytics`; `reviews` chỉ cung cấp dữ kiện thô qua `facts(range)`.
- **Thẻ `.asdlc.yml`**: `harness` chỉ tìm và đưa nội dung thô; `framework` mới hiểu và áp dụng.
- **Đăng comment**: `publisher` dựng nội dung, `scm` gửi, `app/workflows` ghép hai bên.

## 6. Luồng ví dụ (xác minh ranh giới)

```
POST /webhooks/gitlab
 └ app/http  → scm.verifyWebhook / scm.parseWebhook ⇒ ScmEvent
 └ workflow request-review:
     repos.get(...)            (có auto-review không?)
     reviews.latestForMr(...)  (commit này đã review chưa?)
     queue.enqueue("review", dto, {dedupeKey: mr:headSha})
queue handler "review" → workflow review-merge-request:
     scm.getMergeRequest   → workspace.prepare(auth từ scm.gitAuth)
     harness.load(dir)     → framework.resolve(id, harness.repoConfigYaml)
     analysis.analyze      → reviewer.review({rubric, harness, diff, staticFindings})
     scoring.score(...)    → reviews.finishRun(... kết quả ...)   [phát reviews.run.completed]
     publisher.renderSummary/Inline → scm.upsertSummaryNote / scm.postInline
     workspace dispose
```
Không module nào gọi module khác; chỉ `workflow` nối chúng. `analytics` nhận dữ liệu qua `RunFactsSource` (adapter gọi `reviews.facts`) và `MemberDirectory` (adapter gọi `identity.list`).

## 7. Mẫu mã (để thống nhất)

```ts
// modules/scoring/index.ts — cổng duy nhất
export { createScoringModule } from "./api";
export type { ScoringApi, ScoreInput } from "./api";

// modules/analytics/ports.ts — analytics tự khai báo thứ nó cần
export interface RunFactsSource { facts(range: DateRange): Promise<RunFact[]> }
export interface MemberDirectory { list(): Promise<MemberRef[]> }

// app/adapters/analytics.ts — nối port với module khác, chỉ ở đây
export const runFactsAdapter = (reviews: ReviewsApi): RunFactsSource => ({
  facts: (range) => reviews.facts(range),
});

// app/container.ts — composition root
const reviews = createReviewsModule({ db, clock, events });
const analytics = createAnalyticsModule({ runFacts: runFactsAdapter(reviews), members: memberAdapter(identity) });
```

## 8. Kiểm thử theo tầng
- **Module**: unit test `domain/` (thuần) + test `api` với fake port; `infra` test nhẹ với SQLite tạm/thư mục tạm. Không cần Redis hay mạng.
- **Contract**: test schema zod trong `packages/contracts` (snapshot) để thay đổi DTO không âm thầm.
- **Workflow**: test `app/workflows` với module thật hoặc fake; một test end-to-end dùng provider giả và repo git mẫu cục bộ (không cần GitLab).
- **Kiến trúc**: `pnpm arch` trong CI.

## 9. Ánh xạ code đã viết → module

| Hiện tại | Đích |
|---|---|
| `platforms/{gitlab,github,types,index}.ts` | `modules/scm` (`infra/gitlab.ts`, `infra/github.ts`, `api.ts`) |
| `pipeline/workspace.ts` | `modules/workspace` |
| `harness/loader.ts` | `modules/harness` (phần `RepoConfigSchema` chuyển sang `framework`) |
| `framework/loader.ts` | `modules/framework` |
| `config.ts`, `util/exec.ts`, `db.ts` | `kernel/` (chỉ dùng từ `infra/`, `config` chỉ ở `main.ts`/`app`) |
| `packages/shared` | đổi tên `packages/contracts`, tách theo file, bỏ DTO của dashboard sang module chủ |
| `prisma/schema.prisma` | tách `schema/{identity,repos,reviews,…}.prisma`, bỏ relation chéo module (`MergeRequest.memberId` → ID chuỗi, `MergeRequest.repositoryId` → ID chuỗi) |

## 10. Lộ trình thực hiện (theo thứ tự, mỗi bước chạy được)
1. **Nền:** `packages/contracts`, `kernel`, `tools/arch` + `pnpm arch` (rule có hiệu lực ngay từ đầu), schema Prisma chia module.
2. **Module lá thuần (dễ test, không I/O hoặc I/O nhỏ):** `framework`, `scoring`, `analysis`, `publisher`, `harness`.
3. **Module hạ tầng:** `workspace`, `scm`, `queue`, `reviewer`.
4. **Module dữ liệu:** `identity`, `repos`, `reviews`, `settings`, rồi `analytics`.
5. **`app/`:** container, adapters, workflows, http (webhook, chat, manual, poller).
6. **Web:** `kernel` + từng `features/*` theo cùng luật; **desktop:** vỏ Electron mỏng.
7. **Xác minh:** `pnpm arch`, typecheck, test từng module, chạy thử một MR thật với provider `claude-cli`.

## Ghi chú triển khai (đã chốt khi code)

- Kiểm tra kiến trúc là script `tools/arch/check.ts`; `import type` từ `kernel/db|exec` được phép, import giá trị chỉ trong `infra/`.
- Module ném `ModuleError(module, code, msg)`; `kernel/http` map sang HTTP status.
- `.asdlc.yml` của repo được đọc từ **commit gốc của nhánh đích** (không phải nhánh MR) để tác giả MR không tự nới rubric; `.asdlc.yml` bị sửa trong MR sẽ bị cờ HAR-03. Provider AI **không** chọn được qua `.asdlc.yml`.
- Module `reviewer` tự dựng prompt và gọi CLI/HTTP trong `infra/`, không dùng port ra ngoài.
