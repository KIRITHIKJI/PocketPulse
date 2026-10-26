import { existsSync } from "node:fs";

import { type Page, expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { AUTH_FILE, E2E_EMAIL, E2E_PASSWORD, SIGNED_IN_SKIP_REASON } from "./routes";

// Phase 5 journeys on the real project with the shared test account. They assert exact balance
// changes, so playwright.config.ts runs this file once per viewport, one viewport after the
// other. Every entry a test creates is removed again (Undo or Delete → soft delete); nothing
// else in the account's history is touched.
test.skip(!E2E_EMAIL || !E2E_PASSWORD, SIGNED_IN_SKIP_REASON);
test.use({ storageState: AUTH_FILE });
test.describe.configure({ mode: "serial" });

/** A distinctive amount per run, e.g. "13.47", so the entry is easy to find and assert. */
function uniqueAmount(): { text: string; paise: number } {
  const paise = 1_000 + (Date.now() % 8_999);
  const text = `${Math.trunc(paise / 100)}.${String(paise % 100).padStart(2, "0")}`;
  return { text, paise };
}

/** The app's display format: 1347 → "₹13.47", 1300 → "₹13". */
function rupees(paise: number): string {
  const r = Math.trunc(paise / 100);
  const p = paise % 100;
  return `₹${r}${p ? `.${String(p).padStart(2, "0")}` : ""}`;
}

async function paiseOf(page: Page, testId: string): Promise<number> {
  return Number(await main(page).getByTestId(testId).getAttribute("data-paise"));
}

const toast = (page: Page) => page.getByTestId("toast");
// Scoped to <main>: while a page streams in, React briefly holds a hidden copy outside it.
const main = (page: Page) => page.locator("#main");

const historyFor = (amount: string) => `/transactions?type=expense&min=${amount}&max=${amount}`;

async function openTile(page: Page, label: string) {
  const tile = page
    .getByRole("list", { name: "Quick-add tiles" })
    .getByRole("button", { name: new RegExp(`^${label}\\b`) });
  // A tap that lands before hydration does nothing (as on a real phone); tap again until the
  // sheet opens.
  await expect(async () => {
    await tile.click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1_000 });
  }).toPass();
}

/** Don't change the real account's usual tile amount. */
async function keepUsualAmount(page: Page) {
  const remember = page.getByRole("dialog").getByRole("checkbox", { name: /usual amount/ });
  if (await remember.isVisible()) await remember.uncheck();
}

/** Either the filtered-empty state or, if the account has no entries at all, the overall one. */
async function expectNothingListed(page: Page) {
  await expect(
    page
      .getByRole("heading", { name: "No entries match" })
      .or(page.getByRole("heading", { name: "No transactions yet" })),
  ).toBeVisible();
}

async function deleteOpenEntry(page: Page) {
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("dialog")).toContainText("Delete this entry?");
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/transactions$/);
  await expect(toast(page)).toContainText("Entry deleted.");
}

test("Journey A: quick-add tea updates balance, feed and today's spending; Undo reverses it", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/home");
  const balanceBefore = await paiseOf(page, "home-balance");
  const todayBefore = await paiseOf(page, "home-spent-today");
  const amount = uniqueAmount();

  await openTile(page, "Tea");
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "Tea" })).toBeVisible();
  // The default wallet is preselected; there is nothing else to choose.
  await sheet.getByLabel("Amount").fill(amount.text);
  await keepUsualAmount(page);
  await sheet.getByRole("button", { name: `Save ${rupees(amount.paise)}` }).click();

  await expect(sheet).toBeHidden();
  await expect(toast(page)).toContainText(`Saved ${rupees(amount.paise)} · Tea`);
  await expect(main(page).getByTestId("home-balance")).toHaveAttribute(
    "data-paise",
    String(balanceBefore - amount.paise),
  );
  await expect(main(page).getByTestId("home-spent-today")).toHaveAttribute(
    "data-paise",
    String(todayBefore + amount.paise),
  );
  const card = main(page).getByTestId("recent-entries").getByTestId("entry-card").first();
  await expect(card).toContainText("Tea");
  await expect(card).toContainText(`−${rupees(amount.paise)}`);

  // Undo straight from the toast: the entry is removed and every figure goes back.
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toContainText("Undone");
  await expect(main(page).getByTestId("home-balance")).toHaveAttribute(
    "data-paise",
    String(balanceBefore),
  );
  await expect(main(page).getByTestId("home-spent-today")).toHaveAttribute(
    "data-paise",
    String(todayBefore),
  );
  await page.goto(historyFor(amount.text));
  await expectNothingListed(page);
  expect(errors).toEqual([]);
});

test("a double tap saves once; delete asks first and Undo restores the same entry", async ({
  page,
}) => {
  await page.goto("/add");
  const amount = uniqueAmount();
  await openTile(page, "Tea");
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Amount").fill(amount.text);
  await keepUsualAmount(page);
  await sheet.getByRole("button", { name: `Save ${rupees(amount.paise)}` }).dblclick();
  await expect(toast(page)).toContainText(`Saved ${rupees(amount.paise)}`);

  await page.goto(historyFor(amount.text));
  await expect(main(page).getByTestId("history-summary")).toContainText("1 entry match");
  await page.getByRole("link", { name: /Tea/ }).filter({ visible: true }).first().click();
  await expect(main(page).getByTestId("entry-amount")).toHaveText(`−${rupees(amount.paise)}`);

  await deleteOpenEntry(page);
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toContainText("Restored.");
  await page.goto(historyFor(amount.text));
  await expect(main(page).getByTestId("history-summary")).toContainText("1 entry match");

  // Clean up (a soft delete, like any user delete).
  await page.getByRole("link", { name: /Tea/ }).filter({ visible: true }).first().click();
  await deleteOpenEntry(page);
  await page.goto(historyFor(amount.text));
  await expectNothingListed(page);
});

test("full form → history search → detail → edit → undo edit → delete with confirmation", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "The long form journey runs once; Journey A covers the phone layout.");
  // Remove anything an earlier, interrupted run of this test left behind (tagged "phase5").
  for (;;) {
    await page.goto("/transactions?q=phase5&type=expense");
    const leftover = main(page)
      .getByTestId("history-table")
      .getByRole("link", { name: /^E2E lunch/ });
    if ((await leftover.count()) === 0) break;
    await leftover.first().click();
    await deleteOpenEntry(page);
  }

  const label = `E2E lunch ${Date.now()}`;
  await page.goto("/transactions/new");
  await expect(page.getByRole("radio", { name: "Expense" })).toBeChecked();
  await expect(page.getByLabel("Paid from")).toHaveValue(/.+/); // default wallet preselected

  // Only amount + category are required: submit without a category first.
  await page.getByLabel("Amount").fill("45.50");
  await page.getByRole("button", { name: "Save entry" }).click();
  await expect(page.getByText("Choose a category.")).toBeVisible();
  await expect(page.getByLabel("Amount")).toHaveValue("45.50");

  // A date before the wallet's opening date explains it won't change the balance.
  await page.getByLabel("Date").fill("2000-01-01");
  await expect(page.getByText(/This date is before .*opening date/)).toBeVisible();
  await page
    .getByLabel("Date")
    .fill(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(Date.now()));
  await page.getByLabel("Time").fill("00:01");
  await expect(page.getByText(/This date is before .*opening date/)).toBeHidden();

  // The description suggests a category (the built-in keyword "lunch", or an earlier choice)
  // and preselects it; the user can still change it.
  await page.getByLabel("Description").fill(label);
  await expect(page.getByText(/^Suggested: .+Change it if it’s wrong\.$/)).toBeVisible();
  await expect(page.getByLabel("Category")).toHaveValue(/^[0-9a-f-]{36}\|/);
  await page.getByLabel("Tags").fill("e2e, phase5");
  await page.getByRole("button", { name: "Save entry" }).click();
  await expect(toast(page)).toContainText("Saved. Add another?");
  await expect(page.getByLabel("Amount")).toHaveValue(""); // fresh form for the next entry

  await page.goto(`/transactions?q=${encodeURIComponent(label)}`);
  await expect(main(page).getByTestId("history-summary")).toContainText("1 entry match");
  await main(page).getByTestId("history-table").getByRole("link", { name: label }).click();
  await expect(main(page).getByTestId("entry-amount")).toHaveText("−₹45.50");
  await expect(page.getByText("Food & Drinks › Lunch")).toBeVisible();
  const detailUrl = page.url();

  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByLabel("Amount")).toHaveValue("45.50");
  await page.getByLabel("Amount").fill("60");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(detailUrl);
  await expect(main(page).getByTestId("entry-amount")).toHaveText("−₹60");
  await expect(toast(page)).toContainText("Changes saved.");
  // Undo the edit from the toast: the old amount comes back.
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toContainText("Change undone.");
  await expect(main(page).getByTestId("entry-amount")).toHaveText("−₹45.50");

  // Filters: tag search + type + amount range find it; a range that excludes it doesn't.
  await page.goto("/transactions?q=phase5&type=expense&min=45&max=46");
  await expect(main(page).getByTestId("history-table")).toContainText(label);
  await page.goto(`/transactions?q=${encodeURIComponent(label)}&max=10`);
  await expectNothingListed(page);

  // Delete asks first; Cancel keeps it.
  await page.goto(detailUrl);
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("dialog")).toContainText("−₹45.50");
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toBeHidden(); // includes its closing animation
  await expect(main(page).getByTestId("entry-amount")).toBeVisible();

  await deleteOpenEntry(page);
  // A deleted entry's page is gone (404) until it's restored.
  expect((await page.request.get(detailUrl)).status()).toBe(404);
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toContainText("Restored.");
  expect((await page.request.get(detailUrl)).status()).toBe(200);

  // Clean up for good (soft delete).
  await page.goto(detailUrl);
  await deleteOpenEntry(page);
});

test("another user's transaction id is a 404 for this user", async ({ page }) => {
  const emailB = process.env.E2E_USER_B_EMAIL;
  const passwordB = process.env.E2E_USER_B_PASSWORD;
  test.skip(
    !emailB || !passwordB,
    "Set E2E_USER_B_EMAIL / E2E_USER_B_PASSWORD (a second test account) to check cross-user 404s.",
  );
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const b = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { error: signInError } = await b.auth.signInWithPassword({
    email: emailB!,
    password: passwordB!,
  });
  expect(signInError).toBeNull();
  const { data: wallet } = await b.rpc("ensure_default_account");
  const id = crypto.randomUUID();
  const { data: created, error } = await b.rpc("create_transaction", {
    p_tx: {
      id,
      type: "expense",
      amount_paise: 100,
      occurred_at: new Date().toISOString(),
      account_id: (wallet as { id: string }).id,
      description: "E2E cross-user probe",
    },
  });
  expect(error).toBeNull();
  expect((created as { status: string }).status).toBe("applied");
  try {
    for (const path of [`/transactions/${id}`, `/transactions/${id}/edit`]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
      await expect(page.getByRole("heading", { name: "We couldn’t find that" })).toBeVisible();
    }
  } finally {
    // B's probe is soft-deleted, like any entry the user deletes.
    await b.rpc("set_transaction_deleted", { p_id: id, p_deleted: true });
    await b.auth.signOut();
  }
});
