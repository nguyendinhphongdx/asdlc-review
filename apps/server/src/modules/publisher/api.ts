import type { LeaderboardRow, ReviewReport, Severity } from "@mrd/contracts";
import { INLINE_MARKER, renderInline, renderLeaderboard, renderStatus, renderSummary, selectInline, SUMMARY_MARKER, type StatusView } from "./domain/render.js";

export type { StatusView };

export interface InlineDraft {
  file: string;
  line: number;
  body: string;
  ruleId?: string | null;
}

export interface PublisherApi {
  /** Marker để tìm lại comment tổng hợp khi cập nhật. */
  readonly summaryMarker: string;
  readonly inlineMarker: string;
  renderSummary(report: ReviewReport): string;
  renderInline(report: ReviewReport, opts: { minSeverity: Severity; max: number }): InlineDraft[];
  renderStatus(view: StatusView | null, language: string): string;
  renderLeaderboard(rows: LeaderboardRow[], language: string): string;
}

export function createPublisherModule(): PublisherApi {
  return {
    summaryMarker: SUMMARY_MARKER,
    inlineMarker: INLINE_MARKER,
    renderSummary,
    renderInline: (report, opts) =>
      selectInline(report.findings, opts.minSeverity, opts.max).map((f) => ({
        file: f.file!,
        line: f.lineStart!,
        body: renderInline(f, report.language),
        ruleId: f.ruleId,
      })),
    renderStatus,
    renderLeaderboard,
  };
}
