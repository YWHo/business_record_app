import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiRequest, useAuth } from '../features/auth/AuthContext';

export function VerifyLoginPage() {
  const [params] = useSearchParams();
  const { refresh } = useAuth();
  const token = params.get('token');
  const attemptedToken = useRef<string | null>(null);
  const [status, setStatus] = useState(
    token
      ? 'Verifying your sign-in link…'
      : 'This sign-in link is invalid or incomplete.',
  );

  useEffect(() => {
    if (!token || attemptedToken.current === token) return;
    attemptedToken.current = token;

    void apiRequest('/api/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
      .then(refresh)
      .then(() => setStatus('Signed in. You can return to the dashboard.'))
      .catch((error: unknown) =>
        setStatus(
          error instanceof Error ? error.message : 'Unable to sign in.',
        ),
      );
  }, [refresh, token]);

  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>Verify sign-in</h1>
        <p role="status">{status}</p>
        <Link to="/">Continue</Link>
      </section>
    </main>
  );
}
