import { requireRole, requireUser } from '../auth/authorization';
import {
  getRequiredString,
  HttpError,
  json,
  readJsonObject,
} from '../lib/http';
import type { RouteParameters } from '../lib/router';
import type { Env } from '../types';
import { auditorGrantValues } from '../services/auditorGrantService';
import { createManagedInvitation } from '../services/membershipInvitationService';
import {
  accessRevision,
  auditorDirectory,
  auditorMember,
  endAuditorAccess,
  revokeAuditorInvitation,
  updateAuditorMembership,
} from '../services/auditorMembershipService';
import { enforceRateLimit } from '../services/securityService';

async function ownerFor(request: Request, env: Env) {
  if (env.APP_ENV === 'demo')
    throw new HttpError(
      403,
      'Member administration is unavailable in the public demo.',
    );
  const owner = await requireUser(request, env);
  requireRole(owner, ['OWNER']);
  return owner;
}
function id(params: RouteParameters, key: string): string {
  const value = params[key];
  if (!value || value.length > 100)
    throw new HttpError(400, 'Access identity is invalid.');
  return value;
}
export async function listAuditorAccess(request: Request, env: Env) {
  const owner = await ownerFor(request, env);
  return json(await auditorDirectory(env, owner.businessAccountId));
}
export async function getAuditorAccess(
  request: Request,
  env: Env,
  params: RouteParameters,
) {
  const owner = await ownerFor(request, env);
  return json({
    member: await auditorMember(
      env,
      owner.businessAccountId,
      id(params, 'userId'),
    ),
  });
}
export async function inviteAuditor(request: Request, env: Env) {
  const owner = await ownerFor(request, env);
  await enforceRateLimit(request, env.INVITE_RATE_LIMITER, 'invite', owner.id);
  const body = await readJsonObject(request),
    grant = await auditorGrantValues(env.DB, owner.businessAccountId, body);
  const invitation = await createManagedInvitation(
    env,
    owner,
    getRequiredString(body, 'email'),
    'AUDITOR',
    grant,
  );
  return json(
    {
      invitation: {
        id: invitation.id,
        email: invitation.email,
        expiresAt: invitation.expiresAt,
        ...(env.APP_ENV === 'local'
          ? { invitationUrl: invitation.invitationUrl }
          : {}),
      },
    },
    { status: 201 },
  );
}
export async function editAuditorAccess(
  request: Request,
  env: Env,
  params: RouteParameters,
) {
  const owner = await ownerFor(request, env),
    body = await readJsonObject(request);
  if (
    body.restoreAccess !== undefined &&
    typeof body.restoreAccess !== 'boolean'
  )
    throw new HttpError(400, 'Restore access must be explicitly selected.');
  const revision = accessRevision(body.revision),
    grant = await auditorGrantValues(env.DB, owner.businessAccountId, body);
  return json({
    member: await updateAuditorMembership(
      env,
      owner,
      id(params, 'userId'),
      revision,
      grant,
      body.restoreAccess === true,
    ),
  });
}
export async function revokeAuditor(
  request: Request,
  env: Env,
  params: RouteParameters,
) {
  const owner = await ownerFor(request, env),
    body = await readJsonObject(request);
  return json({
    member: await endAuditorAccess(
      env,
      owner,
      id(params, 'userId'),
      accessRevision(body.revision),
      'REVOKE',
    ),
  });
}
export async function expireAuditor(
  request: Request,
  env: Env,
  params: RouteParameters,
) {
  const owner = await ownerFor(request, env),
    body = await readJsonObject(request);
  return json({
    member: await endAuditorAccess(
      env,
      owner,
      id(params, 'userId'),
      accessRevision(body.revision),
      'EXPIRE',
    ),
  });
}
export async function cancelAuditorInvitation(
  request: Request,
  env: Env,
  params: RouteParameters,
) {
  const owner = await ownerFor(request, env),
    body = await readJsonObject(request);
  await revokeAuditorInvitation(
    env,
    owner,
    id(params, 'invitationId'),
    accessRevision(body.revision),
  );
  return json({ revoked: true });
}
