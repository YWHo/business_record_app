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
  let currentRole: 'OWNER' | 'ACCOUNTANT';

  beforeEach(() => {
    currentRole = 'OWNER';
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
          : url.endsWith('/api/business-activities')
            ? {
                activities: [
                  {
                    id: 'activity-contracting',
                    name: 'IT Contracting',
                    activityType: 'PROFESSIONAL_SERVICES',
                    active: true,
                    startedAt: '2025-04-01',
                    endedAt: null,
                  },
                ],
              }
            : url.endsWith('/api/vehicles')
              ? {
                  vehicles: [
                    {
                      id: 'vehicle-local',
                      registration: 'ABC123',
                      description: 'Work vehicle',
                      active: true,
                      acquiredAt: '2025-01-01',
                      retiredAt: null,
                      notes: null,
                    },
                  ],
                }
              : url.endsWith('/api/work-sessions')
                ? {
                    sessions: [
                      {
                        id: 'session-local',
                        businessActivityId: 'activity-contracting',
                        activityName: 'IT Contracting',
                        vehicleId: 'vehicle-local',
                        vehicleRegistration: 'ABC123',
                        startedAt: '2026-09-08T00:00:00.000Z',
                        endedAt: '2026-09-08T02:00:00.000Z',
                        odometerStartKm: 100,
                        odometerEndKm: 150,
                        distanceKm: 50,
                        durationMinutes: 120,
                        durationHours: 2,
                        grossRevenueMinor: 10_000,
                        currency: 'NZD',
                        revenuePerHourMinor: 5000,
                        revenuePerKmMinor: 200,
                        notes: null,
                      },
                    ],
                    summary: {
                      sessionCount: 1,
                      totalDurationHours: 2,
                      totalDistanceKm: 50,
                      totalRevenueMinor: 10_000,
                      revenuePerHourMinor: 5000,
                      revenuePerKmMinor: 200,
                      currency: 'NZD',
                      completeRevenueData: true,
                    },
                  }
                : {
                    user: {
                      id: 'owner',
                      email: 'owner@local.test',
                      role: currentRole,
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

  it('renders owner management for activities and vehicles', async () => {
    renderApp('/setup');

    expect(
      await screen.findByRole('heading', { name: /activities and vehicles/i }),
    ).toBeInTheDocument();
    expect(await screen.findByText('IT Contracting')).toBeInTheDocument();
    expect(await screen.findByText('ABC123')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /add activity/i }),
    ).toBeInTheDocument();
  });

  it('keeps setup read-only for accountants', async () => {
    currentRole = 'ACCOUNTANT';
    renderApp('/setup');

    expect(
      await screen.findByText(/only the owner can change it/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /add activity/i }),
    ).not.toBeInTheDocument();
  });

  it('renders calculated mileage and owner entry controls', async () => {
    renderApp('/mileage');

    expect(
      await screen.findByRole('heading', { name: /work sessions/i }),
    ).toBeInTheDocument();
    expect(await screen.findAllByText('50 km')).toHaveLength(2);
    expect(screen.getByText('ABC123')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /add work session/i }),
    ).toBeInTheDocument();
  });

  it('keeps mileage entry read-only for accountants', async () => {
    currentRole = 'ACCOUNTANT';
    renderApp('/mileage');

    expect(
      await screen.findByText(/only the owner can change them/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /add work session/i }),
    ).not.toBeInTheDocument();
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
