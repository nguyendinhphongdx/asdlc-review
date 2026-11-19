import type { ChangeAreaDto, Finding } from "@mrd/contracts";
import { parseDiff } from "./domain/diff.js";
import { buildAreas, buildDigest, packDiff, shouldSplit, splitDiffByFile, type SplitDecision } from "./domain/areas.js";
import { analyze, type ChangedFile } from "./domain/detectors.js";

export interface AnalyzeRequest {
  diff: string;
  files: ChangedFile[];
  mrDescription?: string;
  /** Glob file bỏ qua (từ `.asdlc.yml`). */
  ignore?: string[];
}

export interface AnalyzeResult {
  findings: Finding[];
  /** Số dòng thay đổi có ý nghĩa (loại lockfile/file sinh tự động/tài liệu). */
  changedLines: number;
  ignoredFiles: string[];
}

export interface AnalysisApi {
  analyze(req: AnalyzeRequest): AnalyzeResult;
  /** T0: gom file đổi thành khu vực thay đổi (tất định), kèm rủi ro và phụ thuộc giữa các khu vực. */
  areas(req: { files: ChangedFile[]; diff?: string; maxAreas?: number }): ChangeAreaDto[];
  /** Có nên review theo khu vực (MR lớn/vượt ngân sách) hay giữ một lượt. */
  shouldSplit(input: { files: number; lines: number; areas: number; omitted: number; maxFiles?: number; maxLines?: number }): SplitDecision;
  /** Tách diff đầy đủ theo file. */
  splitDiff(diff: string): Map<string, string>;
  /** Gói diff của một khu vực thành các phần vừa ngân sách; file quá lớn trả trong `omitted`. */
  packDiff(paths: string[], byFile: Map<string, string>, budget: number): ReturnType<typeof packDiff>;
  /** Bản tóm lược diff theo khu vực (thống kê file + tiêu đề hunk) cho tầng thiết kế/tổng hợp. */
  digest(areas: ChangeAreaDto[], byFile: Map<string, string>, maxChars?: number): string;
}

export function createAnalysisModule(): AnalysisApi {
  return {
    analyze: (req) => analyze({ files: req.files, diffFiles: parseDiff(req.diff), mrDescription: req.mrDescription, ignore: req.ignore }),
    areas: (req) => buildAreas(req.files, { diffFiles: req.diff ? parseDiff(req.diff) : [], maxAreas: req.maxAreas }),
    shouldSplit,
    splitDiff: splitDiffByFile,
    packDiff,
    digest: buildDigest,
  };
}
