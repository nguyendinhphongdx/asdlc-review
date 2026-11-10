export interface IdentityRef {
  platform: string; // gitlab | github | email
  username: string;
}
export interface MemberDto {
  id: string;
  displayName: string;
  email: string | null;
  team: string | null;
  role: string | null;
  active: boolean;
  identities: IdentityRef[];
}
export interface MemberInput {
  displayName: string;
  email?: string | null;
  team?: string | null;
  role?: string | null;
  active?: boolean;
  identities?: IdentityRef[];
}
export const normUsername = (u: string) => u.trim().toLowerCase();
