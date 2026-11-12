/** Hợp đồng chat với agent và sổ tay bài học (M2). */
export type ChatStepDto =
  | { kind: "thinking"; text: string }
  | { kind: "tool"; id: string; name: string; input: Record<string, unknown>; output?: string; error?: boolean };
export interface ChatMessageDto { id: string; role: "user" | "agent" | "system"; text: string; steps?: ChatStepDto[]; createdAt: string }
export type LessonStatus = "proposed" | "active" | "rejected";
export interface LessonDto { id: string; repoId: string; text: string; status: LessonStatus; source: "user" | "agent" | "feedback"; createdAt: string }
export interface ActionDto {
  id: string;
  kind: "comment" | "rerun";
  /** comment: file?, line?, body. rerun: reason. */
  payload: { file?: string; line?: number; body?: string; reason?: string };
  status: "pending" | "done" | "dismissed";
  createdAt: string;
}
export interface ChatStateDto { messages: ChatMessageDto[]; lessons: LessonDto[]; actions: ActionDto[]; /** Các bước đang làm dở của lượt trả lời hiện tại (nếu agent đang bận). */ live?: ChatStepDto[] | null }
export interface ChatImageDto { mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp"; data: string }
export interface ChatReplyDto { reply: string; lessons: string[]; queued?: boolean }
