"use client";

import { createBrowserClient } from "@supabase/ssr";

import { readPublicSupabaseEnv } from "@/lib/env";

/**
 * Supabase client for Client Components. Uses only the publishable key; every row it can touch
 * is limited by RLS to the signed-in user. Returns null when Supabase isn't configured.
 */
export function createSupabaseBrowserClient() {
  const env = readPublicSupabaseEnv();
  if (!env) return null;
  return createBrowserClient(env.url, env.publishableKey);
}
