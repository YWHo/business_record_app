import { type FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../features/auth/AuthContext';

export function AcceptInvitationPage() {
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    const token = params.get('token');
    if (!token) {
      setError('This invitation link is invalid or incomplete.');
      return;
    }
    try {
      await apiRequest('/api/invitations/accept', {
        method: 'POST',
        body: JSON.stringify({ email, token }),
      });
      setMessage('Invitation accepted. You can now request a sign-in link.');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to accept invitation.',
      );
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <span className="eyebrow">Accountant access</span>
        <h1>Accept invitation</h1>
        <p>Enter the same email address that received this invitation.</p>
        <form onSubmit={(event) => void submit(event)} className="stack-form">
          <label htmlFor="invitation-email">Email address</label>
          <input
            id="invitation-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <button type="submit">Accept invitation</button>
        </form>
        {message ? (
          <p role="status" className="notice success">
            {message} <Link to="/login">Sign in</Link>
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="notice error">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}
