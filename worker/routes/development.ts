import { requireRole, requireUser } from '../auth/authorization';
import { requireLocalAuth } from '../auth/localOnly';
import { getRequiredString, json, readJsonObject } from '../lib/http';
import {
  acceptAccountantInvitation,
  createAccountantInvitation,
} from '../services/invitationService';
import type { Env } from '../types';

export async function listDevelopmentOutbox(
  request: Request,
  env: Env,
): Promise<Response> {
  requireLocalAuth(request, env);
  const user = await requireUser(request, env);
  requireRole(user, ['OWNER']);
  const result = await env.DB.prepare(
    `SELECT recipient_email, invitation_url, created_at
       FROM development_outbox
      ORDER BY created_at DESC`,
  ).all();

  return json({ messages: result.results });
}

export async function createInvitation(
  request: Request,
  env: Env,
): Promise<Response> {
  requireLocalAuth(request, env);
  const user = await requireUser(request, env);
  requireRole(user, ['OWNER']);
  const body = await readJsonObject(request);
  const invitation = await createAccountantInvitation(
    env,
    user,
    getRequiredString(body, 'email'),
  );

  return json({ invitation }, { status: 201 });
}

export async function acceptInvitation(
  request: Request,
  env: Env,
): Promise<Response> {
  requireLocalAuth(request, env);
  const body = await readJsonObject(request);
  const result = await acceptAccountantInvitation(
    env,
    getRequiredString(body, 'email'),
    getRequiredString(body, 'token'),
  );

  return json({ user: result });
}

export async function listDevelopmentAuthOutbox(
  request: Request,
  env: Env,
): Promise<Response> {
  requireLocalAuth(request, env);
  const user = await requireUser(request, env);
  requireRole(user, ['OWNER']);
  const result = await env.DB.prepare(
    `SELECT recipient_email, subject, action_url, created_at
       FROM development_auth_outbox
      ORDER BY created_at DESC`,
  ).all();

  return json({ messages: result.results });
}

export async function checkRecordsPermission(
  request: Request,
  env: Env,
): Promise<Response> {
  requireLocalAuth(request, env);
  const user = await requireUser(request, env);
  requireRole(user, ['OWNER', 'ACCOUNTANT']);
  return json({ allowed: true, role: user.role });
}

export async function checkOwnerPermission(
  request: Request,
  env: Env,
): Promise<Response> {
  requireLocalAuth(request, env);
  const user = await requireUser(request, env);
  requireRole(user, ['OWNER']);
  return json({ allowed: true, role: user.role });
}

export async function writeStorageProbe(
  request: Request,
  env: Env,
): Promise<Response> {
  requireLocalAuth(request, env);
  const user = await requireUser(request, env);
  requireRole(user, ['OWNER']);
  const storedAt = new Date().toISOString();

  await env.DOCUMENTS.put('development-checks/r2-binding.txt', storedAt, {
    httpMetadata: { contentType: 'text/plain; charset=utf-8' },
    customMetadata: { createdBy: user.id },
  });

  return json({ objectKey: 'development-checks/r2-binding.txt', storedAt });
}

export async function readStorageProbe(
  request: Request,
  env: Env,
): Promise<Response> {
  requireLocalAuth(request, env);
  const user = await requireUser(request, env);
  requireRole(user, ['OWNER']);
  const object = await env.DOCUMENTS.get('development-checks/r2-binding.txt');

  return json({ exists: object !== null, value: await object?.text() });
}
