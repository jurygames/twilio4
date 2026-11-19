import { createUserScopedSupabaseClient, getSupabaseClient } from './supabaseClient.js';
import security from './security.js';

const { createRoleGuard, parseCookie, sessionExpiresAt, SESSION_COOKIE } = security;

export async function resolveMessagingRole(accessToken, clientFactory = createUserScopedSupabaseClient) {
  if (typeof accessToken !== 'string' || !accessToken || accessToken.length > 4096) return null;
  let result;
  try {
    result = await clientFactory(accessToken).rpc('get_jg_messaging_role');
  } catch {
    throw new Error('messaging_auth_unavailable');
  }
  const { data, error } = result;
  if (error) throw new Error('messaging_auth_unavailable');
  return data === 'operator' || data === 'admin' ? data : null;
}

export async function currentMessagingUser(req) {
  const token = parseCookie(req?.headers?.cookie, SESSION_COOKIE);
  if (!token) return null;
  const { data, error } = await getSupabaseClient().auth.getUser(token);
  if (error) {
    if (error.status === 401 || error.status === 403) return null;
    throw new Error('messaging_auth_unavailable');
  }
  const user = data?.user;
  const role = user ? await resolveMessagingRole(token) : null;
  const expiresAt = user ? sessionExpiresAt(token, user.id) : null;
  if (!user || !role || !expiresAt || expiresAt <= Date.now()) return null;
  return { user, role, accessToken: token, expiresAt };
}

export const requireMessagingRole = createRoleGuard(currentMessagingUser);

export function messagingUserClient(session) {
  if (!session?.accessToken) throw new Error('messaging_session_required');
  return createUserScopedSupabaseClient(session.accessToken);
}
