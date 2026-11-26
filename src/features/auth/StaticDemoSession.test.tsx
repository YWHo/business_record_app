import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { AuthProvider, apiRequest, useAuth } from './AuthContext';

function Probe() {
  const { user, loading, demoLogin, logout, refresh } = useAuth();
  const [result, setResult] = useState('');
  const load = async () => {
    setResult(JSON.stringify(await apiRequest('/api/businesses')));
  };
  return (
    <>
      <p>{loading ? 'Loading' : (user?.role ?? 'Signed out')}</p>
      <button onClick={() => void demoLogin('OWNER')}>Choose owner</button>
      <button onClick={() => void load()}>Read businesses</button>
      <button onClick={() => void refresh()}>Refresh identity</button>
      <button onClick={() => void logout()}>Sign out</button>
      <p data-testid="result">{result}</p>
    </>
  );
}
beforeEach(() => {
  sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

it('boots a demo build, selects roles, reads records and signs out with no API requests', async () => {
  vi.stubEnv('MODE', 'demo');
  const fetcher = vi.fn(() => {
    throw new Error('All API requests blocked');
  });
  vi.stubGlobal('fetch', fetcher);
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await screen.findByText('Signed out');
  fireEvent.click(screen.getByRole('button', { name: 'Choose owner' }));
  await screen.findByText('OWNER');
  fireEvent.click(screen.getByRole('button', { name: 'Read businesses' }));
  await waitFor(() =>
    expect(screen.getByTestId('result')).toHaveTextContent('DoorDash'),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Refresh identity' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  await screen.findByText('Signed out');
  expect(fetcher).not.toHaveBeenCalled();
});

it('keeps production configuration, identity and data on the remote path despite a persisted demo role', async () => {
  vi.stubEnv('MODE', 'cloudflare-production');
  sessionStorage.setItem('business-records-demo-role', 'OWNER');
  const fetcher = vi.fn<typeof fetch>((input) => {
    const path =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    return Promise.resolve(
      new Response(
        JSON.stringify(
          path === '/api/auth/config'
            ? { environment: 'production', demoHelper: false }
            : path === '/api/auth/me'
              ? {
                  user: {
                    id: 'private-session',
                    role: 'OWNER',
                    status: 'ACTIVE',
                  },
                }
              : {
                  businesses: [{ id: 'server-only', name: 'Server response' }],
                },
        ),
      ),
    );
  });
  vi.stubGlobal('fetch', fetcher);
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await screen.findByText('OWNER');
  fireEvent.click(screen.getByRole('button', { name: 'Read businesses' }));
  await waitFor(() =>
    expect(screen.getByTestId('result')).toHaveTextContent('Server response'),
  );
  expect(screen.getByTestId('result')).not.toHaveTextContent('DoorDash');
  expect(fetcher.mock.calls.map(([path]) => path)).toEqual([
    '/api/auth/config',
    '/api/auth/me',
    '/api/businesses',
  ]);
});
