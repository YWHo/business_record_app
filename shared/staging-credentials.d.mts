export type StagingRole = 'OWNER' | 'ACCOUNTANT' | 'AUDITOR';
export interface StagingCredential {
  id: string;
  role: StagingRole;
  email: string;
  verifier: string;
}
export const stagingRoles: readonly StagingRole[];
export const stagingPasswordParameters: Readonly<{
  N: number;
  r: number;
  p: number;
  maxmem: number;
}>;
export function stagingEmail(value: unknown): string;
export function validStagingPassword(value: unknown): value is string;
export function createStagingVerifier(password: string): Promise<string>;
export function verifyStagingPassword(
  password: string,
  verifier: string,
): Promise<boolean>;
export function parseStagingCredentials(raw: unknown): StagingCredential[];
export function stagingCredentialFingerprint(
  identity: StagingCredential,
): Promise<string>;
