import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../features/auth/AuthContext';
import { LoginPage } from './LoginPage';

vi.mock('../features/auth/AuthContext', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../features/auth/AuthContext')>();
  return { ...original, useAuth: vi.fn() };
});

const mockedUseAuth = vi.mocked(useAuth);

describe('LoginPage demo roles', () => {
  const demoLogin = vi.fn<(role: 'OWNER' | 'ACCOUNTANT') => Promise<void>>();

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

  it('offers synthetic owner and accountant entry without production login', async () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<h1>Demo dashboard</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('button', { name: 'Continue as Demo Owner' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Continue as Demo Accountant' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Email sign-in link' }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Continue as Demo Accountant' }),
    );
    await waitFor(() => expect(demoLogin).toHaveBeenCalledWith('ACCOUNTANT'));
    expect(
      await screen.findByRole('heading', { name: 'Demo dashboard' }),
    ).toBeVisible();
  });
});
