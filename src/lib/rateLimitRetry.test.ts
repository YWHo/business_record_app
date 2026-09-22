import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithRateLimitRetry } from './rateLimitRetry';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('rate-limit retry', () => {
  it('retries safe reads with bounded exponential delays', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const timerSpy = vi.spyOn(globalThis, 'setTimeout');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 429, headers: { 'retry-after': '1' } }),
      )
      .mockResolvedValueOnce(
        new Response(null, { status: 429, headers: { 'retry-after': '1' } }),
      )
      .mockResolvedValueOnce(Response.json({ success: true }));
    vi.stubGlobal('fetch', fetchMock);

    const pending = fetchWithRateLimitRetry('/api/dashboard');
    await vi.runAllTimersAsync();
    const response = await pending;

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(timerSpy).toHaveBeenNthCalledWith(1, expect.any(Function), 1_000);
    expect(timerSpy).toHaveBeenNthCalledWith(2, expect.any(Function), 2_000);
  });

  it('does not retry unsafe requests', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(null, { status: 429, headers: { 'retry-after': '1' } }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await fetchWithRateLimitRetry('/api/auth/login', {
      method: 'POST',
    });

    expect(response.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('returns immediately when the requested delay exceeds the retry cap', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(null, { status: 429, headers: { 'retry-after': '60' } }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await fetchWithRateLimitRetry('/api/dashboard');

    expect(response.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
