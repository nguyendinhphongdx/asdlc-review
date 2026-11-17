import type { Db } from "../../kernel/db.js";
import { ModuleError } from "../../kernel/errors.js";
import type { EventBus } from "../../kernel/event-bus.js";
import { isSettingKey, MERGE_KEYS, migrateLegacy, SETTING_SCHEMAS, type SettingKey, type SettingsSnapshot } from "./domain/keys.js";

export interface SettingsDeps {
  db: Db;
  events: EventBus;
  /** Giá trị mặc định (từ env) khi chưa chỉnh trên UI. */
  defaults: SettingsSnapshot;
}

export interface SettingsApi {
  snapshot(): Promise<SettingsSnapshot>;
  get<K extends SettingKey>(key: K): Promise<SettingsSnapshot[K]>;
  /** Cập nhật nhiều khoá; ném `invalid_input` nếu khoá/giá trị sai. */
  update(patch: Partial<Record<string, unknown>>): Promise<SettingsSnapshot>;
}

export function createSettingsModule(deps: SettingsDeps): SettingsApi {
  const snapshot = async (): Promise<SettingsSnapshot> => {
    const rows = await deps.db.setting.findMany();
    const out: Record<string, unknown> = { ...deps.defaults };
    const stored: Record<string, unknown> = {};
    for (const r of rows) {
      try { stored[r.key] = JSON.parse(r.value); } catch { /* bỏ qua dòng hỏng */ }
    }
    for (const [key, value] of Object.entries(migrateLegacy(stored))) {
      if (!isSettingKey(key)) continue;
      const parsed = SETTING_SCHEMAS[key].safeParse(value);
      if (!parsed.success) continue;
      // Khoá dạng bản đồ gộp lên mặc định để thêm mục mặc định mới không bị cài đặt cũ che mất.
      out[key] = MERGE_KEYS.includes(key) ? { ...(deps.defaults[key] as object), ...(parsed.data as object) } : parsed.data;
    }
    return out as SettingsSnapshot;
  };
  return {
    snapshot,
    async get(key) {
      return (await snapshot())[key];
    },
    async update(patch) {
      const keys: string[] = [];
      for (const [k, v] of Object.entries(patch)) {
        if (!isSettingKey(k)) throw new ModuleError("settings", "invalid_input", `Khoá không hợp lệ: ${k}`);
        const parsed = SETTING_SCHEMAS[k].safeParse(v);
        if (!parsed.success) throw new ModuleError("settings", "invalid_input", `Giá trị không hợp lệ cho ${k}: ${parsed.error.issues[0]?.message}`);
        const next = MERGE_KEYS.includes(k) ? { ...((await snapshot())[k] as object), ...(parsed.data as object) } : parsed.data;
        await deps.db.setting.upsert({ where: { key: k }, create: { key: k, value: JSON.stringify(next) }, update: { value: JSON.stringify(next) } });
        keys.push(k);
      }
      if (keys.length) deps.events.publish("settings.changed", { keys });
      return snapshot();
    },
  };
}
