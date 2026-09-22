import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../types';
import { isDemoCacheableRequest, prepareDemoCache } from './demoCacheService';

const environment = { APP_ENV: 'demo' } as Env;

afterEach(() => vi.unstubAllGlobals());

describe('public demo response cache', () => {
  it('caches data reads including filtered requests but excludes operational and binary routes', () => {
    expect(
      isDemoCacheableRequest(
        new Request('https://demo.example.invalid/api/business-activities'),
      ),
    ).toBe(true);
    expect(
      isDemoCacheableRequest(
        new Request('https://demo.example.invalid/api/dashboard?taxYear=2026'),
      ),
    ).toBe(true);
    expect(
      isDemoCacheableRequest(
        new Request('https://demo.example.invalid/api/attachments/file?id=x'),
      ),
    ).toBe(false);
    expect(
      isDemoCacheableRequest(
        new Request('https://demo.example.invalid/api/health'),
      ),
    ).toBe(false);
  });

  it('serves cached JSON for ten minutes without accessing D1', async () => {
    const stored = new Map<string, Response>();
    vi.stubGlobal('caches', {
      default: {
        match: (request: Request) =>
          Promise.resolve(stored.get(request.url)?.clone()),
        put: (request: Request, response: Response) => {
          stored.set(request.url, response.clone());
          return Promise.resolve();
        },
      },
    });
    const request = new Request(
      'https://demo.example.invalid/api/business-activities',
    );

    const first = await prepareDemoCache(request, environment);
    expect(first?.response).toBeNull();
    await first?.store(
      new Response(JSON.stringify({ activities: [] }), {
        headers: { 'content-type': 'application/json; charset=utf-8' },
      }),
    );

    const cachedResponse = [...stored.values()][0];
    expect(cachedResponse.headers.get('cache-control')).toBe(
      'public, max-age=600',
    );

    const hit = await prepareDemoCache(request, environment);
    expect(hit?.response?.headers.get('x-demo-cache')).toBe('HIT');
    expect(hit?.response?.headers.get('cache-control')).toBe('no-store');
    await expect(hit?.response?.json()).resolves.toEqual({ activities: [] });
  });

  it('fails open when the cache is unavailable', async () => {
    vi.stubGlobal('caches', {
      default: {
        match: () => Promise.reject(new Error('cache unavailable')),
      },
    });

    await expect(
      prepareDemoCache(
        new Request('https://demo.example.invalid/api/business-activities'),
        environment,
      ),
    ).resolves.toBeNull();
  });
});
