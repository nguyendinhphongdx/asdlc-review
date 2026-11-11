import type { Db } from "../../kernel/db.js";
import { ModuleError } from "../../kernel/errors.js";
import { extractLessons } from "./domain/lessons.js";

export type LessonStatus = "proposed" | "active" | "rejected";
export interface MessageDto { id: string; mrId: string; role: "user" | "agent" | "system"; text: string; createdAt: string }
export interface LessonDto { id: string; repoId: string; text: string; status: LessonStatus; source: "user" | "agent" | "feedback"; mrId: string | null; createdAt: string }

export interface AgentDeps { db: Db }

export interface AgentApi {
  addMessage(mrId: string, role: MessageDto["role"], text: string): Promise<MessageDto>;
  listMessages(mrId: string, limit?: number): Promise<MessageDto[]>;
  addLesson(input: { repoId: string; text: string; source: LessonDto["source"]; status: LessonStatus; mrId?: string }): Promise<LessonDto | null>;
  listLessons(repoId: string, status?: LessonStatus): Promise<LessonDto[]>;
  getLesson(id: string): Promise<LessonDto>;
  setLessonStatus(id: string, status: LessonStatus): Promise<LessonDto>;
  removeLesson(id: string): Promise<void>;
  /** Các bài học đang bật của repo, mới nhất trước (để nạp vào prompt). */
  notebook(repoId: string): Promise<string[]>;
  extractLessons: typeof extractLessons;
}

const MAX_ACTIVE_IN_PROMPT = 40;
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function createAgentModule({ db }: AgentDeps): AgentApi {
  const msg = (r: { id: string; mrId: string; role: string; text: string; createdAt: Date }): MessageDto => ({ id: r.id, mrId: r.mrId, role: r.role as MessageDto["role"], text: r.text, createdAt: r.createdAt.toISOString() });
  const les = (r: { id: string; repoId: string; text: string; status: string; source: string; mrId: string | null; createdAt: Date }): LessonDto => ({ id: r.id, repoId: r.repoId, text: r.text, status: r.status as LessonStatus, source: r.source as LessonDto["source"], mrId: r.mrId, createdAt: r.createdAt.toISOString() });
  const get = async (id: string) => {
    const r = await db.agentLesson.findUnique({ where: { id } });
    if (!r) throw new ModuleError("agent", "not_found", "Không thấy bài học");
    return r;
  };
  return {
    extractLessons,
    async addMessage(mrId, role, text) {
      return msg(await db.agentMessage.create({ data: { mrId, role, text: text.slice(0, 20_000) } }));
    },
    async listMessages(mrId, limit = 200) {
      const rows = await db.agentMessage.findMany({ where: { mrId }, orderBy: { createdAt: "desc" }, take: limit });
      return rows.reverse().map(msg);
    },
    async addLesson({ repoId, text, source, status, mrId }) {
      const t = text.trim().slice(0, 400);
      if (t.length < 8) throw new ModuleError("agent", "invalid_input", "Bài học quá ngắn (tối thiểu 8 ký tự)");
      const existing = await db.agentLesson.findMany({ where: { repoId, status: { in: ["proposed", "active"] } } });
      if (existing.some((e) => norm(e.text) === norm(t))) return null; // đã có, không nhân đôi
      return les(await db.agentLesson.create({ data: { repoId, text: t, source, status, mrId: mrId ?? null } }));
    },
    async listLessons(repoId, status) {
      const rows = await db.agentLesson.findMany({ where: { repoId, ...(status ? { status } : { status: { not: "rejected" } }) }, orderBy: { createdAt: "desc" } });
      return rows.map(les);
    },
    async getLesson(id) {
      return les(await get(id));
    },
    async setLessonStatus(id, status) {
      await get(id);
      return les(await db.agentLesson.update({ where: { id }, data: { status } }));
    },
    async removeLesson(id) {
      await get(id);
      await db.agentLesson.delete({ where: { id } });
    },
    async notebook(repoId) {
      const rows = await db.agentLesson.findMany({ where: { repoId, status: "active" }, orderBy: { createdAt: "desc" }, take: MAX_ACTIVE_IN_PROMPT });
      return rows.map((r) => r.text);
    },
  };
}
