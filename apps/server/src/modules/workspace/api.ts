import path from "node:path";
import { parseNumstat, safeName, truncateDiff, type NumstatEntry } from "./domain/numstat.js";
import { addWorktree, diffAgainstBase, ensureBare, gitRunner, removeWorktree, resolveBase, sanitizeWorktree } from "./infra/git.js";

export interface WorkspaceDeps {
  reposDir: string;
  runsDir: string;
  keepWorktrees?: boolean;
}

export interface PrepareRequest {
  /** Khoá ổn định của repo, vd "gitlab/group/repo". */
  repoKey: string;
  runId: string;
  cloneUrl: string;
  /** Giá trị header `Authorization` cho git HTTPS (không ghi vào .git/config). */
  authHeader?: string;
  /** Chuỗi cần che trong log/lỗi. */
  secrets?: string[];
  targetBranch: string;
  /** Ref chứa head của MR, vd `refs/merge-requests/12/head` hoặc `refs/pull/12/head`. */
  headRef: string;
  headSha: string;
  baseSha?: string | null;
  /** Ngân sách ký tự cho diff trả về. */
  diffBudgetChars?: number;
}

export interface PreparedWorkspace {
  dir: string;
  baseSha: string;
  headSha: string;
  /** Diff đầy đủ (không cắt). */
  diff: string;
  /** Diff đã cắt theo ngân sách để đưa vào prompt. */
  diffForPrompt: string;
  omittedFiles: string[];
  numstat: NumstatEntry[];
  dispose(): Promise<void>;
}

export interface WorkspaceApi {
  prepare(req: PrepareRequest): Promise<PreparedWorkspace>;
}

export function createWorkspaceModule(deps: WorkspaceDeps): WorkspaceApi {
  return {
    async prepare(req) {
      const bareDir = path.join(deps.reposDir, `${safeName(req.repoKey)}.git`);
      const wtDir = path.join(deps.runsDir, req.runId);
      const git = gitRunner({ auth: req.authHeader, secrets: req.secrets ?? [] });

      await ensureBare(git, bareDir, req.cloneUrl, [
        `+refs/heads/${req.targetBranch}:refs/heads/${req.targetBranch}`,
        `+${req.headRef}:refs/mrd/${safeName(req.headRef)}`,
      ]);
      const baseSha = await resolveBase(bareDir, req.baseSha, `refs/heads/${req.targetBranch}`, req.headSha);
      await addWorktree(bareDir, wtDir, req.headSha);
      await sanitizeWorktree(wtDir);

      const { diff, numstat } = await diffAgainstBase(wtDir, baseSha, req.headSha);
      const cut = truncateDiff(diff, req.diffBudgetChars ?? 120_000);
      return {
        dir: wtDir,
        baseSha,
        headSha: req.headSha,
        diff,
        diffForPrompt: cut.text,
        omittedFiles: cut.omitted,
        numstat: parseNumstat(numstat),
        async dispose() {
          if (!deps.keepWorktrees) await removeWorktree(bareDir, wtDir);
        },
      };
    },
  };
}
