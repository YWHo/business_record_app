const defaultDelayMs = 1_000;
const maximumDelayMs = 30_000;
const maximumRetries = 2;
const jitterMs = 500;

function retryAfterMilliseconds(response: Response): number | null {
  const value = response.headers.get('retry-after');
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;

  const date = Date.parse(value);
  if (!Number.isFinite(date)) return null;
  return Math.max(0, date - Date.now());
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function fetchWithRateLimitRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const canRetry = method === 'GET' || method === 'HEAD';

  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(input, init);
    if (!canRetry || response.status !== 429 || attempt >= maximumRetries) {
      return response;
    }

    const retryAfterMs = retryAfterMilliseconds(response);
    const baseDelay = retryAfterMs ?? defaultDelayMs;
    const delay = baseDelay * 2 ** attempt + Math.random() * jitterMs;
    if (delay > maximumDelayMs) return response;
    await response.body?.cancel();
    await wait(delay);
  }
}
