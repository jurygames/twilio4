import { useEffect, useState } from 'react';

async function requestSession(method, body) {
  return fetch('/api/auth/session', {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-jurygames-request': '1',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

export default function SessionGate({ requiredRole = 'operator', children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    requestSession('GET')
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((value) => { if (!cancelled) setSession(value); })
      .catch(() => { if (!cancelled) setError('Sign in is temporarily unavailable.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!session?.expiresAt) return undefined;
    const timeout = Math.max(0, session.expiresAt - Date.now());
    const timer = setTimeout(() => setSession(null), timeout);
    return () => clearTimeout(timer);
  }, [session?.expiresAt]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = event.currentTarget;
    try {
      const response = await requestSession('POST', {
        email: form.email.value,
        password: form.password.value,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(response.status === 503 ? 'Sign in is temporarily unavailable.' : 'Sign in failed. Check your details or account access.');
        return;
      }
      setSession(data);
      form.reset();
    } catch {
      setError('Sign in is temporarily unavailable.');
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await requestSession('DELETE');
      if (!response.ok) {
        setError('Sign out was not confirmed.');
        return;
      }
      setSession(null);
    } catch {
      setError('Sign out was not confirmed.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-gray-900 p-8 text-center text-gray-300">Checking access…</div>;

  const hasRole = session?.role === 'admin' || (requiredRole === 'operator' && session?.role === 'operator');
  if (!session || !hasRole) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900 px-4 text-white">
        <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg bg-gray-800 p-6 shadow-xl">
          <h1 className="mb-2 text-xl font-semibold">Jury Games messaging</h1>
          <p className="mb-5 text-sm text-gray-300">Sign in with your authorised Jury Games account.</p>
          <label className="mb-1 block text-sm" htmlFor="messaging-email">Email</label>
          <input id="messaging-email" name="email" type="email" autoComplete="username" required maxLength={254} className="mb-4 w-full rounded bg-gray-700 p-2 text-white" />
          <label className="mb-1 block text-sm" htmlFor="messaging-password">Password</label>
          <input id="messaging-password" name="password" type="password" autoComplete="current-password" required maxLength={1024} className="mb-4 w-full rounded bg-gray-700 p-2 text-white" />
          {session && !hasRole ? <p className="mb-3 text-sm text-amber-300">This account does not have template-management access.</p> : null}
          {error ? <p role="alert" className="mb-3 text-sm text-red-300">{error}</p> : null}
          <button type="submit" disabled={busy} className="w-full rounded bg-blue-600 px-4 py-2 font-medium disabled:opacity-50">{busy ? 'Signing in…' : 'Sign in'}</button>
          {session ? <button type="button" onClick={handleLogout} disabled={busy} className="mt-3 w-full rounded bg-gray-700 px-4 py-2 text-sm">Sign out</button> : null}
        </form>
      </div>
    );
  }

  const content = typeof children === 'function'
    ? children({ role: session.role, canSend: Boolean(session.canSend) })
    : children;
  return (
    <>
      <div className="fixed right-3 top-3 z-50">
        <button type="button" onClick={handleLogout} disabled={busy} className="rounded bg-gray-800 px-3 py-1 text-sm text-white shadow disabled:opacity-50">
          {busy ? 'Signing out…' : 'Sign out'}
        </button>
        {error ? <p role="alert" className="mt-1 rounded bg-gray-900 px-2 py-1 text-xs text-red-300">{error}</p> : null}
      </div>
      {content}
    </>
  );
}
