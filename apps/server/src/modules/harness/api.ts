import type { HarnessReportDto } from "@mrd/contracts";
import { computeCoverage, type CoverageInput } from "./domain/coverage.js";
import { loadHarness, readRepoConfig, type Harness, type LoadOptions } from "./application/load.js";
export type { CoverageInput };

export interface HarnessApi {
  /**
   * Đọc nội dung thô của `.asdlc.yml` (nếu có). Module `framework` mới hiểu nội dung.
   * Truyền `ref` (commit nhánh đích) để lấy bản đã được merge, tránh tác giả MR tự sửa luật chấm điểm.
   */
  readRepoConfig(dir: string, opts?: { ref?: string }): Promise<string | null>;
  load(dir: string, opts: LoadOptions): Promise<Harness>;
  /** Độ phủ harness 0–100 (tất định, không dùng AI). */
  coverage(input: CoverageInput): HarnessReportDto;
}

export function createHarnessModule(): HarnessApi {
  return { readRepoConfig, load: loadHarness, coverage: computeCoverage };
}
