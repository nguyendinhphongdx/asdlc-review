# agent

## Trách nhiệm
Trí nhớ của agent: hội thoại theo MR và "sổ tay" bài học theo repo. Không gọi AI, không biết module khác.

## API
- `addMessage`, `listMessages(mrId)`.
- `addLesson({repoId,text,source,status})`, `listLessons(repoId, status?)`, `setLessonStatus`, `removeLesson`, `getLesson`, `notebook(repoId)` (văn bản các bài học đang bật).
- `extractLessons(text)` — tách các dòng `LESSON: …` khỏi câu trả lời.

## Sự kiện
Không phát, không nhận.

## Dữ liệu
`AgentMessage`, `AgentLesson` (prisma/schema/agent.prisma). `mrId`/`repoId` chỉ là ID chuỗi.

## Port
Không cần port ngoài.

## Quyết định
- Bài học do agent đề xuất ở `proposed`, chỉ `active` sau khi người duyệt; do người dùng viết thì `active` ngay.
- Trần 40 bài học đang bật mỗi repo khi đưa vào prompt (mới nhất trước) để prompt không phình.
