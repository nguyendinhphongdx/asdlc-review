import { checkMrDescription, descriptionFindings } from "./mr-description.js";
import type { Finding, ReviewJobData, ReviewReport } from "@mrd/contracts";
import { ModuleError } from "../../kernel/errors.js";
import type { ProgressHub } from "../progress.js";
import type { Logger } from "../../kernel/logger.js";
import type { Modules, AppSettings } from "../modules.js";
import { providerModel, toSnapshot } from "./mappers.js";

const RETRYABLE = new Set(["upstream_error", "timeout", "internal"]);

/**
 * Pipeline review một MR: clone → harness → phân tích → AI → chấm điểm → publish → lưu.
 * Mỗi bước chỉ gọi API công khai của một module; không chứa quy tắc nghiệp vụ.
 */
export function createReviewMergeRequest(m: Modules, cfg: AppSettings, log: Logger, hub?: ProgressHub) {
  return async (job: ReviewJobData): Promise<void> => {
    const started = Date.now();
    // Run đã được tạo sẵn (status queued) lúc xếp hàng: nhận lại đúng run đó và báo "đang chạy" ngay,
    // trước mọi bước chậm (gọi API, clone) để UI không bao giờ thấy khoảng trống.
    const pre = job.runId && job.mrId ? { runId: job.runId, mrId: job.mrId } : null;
    let waitedMs = 0;
    if (pre) {
      waitedMs = (await m.reviews.beginRun(pre.runId)).waitedMs;
      hub?.emit(pre.runId, pre.mrId, "queue", "info", `Worker đã nhận việc${waitedMs >= 1000 ? ` sau ${(waitedMs / 1000).toFixed(0)}s chờ` : ""}, đang lấy thông tin MR`);
    }
    const failEarly = async (reason: string) => {
      if (pre) await m.reviews.failRun(pre.runId, reason, hub?.backlog(pre.runId)).catch(() => undefined);
    };
    let mr: Awaited<ReturnType<Modules["scm"]["getMergeRequest"]>>;
    let repo: Awaited<ReturnType<Modules["repos"]["register"]>>;
    let rec: Awaited<ReturnType<Modules["reviews"]["upsertMr"]>>;
    try {
      mr = await m.scm.getMergeRequest(job.platform, job.projectPath, job.iid);
      repo = await m.repos.register({ platform: mr.platform, fullPath: mr.projectPath, webUrl: mr.projectWebUrl, defaultBranch: mr.defaultBranch });
      if (!repo.enabled) { await failEarly("Repo đang tắt nên không review."); return; }
      const memberId = await m.identity.resolveOrCreate(mr.platform, mr.authorUsername, mr.authorName);
      rec = await m.reviews.upsertMr(toSnapshot(mr, repo.id, memberId));
    } catch (err) {
      await failEarly(`Không lấy được thông tin MR: ${String((err as Error)?.message ?? err).slice(0, 300)}`);
      throw err;
    }
    if (!pre && !job.force && (await m.reviews.findRunByHead(rec.id, mr.headSha))) {
      log.info("bỏ qua: commit này đã được review", { iid: mr.iid, sha: mr.headSha.slice(0, 8) });
      return;
    }

    const settings = await m.settings.snapshot();
    const provider = (repo.provider ?? settings.reviewProvider) as typeof settings.reviewProvider;
    const model = repo.model || providerModel(provider, settings);
    const previous = await m.reviews.latestSucceeded(rec.id);
    const runId = pre
      ? pre.runId
      : (await m.reviews.startRun({ mrId: rec.id, trigger: job.trigger, triggeredBy: job.triggeredBy, headSha: mr.headSha, baseSha: mr.baseSha, provider, commits: mr.commits })).runId;
    if (pre) await m.reviews.setProvider(runId, provider).catch(() => undefined);
    const rlog = log.child(`run:${runId.slice(-6)}`);

    const timings: Record<string, number> = {};
    if (pre) timings.queue = waitedMs;
    let lastSave = 0;
    const emit = (st: string, level: "info" | "tool" | "ai" | "warn" | "done", message: string) => {
      hub?.emit(runId, rec.id, st, level, message);
      // Lưu nhật ký xuống DB định kỳ để vẫn xem được dù app dừng giữa chừng.
      if (hub && Date.now() - lastSave > 2000) { lastSave = Date.now(); void m.reviews.saveActivity(runId, hub.backlog(runId)).catch(() => undefined); }
    };
    const STAGE_LABEL: Record<string, string> = { clone: "Clone repository", framework: "Nạp framework", harness: "Nạp harness", analysis: "Phân tích tĩnh", review: "Review bằng AI", score: "Chấm điểm", publish: "Đăng comment" };
    const stage = async <T>(name: string, fn: () => Promise<T> | T): Promise<T> => {
      await m.reviews.setStage(runId, name, timings);
      emit(name, "info", `Bắt đầu: ${STAGE_LABEL[name] ?? name}`);
      const t = Date.now();
      try {
        const out = await fn();
        emit(name, "done", `Xong: ${STAGE_LABEL[name] ?? name} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
        return out;
      } catch (err) {
        emit(name, "warn", `Lỗi ở bước ${STAGE_LABEL[name] ?? name}: ${String((err as Error)?.message ?? err).slice(0, 200)}`);
        throw err;
      } finally {
        timings[name] = Date.now() - t;
      }
    };
    emit("clone", "info", `Nhận MR !${mr.iid} "${mr.title}" (${job.trigger}), provider ${provider}${model ? `, model ${model}` : ""}`);

    let ws: Awaited<ReturnType<Modules["workspace"]["prepare"]>> | undefined;
    try {
      const auth = m.scm.gitAuth(mr.platform);
      ws = await stage("clone", () =>
        m.workspace.prepare({ repoKey: `${mr.platform}/${mr.projectPath}`, runId, cloneUrl: mr.cloneUrl, authHeader: auth.header, secrets: auth.secrets, targetBranch: mr.targetBranch, headRef: mr.headRef, headSha: mr.headSha, baseSha: mr.baseSha, diffBudgetChars: repo.diffBudgetChars ?? settings.diffBudgetChars }),
      );
      const dir = ws.dir;
      emit("clone", "info", `Diff ${ws.numstat.length} file${ws.omittedFiles.length ? `, ${ws.omittedFiles.length} file bị bỏ qua do vượt ngân sách` : ""}`);
      const repoConfigYaml = await m.harness.readRepoConfig(dir, { ref: ws.baseSha });
      const files = ws.numstat.map((n) => ({ path: n.file, additions: n.additions, deletions: n.deletions, binary: n.binary }));

      const fw = await stage("framework", async () =>
        m.framework.resolve({ frameworkId: repo.frameworkId ?? settings.defaultFramework, repoConfigYaml }),
      );
      emit("framework", "info", `Dùng framework ${fw.rubric.name} v${fw.rubric.version}${fw.repoConfig ? " + .asdlc.yml của repo" : ""}${fw.repoConfigError ? " (.asdlc.yml lỗi nên bị bỏ qua)" : ""}`);
      const harness = await stage("harness", () => m.harness.load(dir, { changedFiles: files.map((f) => f.path), budgetChars: cfg.contextBudgetChars, extraDocGlobs: fw.repoConfig?.docs }));
      emit("harness", "info", `Nạp ${harness.files.length}/${harness.load.length} file harness (${harness.files.reduce((s, f) => s + f.content.length, 0).toLocaleString("en-US")} ký tự), kho có ${harness.totalFiles} file`);
      const harnessReport = m.harness.coverage({
        discovered: harness.discovered,
        contents: harness.files.map((f) => ({ path: f.path, kind: f.kind, content: f.content })),
        repoConfig: { present: Boolean(repoConfigYaml?.trim()), valid: Boolean(repoConfigYaml?.trim()) && !fw.repoConfigError, error: fw.repoConfigError, hasDocs: Boolean(fw.repoConfig?.docs?.length), hasIgnore: Boolean(fw.repoConfig?.ignore?.length) },
      });
      const analysis = await stage("analysis", () => m.analysis.analyze({ diff: ws!.diff, files, mrDescription: mr.description, ignore: fw.repoConfig?.ignore }));
      emit("analysis", "info", `Phân tích tĩnh: ${analysis.findings.length} finding`);
      const stats = { filesChanged: files.length, additions: files.reduce((s, f) => s + f.additions, 0), deletions: files.reduce((s, f) => s + f.deletions, 0) };

      const notebook = await m.agent.notebook(repo.id, files.map((f) => f.path));
      if (notebook.length) emit("review", "info", `Áp dụng ${notebook.length} mục bộ nhớ của repo`);
      const notes = (await m.agent.listNotes(rec.id)).map((n) => ({ author: n.author, text: n.text, createdAt: n.createdAt }));
      if (notes.length) emit("review", "info", `Nạp ${notes.length} ghi chú của người cho MR này`);
      const previousRound = previous
        ? { round: previous.round, findings: previous.findings.map((f) => ({ title: f.title, file: f.file ?? null, line: f.lineStart ?? null, severity: f.severity, status: (f.feedback === "fixed" ? "fixed" : f.feedback === "disagree" ? "dismissed" : "open") as "fixed" | "dismissed" | "open" })) }
        : null;
      if (previousRound?.findings.length) emit("review", "info", `Nạp kết quả vòng ${previousRound.round}: ${previousRound.findings.length} góp ý để kiểm tra lại`);
      const lessonObjs = (await m.agent.listLessons(repo.id, "active")).filter((l) => notebook.some((n) => n.endsWith(l.text)));
      const aiContext = {
        lessons: lessonObjs.map((l) => ({ kind: l.kind, paths: l.paths, text: l.text })),
        notes,
        previousRound: previousRound ? { ...previousRound, score: previous?.score ?? null } : null,
        sources: [
          { id: "memory", label: "Bộ nhớ repo", chars: notebook.join("\n").length },
          { id: "notes", label: "Ghi chú MR", chars: notes.reduce((s, n) => s + n.text.length, 0) },
          { id: "previous", label: "Vòng trước", chars: previousRound ? previousRound.findings.reduce((s, f) => s + f.title.length + 30, 0) : 0 },
        ],
      };
      const ai = await stage("review", () =>
        m.reviewer.review({
          provider, model, workdir: dir, maxBudgetUsd: settings.maxBudgetUsd,
          onActivity: (a) => emit("review", a.kind, a.message),
          mr: { iid: mr.iid, title: mr.title, description: mr.description, author: mr.authorUsername, sourceBranch: mr.sourceBranch, targetBranch: mr.targetBranch, webUrl: mr.webUrl },
          rubric: fw.rubric,
          harness: { files: harness.files, tree: harness.tree, discovered: harness.discovered.map((d) => d.path) },
          diff: ws!.diffForPrompt, omittedFiles: ws!.omittedFiles, stats, staticFindings: analysis.findings, notebook, notes, ...(previousRound?.findings.length ? { previousRound } : {}),
        }),
      );

      const mrDescription = checkMrDescription({ title: mr.title, description: mr.description }, fw.rubric.mrDescription);
      if (mrDescription.docs.length) emit("review", mrDescription.missingRequired ? "warn" : "info", mrDescription.missingRequired ? `Mô tả MR thiếu ${mrDescription.missingRequired} tài liệu bắt buộc: ${mrDescription.docs.filter((d) => d.required && !d.found).map((d) => d.kind).join(", ")}` : "Mô tả MR đủ tài liệu bắt buộc theo chuẩn của framework");
      const overview = (fw.rubric.overview?.sections ?? []).filter((s) => s.enabled).flatMap((s) => {
        const r = ai.review.overview.find((o) => o.id === s.id);
        return r ? [{ id: s.id, title: s.title, kind: s.kind, text: r.text, bullets: r.bullets, verdict: s.kind === "verdict" ? (r.verdict ?? null) : null }] : [];
      });
      const findings: Finding[] = [...analysis.findings, ...descriptionFindings(mrDescription, fw.rubric.mrDescription, fw.rubric.categories[0]?.id ?? "scope"), ...ai.review.findings.map((f): Finding => ({ ...f, source: "ai" }))];
      const score = await stage("score", () => m.scoring.score({ rubric: fw.rubric, findings, changedLines: analysis.changedLines }));
      const scored = findings.map((f, i) => ({ ...f, deduction: score.deductions[i] ?? 0 }));

      const cited = new Set(ai.review.harnessUsed);
      const harnessLoad = {
        items: harness.load.map((h) => ({ path: h.path, kind: h.kind, size: h.size, chars: h.chars, loaded: h.loaded, truncated: h.truncated, reason: h.reason, via: h.via, cited: cited.has(h.path) })),
        totalRepoFiles: harness.totalFiles, loadedChars: harness.files.reduce((s, f) => s + f.content.length, 0),
      };
      emit("review", "info", `AI trả ${ai.review.findings.length} finding, ${ai.review.checks.length} mục checklist${ai.usage.costUsd != null ? `, chi phí $${ai.usage.costUsd.toFixed(2)}` : ""}`);
      const ruleChecks = m.scoring.checklist(fw.rubric, ai.review.checks, findings);
      const omitted = new Set(ws.omittedFiles);
      const fileList = ws.numstat.map((n) => ({ path: n.file, additions: n.additions, deletions: n.deletions, binary: n.binary, reviewed: !omitted.has(n.file) }));

      const summary = fw.repoConfigError ? `${ai.review.summary}\n\n⚠️ ${fw.repoConfigError}` : ai.review.summary;
      const report: ReviewReport = {
        mr: { title: mr.title, iid: mr.iid, webUrl: mr.webUrl, author: mr.authorUsername, sourceBranch: mr.sourceBranch, targetBranch: mr.targetBranch, headSha: mr.headSha },
        score, summary, intent: ai.review.intent, strengths: ai.review.strengths, findings: scored,
        stats: { ...stats, durationSec: Math.round((Date.now() - started) / 1000) },
        harnessFiles: ai.review.harnessUsed.length ? ai.review.harnessUsed : harness.files.map((f) => f.path),
        frameworkLabel: `${fw.rubric.name} v${fw.rubric.version}`, provider, dashboardUrl: `${cfg.publicUrl}/reviews/${runId}`, language: fw.rubric.language,
        omittedFiles: ws.omittedFiles,
      };

      emit("score", "info", `Điểm ${score.total} · hạng ${score.grade} · ${score.verdict}${score.gates.length ? ` · cổng: ${score.gates.map((g) => g.id).join(", ")}` : ""}`);
      const publishComments = repo.publishComments ?? fw.rubric.publish.comments;
      let commentUrl: string | undefined;
      if (publishComments) {
        commentUrl = await stage("publish", async () => {
          try {
            const url = await m.scm.upsertSummaryNote(mr, m.publisher.renderSummary(report), m.publisher.summaryMarker);
            // Không đăng lại inline cho vấn đề đã nêu ở lần review trước.
            const seen = new Set((previous?.findings ?? []).map((f) => `${f.file}|${f.ruleId}|${f.title.toLowerCase()}`));
            const drafts = m.publisher.renderInline(report, { minSeverity: fw.rubric.publish.inlineMinSeverity, max: fw.rubric.publish.maxInline });
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

      if (!publishComments) emit("publish", "info", "Không đăng comment lên MR (đã tắt ở repo hoặc framework), chỉ lưu kết quả");
      emit("publish", "done", "Hoàn tất review");
      await m.reviews.completeRun(runId, {
        activity: hub?.backlog(runId),
        score: score.total, rawScore: score.rawTotal, grade: score.grade, verdict: score.verdict, gates: score.gates,
        summary, intent: ai.review.intent, strengths: ai.review.strengths, harnessFiles: report.harnessFiles, ...stats,
        durationMs: Date.now() - started, costUsd: ai.usage.costUsd, tokens: ai.usage.tokens ?? null, model: ai.usage.model, commentUrl, stageTimings: timings, omittedFiles: ws.omittedFiles, ruleChecks, harnessLoad, overview, mrDescription, aiContext, files: fileList, harnessReport, frameworkId: fw.rubric.id, frameworkVersion: fw.rubric.version,
        findings: scored.map((f) => ({ ...f })),
        categoryScores: score.categories,
      });
      rlog.info("hoàn tất review", { iid: mr.iid, score: score.total, grade: score.grade, findings: findings.length, ms: Date.now() - started });
    } catch (err) {
      const e = err instanceof ModuleError ? err : new ModuleError("app", "internal", String((err as Error)?.message ?? err), err);
      rlog.error("review thất bại", { err: e.message.slice(0, 400) });
      emit("clone", "warn", `Review thất bại: ${e.message.slice(0, 200)}`);
      await m.reviews.failRun(runId, e.message, hub?.backlog(runId));
      if (RETRYABLE.has(e.code)) throw e;
    } finally {
      await ws?.dispose().catch((err) => rlog.warn("dọn workspace lỗi", { err: String(err) }));
    }
  };
}
