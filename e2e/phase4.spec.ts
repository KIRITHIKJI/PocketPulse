import { expect, test } from "@playwright/test";

import { AUTH_FILE, E2E_EMAIL, E2E_PASSWORD, SIGNED_IN_SKIP_REASON } from "./routes";

// Phase 4 journeys against the real project with the shared test account. Steps that write the
// profile or wallets run on the desktop project only (serially) so the two viewports never race;
// every write is idempotent (same values each run) or restored afterwards.
test.skip(!E2E_EMAIL || !E2E_PASSWORD, SIGNED_IN_SKIP_REASON);
test.use({ storageState: AUTH_FILE });

test.describe("onboarding and wallets", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(({ isMobile }) => isMobile, "Writes the shared test profile; runs on desktop only.");

  test("onboarding saves the opening balance and every optional step can be skipped", async ({
    page,
  }) => {
    await page.goto("/onboarding");
    await expect(
      page.getByRole("heading", { level: 1, name: "Currency & timezone" }),
    ).toBeVisible();
    await expect(page.getByLabel("Currency")).toHaveValue("INR");
    await expect(page.getByLabel("Timezone")).toHaveValue("Asia/Kolkata");
    await page.getByRole("button", { name: "Save & continue" }).click();

    await expect(page).toHaveURL(/step=balance$/);
    await expect(page.getByText("not a verified bank balance")).toBeVisible();
    // Validation keeps what was typed.
    const amount = page.getByLabel("Money in it now").first();
    await amount.fill("12.345");
    await page.getByRole("button", { name: "Save & continue" }).click();
    await expect(page.getByText("Use at most 2 decimal places (paise).")).toBeVisible();
    await expect(amount).toHaveValue("12.345");
    await amount.fill("1,234.50");
    await page.getByRole("button", { name: "Save & continue" }).click();

    for (const step of ["income", "budgets", "goal"]) {
      await expect(page).toHaveURL(new RegExp(`step=${step}$`));
      await page.getByRole("link", { name: "Skip this step" }).click();
    }
    await expect(page).toHaveURL(/step=preferences$/);
    await page.getByRole("button", { name: "Finish setup" }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByTestId("finish-setup")).toBeHidden();

    await page.goto("/accounts");
    const wallet = page.locator('[data-testid^="wallet-"]').filter({ hasText: "Default" });
    await expect(wallet).toContainText("₹1,234.50");
    await expect(page.getByText("Tracked total across wallets · now")).toBeVisible();
  });

  test("a wallet can be added, edited and archived", async ({ page }) => {
    const name = `E2E wallet ${Date.now()}`;
    await page.goto("/accounts");
    await page.getByRole("button", { name: "Add wallet" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByLabel("Type").selectOption("upi_wallet");
    await dialog.getByLabel("Opening balance").fill("-25");
    await dialog.getByRole("button", { name: "Add wallet" }).click();
    await expect(dialog).toBeHidden();

    const card = page.getByTestId(`wallet-${name}`);
    await expect(card).toContainText("−₹25");
    await card.getByRole("button", { name: `Edit ${name}` }).click();
    await page.getByRole("dialog").getByLabel("Opening balance").fill("75");
    await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
    await expect(card).toContainText("₹75");

    await card.getByRole("button", { name: "Archive" }).click();
    await expect(page.getByRole("dialog")).toContainText("Nothing is deleted");
    await page.getByRole("dialog").getByRole("button", { name: "Archive" }).click();
    await expect(page.getByRole("region", { name: "Archived", exact: true })).toContainText(name);
  });

  test("the small-purchase threshold is saved to the profile", async ({ page }) => {
    await page.goto("/settings");
    const field = page.getByLabel("Small purchase threshold");
    await field.fill("60");
    await field.locator("xpath=ancestor::form").getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved." }).first()).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Small purchase threshold")).toHaveValue("60");
    await page.getByLabel("Small purchase threshold").fill("50");
    await page
      .getByLabel("Small purchase threshold")
      .locator("xpath=ancestor::form")
      .getByRole("button", { name: "Save" })
      .click();
    await expect(page.getByRole("status").filter({ hasText: "Saved." }).first()).toBeVisible();
  });
});

test.describe("categories", () => {
  test("default hierarchy, rule preview and the uncategorized queue render", async ({ page }) => {
    await page.goto("/categories?tab=spending");
    const food = page.getByTestId("category-Food & Drinks");
    await food.locator("summary").click();
    await expect(food.getByText("Tea", { exact: true })).toBeVisible();

    await page.getByRole("tab", { name: "Rules" }).click();
    await page.getByLabel("Description").fill("masala chai near hostel");
    await expect(page.getByText("Food & Drinks › Tea", { exact: true })).toBeVisible();
    await expect(page.getByText("Matched the word “chai”")).toBeVisible();

    await page.getByRole("tab", { name: /Uncategorized/ }).click();
    await expect(
      page
        .getByRole("heading", { name: "Nothing waiting" })
        .or(page.getByText(/needs? a category/)),
    ).toBeVisible();
  });

  test("a custom category can be created, renamed and archived", async ({ page, isMobile }) => {
    test.skip(isMobile, "Writes categories; runs on desktop only.");
    const name = `E2E ${Date.now()}`.slice(0, 20);
    await page.goto("/categories?tab=spending");
    await page.getByRole("button", { name: "Add category" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByRole("radio", { name: "gamepad 2" }).click();
    await dialog.getByRole("radio", { name: "Teal" }).click();
    await dialog.getByRole("button", { name: "Add category" }).click();
    await expect(dialog).toBeHidden();

    const row = page.getByTestId(`category-${name}`);
    await row.locator("summary").click();
    await row.getByRole("button", { name: `Edit ${name}` }).click();
    await page.getByRole("dialog").getByLabel("Name").fill(`${name}!`);
    await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
    const renamed = page.getByTestId(`category-${name}!`);
    await expect(renamed).toBeVisible();

    // The same <details> element stays open across the rename.
    if ((await renamed.getAttribute("open")) === null) await renamed.locator("summary").click();
    await renamed.getByRole("button", { name: `Archive ${name}!` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Archive" }).click();
    await expect(page.getByRole("region", { name: "Archived and merged" })).toContainText(
      `${name}!`,
    );
  });
});
