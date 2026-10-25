/**
 * Public runtime configuration. Only NEXT_PUBLIC_* values are read here so this module is
 * safe to import from client components. Server-only secrets must never be read in this file.
 *
 * Supabase's current key scheme uses a publishable key (`sb_publishable_…`); the legacy
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY` JWT is accepted as a fallback.
 */
export function readPublicSupabaseEnv(
  env: Record<string, string | undefined> = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
): { url: string; publishableKey: string } | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = (
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  if (!url || !key) return null;
  // The values shipped in .env.example are placeholders, not a configured project.
  if (url.includes("your-project-ref") || key.includes("your-key-here")) return null;
  try {
    const parsed = new URL(url);
    const local = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
    if (parsed.protocol !== "https:" && !local) return null;
  } catch {
    return null;
  }
  return { url, publishableKey: key };
}

export function isSupabaseConfigured(env?: Record<string, string | undefined>): boolean {
  return readPublicSupabaseEnv(env) !== null;
}
