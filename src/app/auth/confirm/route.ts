import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { safeNextPath } from "@/lib/auth/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const OTP_TYPES: readonly EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

/**
 * Landing point for links in auth emails (sign-up confirmation, password recovery). Supports the
 * PKCE `code` flow (default email templates) and the `token_hash` flow (custom templates).
 * On success it sets the session cookie and continues to `next`.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNextPath(url.searchParams.get("next"));
  const failTarget = next === "/reset-password" ? "/forgot-password" : "/login";
  const fail = () =>
    NextResponse.redirect(new URL(`${failTarget}?error=link_invalid`, request.url));

  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail();

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type && OTP_TYPES.includes(type)) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  }
  return ok ? NextResponse.redirect(new URL(next, request.url)) : fail();
}
