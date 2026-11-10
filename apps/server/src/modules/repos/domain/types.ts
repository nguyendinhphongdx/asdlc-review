export interface RepoDto {
  id: string;
  platform: string;
  fullPath: string;
  webUrl: string;
  defaultBranch: string | null;
  frameworkId: string | null;
  provider: string | null;
  enabled: boolean;
  autoReview: boolean;
  lastPolledAt: Date | null;
}
export interface RegisterRepoInput {
  platform: string;
  fullPath: string;
  webUrl: string;
  defaultBranch?: string | null;
}
export interface RepoPatch {
  frameworkId?: string | null;
  provider?: string | null;
  enabled?: boolean;
  autoReview?: boolean;
}
