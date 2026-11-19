import { createUserScopedSupabaseClient, getSupabaseClient } from './supabaseClient';
import security from './security';

const { createRoleGuard, parseCookie, roleForUser, sessionExpiresAt, SESSION_COOKIE } = security;

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
  const expiresAt = user ? sessionExpiresAt(token, user.id) : null;
  if (!user || !role || !expiresAt || expiresAt <= Date.now()) return null;
  return { user, role, accessToken: token, expiresAt };
}

export const requireMessagingRole = createRoleGuard(currentMessagingUser);

export function messagingUserClient(session) {
  if (!session?.accessToken) throw new Error('messaging_session_required');
  return createUserScopedSupabaseClient(session.accessToken);
}
