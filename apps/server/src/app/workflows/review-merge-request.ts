import type { Finding, ReviewJobData, ReviewReport } from "@mrd/contracts";
import { ModuleError } from "../../kernel/errors.js";
import type { Logger } from "../../kernel/logger.js";
import type { Modules, AppSettings } from "../modules.js";
import { toSnapshot } from "./mappers.js";

const RETRYABLE = new Set(["upstream_error", "timeout", "internal"]);

/**
 * Pipeline review một MR: clone → harness → phân tích → AI → chấm điểm → publish → lưu.
 * Mỗi bước chỉ gọi API công khai của một module; không chứa quy tắc nghiệp vụ.
 */
export function createReviewMergeRequest(m: Modules, cfg: AppSettings, log: Logger) {
  return async (job: ReviewJobData): Promise<void> => {
    const started = Date.now();
    const mr = await m.scm.getMergeRequest(job.platform, job.projectPath, job.iid);
    const repo = await m.repos.register({ platform: mr.platform, fullPath: mr.projectPath, webUrl: mr.projectWebUrl, defaultBranch: mr.defaultBranch });
    if (!repo.enabled) return;
    const memberId = await m.identity.resolveOrCreate(mr.platform, mr.authorUsername, mr.authorName);
    const rec = await m.reviews.upsertMr(toSnapshot(mr, repo.id, memberId));
    if (!job.force && (await m.reviews.findRunByHead(rec.id, mr.headSha))) {
      log.info("bỏ qua: commit này đã được review", { iid: mr.iid, sha: mr.headSha.slice(0, 8) });
      return;
    }

    const settings = await m.settings.snapshot();
    const provider = (repo.provider ?? settings.reviewProvider) as typeof settings.reviewProvider;
    const previous = await m.reviews.latestSucceeded(rec.id);
    const { runId } = await m.reviews.startRun({ mrId: rec.id, trigger: job.trigger, triggeredBy: job.triggeredBy, headSha: mr.headSha, baseSha: mr.baseSha, provider, commits: mr.commits });
    const rlog = log.child(`run:${runId.slice(-6)}`);

    const timings: Record<string, number> = {};
    const stage = async <T>(name: string, fn: () => Promise<T> | T): Promise<T> => {
      await m.reviews.setStage(runId, name, timings);
      const t = Date.now();
      try {
        return await fn();
      } finally {
        timings[name] = Date.now() - t;
      }
    };

    let ws: Awaited<ReturnType<Modules["workspace"]["prepare"]>> | undefined;
    try {
      const auth = m.scm.gitAuth(mr.platform);
      ws = await stage("clone", () =>
        m.workspace.prepare({ repoKey: `${mr.platform}/${mr.projectPath}`, runId, cloneUrl: mr.cloneUrl, authHeader: auth.header, secrets: auth.secrets, targetBranch: mr.targetBranch, headRef: mr.headRef, headSha: mr.headSha, baseSha: mr.baseSha, diffBudgetChars: settings.diffBudgetChars }),
      );
      const dir = ws.dir;
      const repoConfigYaml = await m.harness.readRepoConfig(dir, { ref: ws.baseSha });
      const files = ws.numstat.map((n) => ({ path: n.file, additions: n.additions, deletions: n.deletions, binary: n.binary }));

      const fw = await stage("framework", async () =>
        m.framework.resolve({ frameworkId: repo.frameworkId ?? settings.defaultFramework, repoConfigYaml }),
      );
      const harness = await stage("harness", () => m.harness.load(dir, { changedFiles: files.map((f) => f.path), budgetChars: cfg.contextBudgetChars, extraDocGlobs: fw.repoConfig?.docs }));
      const harnessReport = m.harness.coverage({
        discovered: harness.discovered,
        contents: harness.files.map((f) => ({ path: f.path, kind: f.kind, content: f.content })),
        repoConfig: { present: Boolean(repoConfigYaml?.trim()), valid: Boolean(repoConfigYaml?.trim()) && !fw.repoConfigError, error: fw.repoConfigError, hasDocs: Boolean(fw.repoConfig?.docs?.length), hasIgnore: Boolean(fw.repoConfig?.ignore?.length) },
      });
      const analysis = await stage("analysis", () => m.analysis.analyze({ diff: ws!.diff, files, mrDescription: mr.description, ignore: fw.repoConfig?.ignore }));
      const stats = { filesChanged: files.length, additions: files.reduce((s, f) => s + f.additions, 0), deletions: files.reduce((s, f) => s + f.deletions, 0) };

      const ai = await stage("review", () =>
        m.reviewer.review({
          provider, workdir: dir,
          mr: { iid: mr.iid, title: mr.title, description: mr.description, author: mr.authorUsername, sourceBranch: mr.sourceBranch, targetBranch: mr.targetBranch, webUrl: mr.webUrl },
          rubric: fw.rubric,
          harness: { files: harness.files, tree: harness.tree, discovered: harness.discovered.map((d) => d.path) },
          diff: ws!.diffForPrompt, omittedFiles: ws!.omittedFiles, stats, staticFindings: analysis.findings,
        }),
      );

      const findings: Finding[] = [...analysis.findings, ...ai.review.findings.map((f): Finding => ({ ...f, source: "ai" }))];
      const score = await stage("score", () => m.scoring.score({ rubric: fw.rubric, findings, changedLines: analysis.changedLines }));
      const scored = findings.map((f, i) => ({ ...f, deduction: score.deductions[i] ?? 0 }));

      const summary = fw.repoConfigError ? `${ai.review.summary}\n\n⚠️ ${fw.repoConfigError}` : ai.review.summary;
      const report: ReviewReport = {
        mr: { title: mr.title, iid: mr.iid, webUrl: mr.webUrl, author: mr.authorUsername, sourceBranch: mr.sourceBranch, targetBranch: mr.targetBranch, headSha: mr.headSha },
        score, summary, intent: ai.review.intent, strengths: ai.review.strengths, findings: scored,
        stats: { ...stats, durationSec: Math.round((Date.now() - started) / 1000) },
        harnessFiles: ai.review.harnessUsed.length ? ai.review.harnessUsed : harness.files.map((f) => f.path),
        frameworkLabel: `${fw.rubric.name} v${fw.rubric.version}`, provider, dashboardUrl: `${cfg.publicUrl}/reviews/${runId}`, language: fw.rubric.language,
        omittedFiles: ws.omittedFiles,
      };

      let commentUrl: string | undefined;
      if (settings.publishComments) {
        commentUrl = await stage("publish", async () => {
          try {
            const url = await m.scm.upsertSummaryNote(mr, m.publisher.renderSummary(report), m.publisher.summaryMarker);
            // Không đăng lại inline cho vấn đề đã nêu ở lần review trước.
            const seen = new Set((previous?.findings ?? []).map((f) => `${f.file}|${f.ruleId}|${f.title.toLowerCase()}`));
            const drafts = m.publisher.renderInline(report, { minSeverity: settings.inlineMinSeverity, max: settings.maxInlineComments });
            for (const d of drafts) {
              const f = scored.find((x) => x.file === d.file && x.lineStart === d.line && x.ruleId === d.ruleId);
              if (f && seen.has(`${f.file}|${f.ruleId}|${f.title.toLowerCase()}`)) continue;
              await m.scm.postInline(mr, d);
            }
            return url;
          } catch (err) {
            rlog.warn("đăng comment lỗi (kết quả vẫn được lưu)", { err: String(err).slice(0, 300) });
            return undefined;
          }
        });
      }

      await m.reviews.completeRun(runId, {
        score: score.total, rawScore: score.rawTotal, grade: score.grade, verdict: score.verdict, gates: score.gates,
        summary, intent: ai.review.intent, strengths: ai.review.strengths, harnessFiles: report.harnessFiles, ...stats,
        durationMs: Date.now() - started, costUsd: ai.usage.costUsd, model: ai.usage.model, commentUrl, stageTimings: timings, omittedFiles: ws.omittedFiles, harnessReport, frameworkId: fw.rubric.id, frameworkVersion: fw.rubric.version,
        findings: scored.map((f) => ({ ...f })),
        categoryScores: score.categories,
      });
      rlog.info("hoàn tất review", { iid: mr.iid, score: score.total, grade: score.grade, findings: findings.length, ms: Date.now() - started });
    } catch (err) {
      const e = err instanceof ModuleError ? err : new ModuleError("app", "internal", String((err as Error)?.message ?? err), err);
      rlog.error("review thất bại", { err: e.message.slice(0, 400) });
      await m.reviews.failRun(runId, e.message);
      if (RETRYABLE.has(e.code)) throw e;
    } finally {
      await ws?.dispose().catch((err) => rlog.warn("dọn workspace lỗi", { err: String(err) }));
    }
  };
}
