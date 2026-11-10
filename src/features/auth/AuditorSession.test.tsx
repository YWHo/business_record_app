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
describe('auditor access refresh', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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
      if (cause === 'server revocation') ended = true;
      else
        vi.spyOn(Date, 'now').mockReturnValue(
          Date.parse('2099-01-02T00:00:00.000Z'),
        );
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
