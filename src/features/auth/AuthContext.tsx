/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  applyDemoOverlay,
  recordDemoMutation,
  resetDemoData,
} from '../demo/demoStore';
import { fetchWithRateLimitRetry } from '../../lib/rateLimitRetry';
import type { AuditorAccessDetails } from '../../lib/accessPresentation';

export interface AuthUser {
  id: string;
  email: string;
  role: 'OWNER' | 'ACCOUNTANT' | 'AUDITOR';
  status: 'ACTIVE' | 'DISABLED';
  businessAccountId?: string;
  access?: AuditorAccessDetails;
}

export interface AuthConfiguration {
  environment: 'local' | 'demo' | 'production';
  localHelper: boolean;
  demoHelper: boolean;
  turnstileRequired: boolean;
  turnstileSiteKey: string | null;
}

interface AuthContextValue {
  configuration: AuthConfiguration | null;
  configurationError?: string;
  accessEnded?: boolean;
  loading: boolean;
  user: AuthUser | null;
  refresh: () => Promise<void>;
  localLogin: (email: string) => Promise<void>;
  demoLogin: (role: 'OWNER' | 'ACCOUNTANT') => Promise<void>;
  logout: () => Promise<void>;
  resetDemo: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
let publicDemo = false;
const demoRoleKey = 'business-records-demo-role';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: Record<string, unknown> | null,
  ) {
    super(
      typeof body?.error === 'string'
        ? body.error
        : 'The request could not be completed.',
    );
  }
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  if (publicDemo && method !== 'GET' && method !== 'HEAD')
    return (await recordDemoMutation(path, init ?? {})) as T;
  const response = await fetchWithRateLimitRetry(path, {
    ...init,
    headers: {
      ...(typeof init?.body === 'string'
        ? { 'content-type': 'application/json' }
        : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    throw new ApiError(response.status, body);
  }

  const payload = (await response.json()) as T;
  return publicDemo ? applyDemoOverlay(payload, path) : payload;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [configuration, setConfiguration] = useState<AuthConfiguration | null>(
    null,
  );
  const [configurationError, setConfigurationError] = useState('');
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessEnded, setAccessEnded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const result = await apiRequest<{ user: AuthUser }>('/api/auth/me');
      setUser(result.user);
      setAccessEnded(false);
    } catch (caught) {
      if (!(caught instanceof ApiError) || ![401, 403].includes(caught.status))
        throw caught;
      setUser(null);
      setAccessEnded(true);
    }
  }, []);

  useEffect(() => {
    if (user?.role !== 'AUDITOR') return;
    const expiry = user.access?.accessExpiresAt;
    const check = () => {
      if (expiry && Date.now() >= Date.parse(expiry)) {
        setUser(null);
        setAccessEnded(true);
        return;
      }
      void refresh().catch(() => undefined);
    };
    window.addEventListener('focus', check);
    const delay = expiry
      ? Math.max(0, Math.min(Date.parse(expiry) - Date.now() + 100, 2147483647))
      : 60000;
    const timer = window.setTimeout(
      check,
      Number.isFinite(delay) ? delay : 60000,
    );
    return () => {
      window.removeEventListener('focus', check);
      window.clearTimeout(timer);
    };
  }, [refresh, user?.role, user?.access]);

  useEffect(() => {
    let active = true;
    void apiRequest<AuthConfiguration>('/api/auth/config')
      .then(async (config) => {
        publicDemo = config.environment === 'demo';
        const storedRole = sessionStorage.getItem(demoRoleKey);
        const role =
          storedRole === 'OWNER' || storedRole === 'ACCOUNTANT'
            ? storedRole
            : null;
        const current = publicDemo
          ? role
            ? { user: demoUser(role) }
            : null
          : await apiRequest<{ user: AuthUser }>('/api/auth/me').catch(
              () => null,
            );
        if (!active) return;
        setConfiguration(config);
        setUser(current?.user ?? null);
      })
      .catch((caught) => {
        setConfigurationError(
          caught instanceof Error
            ? caught.message
            : 'Application configuration is temporarily unavailable.',
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      configuration,
      configurationError,
      accessEnded,
      loading,
      user,
      refresh,
      localLogin: async (email) => {
        const result = await apiRequest<{ user: AuthUser }>(
          '/api/dev/auth/login',
          { method: 'POST', body: JSON.stringify({ email }) },
        );
        setUser(result.user);
        setAccessEnded(false);
      },
      demoLogin: (role) => {
        sessionStorage.setItem(demoRoleKey, role);
        setUser(demoUser(role));
        setAccessEnded(false);
        return Promise.resolve();
      },
      logout: async () => {
        if (publicDemo) sessionStorage.removeItem(demoRoleKey);
        else await apiRequest('/api/auth/logout', { method: 'POST' });
        setUser(null);
        setAccessEnded(false);
      },
      resetDemo: async () => {
        await resetDemoData();
        window.location.reload();
      },
    }),
    [configuration, configurationError, accessEnded, loading, refresh, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function demoUser(role: 'OWNER' | 'ACCOUNTANT'): AuthUser {
  return {
    id: `browser-demo-${role.toLowerCase()}`,
    email: role === 'OWNER' ? 'owner@demo.invalid' : 'accountant@demo.invalid',
    role,
    status: 'ACTIVE',
    businessAccountId: 'business-account-primary',
  };
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }

  return context;
}
