import { type FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth, apiRequest } from '../features/auth/AuthContext';
import { TurnstileWidget } from '../features/auth/TurnstileWidget';

export function LoginPage() {
  const { configuration, demoLogin, localLogin, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  if (user) return <Navigate to="/" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const result = await apiRequest<{ message: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, turnstileToken }),
      });
      setMessage(result.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to sign in.');
    }
  }

  async function loginWithLocalIdentity(identity: string) {
    setError('');
    try {
      await localLogin(identity);
      await navigate('/');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to sign in.');
    }
  }

  async function loginWithDemoRole(role: 'OWNER' | 'ACCOUNTANT') {
    setError('');
    try {
      await demoLogin(role);
      await navigate('/');
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to open the demo.',
      );
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-heading">
        <span className="eyebrow">Invitation only</span>
        <h1 id="login-heading">Sign in</h1>
        <p>
          {configuration?.demoHelper
            ? 'Explore fictional New Zealand business records. Demo changes are temporary and reset regularly.'
            : 'We will send a single-use sign-in link to your registered email.'}
        </p>
        {!configuration?.demoHelper ? (
          <form onSubmit={(event) => void submit(event)} className="stack-form">
            <label htmlFor="login-email">Email address</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            {configuration?.turnstileRequired &&
            configuration.turnstileSiteKey ? (
              <TurnstileWidget
                siteKey={configuration.turnstileSiteKey}
                onToken={setTurnstileToken}
              />
            ) : null}
            <button
              type="submit"
              disabled={
                configuration?.turnstileRequired === true && !turnstileToken
              }
            >
              Email sign-in link
            </button>
          </form>
        ) : null}
        {message ? (
          <p role="status" className="notice success">
            {message}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="notice error">
            {error}
          </p>
        ) : null}

        {configuration?.localHelper ? (
          <div className="local-auth">
            <h2>Local development</h2>
            <button
              type="button"
              onClick={() => void loginWithLocalIdentity('owner@local.test')}
            >
              Continue as local owner
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                void loginWithLocalIdentity('accountant@local.test')
              }
            >
              Continue as local accountant
            </button>
          </div>
        ) : null}

        {configuration?.demoHelper ? (
          <div className="local-auth">
            <h2>Public demonstration</h2>
            <button
              type="button"
              onClick={() => void loginWithDemoRole('OWNER')}
            >
              Continue as Demo Owner
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void loginWithDemoRole('ACCOUNTANT')}
            >
              Continue as Demo Accountant
            </button>
            <small>
              All identities, businesses, and amounts are synthetic.
            </small>
          </div>
        ) : null}
      </section>
    </main>
  );
}
