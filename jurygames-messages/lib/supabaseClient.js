// lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

let anonymousClient;
let serviceClient;

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

export function getServiceSupabaseClient() {
  if (typeof window !== 'undefined') throw new Error('server_only_client');
  const url = requiredEnv('SUPABASE_URL');
  const key = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceClient) {
    serviceClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return serviceClient;
}
