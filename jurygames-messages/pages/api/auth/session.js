import { createHash } from 'crypto';
import { createAuthSupabaseClient, getServiceSupabaseClient } from '../../../lib/supabaseClient';
import { currentMessagingUser } from '../../../lib/messagingAuth';
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
  roleForUser,
  sessionExpiresAt,
  sessionIdFromAccessToken,
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
      const role = roleForUser(data?.user);
      const token = data?.session?.access_token;
      const refreshToken = data?.session?.refresh_token;
      const sessionId = data?.user && typeof token === 'string' ? sessionIdFromAccessToken(token, data.user.id) : null;
      const expiresAt = data?.user && typeof token === 'string' ? sessionExpiresAt(token, data.user.id) : null;
      if (error || !role || typeof token !== 'string' || token.length > 4096 ||
          typeof refreshToken !== 'string' || refreshToken.length > 4096 || !sessionId || !expiresAt) {
        return res.status(401).json({ error: 'sign_in_failed' });
      }
      const { data: active, error: sessionError } = await getServiceSupabaseClient().rpc('is_jg_messaging_session_active', {
        p_user_id: data.user.id,
        p_session_id: sessionId,
      });
      if (sessionError) return res.status(503).json({ error: 'authentication_unavailable' });
      if (active !== true) return res.status(401).json({ error: 'sign_in_failed' });
      res.setHeader('Set-Cookie', [buildCookie(token), buildRefreshCookie(refreshToken)]);
      return res.status(200).json({ role, canSend: canSend(), expiresAt });
    } catch {
      return res.status(503).json({ error: 'authentication_unavailable' });
    }
  }

  if (req.method === 'DELETE') {
    if (!isTrustedMutation(req)) return res.status(403).json({ error: 'same_origin_required' });
    const accessToken = parseCookie(req.headers.cookie, SESSION_COOKIE);
    const refreshToken = parseCookie(req.headers.cookie, REFRESH_COOKIE);
    if (accessToken && refreshToken) {
      try {
        const client = createAuthSupabaseClient();
        const { error: sessionError } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (sessionError) return res.status(503).json({ error: 'sign_out_unavailable' });
        const { error } = await client.auth.signOut({ scope: 'local' });
        if (error) return res.status(503).json({ error: 'sign_out_unavailable' });
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
