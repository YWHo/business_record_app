import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { AuthProvider, apiRequest, useAuth } from './AuthContext';
import { recordDemoMutation, resetDemoData } from '../demo/demoStore';

vi.mock('../demo/demoStore', () => ({
  applyDemoOverlay: vi.fn((payload: unknown) => Promise.resolve(payload)),
  recordDemoMutation: vi.fn(() => Promise.resolve({ localDemo: true })),
  resetDemoData: vi.fn(() => Promise.resolve()),
}));

function DemoSession() {
  const { user, loading, demoLogin, logout, refresh, resetDemo } = useAuth();
  const [outcome, setOutcome] = useState('');
  const attempt = async (operation: () => Promise<unknown>) => {
    try {
      await operation();
      setOutcome('Allowed');
    } catch (error) {
      setOutcome(error instanceof Error ? error.message : 'Denied');
    }
  };
  return (
    <>
      <p>{loading ? 'Loading' : (user?.role ?? 'Signed out')}</p>
      <p role="status">{outcome}</p>
      <button onClick={() => void attempt(() => demoLogin('OWNER'))}>
        Owner
      </button>
      <button onClick={() => void attempt(() => demoLogin('AUDITOR'))}>
        Auditor
      </button>
      <button onClick={() => void attempt(logout)}>Sign out</button>
      <button onClick={() => void attempt(refresh)}>Refresh</button>
      <button onClick={() => void attempt(resetDemo)}>Reset</button>
      <button
        onClick={() =>
          void attempt(() =>
            apiRequest('/api/comments', { method: 'POST', body: '{}' }),
          )
        }
      >
        Write
      </button>
    </>
  );
}

function openDemo(environment = 'demo') {
  const fetcher = vi.fn<typeof fetch>(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          environment,
          demoHelper: environment === 'demo',
          user: null,
        }),
      ),
    ),
  );
  vi.stubGlobal('fetch', fetcher);
  render(
    <AuthProvider>
      <DemoSession />
    </AuthProvider>,
  );
  return fetcher;
}

describe('browser-local demo sessions', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it.each(['OWNER', 'ACCOUNTANT', 'AUDITOR'])(
    'restores %s without a server session',
    async (role) => {
      sessionStorage.setItem('business-records-demo-role', role);
      const fetcher = openDemo();
      expect(await screen.findByText(role)).toBeVisible();
      await act(async () => {
        fireEvent.focus(window);
        fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
        await Promise.resolve();
      });
      expect(screen.getByText(role)).toBeVisible();
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls[0][0]).toBe('/api/auth/config');
    },
  );

  it('rejects auditor writes and resets before touching storage or the network', async () => {
    sessionStorage.setItem('business-records-demo-role', 'AUDITOR');
    const fetcher = openDemo();
    await screen.findByText('AUDITOR');
    fireEvent.click(screen.getByRole('button', { name: 'Write' }));
    expect(await screen.findByRole('status')).toHaveTextContent('read-only');
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(recordDemoMutation).not.toHaveBeenCalled();
    expect(resetDemoData).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('can switch from owner editing to auditor inspection, sign out, and edit again as owner', async () => {
    sessionStorage.setItem('business-records-demo-role', 'OWNER');
    const fetcher = openDemo();
    await screen.findByText('OWNER');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Write' }));
      await Promise.resolve();
    });
    expect(recordDemoMutation).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Auditor' }));
    await screen.findByText('AUDITOR');
    expect(sessionStorage.getItem('business-records-demo-role')).toBe(
      'AUDITOR',
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Write' }));
      await Promise.resolve();
    });
    expect(recordDemoMutation).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByText('Signed out');
    expect(sessionStorage.getItem('business-records-demo-role')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Owner' }));
    await screen.findByText('OWNER');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Write' }));
      await Promise.resolve();
    });
    expect(recordDemoMutation).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('fails closed for an unknown persisted demo role', async () => {
    sessionStorage.setItem('business-records-demo-role', 'ADMIN');
    const fetcher = openDemo();
    await screen.findByText('Signed out');
    fireEvent.click(screen.getByRole('button', { name: 'Write' }));
    expect(await screen.findByRole('status')).toHaveTextContent('read-only');
    expect(recordDemoMutation).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('cannot turn a private session into a demo identity', async () => {
    openDemo('production');
    await screen.findByText('Signed out');
    fireEvent.click(screen.getByRole('button', { name: 'Auditor' }));
    expect(await screen.findByRole('status')).toHaveTextContent('unavailable');
    expect(sessionStorage.getItem('business-records-demo-role')).toBeNull();
    expect(screen.getByText('Signed out')).toBeVisible();
  });
});
