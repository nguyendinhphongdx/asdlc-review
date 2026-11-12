# queue

## Trách nhiệm
Hàng đợi job generic: thêm job có khử trùng, xử lý song song có giới hạn, thử lại, lặp theo lịch. Không biết gì về nội dung job.

## API
- `enqueue(queue, data, { jobId?, delayMs?, attempts? })` → `{ id, deduplicated }`.
- `process(queue, handler, { concurrency? })`, `repeat(queue, key, data, everyMs)`, `stats(queue)`, `close()`.

## Sự kiện
Không phát, không nhận.

## Dữ liệu
Chế độ `sqlite` (mặc định): bảng `QueueJob` (prisma/schema/queue.prisma) giữ job chưa xong. Chế độ `bullmq`: trạng thái nằm trong Redis.

## Port
Không cần port.

## Quyết định
- Các driver sau cùng một interface: `sqlite` (mặc định: hàng đợi trong process + lưu job vào SQLite, nạp lại khi khởi động, job chạy dở được chạy lại tối đa `attempts` lần), `memory` (không lưu; test) và `bullmq` (Redis, tuỳ chọn khi chạy nhiều server).
- jobId trùng khi job còn chờ/đang chạy thì bị bỏ qua (khử trùng); job đã xong thì được phép thêm lại.
- Dấu ":" trong jobId được thay bằng "_" vì BullMQ không chấp nhận.
