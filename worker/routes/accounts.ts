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
import {
  PRIMARY_BUSINESS_ACCOUNT_ID,
  PRIMARY_BUSINESS_ENTITY_ID,
} from '../services/tenantService';

function requireAccountAdministration(env: Env): void {
  if (env.APP_ENV === 'demo') {
    throw new HttpError(
      403,
      'Account administration is unavailable in the public demo.',
    );
  }
}

export async function bootstrapOwner(
  request: Request,
  env: Env,
): Promise<Response> {
  if (env.APP_ENV === 'demo') {
    throw new HttpError(404, 'Not found.');
  }
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
    `SELECT users.id, users.email, business_account_members.role,
            business_account_members.status,
            business_account_members.business_account_id AS businessAccountId
       FROM business_account_members
       JOIN users ON users.id = business_account_members.user_id
      WHERE business_account_members.business_account_id = ?
        AND business_account_members.role = 'OWNER'`,
  )
    .bind(PRIMARY_BUSINESS_ACCOUNT_ID)
    .first<AuthenticatedUser>();

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
  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO business_accounts
        (id, display_name, status, plan, subscription_status, created_at, updated_at)
       VALUES (?, 'Business Records', 'ACTIVE', 'PRIVATE', 'ACTIVE', ?, ?)`,
    ).bind(PRIMARY_BUSINESS_ACCOUNT_ID, now, now),
    env.DB.prepare(
      `INSERT OR IGNORE INTO business_entities
        (id, business_account_id, entity_type, legal_name, trading_name, country,
         active, created_at, updated_at)
       VALUES (?, ?, 'SOLE_TRADER', NULL, NULL, 'NZ', 1, ?, ?)`,
    ).bind(PRIMARY_BUSINESS_ENTITY_ID, PRIMARY_BUSINESS_ACCOUNT_ID, now, now),
  ]);
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

  await env.DB.prepare(
    `INSERT INTO business_account_members
      (business_account_id, user_id, role, status, created_at, updated_at)
     VALUES (?, ?, 'OWNER', 'ACTIVE', ?, ?)
     ON CONFLICT(business_account_id, user_id) DO UPDATE SET
       role = 'OWNER', status = 'ACTIVE', updated_at = excluded.updated_at`,
  )
    .bind(PRIMARY_BUSINESS_ACCOUNT_ID, ownerId, now, now)
    .run();

  await writeAudit(
    env,
    { id: ownerId, businessAccountId: PRIMARY_BUSINESS_ACCOUNT_ID },
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
    `SELECT users.id, users.email, business_account_members.role,
            business_account_members.status, users.created_at, users.updated_at
       FROM business_account_members
       JOIN users ON users.id = business_account_members.user_id
      WHERE business_account_members.business_account_id = ?
      ORDER BY business_account_members.role DESC, users.email`,
  )
    .bind(owner.businessAccountId)
    .all();
  return json({ users: result.results });
}

export async function disableUser(
  request: Request,
  env: Env,
): Promise<Response> {
  const owner = await requireUser(request, env);
  requireRole(owner, ['OWNER']);
  requireAccountAdministration(env);
  const body = await readJsonObject(request);
  const userId = getRequiredString(body, 'userId');
  const target = await env.DB.prepare(
    `SELECT user_id AS id, role, status
       FROM business_account_members
      WHERE user_id = ? AND business_account_id = ?`,
  )
    .bind(userId, owner.businessAccountId)
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
        `UPDATE business_account_members
            SET status = 'DISABLED', updated_at = ?
          WHERE user_id = ? AND business_account_id = ?`,
      ).bind(now, userId, owner.businessAccountId),
      env.DB.prepare(
        'DELETE FROM sessions WHERE user_id = ? AND business_account_id = ?',
      ).bind(userId, owner.businessAccountId),
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
      WHERE business_account_id = ?
      ORDER BY created_at DESC`,
  )
    .bind(now, owner.businessAccountId)
    .all();
  return json({ invitations: result.results });
}

export async function inviteAccountant(
  request: Request,
  env: Env,
): Promise<Response> {
  const owner = await requireUser(request, env);
  requireRole(owner, ['OWNER']);
  requireAccountAdministration(env);
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
  if (env.APP_ENV === 'demo') throw new HttpError(404, 'Not found.');
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
