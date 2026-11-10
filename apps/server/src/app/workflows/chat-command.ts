import { ModuleError } from "../../kernel/errors.js";
import type { Modules } from "../modules.js";
import type { RequestReview } from "./request-review.js";

const HELP = `**Lệnh hỗ trợ**
- \`review <link MR>\` — xếp hàng review (bỏ qua nếu commit này đã review)
- \`review! <link MR>\` — ép review lại
- \`status <link MR>\` — điểm lần review gần nhất
- \`leaderboard [7d|30d|90d]\` — bảng xếp hạng`;

export interface ChatCommandInput {
  text: string;
  user?: string;
}

export function createChatCommand(m: Modules, requestReview: RequestReview, cfg: { publicUrl: string }) {
  return async ({ text, user }: ChatCommandInput): Promise<string> => {
    const cleaned = text.replace(/^\s*\/?(?:@\S+\s+)?/, "").trim();
    const [cmdRaw = "", ...rest] = cleaned.split(/\s+/);
    const cmd = cmdRaw.toLowerCase();
    const arg = rest.join(" ");

    if (cmd === "review" || cmd === "review!") {
      const mr = m.scm.parseUrl(arg);
      if (!mr) return "Không nhận ra link MR/PR. Ví dụ: `review https://gitlab.com/group/repo/-/merge_requests/12`";
      const r = await requestReview({ ...mr, trigger: "chat", triggeredBy: user, force: cmd === "review!" });
      if (r.status === "skipped") return `⏭️ Bỏ qua: ${r.reason}`;
      if (r.status === "already_reviewed") return `ℹ️ Commit này đã được review. Dùng \`review! ${arg}\` để chạy lại. ${cfg.publicUrl}/reviews/${r.runId}`;
      return r.status === "duplicate" ? "⏳ MR này đang có trong hàng đợi." : `✅ Đã xếp hàng review ${arg}`;
    }

    if (cmd === "status") {
      const ref = m.scm.parseUrl(arg);
      if (!ref) return "Cần link MR/PR.";
      const repo = await m.repos.find(ref.platform, ref.projectPath);
      const rec = repo ? await m.reviews.findMr(repo.id, ref.iid) : null;
      const run = rec ? await m.reviews.latestSucceeded(rec.id) : null;
      return m.publisher.renderStatus(run && run.score !== null ? { total: run.score, grade: run.grade ?? "-", verdict: (run.verdict ?? "comment") as "approve" | "comment" | "request_changes", dashboardUrl: `${cfg.publicUrl}/reviews/${run.id}` } : null, "vi");
    }

    if (cmd === "leaderboard" || cmd === "top") {
      const days = Number(/^(\d+)d$/.exec(arg)?.[1] ?? 30);
      const to = new Date();
      return m.publisher.renderLeaderboard(await m.analytics.leaderboard({ from: new Date(to.getTime() - days * 86_400_000), to }), "vi");
    }

    if (cmd === "" || cmd === "help") return HELP;
    throw new ModuleError("app", "invalid_input", `Lệnh không hợp lệ: ${cmd}\n\n${HELP}`);
  };
}
