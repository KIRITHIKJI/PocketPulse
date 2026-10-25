/**
 * Route access rules shared by the proxy and auth pages. Pure functions so they're unit-tested.
 */

/** Reachable without a session. */
const PUBLIC_PREFIXES = ["/welcome", "/login", "/register", "/forgot-password", "/auth"];

/** Reachable only without a session (signed-in users go home). */
const SIGNED_OUT_ONLY = ["/login", "/register", "/forgot-password"];

function matches(pathname: string, prefixes: readonly string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export type RouteAccess = "public" | "signed-out-only" | "recovery" | "protected";

export function routeAccess(pathname: string): RouteAccess {
  // The reset page needs the recovery session from the email link, so it must not redirect.
  if (pathname === "/reset-password") return "recovery";
  if (matches(pathname, SIGNED_OUT_ONLY)) return "signed-out-only";
  if (matches(pathname, PUBLIC_PREFIXES)) return "public";
  return "protected";
}

export const HOME_PATH = "/home";

/**
 * Only same-origin, absolute paths are allowed as post-login destinations — never
 * "//evil.example", "/\\evil.example" or a full URL (open-redirect protection).
 */
export function safeNextPath(value: unknown, fallback: string = HOME_PATH): string {
  if (typeof value !== "string" || value.length > 512) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f]/.test(value)) return fallback;
  if (routeAccess(value.split("?")[0]!) === "signed-out-only") return fallback;
  return value;
}
