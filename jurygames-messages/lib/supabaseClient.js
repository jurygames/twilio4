// lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

let anonymousClient;

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error('supabase_not_configured');
  return value;
}

export function getSupabaseClient() {
  const url = requiredEnv('SUPABASE_URL');
  const key = requiredEnv('SUPABASE_ANON_KEY');
  if (!anonymousClient) {
    anonymousClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return anonymousClient;
}

export function createAuthSupabaseClient() {
  return createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function createUserScopedSupabaseClient(accessToken) {
  if (typeof window !== 'undefined') throw new Error('server_only_client');
  if (typeof accessToken !== 'string' || !accessToken || accessToken.length > 4096) throw new Error('access_token_required');
  return createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
