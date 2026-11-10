import { ModuleError } from "../../kernel/errors.js";
import type { Modules } from "../modules.js";

/** Đăng ký repo từ link (https://host/group/repo). */
export function createRegisterRepo(m: Modules) {
  return async (url: string) => {
    const p = m.scm.parseProjectUrl(url);
    if (!p) throw new ModuleError("app", "invalid_input", "Không nhận ra link repo (chỉ hỗ trợ GitLab đã cấu hình và github.com)");
    return m.repos.register({ platform: p.platform, fullPath: p.projectPath, webUrl: p.webUrl });
  };
}
