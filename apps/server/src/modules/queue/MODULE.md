# queue

## Trách nhiệm
Hàng đợi job generic: thêm job có khử trùng, xử lý song song có giới hạn, thử lại, lặp theo lịch. Không biết gì về nội dung job.

## API
- `enqueue(queue, data, { jobId?, delayMs?, attempts? })` → `{ id, deduplicated }`.
- `process(queue, handler, { concurrency? })`, `repeat(queue, key, data, everyMs)`, `stats(queue)`, `close()`.

## Sự kiện
Không phát, không nhận.

## Dữ liệu
Trạng thái job nằm trong Redis (BullMQ). Không có bảng SQLite.

## Port
Không cần port.

## Quyết định
- Hai driver sau cùng một interface: `bullmq` (Redis) và `memory` (dev/test, đặt `REDIS_URL=memory`).
- jobId trùng khi job còn chờ/đang chạy thì bị bỏ qua (khử trùng); job đã xong thì được phép thêm lại.
- Dấu ":" trong jobId được thay bằng "_" vì BullMQ không chấp nhận.
