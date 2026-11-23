import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { AuthProvider, useAuth, type AuthUser } from './AuthContext';

const now = new Date('2026-11-23T00:00:00.000Z');

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function SessionState() {
  const { user, loading, accessEnded, refresh, logout } = useAuth();
  return (
    <>
      <p role="status">
        {loading
          ? 'Loading'
          : user
            ? user.role
            : accessEnded
              ? 'Access ended'
              : 'Signed out'}
      </p>
      <button onClick={() => void refresh()}>Refresh access</button>
      <button onClick={() => void logout()}>Sign out</button>
    </>
  );
}

async function openSession(
  expiry = new Date(now.getTime() + 60000).toISOString(),
) {
  const user: AuthUser = {
    id: 'auditor',
    email: 'auditor@example.invalid',
    role: 'AUDITOR',
    status: 'ACTIVE',
    access: {
      accessStartsAt: null,
      accessExpiresAt: expiry,
      scopes: [
        {
          scopeType: 'BUSINESS',
          label: 'IT Contracting',
          dateFrom: null,
          dateTo: null,
        },
      ],
    },
  };
  const pending: ReturnType<typeof deferredResponse>[] = [];
  let initialSession = true;
  const fetcher = vi.fn<typeof fetch>((input) => {
    const path =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (path === '/api/auth/config') {
      return Promise.resolve(json({ environment: 'local' }));
    }
    if (path === '/api/auth/logout') {
      return Promise.resolve(json({ success: true }));
    }
    if (initialSession) {
      initialSession = false;
      return Promise.resolve(json({ user }));
    }
    const response = deferredResponse();
    pending.push(response);
    return response.promise;
  });
  vi.stubGlobal('fetch', fetcher);
  let unmount!: () => void;
  await act(async () => {
    ({ unmount } = render(
      <AuthProvider>
        <SessionState />
      </AuthProvider>,
    ));
    await Promise.resolve();
  });
  expect(screen.getByRole('status')).toHaveTextContent('AUDITOR');
  return { pending, fetcher, user, unmount };
}

describe('auditor session expiry and asynchronous authorization', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });
  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('ends an open workspace at its known expiry without focus or another request', async () => {
    const { fetcher } = await openSession(
      new Date(now.getTime() + 1000).toISOString(),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Access ended');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not restore an expired workspace when an earlier refresh arrives late', async () => {
    const { pending, user } = await openSession(
      new Date(now.getTime() + 1000).toISOString(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refresh access' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Access ended');
    await act(async () => {
      pending[0].resolve(json({ user }));
      await Promise.resolve();
    });
    expect(screen.getByRole('status')).toHaveTextContent('Access ended');
  });

  it('keeps a newer access denial when an older successful refresh arrives last', async () => {
    const { pending, user } = await openSession();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh access' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh access' }));
    await act(async () => {
      pending[1].resolve(json({ error: 'Revoked.' }, 401));
      await Promise.resolve();
    });
    expect(screen.getByRole('status')).toHaveTextContent('Access ended');
    await act(async () => {
      pending[0].resolve(json({ user }));
      await Promise.resolve();
    });
    expect(screen.getByRole('status')).toHaveTextContent('Access ended');
  });

  it('ignores an older denial after the latest refresh confirms current access', async () => {
    const { pending, user } = await openSession();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh access' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh access' }));
    await act(async () => {
      pending[1].resolve(json({ user }));
      await Promise.resolve();
    });
    await act(async () => {
      pending[0].resolve(json({ error: 'Old denial.' }, 403));
      await Promise.resolve();
    });
    expect(screen.getByRole('status')).toHaveTextContent('AUDITOR');
  });

  it('does not reopen a signed-out workspace from an in-flight refresh', async () => {
    const { pending, user } = await openSession();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh access' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
      await Promise.resolve();
    });
    expect(screen.getByRole('status')).toHaveTextContent('Signed out');
    await act(async () => {
      pending[0].resolve(json({ user }));
      await Promise.resolve();
    });
    expect(screen.getByRole('status')).toHaveTextContent('Signed out');
  });

  it.each(['2020-01-01T00:00:00.000Z', 'not-a-date'])(
    'rejects a refreshed auditor whose expiry is %s',
    async (expiry) => {
      const { pending, user } = await openSession();
      fireEvent.click(screen.getByRole('button', { name: 'Refresh access' }));
      await act(async () => {
        pending[0].resolve(
          json({
            user: {
              ...user,
              access: { ...user.access, accessExpiresAt: expiry },
            },
          }),
        );
        await Promise.resolve();
      });
      expect(screen.getByRole('status')).toHaveTextContent('Access ended');
    },
  );

  it('removes expiry and focus checks when the provider unmounts', async () => {
    const { fetcher, unmount } = await openSession();
    unmount();
    await act(async () => {
      fireEvent.focus(window);
      await vi.advanceTimersByTimeAsync(61000);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
