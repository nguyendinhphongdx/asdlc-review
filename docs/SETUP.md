# Cài đặt và review MR đầu tiên

Làm theo từng bước dưới đây, bạn sẽ có một MR thật được review và comment dưới tên bot. Mất khoảng 15 phút.

## 0. Chuẩn bị
| Cần có | Kiểm tra |
|---|---|
| Node.js 22+, pnpm 10+, git | `node -v`, `pnpm -v`, `git --version` |
| AI: `claude` CLI đã đăng nhập (mặc định) | `claude --version`, mở `claude` một lần để đăng nhập |
| GitLab (gitlab.com hoặc tự host) | bạn là Maintainer của repo thử |
| Redis (tuỳ chọn) | không có thì đặt `REDIS_URL=memory` trong `.env` |

```bash
git clone https://github.com/nguyendinhphongdx/asdlc-review.git
cd asdlc-review
cp .env.example .env
pnpm install
pnpm build
pnpm --filter @mrd/server start      # hoặc: pnpm desktop
```
Mở http://localhost:4319.

## 1. Tạo token cho bot
Nên dùng một **tài khoản bot riêng** (hoặc Project/Group Access Token) để comment hiện dưới tên bot, không phải tên bạn.

**Các bước**
1. Đăng nhập GitLab bằng tài khoản bot → **Preferences → Access tokens** → **Add new token**.
   (Project/Group token: vào project/group → **Settings → Access tokens**.)
2. Đặt tên (vd `asdlc-review`) và hạn dùng (≤ 1 năm; ghi lại ngày hết hạn).
3. Chọn scope:

| Scope | Bắt buộc | Dùng để |
|---|---|---|
| `api` | có | đọc MR, đăng/cập nhật comment và inline, tạo webhook |
| `read_repository` | có | clone repo để review |

   Token chỉ có `read_api` **không đủ** (kiểm tra kết nối sẽ báo thiếu scope `api`).
4. Với Project/Group token, chọn role: **Developer** để review và comment; **Maintainer** nếu muốn nút "Tạo webhook tự động".
5. Bấm **Create** và **sao chép token ngay**: GitLab chỉ hiện một lần (dạng `glpat-…`).
6. Thêm bot vào repo/group cần review (với PAT của tài khoản bot: Members → role Developer trở lên).

## 2. Kết nối trong ứng dụng
**Cài đặt → Kết nối → GitLab**: nhập URL (vd `https://gitlab.com`) và token, bấm **Lưu**, rồi **Kiểm tra kết nối**. Bạn sẽ thấy:
- tên tài khoản bot, scope, ngày hết hạn, số repo truy cập được;
- trạng thái AI (`claude` có chạy được trên máy này không).

Nếu lỗi, thông báo nói rõ nguyên nhân (URL không tới được, token sai/hết hạn, thiếu scope `api`, chưa thêm bot vào repo nào).

Token được **mã hoá AES-256-GCM** rồi lưu trong DB; khoá nằm ngoài DB:
- app desktop: keychain của hệ điều hành;
- server: biến `MRD_SECRET_KEY` (≥ 16 ký tự), nếu không đặt thì tự tạo file `data/secret.key` (quyền 0600).

Token không bao giờ xuất hiện trong response API, log hay giao diện (chỉ hiện 4 ký tự cuối). **Backup:** nếu chép DB sang máy khác, phải chép cả khoá (`MRD_SECRET_KEY` hoặc `secret.key`), nếu không thì phải nhập lại token.

Không muốn nhập trên UI? Đặt `GITLAB_URL`, `GITLAB_TOKEN`, `GITLAB_WEBHOOK_SECRET` trong `.env` — giá trị lưu từ UI được ưu tiên hơn.

## 3. Thêm repo và webhook
**Repository → Thêm repository**, nhập `group/project` hoặc link repo. Ứng dụng xác nhận token truy cập được repo, rồi hướng dẫn webhook:

**Tự động** (token là Maintainer): bấm **Tạo webhook tự động**.

**Thủ công**: Project → Settings → Webhooks → Add new webhook
- URL: `<PUBLIC_URL>/webhooks/gitlab` (đúng như app hiển thị)
- Secret token: bấm **Hiện/Sao chép** trong app
- Trigger: **Merge request events** và **Comments**
- Bỏ chọn *Enable SSL verification* nếu GitLab của bạn dùng chứng chỉ tự ký

> `PUBLIC_URL` phải là địa chỉ mà **GitLab truy cập được**. Chạy trên laptop sau NAT: dùng tunnel (ngrok, cloudflared) hoặc bật `POLL_INTERVAL_MIN=5` để quét định kỳ thay cho webhook.

Trạng thái webhook trên trang repo: **Hoạt động** (đã nhận sự kiện hợp lệ), **Chưa nhận sự kiện** (bấm *Test → Merge request events* trên GitLab), **Lỗi** (sự kiện gần nhất bị từ chối, thường do sai secret — mở chi tiết repo để xem nhật ký).

## 4. Review MR đầu tiên
- **Dán link**: trang Reviews → dán link MR → xem tiến trình từng bước. MR ≤ 500 dòng thường xong trong vài phút.
- **Tự động**: mở MR mới hoặc push commit mới → webhook kích hoạt; comment tổng **được cập nhật** (không tạo mới), inline không đăng trùng.
- **Chat**: comment `/review` (hoặc `@mr-reviewer review`) trong MR.

## 5. Giới hạn an toàn (Cài đặt → Review)
| Cài đặt | Mặc định | Ý nghĩa |
|---|---|---|
| Bỏ qua MR nháp | bật | Draft/WIP không được review tự động (dán link thủ công vẫn chạy) |
| Ngân sách diff | 120 000 ký tự | Diff lớn hơn: review phần ưu tiên, liệt kê file bị bỏ qua trong báo cáo và comment |
| Ngưỡng inline, số inline tối đa, `PUBLISH_COMMENTS` | `major`, 15, bật | Điều khiển mức độ comment lên MR |

## 6. Xử lý sự cố
| Triệu chứng | Nguyên nhân thường gặp |
|---|---|
| Kiểm tra kết nối: *không kết nối được* | URL sai, VPN, chứng chỉ tự ký (đặt `NODE_EXTRA_CA_CERTS`) |
| *token sai/hết hạn* | Tạo lại token, dán lại |
| *thiếu scope api* | Token chỉ có `read_api`; tạo token có `api` |
| *không thấy repo nào* | Bot chưa được thêm vào project/group |
| Webhook **Lỗi** | Secret trên GitLab khác secret trong app → copy lại từ app |
| Webhook **Chưa nhận** | `PUBLIC_URL` GitLab không tới được; xem tab *Recent events* của webhook trên GitLab |
| Review lỗi ở bước *clone* | Token thiếu `read_repository` hoặc bot không có quyền repo |
| Review lỗi ở bước *review* | `claude` chưa đăng nhập hoặc không có trong `PATH` (đặt `CLAUDE_BIN`) |
| Đã review commit này | Cùng head SHA không review lại; dùng **Chạy lại** để ép |

## 7. Dữ liệu và sao lưu
- SQLite tại `data/mrd.db`; cache repo `data/repos/`; workspace tạm `data/runs/`.
- Sao lưu: dừng server, chép `data/mrd.db` **và** khoá (`secret.key` hoặc `MRD_SECRET_KEY`).
- Cấu trúc DB tự cập nhật khi khởi động nếu schema đổi.
