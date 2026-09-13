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

export interface AuthUser {
  id: string;
  email: string;
  role: 'OWNER' | 'ACCOUNTANT';
  status: 'ACTIVE' | 'DISABLED';
  businessAccountId?: string;
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
  const response = await fetch(path, {
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

  const refresh = useCallback(async () => {
    try {
      const result = await apiRequest<{ user: AuthUser }>('/api/auth/me');
      setUser(result.user);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void apiRequest<AuthConfiguration>('/api/auth/config')
      .then(async (config) => {
        publicDemo = config.environment === 'demo';
        const role = sessionStorage.getItem(demoRoleKey) as
          AuthUser['role'] | null;
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
      loading,
      user,
      refresh,
      localLogin: async (email) => {
        const result = await apiRequest<{ user: AuthUser }>(
          '/api/dev/auth/login',
          { method: 'POST', body: JSON.stringify({ email }) },
        );
        setUser(result.user);
      },
      demoLogin: (role) => {
        sessionStorage.setItem(demoRoleKey, role);
        setUser(demoUser(role));
        return Promise.resolve();
      },
      logout: async () => {
        if (publicDemo) sessionStorage.removeItem(demoRoleKey);
        else await apiRequest('/api/auth/logout', { method: 'POST' });
        setUser(null);
      },
      resetDemo: async () => {
        await resetDemoData();
        window.location.reload();
      },
    }),
    [configuration, configurationError, loading, refresh, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function demoUser(role: AuthUser['role']): AuthUser {
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
