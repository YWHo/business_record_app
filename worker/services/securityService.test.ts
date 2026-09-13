import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../types';
import {
  enforceRateLimit,
  isTurnstileRequired,
  requireSameOrigin,
  requireSameOriginFetch,
  secureApiResponse,
  verifyTurnstile,
} from './securityService';

const securityEnvironment = (overrides: Partial<Env> = {}) =>
  ({
    APP_ENV: 'production',
    APP_ORIGIN: 'https://records.example.invalid',
    TURNSTILE_REQUIRED: 'true',
    TURNSTILE_SECRET_KEY: 'server-secret',
    ...overrides,
  }) as Env;

afterEach(() => vi.unstubAllGlobals());

describe('request security', () => {
  it('limits both the client and stable subject without exposing either', async () => {
    const keys: string[] = [];
    const limiter = {
      limit: ({ key }: { key: string }) => {
        keys.push(key);
        return Promise.resolve({ success: true });
      },
    };
    await enforceRateLimit(
      new Request('https://records.example.invalid/api/auth/login', {
        headers: { 'cf-connecting-ip': '192.0.2.1' },
      }),
      limiter,
      'login',
      'person@example.invalid',
    );

    expect(keys).toHaveLength(2);
    expect(keys.every((key) => /^[a-f\d]{64}$/.test(key))).toBe(true);
    expect(new Set(keys).size).toBe(2);
  });

  it('requires the configured origin for deployed unsafe requests', () => {
    const env = securityEnvironment();
    expect(() =>
      requireSameOrigin(
        new Request('https://records.example.invalid/api/records', {
          method: 'POST',
          headers: { origin: 'https://records.example.invalid' },
        }),
        env,
      ),
    ).not.toThrow();
    expect(() =>
      requireSameOrigin(
        new Request('https://records.example.invalid/api/records', {
          method: 'POST',
          headers: { origin: 'https://attacker.example.invalid' },
        }),
        env,
      ),
    ).toThrow('Request origin could not be verified.');
    expect(() =>
      requireSameOrigin(
        new Request('https://records.example.invalid/api/records', {
          method: 'POST',
        }),
        env,
      ),
    ).toThrow('Request origin could not be verified.');
  });

  it('allows safe methods and preserves loopback development workflows', () => {
    expect(() =>
      requireSameOrigin(
        new Request('https://records.example.invalid/api/records'),
        securityEnvironment(),
      ),
    ).not.toThrow();
    expect(() =>
      requireSameOrigin(
        new Request('http://127.0.0.1:5173/api/records', { method: 'POST' }),
        securityEnvironment({
          APP_ENV: 'local',
          APP_ORIGIN: 'http://localhost:5173',
        }),
      ),
    ).not.toThrow();
  });

  it('requires same-origin fetch metadata for deployed export navigations', () => {
    expect(() =>
      requireSameOriginFetch(
        new Request('https://records.example.invalid/api/exports/archive', {
          headers: { 'sec-fetch-site': 'same-origin' },
        }),
        securityEnvironment(),
      ),
    ).not.toThrow();
    expect(() =>
      requireSameOriginFetch(
        new Request('https://records.example.invalid/api/exports/archive', {
          headers: { 'sec-fetch-site': 'same-site' },
        }),
        securityEnvironment(),
      ),
    ).toThrow('Request origin could not be verified.');
  });

  it('adds hardened headers without losing response metadata', async () => {
    const response = secureApiResponse(
      new Response('saved', {
        status: 201,
        headers: { 'set-cookie': 'br_session=value; HttpOnly' },
      }),
      securityEnvironment(),
      'request-123',
    );

    expect(response.status).toBe(201);
    expect(await response.text()).toBe('saved');
    expect(response.headers.get('set-cookie')).toContain('br_session=value');
    expect(response.headers.get('x-request-id')).toBe('request-123');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('strict-transport-security')).toContain(
      'max-age=31536000',
    );
  });
});

describe('Turnstile verification', () => {
  it('cannot be disabled by a production variable override', () => {
    expect(
      isTurnstileRequired(securityEnvironment({ TURNSTILE_REQUIRED: 'false' })),
    ).toBe(true);
    expect(
      isTurnstileRequired(
        securityEnvironment({ APP_ENV: 'demo', TURNSTILE_REQUIRED: 'false' }),
      ),
    ).toBe(false);
  });

  it('requires a successful login action for the configured hostname', async () => {
    const fetchMock = vi.fn((_: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe('POST');
      expect(init?.body).toBeInstanceOf(FormData);
      return Promise.resolve(
        Response.json({
          success: true,
          action: 'login',
          hostname: 'records.example.invalid',
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      verifyTurnstile(
        new Request('https://records.example.invalid/api/auth/login', {
          method: 'POST',
          headers: { 'cf-connecting-ip': '192.0.2.1' },
        }),
        securityEnvironment(),
        'challenge-token',
      ),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('fails closed with a service error when verification is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );

    await expect(
      verifyTurnstile(
        new Request('https://records.example.invalid/api/auth/login'),
        securityEnvironment(),
        'challenge-token',
      ),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('rejects a valid token issued for another action', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json({
            success: true,
            action: 'different-action',
            hostname: 'records.example.invalid',
          }),
        ),
      ),
    );

    await expect(
      verifyTurnstile(
        new Request('https://records.example.invalid/api/auth/login'),
        securityEnvironment(),
        'challenge-token',
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});
