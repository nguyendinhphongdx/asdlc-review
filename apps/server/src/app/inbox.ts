import type { InboxDto, InboxItemDto } from "@mrd/contracts";
import type { Logger } from "../kernel/logger.js";
import type { DiscoverMr } from "../modules/scm/index.js";
import type { Modules } from "./modules.js";
import type { RequestReview } from "./workflows/request-review.js";

interface Cached { repoPath: string; mrs: DiscoverMr[] }

/**
 * Hộp MR chờ review. Poller (hoặc nút "Làm mới") kéo MR đang mở của các repo đã thêm về bộ nhớ;
 * danh sách trả ra loại những MR đã có review ở đúng commit hiện tại. `sync({ review })` chỉ tự xếp hàng
 * review khi `review = true` (chế độ polling) và repo bật tự động review.
 */
export function createInbox(m: Modules, requestReview: RequestReview, log: Logger) {
  const cache = new Map<string, Cached>();
  let polledAt: Date | null = null;
  let errors: InboxDto["errors"] = [];
  let polledRepos = 0;
  let inflight: Promise<{ queued: number }> | null = null;

  const run = async (review: boolean): Promise<{ queued: number }> => {
    let queued = 0;
    const errs: InboxDto["errors"] = [];
    let ok = 0;
    for (const repo of await m.repos.list()) {
      const platform = repo.platform as "gitlab" | "github";
      if (!repo.enabled || !m.scm.isConfigured(platform) || platform !== "gitlab") continue;
      const started = new Date();
      try {
        const mrs = await m.scm.listMrs(platform, repo.fullPath, "opened", "");
        cache.set(repo.id, { repoPath: repo.fullPath, mrs });
        if (review && repo.autoReview) {
          for (const mr of mrs) {
            const r = await requestReview({ platform, projectPath: repo.fullPath, iid: mr.iid, trigger: "poll", knownHeadSha: mr.headSha });
            if (r.status === "queued") queued++;
          }
        }
        await m.repos.markPolled(repo.id, started);
        ok++;
      } catch (err) {
        errs.push({ repo: repo.fullPath, message: String(err).slice(0, 200) });
        log.warn("poll repo lỗi", { repo: repo.fullPath, err: String(err).slice(0, 200) });
      }
    }
    errors = errs;
    polledRepos = ok;
    if (!m.scm.isConfigured("gitlab")) log.warn("poll: GitLab chưa có token, bỏ qua (Cài đặt → Kết nối)");
    polledAt = new Date();
    if (queued) log.info("poll: đã xếp hàng review", { queued });
    return { queued };
  };

  return {
    /** Gộp các lần gọi đồng thời (nút Làm mới + tick poller) thành một. */
    sync(opts: { review: boolean }): Promise<{ queued: number }> {
      inflight ??= run(opts.review).finally(() => { inflight = null; });
      return inflight;
    },
    async list(autoPolling: boolean): Promise<InboxDto> {
      const repos = new Map((await m.repos.list()).map((r) => [r.id, r]));
      const items: InboxItemDto[] = [];
      for (const [repoId, c] of cache) {
        if (!repos.get(repoId)?.enabled) continue;
        for (const mr of c.mrs) {
          const rec = await m.reviews.findMr(repoId, mr.iid);
          const run = rec ? await m.reviews.latestRunByHead(rec.id, mr.headSha) : null;
          if (run?.status === "succeeded") continue; // đã review commit này → nằm ở Lịch sử
          items.push({
            repoId, repoPath: c.repoPath, iid: mr.iid, title: mr.title, authorUsername: mr.authorUsername, webUrl: mr.webUrl,
            sourceBranch: mr.sourceBranch, targetBranch: mr.targetBranch, draft: mr.draft, updatedAt: mr.updatedAt.toISOString(), headSha: mr.headSha,
            status: !run ? "pending" : run.status === "running" ? "running" : run.status === "failed" ? "failed" : "queued", runId: run?.id, ...(run && (run.status === "queued" || run.status === "running") && run.stage ? { stage: run.stage } : {}), ...(run?.status === "failed" ? { error: run.error ?? undefined } : {}),
          });
        }
      }
      items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const enabled = [...repos.values()].filter((r) => r.enabled).length;
      const openMrs = [...cache.values()].reduce((n, c) => n + c.mrs.length, 0);
      return { items, polledAt: polledAt?.toISOString() ?? null, autoPolling, errors, connected: m.scm.isConfigured("gitlab"), repos: { enabled, polled: polledRepos }, openMrs };
    },
    get hasData() { return cache.size > 0; },
  };
}
export type Inbox = ReturnType<typeof createInbox>;
