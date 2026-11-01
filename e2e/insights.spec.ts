import { type Page, expect, test } from "@playwright/test";

import { AUTH_FILE, E2E_EMAIL, E2E_PASSWORD, SIGNED_IN_SKIP_REASON } from "./routes";

// Phase 7 on the real project: sparse states, then real entries through to Insights, Money leaks
// and history, with the same totals on every screen. The made-up word has no category, so the
// entries are Unassigned too. Runs in the serial ledger projects and deletes what it saves.
test.skip(!E2E_EMAIL || !E2E_PASSWORD, SIGNED_IN_SKIP_REASON);
test.use({ storageState: AUTH_FILE });
test.describe.configure({ mode: "serial" });

const WORD = "zzkopi";
const main = (page: Page) => page.locator("#main");
const toast = (page: Page) => page.getByTestId("toast");

/** Under the default ₹50 threshold, and different on every run. */
const price = 20 + (Date.now() % 25);

async function deleteEntries(page: Page) {
  for (;;) {
    await page.goto(`/transactions?q=${WORD}`);
    await expect(
      main(page).getByRole("heading", { name: "Transactions", exact: true }),
    ).toBeVisible();
    const rows = main(page).getByRole("link", { name: new RegExp(WORD, "i") });
    const row = rows.locator("visible=true").first();
    if ((await rows.locator("visible=true").count()) === 0) return;
    await row.click();
    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(toast(page)).toContainText("Entry deleted.");
  }
}

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: AUTH_FILE });
  await deleteEntries(page);
  await page.close();
});

test("with no spending, both screens say so honestly", async ({ page }) => {
  await deleteEntries(page);
  await page.goto("/insights?period=all_time");
  await expect(
    main(page).getByRole("heading", { name: "Not enough data for insights yet" }),
  ).toBeVisible();
  await expect(main(page).getByTestId("trend-chart")).toHaveCount(0);
  await expect(main(page)).not.toContainText("NaN");
  await page.goto("/insights/leaks");
  await expect(main(page).getByRole("heading", { name: /repeated purchases/i })).toBeVisible();
});

test("one entry gives totals but no average, comparison or trend", async ({ page }) => {
  await page.goto("/add/text");
  await expect(async () => {
    await page.getByRole("textbox", { name: "What did you spend?" }).fill(`${WORD} ${price}`);
    await page.getByRole("button", { name: "Review entries" }).click();
    await expect(page.getByRole("heading", { name: /^Check/ })).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await page.getByRole("button", { name: /^Save 1 entry/ }).click();
  await expect(toast(page)).toContainText("Saved");

  await page.goto("/insights?period=today");
  await expect(main(page).getByTestId("insights-count")).toHaveText(/\d+/);
  await expect(main(page)).not.toContainText("NaN");
  await expect(main(page).getByTestId("trend-sparse")).toBeVisible();
  await expect(main(page).getByTestId("compare-sparse")).toContainText(
    "Not enough data to compare yet",
  );
  await deleteEntries(page);
});

test("Journey C: Insights, leaks and history agree on real entries", async ({ page }) => {
  const count = 3;
  const total = price * count;
  await page.goto("/add/text");
  const text = Array.from({ length: count }, () => `${WORD} ${price}`).join(", ");
  await expect(async () => {
    await page.getByRole("textbox", { name: "What did you spend?" }).fill(text);
    await page.getByRole("button", { name: "Review entries" }).click();
    await expect(page.getByRole("heading", { name: /^Check/ })).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await page.getByRole("button", { name: `Save all ${count} entries · ₹${total}` }).click();
  await expect(toast(page)).toContainText(`Saved ${count} entries`);

  // The sentence comes from the entries, and opens exactly them.
  await page.goto("/insights?period=this_month");
  const sentence = `You bought ${WORD} ${count} times for ₹${price} each: ₹${total} this month.`;
  const card = main(page).getByTestId("insight-card").filter({ hasText: sentence });
  await expect(card).toBeVisible();

  // The Unassigned group is visible, has its own row, and links to the queue.
  const unassigned = main(page).getByTestId("category-row").filter({ hasText: "Unassigned" });
  await expect(unassigned).toContainText(`₹${total}`);
  await expect(
    main(page).getByRole("link", { name: "Sort these in the Uncategorized queue" }),
  ).toHaveAttribute("href", "/categories?tab=uncategorized");

  await card.click();
  await expect(page).toHaveURL(/\/transactions\?/);
  await expect(main(page).getByTestId("history-summary")).toContainText(
    `${count} entries match · net spending ₹${total}`,
  );

  // Category card → Journey C page → the same total, count and entries.
  await page.goto("/insights?period=this_month");
  await main(page)
    .getByTestId("category-row")
    .filter({ hasText: "Unassigned" })
    .getByRole("link")
    .first()
    .click();
  await expect(main(page).getByRole("heading", { name: "Unassigned", level: 1 })).toBeVisible();
  await expect(main(page).getByTestId("category-net")).toHaveText(`₹${total}`);
  await expect(main(page).getByTestId("category-count")).toHaveText(String(count));

  // Money leaks: the same group, the same total, a what-if, and its entries in history.
  await page.goto("/insights/leaks?period=this_month");
  const group = main(page).getByTestId("leak-group").filter({ hasText: WORD });
  await expect(group).toContainText(`₹${total}`);
  await expect(group.getByTestId("what-if")).toHaveText(
    `If you made one fewer ₹${price} ${WORD} purchase in a period like this one, you’d spend ₹${price} less.`,
  );
  await group.getByRole("button", { name: "One more" }).click();
  await expect(group.getByTestId("what-if")).toContainText(`₹${price * 2} less`);
  await group.getByText(`See the ${count} entries`).click();
  await group.getByRole("link", { name: "Open in Transactions" }).click();
  await expect(main(page).getByTestId("history-summary")).toContainText(
    `${count} entries match · net spending ₹${total}`,
  );
  await expect(main(page).getByTestId("history-narrowing")).toContainText("small purchases");

  await deleteEntries(page);
});

test("a chart bar opens the entries behind it, without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  for (const text of [`${WORD} ${price}`, `${WORD} ${price} yesterday`]) {
    await page.goto("/add/text");
    await expect(async () => {
      await page.getByRole("textbox", { name: "What did you spend?" }).fill(text);
      await page.getByRole("button", { name: "Review entries" }).click();
      await expect(page.getByRole("heading", { name: /^Check/ })).toBeVisible({ timeout: 1_000 });
    }).toPass();
    await page.getByRole("button", { name: /^Save 1 entry/ }).click();
    await expect(toast(page)).toContainText("Saved");
  }

  await page.goto("/insights?period=all_time&trend=day");
  const bars = main(page).locator(".recharts-bar-rectangle path");
  await expect(bars).toHaveCount(2);
  await bars.last().click();
  await expect(page).toHaveURL(/\/transactions\?type=spending/);
  await expect(main(page).getByTestId("history-summary")).toContainText(
    `1 entry match · net spending ₹${price}`,
  );
  expect(errors).toEqual([]);
  await deleteEntries(page);
});

test("a bad custom range is refused out loud", async ({ page }) => {
  await page.goto("/insights?period=custom&from=2026-10-10&to=2026-10-01");
  await expect(main(page).getByRole("alert")).toContainText("before the start date");
});

test("an unknown category shows the not-found screen", async ({ page }) => {
  await page.goto("/insights/category/not-a-category");
  await expect(page.getByRole("heading", { name: "We couldn’t find that" })).toBeVisible();
});
