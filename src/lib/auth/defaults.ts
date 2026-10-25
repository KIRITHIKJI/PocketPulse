import "server-only";

import type { createSupabaseServerClient } from "@/lib/supabase/server";

type ServerClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

/**
 * Seeds the signed-in user's default profile, categories and quick-add tiles if any are missing
 * (e.g. a user created before the signup trigger existed). The RPC only ever seeds the caller and
 * is idempotent. A failure never blocks sign-in, and nothing about the user is logged.
 */
export async function ensureDefaults(supabase: ServerClient) {
  const { error } = await supabase.rpc("ensure_my_defaults");
  if (error) console.error("ensure_my_defaults failed", error.code);
}
