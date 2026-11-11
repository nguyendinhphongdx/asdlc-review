import type { Db } from "../../kernel/db.js";
import { ModuleError } from "../../kernel/errors.js";
import { decrypt, encrypt, hintOf } from "./domain/crypto.js";

export interface SecretsDeps {
  db: Db;
  /** Khoá mã hoá do app cấp (module không đọc env/file). Rỗng = không thể lưu. */
  masterKey: string;
}

export interface SecretsApi {
  /** Nạp và giải mã mọi secret vào bộ nhớ; gọi một lần lúc khởi động. Secret hỏng bị bỏ qua. */
  load(): Promise<{ loaded: number; failed: string[] }>;
  /** Đọc đồng bộ từ bộ nhớ (sau `load`/`set`). */
  peek(key: string): string | undefined;
  hint(key: string): string | null;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  readonly canStore: boolean;
}

export function createSecretsModule(deps: SecretsDeps): SecretsApi {
  const cache = new Map<string, string>();
  const canStore = deps.masterKey.length >= 16;
  const need = () => {
    if (!canStore) throw new ModuleError("secrets", "not_configured", "Chưa có khoá mã hoá (MRD_SECRET_KEY) nên không thể lưu secret");
  };
  return {
    canStore,
    async load() {
      cache.clear();
      const failed: string[] = [];
      if (!canStore) return { loaded: 0, failed };
      for (const row of await deps.db.secret.findMany()) {
        try {
          cache.set(row.key, decrypt(row.ciphertext, deps.masterKey));
        } catch {
          failed.push(row.key); // sai khoá hoặc dữ liệu bị sửa
        }
      }
      return { loaded: cache.size, failed };
    },
    peek: (key) => cache.get(key),
    hint: (key) => {
      const v = cache.get(key);
      return v ? hintOf(v) : null;
    },
    async set(key, value) {
      need();
      if (!value) throw new ModuleError("secrets", "invalid_input", "Giá trị rỗng");
      const ciphertext = encrypt(value, deps.masterKey);
      await deps.db.secret.upsert({ where: { key }, create: { key, ciphertext }, update: { ciphertext } });
      cache.set(key, value);
    },
    async delete(key) {
      await deps.db.secret.delete({ where: { key } }).catch(() => undefined);
      cache.delete(key);
    },
  };
}
