import { HttpError, json, methodNotAllowed } from './lib/http';
import {
  authConfiguration,
  currentUser,
  loginLocally,
  logout,
  requestLogin,
  verifyLogin,
} from './routes/auth';
import {
  acceptInvitation,
  bootstrapOwner,
  disableUser,
  inviteAccountant,
  listInvitations,
  listUsers,
} from './routes/accounts';
import {
  acceptInvitation as acceptDevelopmentInvitation,
  checkOwnerPermission,
  checkRecordsPermission,
  createInvitation as createDevelopmentInvitation,
  listDevelopmentAuthOutbox,
  listDevelopmentOutbox,
  readStorageProbe,
  writeStorageProbe,
} from './routes/development';
import { health } from './routes/health';
import {
  createActivity,
  listActivities,
  updateActivity,
} from './routes/activities';
import { createVehicle, listVehicles, updateVehicle } from './routes/vehicles';
import {
  createWorkSession,
  listWorkSessions,
  updateWorkSession,
} from './routes/workSessions';
import type { Env } from './types';

type RouteHandler = (
  request: Request,
  env: Env,
) => Response | Promise<Response>;

interface Route {
  method: string;
  pathname: string;
  handler: RouteHandler;
}

const routes: Route[] = [
  {
    method: 'GET',
    pathname: '/api/health',
    handler: (_request, env) => health(env),
  },
  { method: 'GET', pathname: '/api/auth/me', handler: currentUser },
  { method: 'GET', pathname: '/api/auth/config', handler: authConfiguration },
  { method: 'POST', pathname: '/api/auth/login', handler: requestLogin },
  { method: 'POST', pathname: '/api/auth/verify', handler: verifyLogin },
  { method: 'POST', pathname: '/api/auth/logout', handler: logout },
  {
    method: 'GET',
    pathname: '/api/business-activities',
    handler: listActivities,
  },
  {
    method: 'POST',
    pathname: '/api/business-activities',
    handler: createActivity,
  },
  {
    method: 'PATCH',
    pathname: '/api/business-activities',
    handler: updateActivity,
  },
  { method: 'GET', pathname: '/api/vehicles', handler: listVehicles },
  { method: 'POST', pathname: '/api/vehicles', handler: createVehicle },
  { method: 'PATCH', pathname: '/api/vehicles', handler: updateVehicle },
  { method: 'GET', pathname: '/api/work-sessions', handler: listWorkSessions },
  {
    method: 'POST',
    pathname: '/api/work-sessions',
    handler: createWorkSession,
  },
  {
    method: 'PATCH',
    pathname: '/api/work-sessions',
    handler: updateWorkSession,
  },
  {
    method: 'POST',
    pathname: '/api/admin/bootstrap-owner',
    handler: bootstrapOwner,
  },
  { method: 'GET', pathname: '/api/users', handler: listUsers },
  { method: 'POST', pathname: '/api/users/disable', handler: disableUser },
  { method: 'GET', pathname: '/api/invitations', handler: listInvitations },
  { method: 'POST', pathname: '/api/invitations', handler: inviteAccountant },
  {
    method: 'POST',
    pathname: '/api/invitations/accept',
    handler: acceptInvitation,
  },
  { method: 'POST', pathname: '/api/dev/auth/login', handler: loginLocally },
  {
    method: 'GET',
    pathname: '/api/dev/auth/outbox',
    handler: listDevelopmentAuthOutbox,
  },
  {
    method: 'GET',
    pathname: '/api/dev/invitations/outbox',
    handler: listDevelopmentOutbox,
  },
  {
    method: 'POST',
    pathname: '/api/dev/invitations',
    handler: createDevelopmentInvitation,
  },
  {
    method: 'POST',
    pathname: '/api/dev/invitations/accept',
    handler: acceptDevelopmentInvitation,
  },
  {
    method: 'GET',
    pathname: '/api/dev/permissions/records',
    handler: checkRecordsPermission,
  },
  {
    method: 'GET',
    pathname: '/api/dev/permissions/owner',
    handler: checkOwnerPermission,
  },
  {
    method: 'PUT',
    pathname: '/api/dev/storage-probe',
    handler: writeStorageProbe,
  },
  {
    method: 'GET',
    pathname: '/api/dev/storage-probe',
    handler: readStorageProbe,
  },
];

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  const matchingPath = routes.filter((route) => route.pathname === pathname);
  const route = matchingPath.find(
    (candidate) => candidate.method === request.method,
  );

  if (route) {
    return route.handler(request, env);
  }

  if (matchingPath.length > 0) {
    return methodNotAllowed(matchingPath.map(({ method }) => method));
  }

  return json({ error: 'Not found.' }, { status: 404 });
}

export default {
  async fetch(request, env): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (env.APP_ENV !== 'local' && url.protocol !== 'https:') {
        url.protocol = 'https:';
        return new Response(null, {
          status: 308,
          headers: { location: url.toString(), 'cache-control': 'no-store' },
        });
      }

      return await handleRequest(request, env);
    } catch (error) {
      if (error instanceof HttpError) {
        return json({ error: error.message }, { status: error.status });
      }

      console.error('Unhandled API error', {
        method: request.method,
        pathname: new URL(request.url).pathname,
      });
      return json({ error: 'An unexpected error occurred.' }, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
