# workspace

## Trách nhiệm
Chuẩn bị bản checkout cô lập (bare cache + git worktree) và diff cho một commit của MR, rồi dọn sạch sau khi dùng.

## API
- `prepare({ repoKey, runId, cloneUrl, authHeader?, targetBranch, headRef, headSha, baseSha? })` → `{ dir, baseSha, headSha, diff, diffForPrompt, omittedFiles, numstat, dispose() }`.

## Sự kiện
Không phát, không nhận.

## Dữ liệu
Không có bảng. Quản lý thư mục `reposDir` (bare cache) và `runsDir` (worktree theo run) do app truyền vào.

## Port
Không cần port.

## Quyết định
- Không biết GitLab/GitHub: ref và token do app truyền vào.
- Token chỉ truyền theo từng lệnh git (`http.extraHeader`), không ghi vào cấu hình repo.
- Code MR là dữ liệu không tin cậy: gỡ `.claude/settings*.json`, `.mcp.json`, `.codex/config.toml` khỏi worktree trước khi agent CLI chạy.
- Khoá theo repo để fetch song song vào cùng một bare repo không đè nhau.
