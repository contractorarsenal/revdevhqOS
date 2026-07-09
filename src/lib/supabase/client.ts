"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseUrl, supabaseAnonKey } from "@/lib/env/public";

/** Browser Supabase client — anon key only; used for auth flows. */
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabaseAnonKey());
}
