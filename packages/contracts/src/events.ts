/** Sự kiện toàn hệ thống (tên ở quá khứ, payload nhỏ). Module phát sự kiện tự khai báo ở events.ts của mình; đây là vocabulary chung. */
export interface RunActivityEntry {
  at: string;
  /** Stage pipeline: clone | framework | harness | analysis | review | score | publish. */
  stage: string;
  /** info = bước chạy; tool = AI đọc/tìm file; ai = AI suy luận; warn = cảnh báo/lỗi; done = hoàn tất bước. */
  level: "info" | "tool" | "ai" | "warn" | "done";
  message: string;
}
export interface DomainEvents {
  "reviews.run.progress": { runId: string; mrId: string; entry: RunActivityEntry };
  "reviews.run.completed": { runId: string; mrId: string; score: number | null; grade: string | null };
  "reviews.run.failed": { runId: string; mrId: string; error: string };
  "identity.member.changed": { memberId: string };
  "repos.repo.changed": { repoId: string };
  "settings.changed": { keys: string[] };
}
export type DomainEventName = keyof DomainEvents;
