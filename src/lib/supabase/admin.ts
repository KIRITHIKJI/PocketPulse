import "server-only";

import { createClient } from "@supabase/supabase-js";

import { readPublicSupabaseEnv } from "@/lib/env";

/**
 * Privileged client using SUPABASE_SECRET_KEY. It bypasses RLS, so it is reserved for the few
 * server-side operations that need it (e.g. deleting an auth user on explicit account
 * deletion). `server-only` makes any client-component import a build error, and the key is
 * read at call time from a non-NEXT_PUBLIC variable, so it can't be inlined into a bundle.
 */
export function createSupabaseAdminClient() {
  const env = readPublicSupabaseEnv();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!env || !secretKey || secretKey.includes("your-key-here")) {
    throw new Error("SUPABASE_SECRET_KEY and the public Supabase URL must be set on the server.");
  }
  return createClient(env.url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
