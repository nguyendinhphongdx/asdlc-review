import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** Chuỗi mã hoá = base64( iv(12) | authTag(16) | dữ liệu ). AES-256-GCM, khoá = sha256(masterKey). */
const keyOf = (masterKey: string) => createHash("sha256").update(masterKey).digest();

export function encrypt(plain: string, masterKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyOf(masterKey), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
}

/** Ném lỗi nếu sai khoá hoặc dữ liệu bị sửa (GCM xác thực). */
export function decrypt(payload: string, masterKey: string): string {
  const raw = Buffer.from(payload, "base64");
  if (raw.length < 29) throw new Error("dữ liệu mã hoá không hợp lệ");
  const decipher = createDecipheriv("aes-256-gcm", keyOf(masterKey), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

/** 4 ký tự cuối để người dùng nhận ra token; không bao giờ trả nhiều hơn. */
export const hintOf = (value: string) => (value.length > 8 ? value.slice(-4) : "••••");
