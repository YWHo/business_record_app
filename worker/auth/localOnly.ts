import { HttpError } from '../lib/http';
import type { Env } from '../types';

const localHostnames = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isLocalAuthRequest(request: Request, env: Env): boolean {
  return (
    env.APP_ENV === 'local' &&
    env.LOCAL_AUTH_ENABLED === 'true' &&
    localHostnames.has(new URL(request.url).hostname)
  );
}

export function requireLocalAuth(request: Request, env: Env): void {
  if (!isLocalAuthRequest(request, env)) {
    throw new HttpError(404, 'Not found.');
  }
}
