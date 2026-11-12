import type { Logger } from "../../kernel/logger.js";
import { ModuleError } from "../../kernel/errors.js";
import type { Modules } from "./../modules.js";
import type { RequestReview } from "./request-review.js";

/** Thực thi đề xuất của agent sau khi người dùng duyệt (đăng comment / chạy lại review). */
export function createAgentActions(m: Modules, requestReview: RequestReview, log: Logger) {
  /** Áp đề xuất sửa framework: fork nếu đang chỉ đọc, rồi áp thay đổi thành phiên bản mới (server hợp lệ hoá lại, rule bảo mật khoá được giữ). */
  const applyFrameworkEdit = async (a: Awaited<ReturnType<Modules["agent"]["getAction"]>>) => {
    const fwId = a.mrId.replace(/^fw:/, "");
    const ops = a.payload.ops ?? [];
    let target = fwId;
    let note = "";
    const cur = await m.framework.detail(fwId);
    if (cur.readOnly) {
      const forked = await m.framework.fork({ baseId: fwId, name: a.payload.forkName?.trim() || `${cur.name} (AI)` }, "ai-chat");
      target = forked.id;
      note = `Đã tạo bản chỉnh sửa "${forked.name}" và `;
    }
    const d = await m.framework.patch(target, ops, `AI: ${(a.payload.reason ?? "").slice(0, 150)}`, "ai-chat");
    await m.agent.setActionStatus(a.id, "done");
    const msg = `${note || "Đã "}áp dụng ${ops.length} thay đổi thành phiên bản v${d.version}.`;
    await m.agent.addMessage(a.mrId, "system", msg);
    // Chat của bản chỉ đọc chuyển sang bản mới để cuộc trò chuyện tiếp tục ở đúng chỗ.
    if (target !== fwId) await m.agent.addMessage(`fw:${target}`, "system", `Tạo từ ${cur.name} theo đề xuất của AI. ${a.payload.reason ?? ""}`.trim());
    log.info("áp đề xuất sửa framework", { id: a.id, target, ops: ops.length });
    return { note: msg, frameworkId: target };
  };
  return {
    async approve(id: string, user?: string) {
      const a = await m.agent.getAction(id);
      if (a.status !== "pending") throw new ModuleError("agent", "conflict", "Đề xuất này đã được xử lý");
      if (a.kind === "framework_edit") return applyFrameworkEdit(a);
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
