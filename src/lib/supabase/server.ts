import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { readPublicSupabaseEnv } from "@/lib/env";
import { retryingFetch } from "@/lib/supabase/retrying-fetch";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers, acting as the
 * signed-in user (publishable key + session cookie, so RLS applies). Returns null when Supabase
 * isn't configured.
 */
export async function createSupabaseServerClient() {
  const env = readPublicSupabaseEnv();
  if (!env) return null;
  const cookieStore = await cookies();
  return createServerClient(env.url, env.publishableKey, {
    global: { fetch: retryingFetch() },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet)
            cookieStore.set(name, value, options);
        } catch {
          // Server Components can't set cookies; the proxy refreshes the session instead.
        }
      },
    },
  });
}
