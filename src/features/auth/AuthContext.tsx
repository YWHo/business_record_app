/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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

export type DemoRole = AuthUser['role'];

interface AuthContextValue {
  configuration: AuthConfiguration | null;
  configurationError?: string;
  accessEnded?: boolean;
  loading: boolean;
  user: AuthUser | null;
  refresh: () => Promise<void>;
  localLogin: (email: string) => Promise<void>;
  demoLogin: (role: DemoRole) => Promise<void>;
  logout: () => Promise<void>;
  resetDemo: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
let publicDemo = false;
let publicDemoRole: DemoRole | null = null;
const demoRoleKey = 'business-records-demo-role';

function storedDemoRole(): DemoRole | null {
  const role = sessionStorage.getItem(demoRoleKey);
  return role === 'OWNER' || role === 'ACCOUNTANT' || role === 'AUDITOR'
    ? role
    : null;
}

function assertDemoEditing() {
  if (publicDemoRole !== 'OWNER' && publicDemoRole !== 'ACCOUNTANT') {
    throw new ApiError(403, {
      error: 'This demo role is read-only. Changes are unavailable.',
    });
  }
}

function auditorAccessHasEnded(user: AuthUser | null): boolean {
  if (user?.role !== 'AUDITOR') {
    return false;
  }
  const expiry = Date.parse(user.access?.accessExpiresAt ?? '');
  return !Number.isFinite(expiry) || Date.now() >= expiry;
}

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
  if (publicDemo && method !== 'GET' && method !== 'HEAD') {
    assertDemoEditing();
    return (await recordDemoMutation(path, init ?? {})) as T;
  }
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
  const sessionVersion = useRef(0);
  const refreshSequence = useRef(0);

  const refresh = useCallback(async () => {
    const version = sessionVersion.current;
    const sequence = ++refreshSequence.current;
    if (publicDemo) {
      setUser(publicDemoRole ? demoUser(publicDemoRole) : null);
      setAccessEnded(false);
      return;
    }
    try {
      const result = await apiRequest<{ user: AuthUser }>('/api/auth/me');
      if (
        version !== sessionVersion.current ||
        sequence !== refreshSequence.current
      ) {
        return;
      }
      const ended = auditorAccessHasEnded(result.user);
      setUser(ended ? null : result.user);
      setAccessEnded(ended);
    } catch (caught) {
      if (
        version !== sessionVersion.current ||
        sequence !== refreshSequence.current
      ) {
        return;
      }
      if (
        !(caught instanceof ApiError) ||
        ![401, 403].includes(caught.status)
      ) {
        throw caught;
      }
      setUser(null);
      setAccessEnded(true);
    }
  }, []);

  useEffect(() => {
    if (user?.role !== 'AUDITOR' || configuration?.environment === 'demo') {
      return;
    }
    const expiry = user.access?.accessExpiresAt;
    const check = () => {
      if (expiry && Date.now() >= Date.parse(expiry)) {
        sessionVersion.current += 1;
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
  }, [configuration?.environment, refresh, user?.role, user?.access]);

  useEffect(() => {
    let active = true;
    const version = sessionVersion.current;
    void apiRequest<AuthConfiguration>('/api/auth/config')
      .then(async (config) => {
        publicDemo = config.environment === 'demo';
        const role = publicDemo ? storedDemoRole() : null;
        publicDemoRole = role;
        const current = publicDemo
          ? role
            ? { user: demoUser(role) }
            : null
          : await apiRequest<{ user: AuthUser }>('/api/auth/me').catch(
              () => null,
            );
        if (!active || version !== sessionVersion.current) {
          return;
        }
        setConfiguration(config);
        const ended =
          !publicDemo && auditorAccessHasEnded(current?.user ?? null);
        setUser(ended ? null : (current?.user ?? null));
        setAccessEnded(ended);
      })
      .catch((caught) => {
        setConfigurationError(
          caught instanceof Error
            ? caught.message
            : 'Application configuration is temporarily unavailable.',
        );
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
      sessionVersion.current += 1;
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
        const version = ++sessionVersion.current;
        const result = await apiRequest<{ user: AuthUser }>(
          '/api/dev/auth/login',
          { method: 'POST', body: JSON.stringify({ email }) },
        );
        const current =
          result.user.role === 'AUDITOR'
            ? await apiRequest<{ user: AuthUser }>('/api/auth/me')
            : result;
        if (version !== sessionVersion.current) {
          return;
        }
        if (auditorAccessHasEnded(current.user)) {
          throw new ApiError(401, { error: 'Auditor access is unavailable.' });
        }
        setUser(current.user);
        setAccessEnded(false);
      },
      demoLogin: (role) => {
        if (
          configuration?.environment !== 'demo' ||
          !configuration.demoHelper ||
          !['OWNER', 'ACCOUNTANT', 'AUDITOR'].includes(role)
        ) {
          return Promise.reject(
            new Error('Demo role selection is unavailable.'),
          );
        }
        sessionStorage.setItem(demoRoleKey, role);
        sessionVersion.current += 1;
        publicDemoRole = role;
        setUser(demoUser(role));
        setAccessEnded(false);
        return Promise.resolve();
      },
      logout: async () => {
        const version = ++sessionVersion.current;
        if (publicDemo) {
          sessionStorage.removeItem(demoRoleKey);
          publicDemoRole = null;
        } else {
          await apiRequest('/api/auth/logout', { method: 'POST' });
        }
        if (version !== sessionVersion.current) {
          return;
        }
        sessionVersion.current += 1;
        setUser(null);
        setAccessEnded(false);
      },
      resetDemo: async () => {
        if (!publicDemo) {
          throw new Error('Demo reset is unavailable.');
        }
        assertDemoEditing();
        await resetDemoData();
        window.location.reload();
      },
    }),
    [configuration, configurationError, accessEnded, loading, refresh, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function demoUser(role: DemoRole): AuthUser {
  return {
    id: `browser-demo-${role.toLowerCase()}`,
    email: `${role.toLowerCase()}@demo.invalid`,
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
