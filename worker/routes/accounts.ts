import { requireRole, requireUser } from '../auth/authorization';
import {
  getRequiredString,
  HttpError,
  json,
  readJsonObject,
} from '../lib/http';
import { writeAudit } from '../services/auditService';
import {
  acceptAccountantInvitation,
  createAccountantInvitation,
  normalizeEmail,
} from '../services/invitationService';
import {
  constantTimeEqual,
  enforceRateLimit,
} from '../services/securityService';
import type { AuthenticatedUser, Env } from '../types';

export async function bootstrapOwner(
  request: Request,
  env: Env,
): Promise<Response> {
  await enforceRateLimit(request, env.AUTH_RATE_LIMITER, 'bootstrap');
  const expectedEmail =
    env.APP_ENV === 'local' ? env.DEV_OWNER_EMAIL : env.BOOTSTRAP_OWNER_EMAIL;
  const expectedKey =
    env.APP_ENV === 'local' ? env.DEV_BOOTSTRAP_KEY : env.BOOTSTRAP_ADMIN_KEY;
  const receivedKey = request.headers.get('x-bootstrap-key') ?? '';

  if (!expectedEmail || !expectedKey) {
    throw new HttpError(503, 'Owner bootstrap is not configured.');
  }

  if (!(await constantTimeEqual(receivedKey, expectedKey))) {
    throw new HttpError(401, 'Bootstrap authorization failed.');
  }

  const email = normalizeEmail(expectedEmail);
  const owner = await env.DB.prepare(
    "SELECT id, email, role, status FROM users WHERE role = 'OWNER'",
  ).first<AuthenticatedUser>();

  if (owner) {
    if (normalizeEmail(owner.email) !== email) {
      throw new HttpError(409, 'Ownership is already initialized.');
    }

    return json({
      created: false,
      owner: { email: owner.email, role: owner.role },
    });
  }

  const now = new Date().toISOString();
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: string }>();
  const ownerId = existing?.id ?? crypto.randomUUID();

  if (existing) {
    await env.DB.prepare(
      `UPDATE users
          SET role = 'OWNER', status = 'ACTIVE', updated_at = ?
        WHERE id = ?`,
    )
      .bind(now, ownerId)
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO users (id, email, role, status, created_at, updated_at)
       VALUES (?, ?, 'OWNER', 'ACTIVE', ?, ?)`,
    )
      .bind(ownerId, email, now, now)
      .run();
  }

  await writeAudit(
    env,
    { id: ownerId },
    'OWNER_BOOTSTRAPPED',
    'USER',
    ownerId,
    'Initial owner account created from deployment configuration.',
  );

  return json(
    { created: true, owner: { email, role: 'OWNER' } },
    { status: 201 },
  );
}

export async function listUsers(request: Request, env: Env): Promise<Response> {
  const owner = await requireUser(request, env);
  requireRole(owner, ['OWNER']);
  const result = await env.DB.prepare(
    `SELECT id, email, role, status, created_at, updated_at
       FROM users
      ORDER BY role DESC, email`,
  ).all();
  return json({ users: result.results });
}

export async function disableUser(
  request: Request,
  env: Env,
): Promise<Response> {
  const owner = await requireUser(request, env);
  requireRole(owner, ['OWNER']);
  const body = await readJsonObject(request);
  const userId = getRequiredString(body, 'userId');
  const target = await env.DB.prepare(
    'SELECT id, role, status FROM users WHERE id = ?',
  )
    .bind(userId)
    .first<{ id: string; role: string; status: string }>();

  if (!target) {
    throw new HttpError(404, 'User not found.');
  }

  if (target.role === 'OWNER') {
    throw new HttpError(400, 'The owner account cannot be disabled.');
  }

  if (target.status !== 'DISABLED') {
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE users SET status = 'DISABLED', updated_at = ? WHERE id = ?",
      ).bind(now, userId),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId),
    ]);
    await writeAudit(
      env,
      owner,
      'USER_DISABLED',
      'USER',
      userId,
      'Account access disabled and active sessions revoked.',
    );
  }

  return json({ success: true });
}

export async function listInvitations(
  request: Request,
  env: Env,
): Promise<Response> {
  const owner = await requireUser(request, env);
  requireRole(owner, ['OWNER']);
  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    `SELECT id, email, role, expires_at, accepted_at, created_at,
            CASE
              WHEN accepted_at IS NOT NULL THEN 'ACCEPTED'
              WHEN expires_at <= ? THEN 'EXPIRED'
              ELSE 'PENDING'
            END AS status
       FROM invitations
      ORDER BY created_at DESC`,
  )
    .bind(now)
    .all();
  return json({ invitations: result.results });
}

export async function inviteAccountant(
  request: Request,
  env: Env,
): Promise<Response> {
  const owner = await requireUser(request, env);
  requireRole(owner, ['OWNER']);
  await enforceRateLimit(request, env.INVITE_RATE_LIMITER, 'invite', owner.id);
  const body = await readJsonObject(request);
  const invitation = await createAccountantInvitation(
    env,
    owner,
    getRequiredString(body, 'email'),
  );
  await writeAudit(
    env,
    owner,
    'INVITATION_CREATED',
    'INVITATION',
    invitation.id,
    'Accountant invitation created.',
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

export async function acceptInvitation(
  request: Request,
  env: Env,
): Promise<Response> {
  await enforceRateLimit(request, env.INVITE_RATE_LIMITER, 'accept');
  const body = await readJsonObject(request);
  const user = await acceptAccountantInvitation(
    env,
    getRequiredString(body, 'email'),
    getRequiredString(body, 'token'),
  );
  await writeAudit(
    env,
    user,
    'INVITATION_ACCEPTED',
    'USER',
    user.id,
    'Accountant invitation accepted.',
  );
  return json({ user: { email: user.email, role: user.role } });
}
