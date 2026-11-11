/** Hợp đồng chat với agent và sổ tay bài học (M2). */
export interface ChatMessageDto { id: string; role: "user" | "agent" | "system"; text: string; createdAt: string }
export type LessonStatus = "proposed" | "active" | "rejected";
export interface LessonDto { id: string; repoId: string; text: string; status: LessonStatus; source: "user" | "agent" | "feedback"; createdAt: string }
export interface ChatStateDto { messages: ChatMessageDto[]; lessons: LessonDto[] }
export interface ChatReplyDto { reply: string; lessons: string[]; queued?: boolean }
