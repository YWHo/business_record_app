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

export interface AuthUser {
  id: string;
  email: string;
  role: 'OWNER' | 'ACCOUNTANT';
  status: 'ACTIVE' | 'DISABLED';
}

export interface AuthConfiguration {
  environment: 'local' | 'demo' | 'production';
  localHelper: boolean;
  turnstileRequired: boolean;
  turnstileSiteKey: string | null;
}

interface AuthContextValue {
  configuration: AuthConfiguration | null;
  loading: boolean;
  user: AuthUser | null;
  refresh: () => Promise<void>;
  localLogin: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function parseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return body?.error ?? 'The request could not be completed.';
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return response.json() as Promise<T>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [configuration, setConfiguration] = useState<AuthConfiguration | null>(
    null,
  );
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
    void Promise.all([
      apiRequest<AuthConfiguration>('/api/auth/config').catch(() => null),
      apiRequest<{ user: AuthUser }>('/api/auth/me').catch(() => null),
    ]).then(([config, current]) => {
      if (!active) return;
      setConfiguration(config);
      setUser(current?.user ?? null);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      configuration,
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
      logout: async () => {
        await apiRequest('/api/auth/logout', { method: 'POST' });
        setUser(null);
      },
    }),
    [configuration, loading, refresh, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }

  return context;
}
