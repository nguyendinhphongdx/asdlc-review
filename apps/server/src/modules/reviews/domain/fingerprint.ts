import { createHash } from "node:crypto";
import type { FindingRecord } from "./types.js";

/** Định danh ổn định của một finding giữa các lần review (để biết lỗi nào đã được sửa). */
export const fingerprint = (f: Pick<FindingRecord, "ruleId" | "file" | "title" | "category">): string =>
  createHash("sha1").update([f.category, f.ruleId ?? "", f.file ?? "", f.title.toLowerCase().trim()].join("|")).digest("hex").slice(0, 16);
