import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth, ApiError, type DemoRole } from '../features/auth/AuthContext';
import { LoginPage } from './LoginPage';

vi.mock('../features/auth/AuthContext', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../features/auth/AuthContext')>();
  return { ...original, useAuth: vi.fn() };
});

describe('LoginPage local identities', () => {
  const localLogin = vi.fn<(email: string) => Promise<void>>();
  beforeEach(() => {
    localLogin.mockReset().mockResolvedValue();
    mockedUseAuth.mockReturnValue({
      configuration: {
        environment: 'local',
        localHelper: true,
        demoHelper: false,
        turnstileRequired: false,
        turnstileSiteKey: null,
      },
      loading: false,
      user: null,
      refresh: vi.fn(),
      localLogin,
      demoLogin: vi.fn(),
      logout: vi.fn(),
      resetDemo: vi.fn(),
    });
  });
  it('shows an accessible recovery notice after a session or grant ends', () => {
    mockedUseAuth.mockReturnValue({ ...mockedUseAuth(), accessEnded: true });
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Request a new sign-in link',
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'contact the account owner',
    );
    expect(screen.queryByLabelText('Auditor access')).not.toBeInTheDocument();
  });
  it.each(['owner', 'accountant', 'auditor'])(
    'offers local %s login with its seeded identity',
    async (role) => {
      render(
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/app/businesses" element={<h1>Local businesses</h1>} />
          </Routes>
        </MemoryRouter>,
      );
      fireEvent.click(
        screen.getByRole('button', { name: `Continue as local ${role}` }),
      );
      await waitFor(() =>
        expect(localLogin).toHaveBeenCalledWith(`${role}@local.test`),
      );
      expect(
        await screen.findByRole('heading', { name: 'Local businesses' }),
      ).toBeVisible();
      expect(
        screen.queryByRole('button', { name: 'Continue as Demo Auditor' }),
      ).not.toBeInTheDocument();
    },
  );
  it('explains the additive seed command when local auditor access is unavailable', async () => {
    localLogin.mockRejectedValue(
      new ApiError(401, { error: 'Unable to sign in.' }),
    );
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Continue as local auditor' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'pnpm db:seed:local:auditor',
    );
  });
  it('does not offer local identities outside local configuration', () => {
    mockedUseAuth.mockReturnValue({
      ...mockedUseAuth(),
      configuration: {
        environment: 'production',
        localHelper: false,
        demoHelper: false,
        turnstileRequired: false,
        turnstileSiteKey: null,
      },
    });
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole('button', { name: 'Continue as local auditor' }),
    ).not.toBeInTheDocument();
  });
});

const mockedUseAuth = vi.mocked(useAuth);

describe('LoginPage demo roles', () => {
  const demoLogin = vi.fn<(role: DemoRole) => Promise<void>>();

  beforeEach(() => {
    demoLogin.mockReset();
    demoLogin.mockResolvedValue();
    mockedUseAuth.mockReturnValue({
      configuration: {
        environment: 'demo',
        localHelper: false,
        demoHelper: true,
        turnstileRequired: false,
        turnstileSiteKey: null,
      },
      loading: false,
      user: null,
      refresh: vi.fn(),
      localLogin: vi.fn(),
      demoLogin,
      logout: vi.fn(),
      resetDemo: vi.fn(),
    });
  });

  it.each([
    ['Owner', 'OWNER'],
    ['Accountant', 'ACCOUNTANT'],
    ['Auditor', 'AUDITOR'],
  ])(
    'offers synthetic %s entry without production login',
    async (label, role) => {
      render(
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/app/businesses" element={<h1>Demo businesses</h1>} />
          </Routes>
        </MemoryRouter>,
      );

      expect(
        screen.getByRole('button', { name: 'Continue as Demo Owner' }),
      ).toBeVisible();
      expect(
        screen.getByRole('button', { name: 'Continue as Demo Auditor' }),
      ).toBeVisible();
      expect(
        screen.queryByRole('button', { name: 'Email sign-in link' }),
      ).not.toBeInTheDocument();

      fireEvent.click(
        screen.getByRole('button', { name: `Continue as Demo ${label}` }),
      );
      await waitFor(() => expect(demoLogin).toHaveBeenCalledWith(role));
      expect(
        await screen.findByRole('heading', { name: 'Demo businesses' }),
      ).toBeVisible();
    },
  );
});
