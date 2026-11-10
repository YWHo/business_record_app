import type { AuthenticatedUser, Env } from '../types';
import {
  acceptManagedInvitation,
  createManagedInvitation,
} from './membershipInvitationService';
export { normalizeEmail } from '../lib/identity';

export function createAccountantInvitation(
  env: Env,
  owner: AuthenticatedUser,
  email: string,
) {
  return createManagedInvitation(env, owner, email, 'ACCOUNTANT');
}

// Keep the explicit accountant-only contract for guarded development helpers.
export async function acceptAccountantInvitation(
  env: Env,
  email: string,
  token: string,
): Promise<{
  id: string;
  email: string;
  role: 'ACCOUNTANT';
  businessAccountId: string;
}> {
  const user = await acceptManagedInvitation(env, email, token, 'ACCOUNTANT');
  return { ...user, role: 'ACCOUNTANT' };
}
