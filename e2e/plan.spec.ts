import { type Page, expect, test } from "@playwright/test";

import { AUTH_FILE, E2E_EMAIL, E2E_PASSWORD, SIGNED_IN_SKIP_REASON } from "./routes";

// Journeys D and E on the real project, with every figure read from the screens. Exact amounts on
// the shared account, so this runs in the serial ledger projects. Goals with history can't be
// deleted, so one goal is reused between runs, and everything ends released, undone or archived.
test.skip(!E2E_EMAIL || !E2E_PASSWORD, SIGNED_IN_SKIP_REASON);
test.use({ storageState: AUTH_FILE });
test.describe.configure({ mode: "serial", timeout: 180_000 });

const GOAL = "zzlaptop";
const BILL = "zzhostel";
const RENT = "zzrent";
const main = (page: Page) => page.locator("#main");
const toast = (page: Page) => page.getByTestId("toast");
const dialog = (page: Page) => page.getByRole("dialog");

const istDate = (plusDays = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    Date.now() + plusDays * 86_400_000,
  );

async function paise(page: Page, path: string, testId: string): Promise<number> {
  await page.goto(path);
  const value = await main(page).getByTestId(testId).getAttribute("data-paise");
  return Number(value);
}
const homeBalance = (page: Page) => paise(page, "/home", "home-balance");
const flexible = (page: Page) => paise(page, "/safe-to-spend", "flexible");

/**
 * Confirms a dialog's server action and waits for that action's own answer, instead of polling
 * the screen for a fixed time that also has to cover the request under load. The dialog closes
 * only on success, so a refused action fails here with its message still on screen.
 */
async function confirmInDialog(page: Page, name: string) {
  const path = new URL(page.url()).pathname;
  // A server action posts to the page it runs on and names itself in the Next-Action header.
  const answer = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.request().headers()["next-action"] !== undefined &&
      new URL(response.url()).pathname === path,
  );
  await dialog(page).getByRole("button", { name }).click();
  // Next sends the answer's headers once the action has run; the new screen streams after.
  await answer;
  await expect(dialog(page)).toBeHidden();
}

async function savePlanning(page: Page, date: string, reserve = "") {
  await page.goto("/safe-to-spend");
  await main(page).getByLabel("Next income date").fill(date);
  await main(page).getByLabel("Minimum reserve").fill(reserve);
  await main(page).getByRole("button", { name: "Save", exact: true }).click();
  await expect(main(page).getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
}

/** Opens the reusable goal, restoring it from an earlier run or creating it the first time. */
async function openGoal(page: Page) {
  await page.goto("/goals");
  const card = main(page).getByRole("link", { name: new RegExp(GOAL) });
  if ((await card.count()) === 0) {
    await main(page).getByRole("button", { name: "Add goal" }).first().click();
    await dialog(page).getByLabel("What are you saving for?").fill(GOAL);
    await dialog(page).getByLabel("Target amount").fill("500");
    await dialog(page).getByRole("button", { name: "Add goal" }).click();
    await expect(dialog(page)).toBeHidden();
  }
  await card.first().click();
  await expect(main(page).getByRole("heading", { name: GOAL, level: 1 })).toBeVisible();
  const restore = main(page).getByRole("button", { name: /^(Restore|Resume|Reopen)$/ });
  if ((await restore.count()) > 0) {
    await restore.click();
    await expect(main(page).getByRole("button", { name: "Mark complete" })).toBeVisible();
  }
}

async function moveMoney(page: Page, button: string, amount: string, confirm: string) {
  await main(page).getByRole("button", { name: button }).click();
  await dialog(page).getByLabel("Amount").fill(amount);
  await dialog(page).getByRole("button", { name: confirm, exact: true }).click();
  await expect(dialog(page)).toBeHidden();
}

async function deletePurchase(page: Page) {
  await page.goto(`/transactions?q=${GOAL}`);
  await main(page)
    .getByRole("link", { name: new RegExp(GOAL) })
    .locator("visible=true")
    .first()
    .click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(dialog(page).getByTestId("delete-note")).toContainText("stays out of the goal");
  await dialog(page).getByRole("button", { name: "Delete" }).click();
  await expect(toast(page)).toContainText("Entry deleted.");
}

test.afterAll(async ({ browser }) => {
  test.setTimeout(60_000);
  const page = await browser.newPage({ storageState: AUTH_FILE });
  await savePlanning(page, "");
  await page.close();
});

test("Journey D: setting money aside isn't spending, and a purchase counts once", async ({
  page,
}) => {
  // An interrupted run can leave money in the reused goal; start from empty.
  await openGoal(page);
  const left = await main(page).getByTestId("goal-saved").textContent();
  if (left !== "₹0") {
    await moveMoney(page, "Release money", left!.replace(/[₹,]/g, ""), "Release");
    await expect(main(page).getByTestId("goal-saved")).toHaveText("₹0");
  }

  await savePlanning(page, istDate(10));
  const balance = await homeBalance(page);
  const start = await flexible(page);

  await openGoal(page);
  await expect(main(page).getByTestId("goal-saved")).toHaveText("₹0");

  // Allocate ₹100: flexible down, balance the same, and it's not an expense.
  await moveMoney(page, "Set money aside", "100", "Set aside");
  await expect(toast(page)).toContainText(`Set aside ₹100 for ${GOAL}`);
  await expect(main(page).getByTestId("goal-saved")).toHaveText("₹100");
  await expect(main(page).getByTestId("goal-remaining")).toHaveText("₹400");
  await expect(main(page).getByTestId("goal-history")).toContainText("Set aside");
  expect(await homeBalance(page)).toBe(balance);
  expect(await flexible(page)).toBe(start - 10_000);
  await expect(main(page).getByTestId("stp-earmarked")).toContainText("₹100");
  await page.goto("/transactions?type=spending");
  await expect(main(page).getByText(GOAL)).toHaveCount(0);

  // Release ₹40: back to flexible, still no income or expense.
  await openGoal(page);
  await moveMoney(page, "Release money", "40", "Release");
  await expect(main(page).getByTestId("goal-saved")).toHaveText("₹60");
  expect(await homeBalance(page)).toBe(balance);
  expect(await flexible(page)).toBe(start - 6_000);

  // "I bought it" for ₹60: the balance drops once, and flexible money doesn't drop again.
  await openGoal(page);
  await main(page).getByRole("button", { name: "I bought it" }).click();
  await expect(dialog(page).getByTestId("purchase-release")).toContainText("₹60");
  await dialog(page)
    .getByRole("button", { name: /^Record purchase/ })
    .click();
  await expect(toast(page)).toContainText("Recorded your purchase");
  await expect(main(page).getByTestId("goal-saved")).toHaveText("₹0");

  // Undo brings both records back together.
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toContainText("Undone");
  await expect(main(page).getByTestId("goal-saved")).toHaveText("₹60");
  expect(await homeBalance(page)).toBe(balance);

  // Do it for real, and check the sums.
  await openGoal(page);
  await main(page).getByRole("button", { name: "I bought it" }).click();
  await dialog(page)
    .getByRole("button", { name: /^Record purchase/ })
    .click();
  await expect(toast(page)).toContainText("Recorded your purchase");
  expect(await homeBalance(page)).toBe(balance - 6_000);
  expect(await flexible(page)).toBe(start - 6_000);

  // Deleting only the purchase says the money didn't go back, right where it lands.
  const note = main(page).getByTestId("goal-release-note").filter({ hasText: GOAL });
  await deletePurchase(page);
  await expect(note).toContainText("The ₹60 wasn’t put back into the goal.");
  await expect(
    main(page).getByRole("heading", { name: "Transactions", exact: true }),
  ).toBeVisible();
  expect(await homeBalance(page)).toBe(balance);
  expect(await flexible(page)).toBe(start);

  // Its button puts the money back, and the note goes.
  await page.goto("/transactions");
  await note.getByRole("button", { name: "Set ₹60 aside again" }).click();
  await expect(toast(page)).toContainText(`Set ₹60 aside again for ${GOAL}`);
  await expect(note).toHaveCount(0);
  await openGoal(page);
  await expect(main(page).getByTestId("goal-saved")).toHaveText("₹60");
  expect(await homeBalance(page)).toBe(balance);
  expect(await flexible(page)).toBe(start - 6_000);

  // Same again, answering the other way, this time from the goal's own page.
  await openGoal(page);
  await main(page).getByRole("button", { name: "I bought it" }).click();
  await dialog(page)
    .getByRole("button", { name: /^Record purchase/ })
    .click();
  await expect(toast(page)).toContainText("Recorded your purchase");
  await deletePurchase(page);
  await openGoal(page);
  await expect(note).toBeVisible();
  await note.getByRole("button", { name: "Keep it flexible" }).click();
  await expect(note).toHaveCount(0);
  await expect(main(page).getByTestId("goal-saved")).toHaveText("₹0");
  expect(await flexible(page)).toBe(start);

  await openGoal(page);
  await main(page).getByRole("button", { name: "Archive" }).click();
  await dialog(page).getByRole("button", { name: "Archive" }).click();
  await expect(toast(page).or(main(page).getByRole("button", { name: "Restore" }))).toBeVisible();
  await expect(main(page).getByRole("button", { name: "Restore" })).toBeVisible();
  await page.goto("/goals");
  await expect(main(page).getByRole("region", { name: "Archived" })).toContainText(GOAL);
});

test("Journey E: no next income date means no daily limit", async ({ page }) => {
  await savePlanning(page, "");
  await page.goto("/safe-to-spend");
  const prompt = main(page).getByTestId("income-date-prompt");
  await expect(prompt).toContainText("Set your next income date");
  await expect(prompt.getByRole("link", { name: "Set your next income date" })).toHaveAttribute(
    "href",
    "/settings#settings-income",
  );
  await expect(main(page).getByTestId("stp-daily")).toHaveText("—");
  await expect(main(page).getByTestId("stp-weekly")).toHaveText("—");
  await expect(main(page).getByTestId("stp-days")).toHaveText("—");
  await expect(main(page).getByTestId("stp-end-balance")).toHaveText("—");

  await page.goto("/survival");
  await expect(main(page).getByTestId("income-date-prompt")).toContainText(
    "Set your next income date",
  );
  await expect(main(page).getByTestId("survival-daily")).toHaveCount(0);
});

test("Journey E: the limits follow the saved date, and a paid bill counts once", async ({
  page,
}) => {
  await savePlanning(page, istDate(10));
  const balance = await homeBalance(page);
  const before = await flexible(page);
  await expect(main(page).getByTestId("stp-days")).toHaveText("10");

  // The limit is the flexible amount over the days left, and Survival Mode says the same.
  const daily = await main(page).getByTestId("stp-daily").textContent();
  await page.goto("/survival");
  await expect(main(page).getByTestId("survival-days")).toHaveText("10");
  await expect(main(page).getByTestId("survival-daily")).toHaveText(daily!);
  await expect(main(page).getByTestId("survival-status")).toBeVisible();

  // A planned bill comes off safe-to-spend, not off the balance.
  await page.goto("/recurring");
  await main(page).getByRole("button", { name: "Add a bill" }).click();
  await dialog(page).getByLabel("What’s it for?").fill(BILL);
  await dialog(page).getByLabel("Amount").fill("123");
  await dialog(page).getByLabel("Due on").fill(istDate(1));
  await dialog(page).getByRole("button", { name: "Add bill" }).click();
  await expect(dialog(page)).toBeHidden();
  const item = main(page).getByTestId("due-item").filter({ hasText: BILL });
  await expect(item).toContainText("Planned, not paid");
  expect(await flexible(page)).toBe(before - 12_300);
  await expect(main(page).getByTestId("stp-bills")).toContainText(BILL);
  expect(await homeBalance(page)).toBe(balance);

  // Paying it moves it from planned to real in one save; flexible money stays where it was.
  await page.goto("/recurring");
  await item.getByRole("button", { name: /^Mark paid/ }).click();
  await dialog(page)
    .getByRole("button", { name: /^Record payment/ })
    .click();
  await expect(toast(page)).toContainText(`Recorded ${BILL}`);
  await expect(item).toHaveCount(0);
  await expect(main(page).getByTestId("occurred-list")).toContainText(BILL);
  const undo = toast(page).getByRole("button", { name: "Undo" });
  await undo.click();
  await expect(toast(page)).toContainText("Undone");
  await expect(item).toBeVisible();

  await item.getByRole("button", { name: /^Mark paid/ }).click();
  await dialog(page)
    .getByRole("button", { name: /^Record payment/ })
    .click();
  await expect(toast(page)).toContainText(`Recorded ${BILL}`);
  expect(await homeBalance(page)).toBe(balance - 12_300);
  expect(await flexible(page)).toBe(before - 12_300);
  await expect(main(page).getByTestId("stp-bills")).toHaveCount(0);

  // A recurring expense is a forecast until confirmed, and is confirmed once.
  await page.goto("/recurring");
  await main(page).getByRole("button", { name: "Add recurring" }).click();
  await dialog(page).getByLabel("Name").fill(RENT);
  await dialog(page).getByLabel("Amount").fill("77");
  await dialog(page).getByLabel("Next due").fill(istDate(2));
  await dialog(page).getByRole("button", { name: "Add recurring item" }).click();
  await expect(dialog(page)).toBeHidden();
  const rent = main(page).getByTestId("due-item").filter({ hasText: RENT }).first();
  await expect(rent).toContainText("Forecast");
  await expect(rent).toContainText("Counted in safe-to-spend");
  expect(await homeBalance(page)).toBe(balance - 12_300);
  expect(await flexible(page)).toBe(before - 12_300 - 7_700);

  await page.goto("/recurring");
  await rent.getByRole("button", { name: /^Mark paid/ }).click();
  await dialog(page)
    .getByRole("button", { name: /^Record payment/ })
    .click();
  await expect(toast(page)).toContainText(`Recorded ${RENT}`);
  expect(await homeBalance(page)).toBe(balance - 12_300 - 7_700);
  expect(await flexible(page)).toBe(before - 12_300 - 7_700);

  // Clean up: both entries, then the template.
  for (const word of [BILL, RENT]) {
    await page.goto(`/transactions?q=${word}`);
    await main(page)
      .getByRole("link", { name: new RegExp(word) })
      .locator("visible=true")
      .first()
      .click();
    await page.getByRole("button", { name: "Delete" }).click();
    await dialog(page).getByRole("button", { name: "Delete" }).click();
    await expect(toast(page)).toContainText("Entry deleted.");
  }
  expect(await homeBalance(page)).toBe(balance);

  await page.goto("/recurring");
  await main(page)
    .getByTestId("recurring-template")
    .filter({ hasText: RENT })
    .getByRole("button", { name: "Archive" })
    .click();
  await confirmInDialog(page, "Archive");
  await expect(main(page).getByTestId("recurring-template").filter({ hasText: RENT })).toHaveCount(
    0,
  );

  // The bill is unpaid again now its payment is gone; cancel it.
  const unpaid = main(page).getByTestId("due-item").filter({ hasText: BILL });
  await unpaid.getByRole("button", { name: "Cancel bill" }).click();
  await confirmInDialog(page, "Cancel bill");
  await expect(unpaid).toHaveCount(0);
  expect(await flexible(page)).toBe(before);
});

test("budgets alert at a chosen threshold and always say they're targets", async ({ page }) => {
  await page.goto("/budgets");
  await main(page).getByRole("button", { name: "Add budget" }).first().click();
  await dialog(page).getByLabel("Limit").fill("100000");
  await dialog(page).getByLabel("Period").selectOption("custom");
  await dialog(page).getByLabel("To").fill(istDate(6));
  await dialog(page).getByLabel("Alert me at (% used)").fill("1");
  await dialog(page).getByRole("button", { name: "Add budget" }).click();
  await expect(dialog(page)).toBeHidden();

  const custom = main(page).getByTestId("budget-card").filter({ hasText: "Custom ·" });
  const card = custom.filter({ hasText: "of ₹1,00,000" });
  await expect(card).toHaveCount(1);

  // A second add from the same open page is a second budget, not an overwrite of the first.
  await main(page).getByRole("button", { name: "Add budget" }).first().click();
  await dialog(page).getByLabel("Limit").fill("200000");
  await dialog(page).getByLabel("Period").selectOption("custom");
  await dialog(page).getByLabel("To").fill(istDate(6));
  await dialog(page).getByRole("button", { name: "Add budget" }).click();
  await expect(dialog(page)).toBeHidden();
  const second = custom.filter({ hasText: "of ₹2,00,000" });
  await expect(second).toHaveCount(1);
  await expect(card).toHaveCount(1);
  await expect(card.getByTestId("budget-remaining")).toContainText("target, not reserved money");

  // ₹1,500 of ₹1,00,000 passes the 1 % threshold; nothing is blocked along the way.
  await page.goto("/add/text");
  await expect(async () => {
    await page.getByRole("textbox", { name: "What did you spend?" }).fill("zzbudget 1500");
    await page.getByRole("button", { name: "Review entries" }).click();
    await expect(page.getByRole("heading", { name: /^Check/ })).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await page.getByRole("button", { name: /^Save 1 entry/ }).click();
  await expect(toast(page)).toContainText("Saved");

  await page.goto("/budgets");
  await expect(main(page).getByTestId("budget-alerts")).toContainText("reached 1% of its target");
  await expect(card.getByTestId("budget-used")).not.toHaveText("0%");
  await page.goto("/home");
  await expect(main(page).getByTestId("budget-snapshot")).toContainText("alert level");

  // Deleting the entry updates the budget straight away.
  await page.goto("/transactions?q=zzbudget");
  await main(page)
    .getByRole("link", { name: /zzbudget/i })
    .locator("visible=true")
    .first()
    .click();
  await page.getByRole("button", { name: "Delete" }).click();
  await dialog(page).getByRole("button", { name: "Delete" }).click();
  await expect(toast(page)).toContainText("Entry deleted.");

  await page.goto("/budgets");
  for (const budget of [card, second]) {
    await budget.getByRole("button", { name: /^Remove/ }).click();
    await dialog(page).getByRole("button", { name: "Remove budget" }).click();
    await expect(dialog(page)).toBeHidden();
    await expect(budget).toHaveCount(0);
  }
});

test("an unknown goal gets a real 404", async ({ page }) => {
  const response = await page.goto("/goals/00000000-0000-4000-8000-000000000000");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "We couldn’t find that" })).toBeVisible();
});
