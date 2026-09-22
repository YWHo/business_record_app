import type { Env } from '../types';

const cacheTtlSeconds = 10 * 60;
const excludedPaths = new Set([
  '/api/health',
  '/api/attachments/file',
  '/api/exports/archive',
]);

export function isDemoCacheableRequest(request: Request): boolean {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  return (
    !url.pathname.startsWith('/api/dev/') && !excludedPaths.has(url.pathname)
  );
}

function responseForClient(response: Response, status: 'HIT' | 'MISS') {
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'no-store');
  headers.set('x-demo-cache', status);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export interface DemoCacheLookup {
  response: Response | null;
  store(response: Response): Promise<void>;
  miss(response: Response): Response;
}

interface WorkerCacheStorage extends CacheStorage {
  readonly default: Cache;
}

export async function prepareDemoCache(
  request: Request,
  env: Env,
): Promise<DemoCacheLookup | null> {
  if (
    env.APP_ENV !== 'demo' ||
    !isDemoCacheableRequest(request) ||
    typeof caches === 'undefined'
  ) {
    return null;
  }

  const cache = (caches as WorkerCacheStorage).default;
  const key = new Request(request.url, { method: 'GET' });
  let cached: Response | undefined;
  try {
    cached = await cache.match(key);
  } catch {
    return null;
  }

  return {
    response: cached ? responseForClient(cached, 'HIT') : null,
    async store(response) {
      if (
        response.status !== 200 ||
        !response.headers.get('content-type')?.startsWith('application/json')
      ) {
        return;
      }
      const headers = new Headers(response.headers);
      headers.set('cache-control', `public, max-age=${cacheTtlSeconds}`);
      headers.delete('set-cookie');
      try {
        await cache.put(
          key,
          new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
          }),
        );
      } catch {
        // Caching is an optimization; a cache outage must not break the demo.
      }
    },
    miss: (response) => responseForClient(response, 'MISS'),
  };
}
