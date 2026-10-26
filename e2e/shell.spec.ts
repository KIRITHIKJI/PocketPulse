import { type Page, expect, test } from "@playwright/test";

import { APP_ROUTES, AUTH_FILE, E2E_EMAIL, E2E_PASSWORD, SIGNED_IN_SKIP_REASON } from "./routes";

// Signed-in shell tests, using the session saved by auth.setup.ts (a real account; there is no
// fake session). They only run when E2E_EMAIL / E2E_PASSWORD are set.
test.skip(!E2E_EMAIL || !E2E_PASSWORD, SIGNED_IN_SKIP_REASON);
test.use({ storageState: AUTH_FILE });

for (const route of APP_ROUTES) {
  test(`${route} renders with a heading, no horizontal overflow and no console errors`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/coming soon/i);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
}

test.describe("sign-out", () => {
  // A fresh sign-in of its own, so signing out doesn't end the shared session other tests use.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("signed-in users skip the sign-in page and can sign out", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(E2E_EMAIL!);
    await page.getByLabel("Password").fill(E2E_PASSWORD!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/home$/);
    await page.goto("/login");
    await expect(page).toHaveURL(/\/home$/);
    await page.getByTestId("account-menu").click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/home");
    await expect(page).toHaveURL(/\/login\?next=%2Fhome$/);
  });
});

test("unknown transaction ids show the in-app not-found state", async ({ page }) => {
  // The (app) loading boundary streams the response, so Next.js sends 200 before notFound()
  // runs and marks the page noindex instead of sending a 404 status.
  await page.goto("/transactions/does-not-exist");
  await expect(page.getByRole("heading", { name: "We couldn’t find that" })).toBeVisible();
  expect(await page.locator('meta[name="robots"][content*="noindex"]').count()).toBeGreaterThan(0);
  await expect(
    page
      .getByRole("navigation", { name: "Primary" })
      .or(page.getByRole("complementary", { name: "Main navigation" })),
  ).toBeVisible();
});

test("navigation: sidebar on desktop, bottom tabs + section sheet on mobile", async ({
  page,
  isMobile,
}) => {
  await page.goto("/home");
  const sidebar = page.getByRole("complementary", { name: "Main navigation" });
  const tabs = page.getByRole("navigation", { name: "Primary" });

  if (isMobile) {
    await expect(sidebar).toBeHidden();
    await expect(tabs).toBeVisible();
    await tabs.getByRole("link", { name: "Plan" }).click();
    await expect(page).toHaveURL(/\/budgets$/);
    await expect(tabs.getByRole("link", { name: "Plan" })).toHaveAttribute("aria-current", "page");

    await page.getByRole("button", { name: "Open all sections" }).click();
    await page.getByRole("dialog").getByRole("link", { name: "Money leaks" }).click();
    await expect(page).toHaveURL(/\/insights\/leaks$/);
    await expect(page.getByRole("dialog")).toBeHidden();

    await page.getByRole("link", { name: "Add expense" }).click();
    await expect(page).toHaveURL(/\/add$/);
  } else {
    await expect(sidebar).toBeVisible();
    await expect(tabs).toBeHidden();
    await sidebar.getByRole("link", { name: "Savings goals" }).click();
    await expect(page).toHaveURL(/\/goals$/);
    await expect(sidebar.getByRole("link", { name: "Savings goals" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  }
});

/** Clicks and waits for the server action that saves the choice to the profile. */
async function clickAndSave(page: Page, click: () => Promise<void>) {
  const saved = page.waitForResponse(
    (r) => r.request().method() === "POST" && Boolean(r.request().headers()["next-action"]),
  );
  await click();
  expect((await saved).ok()).toBe(true);
}

// Theme and motion are saved to the (shared) test profile, so these run on one project only,
// serially, and put the defaults back.
test.describe("synced appearance preferences", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(({ isMobile }) => isMobile, "Writes the shared test profile; runs on desktop only.");

  test("theme defaults to midnight, persists, and follows the account to a new device", async ({
    page,
    browser,
  }) => {
    await page.goto("/settings");
    const theme = page.getByRole("radiogroup", { name: "Theme" });
    // Start from the default even if an earlier run was interrupted midway. Wait until the page
    // is hydrated and the profile's theme applied before reading it.
    await page.waitForLoadState("networkidle");
    if (await page.evaluate(() => document.documentElement.classList.contains("light"))) {
      await clickAndSave(page, () => theme.getByRole("radio", { name: "Midnight" }).click());
    }
    await expect(page.locator("html")).toHaveClass(/dark/);

    await clickAndSave(page, () => theme.getByRole("radio", { name: "Light" }).click());
    await expect(page.locator("html")).toHaveClass(/light/);
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/light/);
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(background).not.toBe("rgba(0, 0, 0, 0)");

    // A second "device": same account, empty local storage — the profile brings the theme.
    const other = await browser.newContext({ storageState: AUTH_FILE });
    try {
      const otherPage = await other.newPage();
      await otherPage.evaluate(() => localStorage.clear()).catch(() => {});
      await otherPage.goto("/home");
      await expect(otherPage.locator("html")).toHaveClass(/light/);
    } finally {
      await other.close();
    }

    await clickAndSave(page, () => theme.getByRole("radio", { name: "Midnight" }).click());
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("reduced-motion preference applies before paint after reload", async ({ page }) => {
    await page.goto("/settings");
    const motion = page.getByRole("radiogroup", { name: "Motion" });
    await clickAndSave(page, () => motion.getByRole("radio", { name: "Reduced" }).click());
    await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
    await clickAndSave(page, () =>
      page
        .getByRole("radiogroup", { name: "Motion" })
        .getByRole("radio", { name: "Match device" })
        .click(),
    );
    await expect(page.locator("html")).not.toHaveAttribute("data-motion", /./);
    await page.reload();
    await expect(page.locator("html")).not.toHaveAttribute("data-motion", /./);
  });
});

test.describe("with OS reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("CSS transitions are effectively disabled", async ({ page }) => {
    await page.goto("/home");
    const duration = await page
      .getByRole("link", { name: "Quick add" })
      .first()
      .evaluate((element) => getComputedStyle(element).transitionDuration);
    expect(parseFloat(duration)).toBeLessThan(0.001);
  });
});

test("offline banner reflects connectivity", async ({ page, context }) => {
  await page.goto("/home");
  await context.setOffline(true);
  await expect(page.getByRole("status").filter({ hasText: "You’re offline" })).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText("You’re offline")).toBeHidden();
});
