/**
 * Test-only diagnostics: printed only when the server runs with `PP_E2E_DIAGNOSE=1` (the e2e
 * web server). Callers pass status codes and error codes only, never tokens or personal data.
 */
export function diagnose(event: string, details: Record<string, string | number | boolean | null>) {
  if (process.env.PP_E2E_DIAGNOSE !== "1") return;
  console.warn(`[e2e-diagnose] ${event} ${JSON.stringify(details)}`);
}
