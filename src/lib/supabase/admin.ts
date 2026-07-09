import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/lib/env/public";
import { env } from "@/lib/env/server";

/**
 * Service-role client. Bypasses RLS — server-only, never import from client
 * components. Used for administrative operations (e.g. seeding a demo user).
 */
export function createAdminClient() {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return createSupabaseClient(supabaseUrl(), env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
