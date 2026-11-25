// Browser-side session renewal. Refresh tokens remain in HttpOnly cookies.
const REFRESH_LEEWAY_MS = 120_000;
const LOCK_NAME = 'jurygames-messaging-session';
let renewal = null;

function withSessionLock(action) {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : null;
  return locks?.request ? locks.request(LOCK_NAME, action) : action();
}

function requestSession(method, body, fetcher = fetch) {
  return fetcher('/api/auth/session', {
    method,
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'x-jurygames-request': '1' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function checkSession(fetcher = fetch, now = Date.now) {
  const current = await requestSession('GET', undefined, fetcher);
  if (current.ok) {
    const session = await current.json();
    if (session.expiresAt - now() > REFRESH_LEEWAY_MS) return { status: 'ready', session };
  } else if (current.status !== 401) {
    return { status: current.status === 403 ? 'signed-out' : 'unavailable' };
  }
  const refreshed = await requestSession('PATCH', undefined, fetcher);
  if (refreshed.ok) return { status: 'ready', session: await refreshed.json() };
  if (refreshed.status === 401 || refreshed.status === 403) {
    // A concurrent tab may have completed rotation while this one was waiting.
    const latest = await requestSession('GET', undefined, fetcher);
    if (latest.ok) return { status: 'ready', session: await latest.json() };
    return { status: latest.status === 401 || latest.status === 403 ? 'signed-out' : 'unavailable' };
  }
  return { status: 'unavailable' };
}

function renewSession() {
  if (!renewal) {
    renewal = Promise.resolve().then(() => withSessionLock(() => checkSession()))
      .catch(() => ({ status: 'unavailable' }))
      .finally(() => { renewal = null; });
  }
  return renewal;
}

// A 401 from our role guard happens before any protected operation, including
// dispatch. Never repeat ambiguous network failures or other HTTP responses.
async function messagingFetch(url, options, fetcher = fetch, renew = renewSession) {
  const response = await fetcher(url, options);
  if (response.status !== 401) return response;
  const body = await response.clone().json().catch(() => ({}));
  if (body.error !== 'authentication_required') return response;
  const result = await renew();
  if (result.status !== 'ready') return response;
  return fetcher(url, options);
}

module.exports = { requestSession, withSessionLock, checkSession, renewSession, messagingFetch };
