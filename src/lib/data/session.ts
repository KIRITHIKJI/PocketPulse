import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ServerClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

export interface Session {
  supabase: ServerClient;
  userId: string;
  email: string | null;
}

/**
 * The signed-in user's RLS-scoped client, or null when signed out or unconfigured. The user id
 * comes from the verified JWT, never from a form or URL. Cached per request, so the layout,
 * header and page share one verification.
 */
export const optionalSession = cache(async (): Promise<Session | null> => {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (error || !userId) return null;
  return { supabase, userId, email: (data.claims.email as string | undefined) ?? null };
});

/** Like optionalSession, but redirects to sign-in when there is no session. */
export const requireSession = cache(async (): Promise<Session> => {
  const session = await optionalSession();
  if (!session) redirect("/login");
  return session;
});

/**
 * "Now" for this request. One instant is shared by everything rendered for the request, so a
 * balance "as of now" and "today" can't disagree across a midnight boundary mid-render.
 */
export const requestNow = cache((): number => Date.now());
