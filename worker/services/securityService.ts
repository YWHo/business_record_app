import { hashToken } from '../auth/authorization';
import { HttpError } from '../lib/http';
import type { Env, RateLimiter } from '../types';

export async function enforceRateLimit(
  request: Request,
  limiter: RateLimiter,
  scope: string,
  discriminator = '',
): Promise<void> {
  const clientAddress = request.headers.get('cf-connecting-ip') ?? 'local';
  const key = await hashToken(`${scope}:${clientAddress}:${discriminator}`);
  const result = await limiter.limit({ key });

  if (!result.success) {
    throw new HttpError(429, 'Too many requests. Please try again later.');
  }
}

export async function verifyTurnstile(
  request: Request,
  env: Env,
  token: string | undefined,
): Promise<void> {
  if (env.TURNSTILE_REQUIRED !== 'true') {
    return;
  }

  if (!token || token.length > 2048 || !env.TURNSTILE_SECRET_KEY) {
    throw new HttpError(400, 'Challenge verification failed.');
  }

  const form = new FormData();
  form.set('secret', env.TURNSTILE_SECRET_KEY);
  form.set('response', token);
  form.set('idempotency_key', crypto.randomUUID());

  const clientAddress = request.headers.get('cf-connecting-ip');
  if (clientAddress) {
    form.set('remoteip', clientAddress);
  }

  const response = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    { method: 'POST', body: form },
  );
  const result = await response.json<{
    success?: boolean;
    action?: string;
    hostname?: string;
  }>();
  const expectedHostname = new URL(env.APP_ORIGIN).hostname;

  if (
    !response.ok ||
    result.success !== true ||
    result.action !== 'login' ||
    result.hostname !== expectedHostname
  ) {
    throw new HttpError(400, 'Challenge verification failed.');
  }
}

export async function constantTimeEqual(
  received: string,
  expected: string,
): Promise<boolean> {
  const [receivedHash, expectedHash] = await Promise.all([
    hashToken(received),
    hashToken(expected),
  ]);
  let difference = 0;

  for (let index = 0; index < receivedHash.length; index += 1) {
    difference |=
      receivedHash.charCodeAt(index) ^ expectedHash.charCodeAt(index);
  }

  return difference === 0;
}
