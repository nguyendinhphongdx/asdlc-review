import { randomBytes } from "node:crypto";
import type {
  ConfigPreviewDto, ConfigPreviewInput, FrameworkChangeDto, FrameworkDetailDto, FrameworkEditInput, FrameworkInfoDto, FrameworkKind, ForkFrameworkInput, Rubric,
} from "@mrd/contracts";
import type { Db } from "../../kernel/db.js";
import { ModuleError } from "../../kernel/errors.js";
import { applyEdit, diffFrameworks, validateEdit } from "./domain/edit.js";
import { buildRubric, checkRepoConfig, parseRepoConfig } from "./domain/resolve.js";
import type { FrameworkFile, RepoConfig } from "./domain/schema.js";
import { DbFrameworkStore } from "./infra/db-store.js";
import { FsFrameworkSource } from "./infra/fs-source.js";

export interface FrameworkDeps {
  frameworksDir: string;
  /** DB của module (bảng CustomFramework/FrameworkVersion). Không truyền = chỉ dùng framework file. */
  db?: Db;
  defaultFrameworkId?: string;
}

export type FrameworkInfo = Omit<FrameworkInfoDto, "repoCount"> ;

export interface ResolveInput {
  /** Ghi đè từ cấu hình repo trong hệ thống (ưu tiên thấp hơn `.asdlc.yml`). */
  frameworkId?: string | null;
  /** Nội dung thô của `.asdlc.yml` (nếu repo có). */
  repoConfigYaml?: string | null;
}

export interface ResolveResult {
  rubric: Rubric;
  repoConfig: RepoConfig | null;
  /** Lỗi/vi phạm của `.asdlc.yml` (phần vi phạm bị bỏ qua, review vẫn chạy). */
  repoConfigError?: string;
}

export interface FrameworkApi {
  list(): Promise<FrameworkInfo[]>;
  /** Rubric hiện hành (đã lọc rule tắt) — cho các module khác. */
  get(id: string): Promise<Rubric>;
  detail(id: string, version?: number): Promise<FrameworkDetailDto>;
  fork(input: ForkFrameworkInput, author?: string): Promise<FrameworkDetailDto>;
  update(id: string, edit: FrameworkEditInput, author?: string): Promise<FrameworkDetailDto>;
  restore(id: string, version: number, author?: string): Promise<FrameworkDetailDto>;
  remove(id: string): Promise<void>;
  /** Khác biệt giữa phiên bản hiện tại (hoặc `version`) và framework gốc lúc fork. */
  diffFromBase(id: string, version?: number): Promise<FrameworkChangeDto[]>;
  previewConfig(input: ConfigPreviewInput): Promise<ConfigPreviewDto>;
  resolve(input: ResolveInput): Promise<ResolveResult>;
}

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "fw";

export function createFrameworkModule(deps: FrameworkDeps): FrameworkApi {
  const source = new FsFrameworkSource(deps.frameworksDir);
  const store = deps.db ? new DbFrameworkStore(deps.db) : null;
  const fallback = deps.defaultFrameworkId ?? "asdlc";

  const kindOf = (f: FrameworkFile): FrameworkKind => (f.kind === "default" || f.id === fallback ? "default" : "template");
  const info = (f: FrameworkFile, kind: FrameworkKind, extra: Partial<FrameworkInfo> = {}): FrameworkInfo => ({
    id: f.id, name: f.name, version: f.version, kind, baseId: null,
    categories: f.categories.map((c) => ({ id: c.id, name: c.name, weight: c.weight, criteria: c.criteria.length })),
    ruleCount: f.categories.reduce((s, c) => s + c.criteria.length, 0), updatedAt: null, ...extra,
  });
  /** Nạp framework theo id: file (mặc định/mẫu) hoặc DB (tự tạo). */
  const load = async (id: string, version?: number): Promise<{ file: FrameworkFile; kind: FrameworkKind; label: string; baseId: string | null; meta?: Awaited<ReturnType<DbFrameworkStore["find"]>> }> => {
    const custom = store ? await store.load(id, version) : null;
    if (custom) return { file: { ...custom.file, id }, kind: "custom", label: String(custom.version), baseId: custom.meta.baseId, meta: custom.meta };
    const f = await source.load(id);
    return { file: f, kind: kindOf(f), label: f.version, baseId: null };
  };
  const detailOf = async (id: string, version?: number): Promise<FrameworkDetailDto> => {
    const { file, kind, label, baseId } = await load(id, version);
    const versions = kind === "custom" && store ? (await store.versions(id)).map((v) => ({ ...v, createdAt: v.createdAt.toISOString() })) : [];
    return {
      id, name: file.name, version: label, kind, baseId, readOnly: kind !== "custom", language: file.language,
      severity: file.severity as FrameworkDetailDto["severity"],
      gates: file.gates.map((g) => ({ id: g.id, reason: g.reason, capTotal: g.capTotal, when: g.when, locked: g.locked })),
      grades: [...file.grades].sort((a, b) => b.min - a.min), sizeBaseline: file.sizeBaseline,
      categories: file.categories.map((c) => ({ id: c.id, name: c.name, weight: c.weight, criteria: c.criteria.map((r) => ({ id: r.id, title: r.title, check: r.check, why: r.why, defaultSeverity: r.defaultSeverity, enabled: r.enabled, locked: r.locked })) })),
      versions,
    };
  };
  const needCustom = async (id: string) => {
    if (!store) throw new ModuleError("framework", "not_configured", "Chưa bật lưu framework tự tạo");
    const meta = await store.find(id);
    if (!meta) throw new ModuleError("framework", "invalid_input", "Bản mặc định và mẫu dựng sẵn chỉ đọc: hãy tạo bản chỉnh sửa (fork) trước");
    return meta;
  };
  const fail = (errors: string[]) => new ModuleError("framework", "invalid_input", errors.slice(0, 8).join("; "));

  return {
    async list() {
      const out = (await source.list()).map((f) => info(f, kindOf(f)));
      if (store) {
        for (const m of await store.list()) {
          const l = await store.load(m.id);
          if (l) out.push(info({ ...l.file, id: m.id }, "custom", { version: String(m.currentVersion), baseId: m.baseId, updatedAt: m.updatedAt.toISOString() }));
        }
      }
      return out;
    },
    async get(id) {
      const { file, label } = await load(id);
      return buildRubric(file, null, label);
    },
    detail: detailOf,
    async fork(input, author = "admin") {
      if (!store) throw new ModuleError("framework", "not_configured", "Chưa bật lưu framework tự tạo");
      const base = await load(input.baseId);
      const name = input.name.trim();
      if (!name) throw new ModuleError("framework", "invalid_input", "Tên framework không được để trống");
      const id = `c-${slug(name)}-${randomBytes(2).toString("hex")}`;
      const file: FrameworkFile = { ...structuredClone(base.file), id, name, kind: undefined };
      await store.create(id, name, base.kind === "custom" ? (base.baseId ?? input.baseId) : input.baseId, file, author, `Fork từ ${base.file.name} ${base.label}`);
      return detailOf(id);
    },
    async update(id, edit, author = "admin") {
      await needCustom(id);
      const cur = (await load(id)).file;
      const errors = validateEdit(cur, edit);
      if (errors.length) throw fail(errors);
      const version = await store!.addVersion(id, { ...applyEdit(cur, edit), id }, author, edit.note?.trim() ?? "");
      return detailOf(id, version);
    },
    async restore(id, version, author = "admin") {
      await needCustom(id);
      const old = await store!.load(id, version);
      if (!old) throw new ModuleError("framework", "not_found", "Không có phiên bản này");
      const v = await store!.addVersion(id, old.file, author, `Khôi phục từ v${version}`);
      return detailOf(id, v);
    },
    async remove(id) {
      await needCustom(id);
      await store!.remove(id);
    },
    async diffFromBase(id, version) {
      const cur = await load(id, version);
      if (cur.kind !== "custom" || !cur.baseId) return [];
      return diffFrameworks((await source.load(cur.baseId)), cur.file);
    },
    async previewConfig(input) {
      const parsed = parseRepoConfig(input.yaml);
      const base = (await load(input.frameworkId ?? parsed.config?.framework ?? fallback)).file;
      if (parsed.error) return { valid: false, errors: [parsed.error], changes: [], docs: [], ignore: [] };
      const { errors, changes } = checkRepoConfig(base, parsed.config);
      return { valid: errors.length === 0, errors, changes, docs: parsed.config?.docs ?? [], ignore: parsed.config?.ignore ?? [] };
    },
    async resolve(input) {
      const parsed = parseRepoConfig(input.repoConfigYaml);
      const id = parsed.config?.framework ?? input.frameworkId ?? fallback;
      let loaded;
      try {
        loaded = await load(id);
      } catch (err) {
        // Framework gán cho repo đã bị xoá: dùng mặc định thay vì làm hỏng review.
        if (id === fallback || !(err instanceof ModuleError) || err.code !== "not_found") throw err;
        loaded = await load(fallback);
      }
      const chk = checkRepoConfig(loaded.file, parsed.config);
      const error = parsed.error ?? (chk.errors.length ? `.asdlc.yml có phần bị bỏ qua: ${chk.errors.join("; ").slice(0, 400)}` : undefined);
      return { rubric: buildRubric(loaded.file, parsed.config, loaded.label), repoConfig: parsed.config, repoConfigError: error };
    },
  };
}
