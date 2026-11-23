import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
function AccessState() {
  const { user, loading, accessEnded } = useAuth();
  return (
    <p>
      {loading
        ? 'Loading'
        : user
          ? user.role
          : accessEnded
            ? 'Access ended'
            : 'Signed out'}
    </p>
  );
}
function LocalAuditorEntry() {
  const { user, loading, localLogin } = useAuth();
  return (
    <>
      <p>
        {loading
          ? 'Loading'
          : (user?.access?.scopes[0]?.label ?? 'No scope loaded')}
      </p>
      <button onClick={() => void localLogin('auditor@local.test')}>
        Local auditor
      </button>
    </>
  );
}
describe('auditor access refresh', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('loads auditor scope metadata immediately after local login', async () => {
    let signedIn = false;
    const fetcher = vi.fn<typeof fetch>((input) => {
      const path =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (path === '/api/dev/auth/login') {
        signedIn = true;
      }
      const user = {
        id: 'local-auditor',
        email: 'auditor@local.test',
        role: 'AUDITOR',
        status: 'ACTIVE',
      };
      return Promise.resolve(
        new Response(
          JSON.stringify(
            path === '/api/auth/config'
              ? { environment: 'local', localHelper: true }
              : {
                  user: signedIn
                    ? {
                        ...user,
                        ...(path === '/api/auth/me'
                          ? {
                              access: {
                                accessStartsAt: null,
                                accessExpiresAt: '2099-01-01T00:00:00.000Z',
                                scopes: [
                                  {
                                    scopeType: 'BUSINESS',
                                    label: 'IT Contracting',
                                    dateFrom: null,
                                    dateTo: null,
                                  },
                                ],
                              },
                            }
                          : {}),
                      }
                    : null,
                },
          ),
        ),
      );
    });
    vi.stubGlobal('fetch', fetcher);
    render(
      <AuthProvider>
        <LocalAuditorEntry />
      </AuthProvider>,
    );
    await screen.findByText('No scope loaded');
    fireEvent.click(screen.getByRole('button', { name: 'Local auditor' }));
    expect(await screen.findByText('IT Contracting')).toBeVisible();
    expect(
      fetcher.mock.calls.filter(([input]) => input === '/api/auth/me'),
    ).toHaveLength(2);
  });
  it.each(['server revocation', 'known expiry'])(
    'removes the active workspace after %s',
    async (cause) => {
      let ended = false;
      const listeners = vi.spyOn(window, 'addEventListener');
      vi.stubGlobal(
        'fetch',
        vi.fn((path: string) =>
          Promise.resolve(
            new Response(
              JSON.stringify(
                path === '/api/auth/config'
                  ? { environment: 'local' }
                  : ended
                    ? { error: 'Authentication required.' }
                    : {
                        user: {
                          id: 'auditor',
                          email: 'auditor@example.invalid',
                          role: 'AUDITOR',
                          status: 'ACTIVE',
                          access: {
                            accessExpiresAt: '2099-01-01T00:00:00.000Z',
                            scopes: [],
                          },
                        },
                      },
              ),
              { status: ended && path === '/api/auth/me' ? 401 : 200 },
            ),
          ),
        ),
      );
      render(
        <AuthProvider>
          <AccessState />
        </AuthProvider>,
      );
      expect(await screen.findByText('AUDITOR')).toBeVisible();
      await waitFor(() =>
        expect(listeners).toHaveBeenCalledWith('focus', expect.any(Function)),
      );
      if (cause === 'server revocation') {
        ended = true;
      } else {
        vi.spyOn(Date, 'now').mockReturnValue(
          Date.parse('2099-01-02T00:00:00.000Z'),
        );
      }
      await act(async () => {
        fireEvent.focus(window);
        await Promise.resolve();
      });
      expect(await screen.findByText('Access ended')).toBeVisible();
    },
  );
  it('keeps the current workspace when a focus check meets a temporary service failure', async () => {
    let unavailable = false;
    const listeners = vi.spyOn(window, 'addEventListener');
    const fetcher = vi.fn((path: string) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            path === '/api/auth/config'
              ? { environment: 'local' }
              : unavailable
                ? { error: 'Temporary failure.' }
                : {
                    user: {
                      id: 'auditor',
                      role: 'AUDITOR',
                      access: {
                        accessExpiresAt: '2099-01-01T00:00:00.000Z',
                        scopes: [],
                      },
                    },
                  },
          ),
          { status: unavailable && path === '/api/auth/me' ? 503 : 200 },
        ),
      ),
    );
    vi.stubGlobal('fetch', fetcher);
    render(
      <AuthProvider>
        <AccessState />
      </AuthProvider>,
    );
    expect(await screen.findByText('AUDITOR')).toBeVisible();
    await waitFor(() =>
      expect(listeners).toHaveBeenCalledWith('focus', expect.any(Function)),
    );
    unavailable = true;
    await act(async () => {
      fireEvent.focus(window);
      await Promise.resolve();
    });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    expect(screen.getByText('AUDITOR')).toBeVisible();
    expect(screen.queryByText('Access ended')).not.toBeInTheDocument();
  });
});
