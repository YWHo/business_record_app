import { HttpError, json, methodNotAllowed } from './lib/http';
import { currentUser, loginLocally, logout } from './routes/auth';
import {
  acceptInvitation,
  checkOwnerPermission,
  checkRecordsPermission,
  createInvitation,
  listDevelopmentOutbox,
  readStorageProbe,
  writeStorageProbe,
} from './routes/development';
import { health } from './routes/health';
import type { Env } from './types';

type RouteHandler = (request: Request, env: Env) => Promise<Response>;

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
  { method: 'POST', pathname: '/api/auth/logout', handler: logout },
  { method: 'POST', pathname: '/api/dev/auth/login', handler: loginLocally },
  {
    method: 'GET',
    pathname: '/api/dev/invitations/outbox',
    handler: listDevelopmentOutbox,
  },
  {
    method: 'POST',
    pathname: '/api/dev/invitations',
    handler: createInvitation,
  },
  {
    method: 'POST',
    pathname: '/api/dev/invitations/accept',
    handler: acceptInvitation,
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
