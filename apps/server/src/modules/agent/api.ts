import type { Db } from "../../kernel/db.js";
import { ModuleError } from "../../kernel/errors.js";
import { extractLessons } from "./domain/lessons.js";

export type LessonStatus = "proposed" | "active" | "rejected";
export interface MessageDto { id: string; mrId: string; role: "user" | "agent" | "system"; text: string; steps?: unknown[]; createdAt: string }
export interface LessonDto { id: string; repoId: string; text: string; status: LessonStatus; source: "user" | "agent" | "feedback"; mrId: string | null; createdAt: string }

export interface ActionDto { id: string; mrId: string; kind: "comment" | "rerun"; payload: { file?: string; line?: number; body?: string; reason?: string }; status: "pending" | "done" | "dismissed"; createdAt: string }

export interface AgentDeps { db: Db }

export interface AgentApi {
  addMessage(mrId: string, role: MessageDto["role"], text: string, steps?: unknown[]): Promise<MessageDto>;
  listMessages(mrId: string, limit?: number): Promise<MessageDto[]>;
  addLesson(input: { repoId: string; text: string; source: LessonDto["source"]; status: LessonStatus; mrId?: string }): Promise<LessonDto | null>;
  listLessons(repoId: string, status?: LessonStatus): Promise<LessonDto[]>;
  getLesson(id: string): Promise<LessonDto>;
  setLessonStatus(id: string, status: LessonStatus): Promise<LessonDto>;
  removeLesson(id: string): Promise<void>;
  /** Các bài học đang bật của repo, mới nhất trước (để nạp vào prompt). */
  notebook(repoId: string): Promise<string[]>;
  /** Đề xuất của agent (đăng comment / chạy lại) chờ người duyệt. */
  addAction(mrId: string, kind: ActionDto["kind"], payload: ActionDto["payload"]): Promise<ActionDto>;
  listActions(mrId: string, status?: ActionDto["status"]): Promise<ActionDto[]>;
  getAction(id: string): Promise<ActionDto>;
  setActionStatus(id: string, status: ActionDto["status"]): Promise<ActionDto>;
  extractLessons: typeof extractLessons;
}

const MAX_ACTIVE_IN_PROMPT = 40;
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function createAgentModule({ db }: AgentDeps): AgentApi {
  const msg = (r: { id: string; mrId: string; role: string; text: string; steps?: string | null; createdAt: Date }): MessageDto => ({ id: r.id, mrId: r.mrId, role: r.role as MessageDto["role"], text: r.text, ...(r.steps ? { steps: JSON.parse(r.steps) as unknown[] } : {}), createdAt: r.createdAt.toISOString() });
  const les = (r: { id: string; repoId: string; text: string; status: string; source: string; mrId: string | null; createdAt: Date }): LessonDto => ({ id: r.id, repoId: r.repoId, text: r.text, status: r.status as LessonStatus, source: r.source as LessonDto["source"], mrId: r.mrId, createdAt: r.createdAt.toISOString() });
  const get = async (id: string) => {
    const r = await db.agentLesson.findUnique({ where: { id } });
    if (!r) throw new ModuleError("agent", "not_found", "Không thấy bài học");
    return r;
  };
  const act = (r: { id: string; mrId: string; kind: string; payload: string; status: string; createdAt: Date }): ActionDto => ({ id: r.id, mrId: r.mrId, kind: r.kind as ActionDto["kind"], payload: JSON.parse(r.payload) as ActionDto["payload"], status: r.status as ActionDto["status"], createdAt: r.createdAt.toISOString() });
  return {
    extractLessons,
    async addAction(mrId, kind, payload) {
      const clean = { ...payload, body: payload.body?.slice(0, 4000), reason: payload.reason?.slice(0, 400) };
      return act(await db.agentAction.create({ data: { mrId, kind, payload: JSON.stringify(clean), status: "pending" } }));
    },
    async listActions(mrId, status) {
      const rows = await db.agentAction.findMany({ where: { mrId, ...(status ? { status } : { status: "pending" }) }, orderBy: { createdAt: "asc" } });
      return rows.map(act);
    },
    async getAction(id) {
      const r = await db.agentAction.findUnique({ where: { id } });
      if (!r) throw new ModuleError("agent", "not_found", "Không thấy đề xuất");
      return act(r);
    },
    async setActionStatus(id, status) {
      await this.getAction(id);
      return act(await db.agentAction.update({ where: { id }, data: { status } }));
    },
    async addMessage(mrId, role, text, steps) {
      return msg(await db.agentMessage.create({ data: { mrId, role, text: text.slice(0, 20_000), steps: steps?.length ? JSON.stringify(steps).slice(0, 60_000) : null } }));
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
