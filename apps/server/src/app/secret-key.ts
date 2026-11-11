import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";

/**
 * Khoá mã hoá secret: ưu tiên biến môi trường (desktop truyền khoá lấy từ keychain; server tự đặt),
 * nếu không thì dùng/tạo file `secret.key` (0600) trong thư mục dữ liệu.
 * Khoá luôn nằm ngoài file DB.
 */
export function resolveMasterKey(envKey: string, dataDir: string): { key: string; source: "env" | "file" } {
  if (envKey.length >= 16) return { key: envKey, source: "env" };
  const file = path.join(dataDir, "secret.key");
  if (existsSync(file)) return { key: readFileSync(file, "utf8").trim(), source: "file" };
  mkdirSync(dataDir, { recursive: true });
  const key = randomBytes(32).toString("hex");
  writeFileSync(file, key, { mode: 0o600 });
  chmodSync(file, 0o600);
  return { key, source: "file" };
}
