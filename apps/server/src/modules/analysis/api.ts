import type { Finding } from "@mrd/contracts";
import { parseDiff } from "./domain/diff.js";
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
}

export function createAnalysisModule(): AnalysisApi {
  return {
    analyze: (req) => analyze({ files: req.files, diffFiles: parseDiff(req.diff), mrDescription: req.mrDescription, ignore: req.ignore }),
  };
}
