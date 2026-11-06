import { expect, test } from "@playwright/test";

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
    // Phones widen the layout viewport to fit overflowing content (which makes the check above
    // read 0), so also compare it with the device width.
    expect(await page.evaluate(() => window.innerWidth)).toBe(page.viewportSize()!.width);
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

test("unknown transaction ids get a real 404 with the in-app not-found state", async ({ page }) => {
  // The entry is looked up in transactions/[id]/layout.tsx, outside the streaming loading
  // boundary, so the status is decided before the response starts.
  const randomId = crypto.randomUUID();
  for (const path of [
    "/transactions/does-not-exist",
    `/transactions/${randomId}`,
    `/transactions/${randomId}/edit`,
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
    await expect(page.getByRole("heading", { name: "We couldn’t find that" })).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Primary" })
        .or(page.getByRole("complementary", { name: "Main navigation" })),
    ).toBeVisible();
  }
});

test("navigation: sidebar on desktop, bottom tabs + You sheet on mobile", async ({
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

    await tabs.getByRole("button", { name: "You" }).click();
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

test.describe("with OS reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("CSS transitions are effectively disabled", async ({ page }) => {
    await page.goto("/home");
    // A quick-add tile: it has a press/hover transition on every viewport.
    const duration = await page
      .getByRole("list", { name: "Quick-add tiles" })
      .getByRole("button")
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
