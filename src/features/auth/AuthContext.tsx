/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { resetDemoData } from '../demo/demoStore';
import { fetchWithRateLimitRetry } from '../../lib/rateLimitRetry';
import { ApiError } from '../../lib/apiError';
import { staticDemoConfiguration } from '../demo/demoConfiguration';
export { ApiError } from '../../lib/apiError';
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
  request: typeof apiRequest;
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
const demoRoleKey = 'business-records-demo-role';

function storedDemoRole(): DemoRole | null {
  const role = sessionStorage.getItem(demoRoleKey);
  return role === 'OWNER' || role === 'ACCOUNTANT' || role === 'AUDITOR'
    ? role
    : null;
}

function auditorAccessHasEnded(user: AuthUser | null): boolean {
  if (user?.role !== 'AUDITOR') {
    return false;
  }
  const expiry = Date.parse(user.access?.accessExpiresAt ?? '');
  return !Number.isFinite(expiry) || Date.now() >= expiry;
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  return remoteRequest<T>(path, init);
}

async function remoteRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithRateLimitRetry(path, {
    ...init,
    cache: 'no-store',
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
  return payload;
}

export function AuthProvider({
  children,
  mode = 'private',
}: {
  children: ReactNode;
  mode?: 'demo' | 'private';
}) {
  const [configuration, setConfiguration] = useState<AuthConfiguration | null>(
    mode === 'demo' ? staticDemoConfiguration : null,
  );
  const [configurationError, setConfigurationError] = useState('');
  const [loading, setLoading] = useState(mode !== 'demo');
  const [user, setUser] = useState<AuthUser | null>(() => {
    const role = mode === 'demo' ? storedDemoRole() : null;
    return role ? demoUser(role) : null;
  });
  const [accessEnded, setAccessEnded] = useState(false);
  const sessionVersion = useRef(0);
  const refreshSequence = useRef(0);
  const lifetime = useRef({ active: true, role: user?.role ?? null });
  useLayoutEffect(() => {
    const scope = lifetime.current;
    scope.active = true;
    return () => {
      scope.active = false;
      sessionVersion.current += 1;
    };
  }, []);
  useLayoutEffect(() => {
    lifetime.current.role = user?.role ?? null;
  }, [user?.role]);
  const request = useMemo<typeof apiRequest>(() => {
    const role = user?.role ?? null;
    return async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const assertCurrent = () => {
        if (!lifetime.current.active || lifetime.current.role !== role) {
          throw new ApiError(409, {
            error: 'This workspace has changed. Please try again.',
          });
        }
      };
      assertCurrent();
      if (mode === 'private') {
        const result = await remoteRequest<T>(path, init);
        assertCurrent();
        return result;
      }
      const { staticDemoRequest } = await import('../demo/staticDemoApi');
      assertCurrent();
      const result = (await staticDemoRequest(path, init, role)) as T;
      assertCurrent();
      return result;
    };
  }, [mode, user?.role]);

  const refresh = useCallback(async () => {
    if (!lifetime.current.active) {
      return;
    }
    const version = sessionVersion.current;
    const sequence = ++refreshSequence.current;
    if (mode === 'demo') {
      const role = storedDemoRole();
      setUser(role ? demoUser(role) : null);
      setAccessEnded(false);
      return;
    }
    try {
      const result = await request<{ user: AuthUser }>('/api/auth/me');
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
  }, [mode, request]);

  useEffect(() => {
    if (user?.role !== 'AUDITOR' || mode === 'demo') {
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
  }, [mode, refresh, user?.role, user?.access]);

  useEffect(() => {
    if (mode === 'demo') {
      return;
    }
    let active = true;
    const version = sessionVersion.current;
    const configRequest = remoteRequest<AuthConfiguration>('/api/auth/config');
    void configRequest
      .then(async (config) => {
        if (!active || version !== sessionVersion.current) {
          return;
        }
        const current = await apiRequest<{ user: AuthUser }>(
          '/api/auth/me',
        ).catch(() => null);
        if (!active || version !== sessionVersion.current) {
          return;
        }
        setConfiguration({ ...config, demoHelper: false });
        const ended = auditorAccessHasEnded(current?.user ?? null);
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
  }, [mode]);

  const value = useMemo<AuthContextValue>(
    () => ({
      request,
      configuration,
      configurationError,
      accessEnded,
      loading,
      user,
      refresh,
      localLogin: async (email) => {
        if (mode !== 'private' || !lifetime.current.active) {
          throw new Error('Local sign-in is unavailable.');
        }
        const version = ++sessionVersion.current;
        const result = await request<{ user: AuthUser }>(
          '/api/dev/auth/login',
          { method: 'POST', body: JSON.stringify({ email }) },
        );
        const current =
          result.user.role === 'AUDITOR'
            ? await request<{ user: AuthUser }>('/api/auth/me')
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
          mode !== 'demo' ||
          !lifetime.current.active ||
          !['OWNER', 'ACCOUNTANT', 'AUDITOR'].includes(role)
        ) {
          return Promise.reject(
            new Error('Demo role selection is unavailable.'),
          );
        }
        sessionStorage.setItem(demoRoleKey, role);
        sessionVersion.current += 1;
        setUser(demoUser(role));
        setAccessEnded(false);
        return Promise.resolve();
      },
      logout: async () => {
        const version = ++sessionVersion.current;
        if (!lifetime.current.active) {
          return;
        }
        if (mode === 'demo') {
          sessionStorage.removeItem(demoRoleKey);
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
        if (mode !== 'demo' || !lifetime.current.active) {
          throw new Error('Demo reset is unavailable.');
        }
        if (
          lifetime.current.role !== 'OWNER' &&
          lifetime.current.role !== 'ACCOUNTANT'
        ) {
          throw new ApiError(403, {
            error: 'This demo role is read-only. Changes are unavailable.',
          });
        }
        await resetDemoData();
        window.location.reload();
      },
    }),
    [
      configuration,
      configurationError,
      accessEnded,
      loading,
      refresh,
      user,
      request,
      mode,
      lifetime,
    ],
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

export function useApiRequest(): typeof apiRequest {
  return useAuth().request;
}
