import { HttpError } from '../lib/http';
import type { Env } from '../types';

export function isDemoAuthEnabled(env: Env): boolean {
  return env.APP_ENV === 'demo' && env.DEMO_AUTH_ENABLED === 'true';
}

export function requireDemoAuth(env: Env): void {
  if (!isDemoAuthEnabled(env)) {
    throw new HttpError(404, 'Not found.');
  }
}
