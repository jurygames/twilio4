import { createHash } from 'crypto';
import { createAuthSupabaseClient } from '../../../lib/supabaseClient';
import { currentMessagingUser, resolveMessagingRole } from '../../../lib/messagingAuth';
import security from '../../../lib/security';

const {
  canSend,
  buildCookie,
  buildRefreshCookie,
  clearCookie,
  clearRefreshCookie,
  isTrustedMutation,
  parseCookie,
  REFRESH_COOKIE,
  sessionExpiresAt,
  SESSION_COOKIE,
  takeLoginAttempt,
} = security;

function setPrivateHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Vary', 'Cookie');
}

function requestIpKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const ip = typeof raw === 'string' ? raw.split(',')[0].trim() : 'unknown';
  return createHash('sha256').update(ip).digest('hex');
}

export default async function handler(req, res) {
  setPrivateHeaders(res);
  if (req.method === 'GET') {
    try {
      const session = await currentMessagingUser(req);
      if (!session) return res.status(401).json({ error: 'authentication_required' });
      return res.status(200).json({ role: session.role, canSend: canSend(), expiresAt: session.expiresAt });
    } catch {
      return res.status(503).json({ error: 'authentication_unavailable' });
    }
  }

  if (req.method === 'POST') {
    if (!isTrustedMutation(req)) return res.status(403).json({ error: 'same_origin_required' });
    if (!takeLoginAttempt(requestIpKey(req))) return res.status(429).json({ error: 'try_again_later' });
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || email.length > 254 || !password || password.length > 1024) {
      return res.status(400).json({ error: 'credentials_required' });
    }
    try {
      const { data, error } = await createAuthSupabaseClient().auth.signInWithPassword({ email, password });
      const token = data?.session?.access_token;
      const refreshToken = data?.session?.refresh_token;
      const role = typeof token === 'string' ? await resolveMessagingRole(token) : null;
      const expiresAt = data?.user && typeof token === 'string' ? sessionExpiresAt(token, data.user.id) : null;
      if (error || !role || typeof token !== 'string' || token.length > 4096 ||
          typeof refreshToken !== 'string' || refreshToken.length > 4096 || !expiresAt) {
        return res.status(401).json({ error: 'sign_in_failed' });
      }
      res.setHeader('Set-Cookie', [buildCookie(token), buildRefreshCookie(refreshToken)]);
      return res.status(200).json({ role, canSend: canSend(), expiresAt });
    } catch {
      return res.status(503).json({ error: 'authentication_unavailable' });
    }
  }

  if (req.method === 'PATCH') {
    if (!isTrustedMutation(req)) return res.status(403).json({ error: 'same_origin_required' });
    const refreshToken = parseCookie(req.headers.cookie, REFRESH_COOKIE);
    if (!refreshToken) return res.status(401).json({ error: 'authentication_required' });
    try {
      // A second tab may already have refreshed the shared cookies.
      const existing = await currentMessagingUser(req);
      if (existing && existing.expiresAt - Date.now() > 120_000) {
        return res.status(200).json({ role: existing.role, canSend: canSend(), expiresAt: existing.expiresAt });
      }
      const { data, error } = await createAuthSupabaseClient().auth.refreshSession({ refresh_token: refreshToken });
      if (error) {
        const invalid = ['refresh_token_not_found', 'refresh_token_already_used', 'session_not_found', 'session_expired', 'user_banned', 'user_not_found'].includes(error.code) || error.status === 401 || error.status === 403;
        // Do not delete cookies on a failed rotation: another tab may have
        // succeeded. The browser can check the latest shared session.
        return res.status(invalid ? 401 : 503).json({ error: invalid ? 'authentication_required' : 'authentication_unavailable' });
      }
      const token = data?.session?.access_token;
      const nextRefresh = data?.session?.refresh_token;
      const expiresAt = data?.user && typeof token === 'string' ? sessionExpiresAt(token, data.user.id) : null;
      if (!expiresAt || expiresAt <= Date.now() || typeof nextRefresh !== 'string' || !nextRefresh || nextRefresh.length > 4096 || token.length > 4096) {
        return res.status(503).json({ error: 'authentication_unavailable' });
      }
      // Keep the rotated token even if the role lookup has a temporary outage.
      // Every protected endpoint still performs its own live role check.
      res.setHeader('Set-Cookie', [buildCookie(token), buildRefreshCookie(nextRefresh)]);
      const role = await resolveMessagingRole(token);
      if (!role) {
        return res.status(403).json({ error: 'messaging_role_required' });
      }
      return res.status(200).json({ role, canSend: canSend(), expiresAt });
    } catch {
      return res.status(503).json({ error: 'authentication_unavailable' });
    }
  }

  if (req.method === 'DELETE') {
    if (!isTrustedMutation(req)) return res.status(403).json({ error: 'same_origin_required' });
    const accessToken = parseCookie(req.headers.cookie, SESSION_COOKIE);
    const refreshToken = parseCookie(req.headers.cookie, REFRESH_COOKIE);
    if (refreshToken) {
      try {
        const client = createAuthSupabaseClient();
        const { error: sessionError } = accessToken
          ? await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
          : await client.auth.refreshSession({ refresh_token: refreshToken });
        if (sessionError) {
          const invalid = ['refresh_token_not_found', 'refresh_token_already_used', 'session_not_found', 'session_expired', 'user_banned', 'user_not_found'].includes(sessionError.code) || sessionError.status === 401 || sessionError.status === 403;
          if (!invalid) return res.status(503).json({ error: 'sign_out_unavailable' });
        } else {
          const { error } = await client.auth.signOut({ scope: 'local' });
          if (error) return res.status(503).json({ error: 'sign_out_unavailable' });
        }
      } catch {
        return res.status(503).json({ error: 'sign_out_unavailable' });
      }
    }
    res.setHeader('Set-Cookie', [clearCookie(), clearRefreshCookie()]);
    return res.status(204).end();
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'method_not_allowed' });
}
