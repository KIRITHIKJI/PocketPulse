import { type Page, expect, test } from "@playwright/test";

import { AUTH_FILE, E2E_EMAIL, E2E_PASSWORD, SIGNED_IN_SKIP_REASON } from "./routes";

// Theme and motion live on the shared test profile, and the motion spec depends on that profile
// not changing under it, so these run in the serial ledger projects, never alongside it.
test.skip(!E2E_EMAIL || !E2E_PASSWORD, SIGNED_IN_SKIP_REASON);
test.use({ storageState: AUTH_FILE });

/** Clicks and waits for the server action that saves the choice to the profile. */
async function clickAndSave(page: Page, click: () => Promise<void>) {
  const saved = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      Boolean(r.request().headers()["next-action"]) &&
      // Other server actions run on page load too (the reminder check), so match this one's body.
      /"(theme|motion)"/.test(r.request().postData() ?? ""),
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
