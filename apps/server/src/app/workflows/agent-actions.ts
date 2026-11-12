import type { Logger } from "../../kernel/logger.js";
import { ModuleError } from "../../kernel/errors.js";
import type { Modules } from "./../modules.js";
import type { RequestReview } from "./request-review.js";

/** Thực thi đề xuất của agent sau khi người dùng duyệt (đăng comment / chạy lại review). */
export function createAgentActions(m: Modules, requestReview: RequestReview, log: Logger) {
  return {
    async approve(id: string, user?: string) {
      const a = await m.agent.getAction(id);
      if (a.status !== "pending") throw new ModuleError("agent", "conflict", "Đề xuất này đã được xử lý");
      const mr = await m.reviews.getMr(a.mrId);
      const repo = await m.repos.get(mr.repositoryId);
      const platform = repo.platform as "gitlab" | "github";
      let note: string;
      if (a.kind === "rerun") {
        const r = await requestReview({ platform, projectPath: repo.fullPath, iid: mr.iid, trigger: "chat", triggeredBy: user, force: true });
        note = r.status === "queued" || r.status === "duplicate" ? "Đã xếp hàng chạy lại review." : r.status === "skipped" ? `Bỏ qua: ${r.reason}` : "Commit này đã được review.";
      } else {
        const info = await m.scm.getMergeRequest(platform, repo.fullPath, mr.iid);
        const { file, line, body = "" } = a.payload;
        const posted = file && line ? await m.scm.postInline(info, { file, line, body }) : false;
        if (!posted) await m.scm.reply(info, file && line ? `**${file}:${line}**\n\n${body}` : body);
        note = posted ? `Đã đăng comment inline tại ${file}:${line}.` : "Đã đăng comment lên MR.";
      }
      await m.agent.setActionStatus(id, "done");
      await m.agent.addMessage(a.mrId, "system", note);
      log.info("duyệt đề xuất của agent", { id, kind: a.kind });
      return { note };
    },
    async dismiss(id: string) {
      return m.agent.setActionStatus(id, "dismissed");
    },
  };
}
