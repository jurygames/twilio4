const REQUEST_TIMEOUT_MS = 8000;

class SummonsMessagingApiError extends Error {
  constructor(status, code) {
    super(code);
    this.name = 'SummonsMessagingApiError';
    this.status = status;
    this.code = code;
  }
}

function configuredOrigin(env = process.env) {
  if (typeof window !== 'undefined') throw new Error('server_only_client');
  const raw = typeof env.SUMMONS_MESSAGING_API_BASE_URL === 'string'
    ? env.SUMMONS_MESSAGING_API_BASE_URL.trim()
    : '';
  if (!raw) throw new SummonsMessagingApiError(503, 'show_source_unavailable');
  let url;
  try { url = new URL(raw); } catch { throw new SummonsMessagingApiError(503, 'show_source_unavailable'); }
  const localDevelopment = env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if ((!localDevelopment && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash) {
    throw new SummonsMessagingApiError(503, 'show_source_unavailable');
  }
  return url.origin;
}

async function requestSummons(path, accessToken, { env = process.env, fetchImpl = fetch } = {}) {
  if (typeof accessToken !== 'string' || !accessToken || accessToken.length > 4096) {
    throw new SummonsMessagingApiError(401, 'authentication_required');
  }
  const origin = configuredOrigin(env);
  const url = new URL(path, origin);
  if (url.origin !== origin || !url.pathname.startsWith('/api/messaging/')) {
    throw new SummonsMessagingApiError(503, 'show_source_unavailable');
  }
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch {
    throw new SummonsMessagingApiError(503, 'show_source_unavailable');
  }
  if (!response.ok) {
    const status = [401, 403, 409, 503].includes(response.status) ? response.status : 503;
    const code = status === 401 ? 'authentication_required'
      : status === 403 ? 'messaging_role_required'
        : status === 409 ? 'show_changed_during_read' : 'show_source_unavailable';
    throw new SummonsMessagingApiError(status, code);
  }
  try { return await response.json(); }
  catch { throw new SummonsMessagingApiError(503, 'show_source_unavailable'); }
}

async function getSummonsMessagingShows(accessToken, options) {
  const payload = await requestSummons('/api/messaging/shows', accessToken, options);
  if (!payload || !['ready', 'empty'].includes(payload.status) || !Array.isArray(payload.shows) || payload.shows.length > 500) {
    throw new SummonsMessagingApiError(503, 'show_source_unavailable');
  }
  return payload;
}

async function getSummonsShowRecipients(accessToken, showId, options) {
  if (typeof showId !== 'string' || !showId.trim() || showId.length > 256) {
    throw new SummonsMessagingApiError(400, 'show_id_required');
  }
  const query = new URLSearchParams({ show_id: showId.trim() });
  const payload = await requestSummons(`/api/messaging/recipients?${query.toString()}`, accessToken, options);
  if (!payload || payload.showId !== showId.trim() || !Array.isArray(payload.recipients) || payload.recipients.length > 1000) {
    throw new SummonsMessagingApiError(503, 'show_source_unavailable');
  }
  if (payload.recipients.some(recipient => !recipient || typeof recipient.number !== 'string')) {
    throw new SummonsMessagingApiError(503, 'show_source_unavailable');
  }
  return payload;
}

module.exports = { SummonsMessagingApiError, getSummonsMessagingShows, getSummonsShowRecipients };
