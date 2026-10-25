export const APP_ROUTES = [
  "/home",
  "/add",
  "/add/text",
  "/add/voice",
  "/transactions",
  "/transactions/new",
  "/categories",
  "/recurring",
  "/insights",
  "/insights/leaks",
  "/budgets",
  "/goals",
  "/safe-to-spend",
  "/survival",
  "/reports",
  "/rewards",
  "/reminders",
  "/settings",
  "/settings/privacy",
  "/settings/sync",
  "/settings/data",
  "/onboarding",
];

export const PUBLIC_ROUTES = [
  "/welcome",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
];

/** A real account in a real Supabase project (with migrations applied) for signed-in tests. */
export const E2E_EMAIL = process.env.E2E_EMAIL;
export const E2E_PASSWORD = process.env.E2E_PASSWORD;
export const SIGNED_IN_SKIP_REASON =
  "Set E2E_EMAIL and E2E_PASSWORD (a test account in your Supabase project) to run signed-in shell tests.";
