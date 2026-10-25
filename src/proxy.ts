import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { HOME_PATH, routeAccess } from "@/lib/auth/routes";
import { readPublicSupabaseEnv } from "@/lib/env";

/**
 * Runs before every page request: refreshes the Supabase session cookie and redirects by
 * session state. This is an optimistic check for navigation only — data access is protected
 * by RLS in the database, never by this file.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const access = routeAccess(pathname);
  const env = readPublicSupabaseEnv();

  if (!env) {
    // Without a configured project nothing private can load; the sign-in page explains why.
    if (pathname === "/") return NextResponse.redirect(new URL("/welcome", request.url));
    if (access === "protected") return NextResponse.redirect(new URL("/login", request.url));
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });

  // Verifies the JWT (and refreshes an expired session) before deciding anything.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  const redirectTo = (target: URL) => {
    const redirect = NextResponse.redirect(target);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  };

  if (pathname === "/") {
    return redirectTo(new URL(signedIn ? HOME_PATH : "/welcome", request.url));
  }
  if (!signedIn && access === "protected") {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `${pathname}${search}`);
    return redirectTo(login);
  }
  if (signedIn && access === "signed-out-only") {
    return redirectTo(new URL(HOME_PATH, request.url));
  }
  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and metadata files.
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$).*)",
  ],
};
