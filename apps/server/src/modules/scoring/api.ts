import type { Finding, Rubric, ScoreResult } from "@mrd/contracts";
import { scoreFindings } from "./domain/score.js";

export interface ScoreRequest {
  rubric: Rubric;
  findings: Finding[];
  changedLines: number;
}

export interface ScoringApi {
  score(input: ScoreRequest): ScoreResult;
}

export function createScoringModule(): ScoringApi {
  return { score: (input) => scoreFindings(input) };
}
