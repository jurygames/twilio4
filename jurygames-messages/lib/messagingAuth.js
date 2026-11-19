import { getServiceSupabaseClient, getSupabaseClient } from './supabaseClient';
import security from './security';

const { createRoleGuard, parseCookie, roleForUser, sessionExpiresAt, sessionIdFromAccessToken, SESSION_COOKIE } = security;

export async function currentMessagingUser(req) {
  const token = parseCookie(req?.headers?.cookie, SESSION_COOKIE);
  if (!token) return null;
  const { data, error } = await getSupabaseClient().auth.getUser(token);
  if (error) {
    if (error.status === 401 || error.status === 403) return null;
    throw new Error('messaging_auth_unavailable');
  }
  const user = data?.user;
  const role = roleForUser(user);
  const sessionId = user ? sessionIdFromAccessToken(token, user.id) : null;
  const expiresAt = user ? sessionExpiresAt(token, user.id) : null;
  if (!user || !role || !sessionId || !expiresAt || expiresAt <= Date.now()) return null;
  const { data: active, error: sessionError } = await getServiceSupabaseClient().rpc('is_jg_messaging_session_active', {
    p_user_id: user.id,
    p_session_id: sessionId,
  });
  if (sessionError) throw new Error('messaging_session_check_unavailable');
  if (active !== true) return null;
  return { user, role, accessToken: token, sessionId, expiresAt };
}

export const requireMessagingRole = createRoleGuard(currentMessagingUser);
