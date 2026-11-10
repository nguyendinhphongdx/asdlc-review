import type { Db } from "../../kernel/db.js";
import { ModuleError } from "../../kernel/errors.js";
import type { EventBus } from "../../kernel/event-bus.js";
import { isSettingKey, SETTING_SCHEMAS, type SettingKey, type SettingsSnapshot } from "./domain/keys.js";

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
    for (const r of rows) {
      const key: string = r.key;
      if (!isSettingKey(key)) continue;
      const parsed = SETTING_SCHEMAS[key].safeParse(JSON.parse(r.value));
      if (parsed.success) out[key] = parsed.data;
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
        await deps.db.setting.upsert({ where: { key: k }, create: { key: k, value: JSON.stringify(parsed.data) }, update: { value: JSON.stringify(parsed.data) } });
        keys.push(k);
      }
      if (keys.length) deps.events.publish("settings.changed", { keys });
      return snapshot();
    },
  };
}
