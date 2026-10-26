import type { Route } from "next";

import { ONBOARDING_STEPS } from "@/lib/validation/onboarding";

/**
 * Where a successful onboarding step continues to. Only known step URLs (or Home) are allowed,
 * so a crafted `next` value can't redirect anywhere else. Anything else → null (stay on page).
 */
export function onboardingRedirect(value: unknown): Route | null {
  if (typeof value !== "string") return null;
  if (value === "/home") return "/home";
  const match = /^\/onboarding\?step=([a-z]+)$/.exec(value);
  if (match && ONBOARDING_STEPS.some((s) => s.id === match[1])) return value as Route;
  return null;
}

export function stepHref(step: string): Route {
  return `/onboarding?step=${step}` as Route;
}
