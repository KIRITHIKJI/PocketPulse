import AxeBuilder from "@axe-core/playwright";
import { type Page, expect, test } from "@playwright/test";

import { APP_ROUTES, AUTH_FILE, E2E_EMAIL, E2E_PASSWORD, PUBLIC_ROUTES } from "./routes";

// Every screen, in both themes, against WCAG 2.2 AA as axe can measure it. Screenshots for a
// person to look at are written only when SHOTS_DIR is set.
const SHOTS = process.env.SHOTS_DIR;
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// The narrowest phone and a common laptop, rather than each device profile's own width.
test.use({
  viewport: async ({ isMobile }, provide) =>
    provide(isMobile ? { width: 375, height: 812 } : { width: 1440, height: 900 }),
});

async function check(page: Page, route: string, theme: "dark" | "light", label: string) {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: theme });
  await page.addInitScript((value) => {
    try {
      window.localStorage.setItem("theme", value);
    } catch {
      // Storage is unavailable on about:blank.
    }
  }, theme);
  await page.goto(route);
  await expect(page.locator("h1").first()).toBeVisible();
  await page.waitForLoadState("networkidle").catch(() => undefined);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${route} scrolls sideways`).toBeLessThanOrEqual(0);
  if (SHOTS) {
    const name = `${label}-${theme}-${route.replaceAll("/", "_")}.png`;
    await page.screenshot({ path: `${SHOTS}/${name}`, fullPage: true });
  }
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const found = violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.slice(0, 4).map((n) => `${n.target.join(" ")} :: ${n.failureSummary}`),
  }));
  expect(found, `${route} in ${theme}`).toEqual([]);
}

test.describe("signed in", () => {
  test.skip(!E2E_EMAIL || !E2E_PASSWORD, "Needs a test account.");
  test.use({ storageState: AUTH_FILE });
  for (const route of APP_ROUTES) {
    for (const theme of ["dark", "light"] as const) {
      test(`${route} in ${theme}`, async ({ page, isMobile }) => {
        await check(page, route, theme, isMobile ? "mobile" : "desktop");
      });
    }
  }
});

test.describe("signed out", () => {
  for (const route of [...PUBLIC_ROUTES, "/offline"]) {
    for (const theme of ["dark", "light"] as const) {
      test(`${route} in ${theme}`, async ({ page, isMobile }) => {
        await check(page, route, theme, isMobile ? "mobile" : "desktop");
      });
    }
  }
});
