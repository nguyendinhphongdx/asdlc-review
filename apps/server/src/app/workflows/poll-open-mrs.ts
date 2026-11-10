import type { Logger } from "../../kernel/logger.js";
import type { Modules } from "../modules.js";
import type { RequestReview } from "./request-review.js";

/** Dành cho máy không nhận được webhook (sau NAT): quét MR đang mở của các repo bật tự động review. */
export function createPollOpenMrs(m: Modules, requestReview: RequestReview, log: Logger) {
  return async () => {
    let queued = 0;
    for (const repo of await m.repos.list()) {
      const platform = repo.platform as "gitlab" | "github";
      if (!repo.enabled || !repo.autoReview || !m.scm.isConfigured(platform)) continue;
      const started = new Date();
      try {
        for (const ref of await m.scm.listOpen(platform, repo.fullPath)) {
          if (ref.draft) continue;
          const r = await requestReview({ platform, projectPath: repo.fullPath, iid: ref.iid, trigger: "poll", knownHeadSha: ref.headSha });
          if (r.status === "queued") queued++;
        }
        await m.repos.markPolled(repo.id, started);
      } catch (err) {
        log.warn("poll repo lỗi", { repo: repo.fullPath, err: String(err).slice(0, 200) });
      }
    }
    if (queued) log.info("poll: đã xếp hàng review", { queued });
  };
}
