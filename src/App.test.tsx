import { render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './features/auth/AuthContext';

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        const body = url.endsWith('/api/auth/config')
          ? {
              environment: 'local',
              localHelper: true,
              turnstileRequired: false,
              turnstileSiteKey: null,
            }
          : {
              user: {
                id: 'owner',
                email: 'owner@local.test',
                role: 'OWNER',
                status: 'ACTIVE',
              },
            };
        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it('renders the dashboard route', async () => {
    renderApp('/');

    expect(
      await screen.findByRole('heading', {
        name: /your business at a glance/i,
      }),
    ).toBeInTheDocument();
  });

  it('renders a not-found page for unknown routes', async () => {
    renderApp('/missing');

    expect(
      await screen.findByRole('heading', { name: /page not found/i }),
    ).toBeInTheDocument();
  });

  it('consumes a login link only once under strict effects', async () => {
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/verify-login?token=single-use']}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </MemoryRouter>
      </StrictMode>,
    );

    expect(await screen.findByText(/signed in/i)).toBeInTheDocument();
    const fetchMock = vi.mocked(fetch);
    const verificationCalls = fetchMock.mock.calls.filter(([input]) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      return url.endsWith('/api/auth/verify');
    });
    expect(verificationCalls).toHaveLength(1);
  });
});
