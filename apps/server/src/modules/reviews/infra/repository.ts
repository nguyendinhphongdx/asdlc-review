import type { Db } from "../../../kernel/db.js";
import { fingerprint } from "../domain/fingerprint.js";
import type { FindingDto, MrDto, MrFact, MrSnapshot, RunDetail, RunFilter, RunListItem, RunResult, RunSummary, StartRunInput, RuleStat, RuleStats, UsageRunRow } from "../domain/types.js";
import { parse, toMrDto, toRunSummary } from "./mappers.js";

export class ReviewRepository {
  constructor(private db: Db) {}

  async usageRows(from: Date, to: Date): Promise<UsageRunRow[]> {
    const rows = await this.db.reviewRun.findMany({
      where: { createdAt: { gte: from, lte: to }, status: { in: ["succeeded", "failed"] } },
      orderBy: { createdAt: "asc" },
      select: { id: true, createdAt: true, status: true, provider: true, model: true, frameworkId: true, costUsd: true, durationMs: true, score: true, inputTokens: true, outputTokens: true, cacheReadTokens: true, cacheWriteTokens: true, mergeRequest: { select: { id: true, iid: true, title: true, repositoryId: true } } },
    });
    return rows.map((r) => ({ runId: r.id, mrId: r.mergeRequest.id, iid: r.mergeRequest.iid, title: r.mergeRequest.title, repositoryId: r.mergeRequest.repositoryId, createdAt: r.createdAt, status: r.status, provider: r.provider, model: r.model, frameworkId: r.frameworkId, costUsd: r.costUsd, durationMs: r.durationMs, score: r.score, inputTokens: r.inputTokens, outputTokens: r.outputTokens, cacheReadTokens: r.cacheReadTokens, cacheWriteTokens: r.cacheWriteTokens }));
  }

  /** Thống kê finding theo rule trên các run thành công gần nhất của một framework (để cải thiện rule). */
  async ruleStats(frameworkId: string, limitRuns: number): Promise<RuleStats> {
    const runs = await this.db.reviewRun.findMany({ where: { frameworkId, status: "succeeded" }, orderBy: { createdAt: "desc" }, take: limitRuns, select: { id: true } });
    const rows = runs.length ? await this.db.reviewFinding.findMany({ where: { runId: { in: runs.map((r) => r.id) } }, select: { ruleId: true, severity: true, feedback: true, source: true } }) : [];
    const by = new Map<string, RuleStat>();
    for (const f of rows) {
      const id = f.ruleId ?? "(không gắn rule)";
      const s = by.get(id) ?? { ruleId: id, count: 0, agree: 0, disagree: 0, fixed: 0, severities: {} };
      s.count++;
      if (f.feedback === "agree") s.agree++;
      else if (f.feedback === "disagree") s.disagree++;
      else if (f.feedback === "fixed") s.fixed++;
      s.severities[f.severity] = (s.severities[f.severity] ?? 0) + 1;
      by.set(id, s);
    }
    return { runs: runs.length, rules: [...by.values()].sort((a, b) => b.count - a.count) };
  }

  async upsertMr(s: MrSnapshot): Promise<MrDto> {
    const data = {
      title: s.title, description: s.description, webUrl: s.webUrl, sourceBranch: s.sourceBranch, targetBranch: s.targetBranch, authorUsername: s.authorUsername,
      memberId: s.memberId ?? null, state: s.state, draft: s.draft, mergedAt: s.mergedAt ?? null, closedAt: s.closedAt ?? null,
    };
    return toMrDto(await this.db.mergeRequest.upsert({
      where: { repositoryId_iid: { repositoryId: s.repositoryId, iid: s.iid } },
      create: { repositoryId: s.repositoryId, iid: s.iid, openedAt: s.openedAt, ...data },
      update: data,
    }));
  }

  async getMr(id: string): Promise<MrDto | null> {
    const m = await this.db.mergeRequest.findUnique({ where: { id } });
    return m ? toMrDto(m) : null;
  }
  async findMr(repositoryId: string, iid: number): Promise<MrDto | null> {
    const m = await this.db.mergeRequest.findUnique({ where: { repositoryId_iid: { repositoryId, iid } } });
    return m ? toMrDto(m) : null;
  }
  async listMrs(f: { repositoryId?: string; memberId?: string; state?: string; limit?: number; offset?: number }) {
    const where = { repositoryId: f.repositoryId, memberId: f.memberId, state: f.state };
    const [items, total] = await Promise.all([
      this.db.mergeRequest.findMany({ where, orderBy: { updatedAt: "desc" }, take: f.limit ?? 50, skip: f.offset ?? 0 }),
      this.db.mergeRequest.count({ where }),
    ]);
    return { items: items.map(toMrDto), total };
  }

  /** Tạo run. `queued`: mới xếp hàng (chưa có worker nhận); mặc định `running` (chạy ngay). */
  async startRun(i: StartRunInput, initial: "queued" | "running" = "running"): Promise<{ runId: string; round: number }> {
    const round = (await this.db.reviewRun.count({ where: { mergeRequestId: i.mrId } })) + 1;
    const queued = initial === "queued";
    const r = await this.db.reviewRun.create({
      data: { mergeRequestId: i.mrId, round, trigger: i.trigger, triggeredBy: i.triggeredBy ?? null, headSha: i.headSha, baseSha: i.baseSha ?? null, status: initial, stage: queued ? "queue" : "start", provider: i.provider ?? null, frameworkId: i.frameworkId ?? null, frameworkVersion: i.frameworkVersion ?? null, commits: i.commits ?? 0, startedAt: queued ? null : new Date() },
    });
    return { runId: r.id, round };
  }

  /** Worker nhận run đã xếp hàng (hoặc thử lại run lỗi): chuyển sang `running`, trả thời gian đã chờ. */
  async beginRun(runId: string, provider: string | null, now: Date): Promise<{ mrId: string; waitedMs: number }> {
    const cur = await this.db.reviewRun.findUnique({ where: { id: runId }, select: { createdAt: true } });
    const r = await this.db.reviewRun.update({ where: { id: runId }, data: { status: "running", stage: "start", error: null, finishedAt: null, startedAt: now, ...(provider ? { provider } : {}) } });
    return { mrId: r.mergeRequestId, waitedMs: cur ? Math.max(0, now.getTime() - cur.createdAt.getTime()) : 0 };
  }

  async setProvider(runId: string, provider: string): Promise<void> {
    await this.db.reviewRun.update({ where: { id: runId }, data: { provider } });
  }

  async setStage(runId: string, stage: string, timings?: Record<string, number>): Promise<{ mrId: string }> {
    const r = await this.db.reviewRun.update({ where: { id: runId }, data: { stage, ...(timings ? { stageTimings: JSON.stringify(timings) } : {}) } });
    return { mrId: r.mergeRequestId };
  }

  async completeRun(runId: string, res: RunResult, now: Date): Promise<{ mrId: string }> {
    return this.db.$transaction(async (tx) => {
      const run = await tx.reviewRun.update({
        where: { id: runId },
        data: {
          status: "succeeded", stage: "done", score: res.score, rawScore: res.rawScore, grade: res.grade, verdict: res.verdict, gates: JSON.stringify(res.gates),
          summary: res.summary, intent: res.intent, strengths: JSON.stringify(res.strengths), harnessFiles: JSON.stringify(res.harnessFiles),
          filesChanged: res.filesChanged, additions: res.additions, deletions: res.deletions, durationMs: res.durationMs, costUsd: res.costUsd ?? null, inputTokens: res.tokens?.inputTokens ?? null, outputTokens: res.tokens?.outputTokens ?? null, cacheReadTokens: res.tokens?.cacheReadTokens ?? null, cacheWriteTokens: res.tokens?.cacheWriteTokens ?? null,
          model: res.model ?? undefined, commentUrl: res.commentUrl ?? null, stageTimings: JSON.stringify(res.stageTimings ?? {}), omittedFiles: JSON.stringify(res.omittedFiles ?? []), ruleChecks: JSON.stringify(res.ruleChecks ?? []), activity: JSON.stringify(res.activity ?? []), harnessLoad: res.harnessLoad ? JSON.stringify(res.harnessLoad) : null, overview: JSON.stringify(res.overview ?? []), mrContext: res.mrDescription ? JSON.stringify(res.mrDescription) : null, aiContext: res.aiContext ? JSON.stringify(res.aiContext) : null, fileList: JSON.stringify(res.files ?? []), harnessReport: res.harnessReport ? JSON.stringify(res.harnessReport) : null, ...(res.frameworkId ? { frameworkId: res.frameworkId, frameworkVersion: res.frameworkVersion ?? null } : {}), finishedAt: now,
        },
      });
      await tx.reviewFinding.createMany({
        data: res.findings.map((f) => ({
          runId, source: f.source, category: f.category, ruleId: f.ruleId ?? null, severity: f.severity, kind: f.kind, title: f.title, file: f.file ?? null,
          lineStart: f.lineStart ?? null, lineEnd: f.lineEnd ?? null, why: f.why, evidence: f.evidence ?? null, suggestion: f.suggestion ?? null,
          question: f.question ?? null, confidence: f.confidence, deduction: f.deduction, fingerprint: fingerprint(f),
        })),
      });
      await tx.reviewCategoryScore.createMany({ data: res.categoryScores.map((c) => ({ runId, ...c })) });
      const mr = await tx.mergeRequest.findUniqueOrThrow({ where: { id: run.mergeRequestId } });
      await tx.mergeRequest.update({
        where: { id: mr.id },
        data: { latestScore: res.score, reviewCount: { increment: 1 }, ...(mr.firstScore === null ? { firstScore: res.score, firstReviewAt: now } : {}) },
      });
      return { mrId: mr.id };
    });
  }

  async failRun(runId: string, error: string, now: Date, activity: unknown[] = []): Promise<{ mrId: string }> {
    const r = await this.db.reviewRun.update({ where: { id: runId }, data: { status: "failed", error: error.slice(0, 2000), activity: JSON.stringify(activity), finishedAt: now } });
    return { mrId: r.mergeRequestId };
  }

  async latestRunByHead(mrId: string, headSha: string): Promise<RunSummary | null> {
    const r = await this.db.reviewRun.findFirst({ where: { mergeRequestId: mrId, headSha }, orderBy: { createdAt: "desc" } });
    return r ? toRunSummary(r) : null;
  }
  async saveActivity(runId: string, activity: unknown[]): Promise<void> {
    await this.db.reviewRun.updateMany({ where: { id: runId, status: { in: ["running", "queued"] } }, data: { activity: JSON.stringify(activity) } });
  }
  async failStale(o: { olderThanMs: number; statuses: string[]; reason: string }, now: Date): Promise<number> {
    const res = await this.db.reviewRun.updateMany({ where: { status: { in: o.statuses }, createdAt: { lt: new Date(now.getTime() - o.olderThanMs) } }, data: { status: "failed", error: o.reason, finishedAt: now } });
    return res.count;
  }

  async findRunByHead(mrId: string, headSha: string): Promise<RunSummary | null> {
    const r = await this.db.reviewRun.findFirst({ where: { mergeRequestId: mrId, headSha, status: { in: ["running", "queued", "succeeded"] } }, orderBy: { createdAt: "desc" } });
    return r ? toRunSummary(r) : null;
  }
  async latestSucceeded(mrId: string): Promise<RunDetail | null> {
    const r = await this.db.reviewRun.findFirst({ where: { mergeRequestId: mrId, status: "succeeded" }, orderBy: { createdAt: "desc" }, select: { id: true } });
    return r ? this.getRun(r.id) : null;
  }

  async getRun(id: string): Promise<RunDetail | null> {
    const r = await this.db.reviewRun.findUnique({ where: { id }, include: { findings: true, categoryScores: true, mergeRequest: true } });
    if (!r) return null;
    return {
      ...toRunSummary(r),
      mr: toMrDto(r.mergeRequest),
      frameworkId: r.frameworkId, frameworkVersion: r.frameworkVersion, baseSha: r.baseSha, rawScore: r.rawScore,
      gates: parse(r.gates, []), summary: r.summary, intent: r.intent, strengths: parse(r.strengths, []), harnessFiles: parse(r.harnessFiles, []),
      commits: r.commits, commentUrl: r.commentUrl, stageTimings: parse(r.stageTimings, {}), omittedFiles: parse(r.omittedFiles, []), harnessReport: parse(r.harnessReport, null), harnessLoad: parse(r.harnessLoad, null), overview: parse(r.overview, []), mrDescription: parse(r.mrContext, null), aiContext: parse(r.aiContext, null), activity: parse(r.activity, []), ruleChecks: parse(r.ruleChecks, []), files: parse(r.fileList, []),
      findings: r.findings.map((f): FindingDto => ({ ...f, source: f.source as FindingDto["source"] })),
      categoryScores: r.categoryScores.map((c) => ({ category: c.category, name: c.name, weight: c.weight, score: c.score, deduction: c.deduction, findings: c.findings })),
    };
  }

  async listRuns(f: RunFilter): Promise<{ items: RunListItem[]; total: number }> {
    const where = {
      status: f.status,
      mergeRequestId: f.mrId,
      mergeRequest: f.repositoryId || f.memberId ? { repositoryId: f.repositoryId, memberId: f.memberId } : undefined,
      score: f.minScore !== undefined || f.maxScore !== undefined ? { gte: f.minScore, lte: f.maxScore } : undefined,
      createdAt: f.from || f.to ? { gte: f.from, lte: f.to } : undefined,
    };
    const [rows, total] = await Promise.all([
      this.db.reviewRun.findMany({ where, orderBy: { createdAt: "desc" }, take: f.limit ?? 50, skip: f.offset ?? 0, include: { mergeRequest: true, findings: { select: { severity: true, kind: true } } } }),
      this.db.reviewRun.count({ where }),
    ]);
    return {
      total,
      items: rows.map((r) => {
        const counts: Record<string, number> = {};
        for (const x of r.findings) if (x.kind === "issue") counts[x.severity] = (counts[x.severity] ?? 0) + 1;
        const m = r.mergeRequest;
        return { ...toRunSummary(r), mr: { id: m.id, iid: m.iid, title: m.title, webUrl: m.webUrl, authorUsername: m.authorUsername, memberId: m.memberId, repositoryId: m.repositoryId }, findingCounts: counts };
      }),
    };
  }

  async setFeedback(findingId: string, feedback: string | null) {
    await this.db.reviewFinding.update({ where: { id: findingId }, data: { feedback } });
  }

  async facts(from: Date, to: Date): Promise<MrFact[]> {
    const mrs = await this.db.mergeRequest.findMany({
      where: { runs: { some: { status: "succeeded", createdAt: { gte: from, lte: to } } } },
      include: {
        runs: {
          where: { status: "succeeded", createdAt: { gte: from, lte: to } },
          orderBy: { createdAt: "asc" },
          include: { findings: { select: { category: true, ruleId: true, severity: true, kind: true, title: true } } },
        },
      },
    });
    return mrs.map((m) => ({
      mrId: m.id, repositoryId: m.repositoryId, iid: m.iid, title: m.title, authorUsername: m.authorUsername, memberId: m.memberId, state: m.state,
      openedAt: m.openedAt, mergedAt: m.mergedAt, firstScore: m.firstScore,
      runs: m.runs.map((r) => ({ id: r.id, round: r.round, createdAt: r.createdAt, score: r.score, grade: r.grade, filesChanged: r.filesChanged, additions: r.additions, deletions: r.deletions, durationMs: r.durationMs, costUsd: r.costUsd, findings: r.findings })),
    }));
  }
}
