import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

const sharedAuthConfig = {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
} as const;

export function createSupabaseAdminClient() {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, sharedAuthConfig);
}

export function createSupabasePublicClient() {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, sharedAuthConfig);
}
