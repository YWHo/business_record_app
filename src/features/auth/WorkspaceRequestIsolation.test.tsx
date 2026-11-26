import { render, waitFor } from '@testing-library/react';
import { StrictMode, useEffect } from 'react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import {
  AuthProvider,
  useApiRequest,
  useAuth,
  type apiRequest,
} from './AuthContext';
import { demoStorageSnapshot, resetDemoData } from '../demo/demoStore';

type RequestClient = typeof apiRequest;
function Capture({ save }: { save: (request: RequestClient) => void }) {
  const request = useApiRequest();
  const { loading } = useAuth();
  useEffect(() => {
    if (!loading) {
      save(request);
    }
  }, [request, save, loading]);
  return null;
}
beforeEach(async () => {
  sessionStorage.clear();
  await resetDemoData();
});
afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

it('rejects stale private clients and discards late private responses after entering the demo', async () => {
  let resolvePrivate!: (response: Response) => void;
  const fetcher = vi.fn<typeof fetch>((input) => {
    if (input === '/api/auth/config') {
      return Promise.resolve(
        new Response(
          JSON.stringify({ environment: 'production', demoHelper: false }),
        ),
      );
    }
    if (input === '/api/auth/me') {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            user: { id: 'private-owner', role: 'OWNER', status: 'ACTIVE' },
          }),
        ),
      );
    }
    return new Promise<Response>((resolve) => {
      resolvePrivate = resolve;
    });
  });
  vi.stubGlobal('fetch', fetcher);
  let privateClient: RequestClient | undefined;
  const mounted = render(
    <AuthProvider>
      <Capture
        save={(request) => {
          privateClient = request;
        }}
      />
    </AuthProvider>,
  );
  await waitFor(() => expect(privateClient).toBeDefined());
  const pending = privateClient!('/api/clients').catch(
    (error: unknown) => error,
  );
  expect(fetcher.mock.calls.at(-1)?.[1]?.cache).toBe('no-store');
  mounted.unmount();
  sessionStorage.setItem('business-records-demo-role', 'OWNER');
  let demoClient: RequestClient | undefined;
  render(
    <AuthProvider mode="demo">
      <Capture
        save={(request) => {
          demoClient = request;
        }}
      />
    </AuthProvider>,
  );
  await waitFor(() => expect(demoClient).toBeDefined());
  resolvePrivate(
    new Response(
      JSON.stringify({ clients: [{ name: 'Private data must stay private' }] }),
    ),
  );
  expect(await pending).toMatchObject({ status: 409 });
  await expect(
    privateClient!('/api/clients', {
      method: 'POST',
      body: JSON.stringify({ name: 'Private data must stay private' }),
    }),
  ).rejects.toMatchObject({ status: 409 });
  const clients = await demoClient!<{ clients: { name: string }[] }>(
    '/api/clients',
  );
  expect(clients.clients.some((row) => row.name.includes('Private data'))).toBe(
    false,
  );
  expect((await demoStorageSnapshot()).operations).toEqual([]);
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it('keeps restored demo reads available during StrictMode effect reconnection', async () => {
  sessionStorage.setItem('business-records-demo-role', 'OWNER');
  const outcomes: unknown[] = [];
  function ReadsDemo() {
    const request = useApiRequest();
    useEffect(() => {
      void request('/api/businesses')
        .then(() => outcomes.push('ok'))
        .catch((error: unknown) => outcomes.push(error));
    }, [request]);
    return null;
  }
  render(
    <StrictMode>
      <AuthProvider mode="demo">
        <ReadsDemo />
      </AuthProvider>
    </StrictMode>,
  );
  await waitFor(() => expect(outcomes).toHaveLength(2));
  expect(outcomes).toEqual(['ok', 'ok']);
});
