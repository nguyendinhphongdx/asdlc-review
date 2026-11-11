import type { Platform } from "@mrd/contracts";

export interface MrInfo {
  platform: Platform;
  projectPath: string;
  projectId: string;
  projectWebUrl: string;
  defaultBranch: string | null;
  cloneUrl: string;
  iid: number;
  title: string;
  description: string;
  webUrl: string;
  sourceBranch: string;
  targetBranch: string;
  authorUsername: string;
  authorName: string;
  state: "opened" | "merged" | "closed";
  draft: boolean;
  createdAt: Date;
  mergedAt: Date | null;
  closedAt: Date | null;
  headSha: string;
  baseSha: string | null;
  startSha: string | null;
  /** Ref chứa head của MR trong remote (dùng để fetch). */
  headRef: string;
  commits: number;
}

export interface OpenMrRef {
  iid: number;
  headSha: string;
  updatedAt: Date;
  draft: boolean;
}

export interface InlineComment {
  file: string;
  line: number;
  body: string;
}

export interface ParsedMrUrl {
  platform: Platform;
  projectPath: string;
  iid: number;
}

export type ScmEventKind = "mr_opened" | "mr_updated" | "mr_merged" | "mr_closed" | "review_requested";

export interface ScmEvent {
  platform: Platform;
  projectPath: string;
  iid: number;
  kind: ScmEventKind;
  headSha?: string;
  draft?: boolean;
  actor?: string;
}

export interface GitAuth {
  header?: string;
  secrets: string[];
}

/** Hợp đồng mà mỗi nền tảng phải hiện thực. */
export interface PlatformClient {
  isConfigured(): boolean;
  getMergeRequest(projectPath: string, iid: number): Promise<MrInfo>;
  listOpen(projectPath: string, updatedAfter?: Date): Promise<OpenMrRef[]>;
  upsertSummaryNote(mr: MrInfo, body: string, marker: string): Promise<string | undefined>;
  postInline(mr: MrInfo, c: InlineComment): Promise<boolean>;
  reply(mr: MrInfo, body: string): Promise<void>;
  gitAuth(): GitAuth;
}

export type ProbeErrorCode = "not_configured" | "unreachable" | "unauthorized" | "missing_scope" | "expired" | "no_projects" | "unknown";
export interface ConnectionProbe {
  ok: boolean;
  error?: { code: ProbeErrorCode; message: string };
  user?: { username: string; name: string };
  scopes?: string[];
  expiresAt?: string | null;
  projectCount?: number;
}
export interface ProjectProbe {
  ok: boolean;
  fullPath?: string;
  webUrl?: string;
  defaultBranch?: string | null;
  canCreateWebhook?: boolean;
  error?: string;
}
