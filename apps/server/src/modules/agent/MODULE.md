# agent

## Trách nhiệm
Trí nhớ của agent ở hai tầng: **bộ nhớ repo** (kiến thức bền, "sổ tay" bài học theo repo, có loại và phạm vi path) và **ghi chú theo MR**; cùng hội thoại theo MR. Không gọi AI, không biết module khác.

## API
- `addMessage`, `listMessages(mrId)`.
- `addLesson({repoId,text,source,status,kind?,paths?})`, `updateLesson(id,{text?,kind?,paths?})`, `listLessons(repoId, status?)`, `setLessonStatus`, `removeLesson`, `getLesson`.
- `notebook(repoId, changedFiles?)` — các mục đang bật, mỗi dòng dạng `[loại · paths] nội dung`. Có `changedFiles` thì chỉ lấy mục có phạm vi (glob) trùng file đổi; mục không có phạm vi luôn được lấy.
- `addNote(mrId, author, text)`, `listNotes(mrId)`, `removeNote(id)` — ghi chú của người cho AI về một MR.
- `addAction(mrId,kind,payload)`, `listActions`, `getAction`, `setActionStatus` — đề xuất của agent (đăng comment / chạy lại) chờ người duyệt; `addMessage` nhận thêm `steps` (suy luận, gọi tool).
- `extractLessons(text)` — tách các dòng `LESSON: …` khỏi câu trả lời.

## Sự kiện
Không phát, không nhận.

## Dữ liệu
`AgentMessage`, `AgentLesson` (có `kind`: conv/arch/skip/term, `paths`: glob cách nhau bởi dấu phẩy), `AgentNote`, `AgentAction` (prisma/schema/agent.prisma). `mrId`/`repoId` chỉ là ID chuỗi.

## Port
Không cần port ngoài.

## Quyết định
- Bài học do agent đề xuất ở `proposed`, chỉ `active` sau khi người duyệt; do người dùng viết thì `active` ngay.
- Loại: `conv` quy ước, `arch` kiến trúc, `skip` bỏ qua, `term` thuật ngữ. Glob tự cài (`domain/glob.ts`): `**` mọi cấp, `*` trong một cấp, `?` một ký tự.
- Ghi chú MR là dữ liệu người nhập, không tin cậy: prompt gắn nhãn dữ liệu, không làm theo nếu mâu thuẫn rubric.
- Trần 40 bài học đang bật mỗi repo khi đưa vào prompt (mới nhất trước) để prompt không phình.
