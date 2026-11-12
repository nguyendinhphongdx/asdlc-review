import type { ActionDto as ActionContract } from "@mrd/contracts";
import type { Db } from "../../kernel/db.js";
import { ModuleError } from "../../kernel/errors.js";
import { pathsMatch } from "./domain/glob.js";
import { extractLessons } from "./domain/lessons.js";

export type LessonStatus = "proposed" | "active" | "rejected";
export interface MessageDto { id: string; mrId: string; role: "user" | "agent" | "system"; text: string; steps?: unknown[]; createdAt: string }
export type LessonKind = "conv" | "arch" | "skip" | "term";
export interface LessonDto { id: string; repoId: string; text: string; status: LessonStatus; source: "user" | "agent" | "feedback"; kind: LessonKind; paths: string; mrId: string | null; createdAt: string }
export interface NoteDto { id: string; mrId: string; author: string; text: string; createdAt: string }
const KINDS: LessonKind[] = ["conv", "arch", "skip", "term"];
const KIND_LABEL: Record<LessonKind, string> = { conv: "quy ước", arch: "kiến trúc", skip: "bỏ qua", term: "thuật ngữ" };

export interface ActionDto { id: string; mrId: string; kind: ActionContract["kind"]; payload: ActionContract["payload"]; status: "pending" | "done" | "dismissed"; createdAt: string }

export interface AgentDeps { db: Db }

export interface AgentApi {
  addMessage(mrId: string, role: MessageDto["role"], text: string, steps?: unknown[]): Promise<MessageDto>;
  listMessages(mrId: string, limit?: number): Promise<MessageDto[]>;
  addLesson(input: { repoId: string; text: string; source: LessonDto["source"]; status: LessonStatus; mrId?: string; kind?: LessonKind; paths?: string }): Promise<LessonDto | null>;
  updateLesson(id: string, patch: { text?: string; kind?: LessonKind; paths?: string }): Promise<LessonDto>;
  addNote(mrId: string, author: string, text: string): Promise<NoteDto>;
  listNotes(mrId: string): Promise<NoteDto[]>;
  removeNote(id: string): Promise<void>;
  listLessons(repoId: string, status?: LessonStatus): Promise<LessonDto[]>;
  getLesson(id: string): Promise<LessonDto>;
  setLessonStatus(id: string, status: LessonStatus): Promise<LessonDto>;
  removeLesson(id: string): Promise<void>;
  /** Bộ nhớ đang bật của repo (để nạp vào prompt), gắn nhãn loại + phạm vi. Có `changedFiles` thì chỉ lấy mục có phạm vi trùng file đổi (mục không có phạm vi luôn lấy). */
  notebook(repoId: string, changedFiles?: string[]): Promise<string[]>;
  /** Đề xuất của agent (đăng comment / chạy lại / sửa framework) chờ người duyệt. `mrId` là khoá phạm vi: id MR, hoặc `fw:<frameworkId>` cho chat framework. */
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
  const les = (r: { id: string; repoId: string; text: string; status: string; source: string; kind?: string; paths?: string; mrId: string | null; createdAt: Date }): LessonDto => ({ id: r.id, repoId: r.repoId, text: r.text, status: r.status as LessonStatus, source: r.source as LessonDto["source"], kind: (KINDS.includes(r.kind as LessonKind) ? r.kind : "conv") as LessonKind, paths: r.paths ?? "", mrId: r.mrId, createdAt: r.createdAt.toISOString() });
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
    async addLesson({ repoId, text, source, status, mrId, kind, paths }) {
      const t = text.trim().slice(0, 400);
      if (t.length < 8) throw new ModuleError("agent", "invalid_input", "Bài học quá ngắn (tối thiểu 8 ký tự)");
      const existing = await db.agentLesson.findMany({ where: { repoId, status: { in: ["proposed", "active"] } } });
      if (existing.some((e) => norm(e.text) === norm(t))) return null; // đã có, không nhân đôi
      return les(await db.agentLesson.create({ data: { repoId, text: t, source, status, mrId: mrId ?? null, kind: kind && KINDS.includes(kind) ? kind : "conv", paths: (paths ?? "").trim().slice(0, 300) } }));
    },
    async updateLesson(id, patch) {
      await get(id);
      const data: { text?: string; kind?: string; paths?: string } = {};
      if (patch.text != null) { const t = patch.text.trim().slice(0, 400); if (t.length < 8) throw new ModuleError("agent", "invalid_input", "Bài học quá ngắn (tối thiểu 8 ký tự)"); data.text = t; }
      if (patch.kind && KINDS.includes(patch.kind)) data.kind = patch.kind;
      if (patch.paths != null) data.paths = patch.paths.trim().slice(0, 300);
      return les(await db.agentLesson.update({ where: { id }, data }));
    },
    async addNote(mrId, author, text) {
      const t = text.trim().slice(0, 1000);
      if (t.length < 3) throw new ModuleError("agent", "invalid_input", "Ghi chú quá ngắn");
      const r = await db.agentNote.create({ data: { mrId, author: author.slice(0, 80) || "người dùng", text: t } });
      return { id: r.id, mrId: r.mrId, author: r.author, text: r.text, createdAt: r.createdAt.toISOString() };
    },
    async listNotes(mrId) {
      const rows = await db.agentNote.findMany({ where: { mrId }, orderBy: { createdAt: "asc" }, take: 50 });
      return rows.map((r) => ({ id: r.id, mrId: r.mrId, author: r.author, text: r.text, createdAt: r.createdAt.toISOString() }));
    },
    async removeNote(id) {
      await db.agentNote.deleteMany({ where: { id } });
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
    async notebook(repoId, changedFiles) {
      const all = await db.agentLesson.findMany({ where: { repoId, status: "active" }, orderBy: { createdAt: "desc" } });
      const rows = all.filter((r) => pathsMatch(r.paths ?? "", changedFiles ?? [])).slice(0, MAX_ACTIVE_IN_PROMPT);
      return rows.map((r) => {
        const k = KIND_LABEL[(KINDS.includes(r.kind as LessonKind) ? r.kind : "conv") as LessonKind];
        return `[${k}${r.paths ? ` · ${r.paths}` : ""}] ${r.text}`;
      });
    },
  };
}
