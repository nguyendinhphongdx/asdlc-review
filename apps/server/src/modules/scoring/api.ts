import type { Finding, RuleCheck, RuleCheckDto, Rubric, ScoreResult } from "@mrd/contracts";
import { buildChecklist } from "./domain/checklist.js";
import { scoreFindings } from "./domain/score.js";

export interface ScoreRequest {
  rubric: Rubric;
  findings: Finding[];
  changedLines: number;
}

export interface ScoringApi {
  score(input: ScoreRequest): ScoreResult;
  /** Checklist theo rule: fail suy từ finding, rule AI bỏ sót là "unchecked". */
  checklist(rubric: Rubric, aiChecks: RuleCheck[], findings: Finding[]): RuleCheckDto[];
}

export function createScoringModule(): ScoringApi {
  return { score: (input) => scoreFindings(input), checklist: buildChecklist };
}
