import { type Browser, type Page, expect, test } from "@playwright/test";

import { AUTH_FILE, E2E_EMAIL, E2E_PASSWORD, SIGNED_IN_SKIP_REASON } from "./routes";

// Journey F on the real project, then the same exports for a second user, who must see none of it.
// Runs in the serial ledger projects and deletes what it saves.
test.skip(!E2E_EMAIL || !E2E_PASSWORD, SIGNED_IN_SKIP_REASON);
test.use({ storageState: AUTH_FILE });
test.describe.configure({ mode: "serial", timeout: 120_000 });

const WORD = "zzreportitem";
const main = (page: Page) => page.locator("#main");
const toast = (page: Page) => page.getByTestId("toast");
const report = (page: Page) => main(page).getByTestId("report");
const AMOUNT = 300 + (Date.now() % 90);

async function logEntry(page: Page, text: string) {
  await page.goto("/add/text");
  await expect(async () => {
    await page.getByRole("textbox", { name: "What did you spend?" }).fill(text);
    await page.getByRole("button", { name: "Review entries" }).click();
    await expect(page.getByRole("heading", { name: /^Check/ })).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await page.getByRole("button", { name: /^Save 1 entry/ }).click();
  await expect(toast(page)).toContainText("Saved");
}

async function deleteEntries(page: Page) {
  for (;;) {
    await page.goto(`/transactions?q=${WORD}`);
    await expect(
      main(page).getByRole("heading", { name: "Transactions", exact: true }),
    ).toBeVisible();
    const rows = main(page)
      .getByRole("link", { name: new RegExp(WORD, "i") })
      .locator("visible=true");
    if ((await rows.count()) === 0) return;
    await rows.first().click();
    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(toast(page)).toContainText("Entry deleted.");
  }
}

test.afterAll(async ({ browser }) => {
  test.setTimeout(60_000);
  const page = await browser.newPage({ storageState: AUTH_FILE });
  await deleteEntries(page);
  await page.close();
});

test("Journey F: review, choose, then export a report that adds up", async ({ page, context }) => {
  await deleteEntries(page);
  await logEntry(page, `${WORD} ${AMOUNT}`);

  await page.goto("/reports?period=this_month&details=0");
  await expect(main(page).getByTestId("report-expenses")).toContainText(`₹`);
  const spent = await main(page).getByTestId("report-expenses").textContent();
  await expect(report(page)).toContainText("Balance so far");
  await expect(main(page).getByTestId("report-entries")).toHaveCount(0);

  // The same period on Insights shows the same spending.
  await page.goto("/insights?period=this_month");
  await expect(main(page)).toContainText(spent!.replace("−", ""));

  // Choosing entries shows them; nothing has left the device.
  await page.goto("/reports?period=this_month&details=0");
  await main(page).getByRole("checkbox", { name: "Every entry" }).check();
  await main(page).getByRole("button", { name: "Update preview" }).click();
  await expect(main(page).getByTestId("report-entries")).toContainText(new RegExp(WORD, "i"));
  await expect(main(page).getByTestId("report-exports")).toContainText("Nothing is sent to anyone");

  // A real PDF and a correct CSV, of exactly what's on the screen.
  const [pdf] = await Promise.all([
    page.waitForEvent("download"),
    main(page).getByRole("link", { name: "Download PDF" }).click(),
  ]);
  expect(pdf.suggestedFilename()).toMatch(/^pocketpulse-report-.*\.pdf$/);
  const pdfHref = await main(page).getByRole("link", { name: "Download PDF" }).getAttribute("href");
  const pdfResponse = await page.request.get(pdfHref!);
  expect(pdfResponse.headers()["content-type"]).toBe("application/pdf");
  expect(pdfResponse.headers()["cache-control"]).toContain("no-store");
  expect((await pdfResponse.body()).subarray(0, 5).toString()).toBe("%PDF-");

  const csvHref = await main(page).getByRole("link", { name: "Download CSV" }).getAttribute("href");
  const csv = await (await page.request.get(csvHref!)).text();
  const row = csv.split("\r\n").find((line) => line.toLowerCase().includes(WORD));
  expect(row).toContain(`INR,${AMOUNT}.00,-${AMOUNT}.00`);

  // The text summary goes to this device's clipboard.
  await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => undefined);
  await main(page).getByRole("button", { name: "Copy text summary" }).click();
  await expect(main(page).getByRole("button", { name: "Copied" })).toBeVisible();

  // A finished period says closing, not "so far", and has a historical date.
  await page.goto("/reports?period=previous_month");
  await expect(report(page)).toContainText("Closing balance");
  await expect(report(page)).not.toContainText("Balance so far");
  await expect(main(page).getByTestId("report-opening")).toBeVisible();
});

test("a hidden category leaves the export but stays in the totals", async ({ page }) => {
  await logEntry(page, `tea ${WORD} ${AMOUNT}`);
  await page.goto("/reports?period=this_month&details=1");
  await expect(main(page).getByTestId("report-categories")).toContainText("Food & Drinks");
  const net = await main(page).getByTestId("report-net").textContent();
  const label = await main(page).locator("label", { hasText: "Food & Drinks" }).first();
  await main(page).getByText("Hide categories").click();
  await label.getByRole("checkbox").check();
  await main(page).getByRole("button", { name: "Update preview" }).click();
  await expect(main(page).getByTestId("report-categories")).toContainText("Other categories");
  await expect(main(page).getByTestId("report-categories")).not.toContainText("Food & Drinks");
  await expect(main(page).getByTestId("report-net")).toHaveText(net!);
  await deleteEntries(page);
});

async function signInAsB(browser: Browser) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(process.env.E2E_USER_B_EMAIL!);
  await page.getByLabel("Password").fill(process.env.E2E_USER_B_PASSWORD!);
  await page.getByRole("button", { name: /^Sign in/ }).click();
  await page.waitForURL(/\/(home|onboarding)/);
  return { context, page };
}

test("another user's reports and exports never hold this user's data", async ({
  page,
  browser,
}) => {
  test.skip(
    !process.env.E2E_USER_B_EMAIL || !process.env.E2E_USER_B_PASSWORD,
    "Needs E2E_USER_B_EMAIL / E2E_USER_B_PASSWORD.",
  );
  await deleteEntries(page);
  await logEntry(page, `${WORD} ${AMOUNT}`);

  // User A's own export has the entry, which is what makes the checks below mean something.
  const mine = await page.request.get("/settings/data/export?format=json");
  const own = (await mine.json()) as {
    tables: { transactions: { id: string; description: string | null; owner_id: string }[] };
  };
  const entry = own.tables.transactions.find((tx) => tx.description?.toLowerCase() === WORD);
  expect(entry).toBeDefined();
  const ownerA = entry!.owner_id;

  const { context, page: b } = await signInAsB(browser);
  try {
    const query = "period=all_time&details=1&notes=1&compare=0";
    await b.goto(`/reports?${query}`);
    const shown = await b.locator("#main").textContent();
    expect(shown!.toLowerCase()).not.toContain(WORD);

    const csv = await (await b.request.get(`/reports/export?format=csv&${query}`)).text();
    expect(csv.toLowerCase()).not.toContain(WORD);

    const pdf = await b.request.get(`/reports/export?format=pdf&${query}`);
    expect(pdf.ok()).toBe(true);
    expect((await pdf.body()).toString("latin1").toLowerCase()).not.toContain(WORD);

    const entries = await (await b.request.get("/settings/data/export?format=csv")).text();
    expect(entries.toLowerCase()).not.toContain(WORD);
    expect(entries).not.toContain(entry!.id);

    const raw = await (await b.request.get("/settings/data/export?format=json")).text();
    expect(raw).not.toContain(entry!.id);
    expect(raw).not.toContain(ownerA);
    expect(raw.toLowerCase()).not.toContain(WORD);
    const exported = JSON.parse(raw) as { tables: Record<string, Record<string, unknown>[]> };
    for (const [table, rows] of Object.entries(exported.tables)) {
      for (const row of rows) {
        const owner = row.owner_id ?? row.id;
        if (table === "profiles" || row.owner_id) expect(owner, table).not.toBe(ownerA);
      }
    }

    // And opening A's entry directly is a plain 404.
    expect((await b.request.get(`/transactions/${entry!.id}`)).status()).toBe(404);
  } finally {
    await context.close();
  }
  await deleteEntries(page);
});

test("exports need a signed-in user", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  for (const path of ["/reports/export?format=csv", "/settings/data/export?format=json"]) {
    const response = await context.request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBeGreaterThanOrEqual(300);
    expect(response.status(), path).toBeLessThan(400);
    expect(response.headers().location, path).toContain("/login");
  }
  await context.close();
});
