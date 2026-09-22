import { hashToken } from '../auth/authorization';
import { HttpError } from '../lib/http';
import type { Env, RateLimiter } from '../types';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isTurnstileRequired(env: Env): boolean {
  return env.APP_ENV === 'production' || env.TURNSTILE_REQUIRED === 'true';
}

export function requireSameOrigin(request: Request, env: Env): void {
  if (env.APP_ENV === 'local' || safeMethods.has(request.method)) return;

  let expectedOrigin: string;
  try {
    expectedOrigin = new URL(env.APP_ORIGIN).origin;
  } catch {
    throw new HttpError(503, 'Application origin is not configured.');
  }

  const suppliedOrigin = request.headers.get('origin');
  if (!suppliedOrigin || suppliedOrigin !== expectedOrigin) {
    throw new HttpError(403, 'Request origin could not be verified.');
  }
}

export function requireSameOriginFetch(request: Request, env: Env): void {
  if (env.APP_ENV === 'local') return;
  if (request.headers.get('sec-fetch-site') !== 'same-origin') {
    throw new HttpError(403, 'Request origin could not be verified.');
  }
}

export function secureApiResponse(
  response: Response,
  env: Env,
  requestId: string,
): Response {
  const headers = new Headers(response.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'DENY');
  headers.set('referrer-policy', 'no-referrer');
  headers.set(
    'permissions-policy',
    'camera=(self), geolocation=(), microphone=(), payment=(), usb=()',
  );
  headers.set(
    'content-security-policy',
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  );
  headers.set('x-request-id', requestId);
  if (env.APP_ENV !== 'local') {
    headers.set(
      'strict-transport-security',
      'max-age=31536000; includeSubDomains',
    );
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function enforceRateLimit(
  request: Request,
  limiter: RateLimiter,
  scope: string,
  discriminator = '',
  retryAfterSeconds = 60,
): Promise<void> {
  const clientAddress = request.headers.get('cf-connecting-ip') ?? 'local';
  const dimensions = [`${scope}:client:${clientAddress}`];
  if (discriminator) dimensions.push(`${scope}:subject:${discriminator}`);
  const results = await Promise.all(
    dimensions.map(async (dimension) =>
      limiter.limit({ key: await hashToken(dimension) }),
    ),
  );

  if (results.some((result) => !result.success)) {
    throw new HttpError(429, 'Too many requests. Please try again later.', {
      'retry-after': String(retryAfterSeconds),
    });
  }
}

export async function verifyTurnstile(
  request: Request,
  env: Env,
  token: string | undefined,
): Promise<void> {
  if (!isTurnstileRequired(env)) {
    return;
  }

  if (!token || token.length > 2048 || !env.TURNSTILE_SECRET_KEY) {
    throw new HttpError(400, 'Challenge verification failed.');
  }

  let expectedHostname: string;
  try {
    expectedHostname = new URL(env.APP_ORIGIN).hostname;
  } catch {
    throw new HttpError(503, 'Application origin is not configured.');
  }

  const form = new FormData();
  form.set('secret', env.TURNSTILE_SECRET_KEY);
  form.set('response', token);
  form.set('idempotency_key', crypto.randomUUID());

  const clientAddress = request.headers.get('cf-connecting-ip');
  if (clientAddress) {
    form.set('remoteip', clientAddress);
  }

  let response: Response;
  let result: { success?: boolean; action?: string; hostname?: string };
  try {
    response = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      { method: 'POST', body: form, signal: AbortSignal.timeout(5_000) },
    );
    if (!response.ok) {
      throw new Error('Turnstile returned a non-success status.');
    }
    result = await response.json<typeof result>();
  } catch {
    throw new HttpError(
      503,
      'Challenge verification is temporarily unavailable.',
    );
  }
  if (
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
