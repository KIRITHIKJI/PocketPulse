import { type BrowserContext, type Page, expect, test } from "@playwright/test";

import { AUTH_FILE, E2E_EMAIL, E2E_PASSWORD, SIGNED_IN_SKIP_REASON } from "./routes";

// Journey G and everything around it, on the real project with the real service worker. These
// assert exact balance changes, so they run in the serial ledger projects. Every entry is deleted
// again (soft delete, like a user delete).
test.skip(!E2E_EMAIL || !E2E_PASSWORD, SIGNED_IN_SKIP_REASON);
test.use({ storageState: AUTH_FILE, serviceWorkers: "allow" });
test.describe.configure({ mode: "serial", timeout: 180_000 });

const main = (page: Page) => page.locator("#main");
const toast = (page: Page) => page.getByTestId("toast");
const banner = (page: Page) => page.getByTestId("sync-banner");

/**
 * Amounts this spec records entries at. A test that fails partway never reaches its own cleanup,
 * and its entries would then count as spending (and a logged day) for every later spec on the
 * shared account, so `afterEach` deletes whatever is left at these amounts, pass or fail.
 */
const usedAmounts = new Set<string>(["37.11", "61.25", "42.50"]);

function uniqueAmount(): { text: string; paise: number } {
  const paise = 1_000 + (Date.now() % 8_999);
  const text = `${Math.trunc(paise / 100)}.${String(paise % 100).padStart(2, "0")}`;
  usedAmounts.add(text);
  return { text, paise };
}

function rupees(paise: number): string {
  const r = Math.trunc(paise / 100);
  const p = paise % 100;
  return `₹${r}${p ? `.${String(p).padStart(2, "0")}` : ""}`;
}

async function balanceOn(page: Page): Promise<number> {
  await expect(main(page).getByTestId("home-balance")).toBeVisible();
  return Number(await main(page).getByTestId("home-balance").getAttribute("data-paise"));
}

/** A second, plain session of the same account: "the other device". */
async function otherDevice(context: BrowserContext) {
  const browser = context.browser()!;
  const other = await browser.newContext({ storageState: AUTH_FILE, serviceWorkers: "block" });
  const page = await other.newPage();
  return { page, other };
}

async function readyForOffline(page: Page) {
  await page.goto("/home");
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker?.controller)), {
      timeout: 30_000,
    })
    .toBe(true);
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const cache = await caches.open("pp-pages-v1");
          return (await cache.keys()).map((r) => new URL(r.url).pathname);
        }),
      { timeout: 90_000 },
    )
    .toEqual(expect.arrayContaining(["/home", "/add", "/transactions/new", "/settings/sync"]));
}

async function openTile(page: Page, label: string) {
  const tile = page
    .getByRole("list", { name: "Quick-add tiles" })
    .getByRole("button", { name: new RegExp(`^${label}\\b`) });
  await expect(async () => {
    await tile.click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1_000 });
  }).toPass();
}

async function addTile(page: Page, amount: { text: string; paise: number }) {
  await openTile(page, "Tea");
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Amount").fill(amount.text);
  const remember = sheet.getByRole("checkbox", { name: /usual amount/ });
  if (await remember.isVisible()) await remember.uncheck();
  await sheet.getByRole("button", { name: `Save ${rupees(amount.paise)}` }).click();
  await expect(sheet).toBeHidden();
}

/** The queued operation with this amount, read from the device's own database. */
function queuedOp(page: Page, paise: number) {
  return page.evaluate(
    (amount) =>
      new Promise<{ opId: string; command: { kind: string; draft?: { id: string } } } | null>(
        (resolve, reject) => {
          const open = indexedDB.open("pocketpulse-offline");
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const all = open.result.transaction("ops").objectStore("ops").getAll();
            all.onsuccess = () => {
              open.result.close();
              const ops = all.result as { amountPaise: number; opId: string }[];
              resolve((ops.find((op) => op.amountPaise === amount) as never) ?? null);
            };
          };
        },
      ),
    paise,
  );
}

async function syncCommand(page: Page, command: unknown) {
  const response = await page.request.post("/api/sync", { data: { command, remember: null } });
  expect(response.status()).toBe(200);
  return (await response.json()) as { ok: boolean; status: string; message?: string };
}

const newId = () => crypto.randomUUID();

async function removeEntry(page: Page, id: string) {
  const result = await syncCommand(page, { kind: "delete", opId: newId(), id });
  expect(result.ok).toBe(true);
}

test.afterEach(async ({ browser }) => {
  const page = await browser.newPage({ storageState: AUTH_FILE });
  for (const amount of usedAmounts) {
    await page.goto(`/transactions?type=expense&min=${amount}&max=${amount}`);
    await expect(main(page).getByTestId("history-summary")).toBeVisible();
    const hrefs = await main(page)
      .getByTestId("history-table")
      .getByRole("link")
      .evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""));
    const ids = new Set(
      hrefs.flatMap((href) => /^\/transactions\/([0-9a-f-]{36})$/.exec(href)?.slice(1) ?? []),
    );
    for (const id of ids) await removeEntry(page, id);
  }
  await page.close();
});

/** How many live rows the account has at exactly this amount. */
async function rowsAt(page: Page, amount: string) {
  await page.goto(`/transactions?type=expense&min=${amount}&max=${amount}`);
  const summary = await main(page).getByTestId("history-summary").innerText();
  return Number(/^\d+/.exec(summary)![0]);
}

test("Journey G: add offline, survive a reload, sync once, correct on another device", async ({
  page,
  context,
}) => {
  await readyForOffline(page);
  const { page: laptop, other } = await otherDevice(context);
  await laptop.goto("/home");
  const before = await balanceOn(laptop);
  const amount = uniqueAmount();

  await context.setOffline(true);
  await expect(banner(page)).toContainText("You’re offline");

  // A cold start with no network: the saved screen opens, and says how old it is.
  await page.reload();
  await expect(banner(page)).toContainText("Figures here are from");
  await addTile(page, amount);
  await expect(toast(page)).toContainText("Saved on this device");

  const waiting = main(page).getByTestId("waiting-entries");
  await expect(waiting).toContainText("Tea");
  await expect(waiting).toContainText(rupees(amount.paise));
  await expect(waiting.getByTestId("sync-status").first()).toHaveAttribute(
    "data-status",
    "pending",
  );
  await expect(waiting).toContainText("isn’t in the figures");
  // The balance on screen hasn't been faked: it's still the last figure the server gave.
  expect(await balanceOn(page)).toBe(before);

  // Closing the app mustn't lose it.
  await page.reload();
  await expect(main(page).getByTestId("waiting-entries")).toContainText(rupees(amount.paise));
  const op = await queuedOp(page, amount.paise);
  expect(op?.command.kind).toBe("create");

  // Nothing has reached the other device.
  await laptop.reload();
  expect(await balanceOn(laptop)).toBe(before);

  await context.setOffline(false);
  await expect(toast(page).or(banner(page))).toBeVisible();
  await expect(main(page).getByTestId("waiting-entries")).toBeHidden({ timeout: 30_000 });
  await expect(main(page).getByTestId("home-balance")).toHaveAttribute(
    "data-paise",
    String(before - amount.paise),
  );

  await laptop.reload();
  expect(await balanceOn(laptop)).toBe(before - amount.paise);
  expect(await rowsAt(laptop, amount.text)).toBe(1);

  // A replay of the very same operation changes nothing.
  const replay = await syncCommand(page, op!.command);
  expect(replay).toMatchObject({ ok: true, status: "duplicate" });
  await laptop.goto("/home");
  expect(await balanceOn(laptop)).toBe(before - amount.paise);

  await removeEntry(page, op!.command.draft!.id);
  await laptop.reload();
  expect(await balanceOn(laptop)).toBe(before);
  await other.close();
});

test("the answer gets lost after saving: a retry finds it, and there's one entry", async ({
  page,
  context,
}) => {
  await readyForOffline(page);
  const before = await balanceOn(page);
  const amount = uniqueAmount();

  await context.setOffline(true);
  await addTile(page, amount);
  const op = await queuedOp(page, amount.paise);

  let reachedServer = 0;
  await page.route("**/api/sync", async (route) => {
    await route.fetch();
    await route.abort("connectionreset");
    reachedServer += 1;
  });
  await context.setOffline(false);
  await expect.poll(() => reachedServer, { timeout: 30_000 }).toBeGreaterThan(0);
  await page.unroute("**/api/sync");

  await page.goto("/settings/sync");
  await main(page).getByRole("button", { name: "Sync now" }).click();
  await expect(main(page).getByRole("heading", { name: /Everything on this device/ })).toBeVisible({
    timeout: 30_000,
  });

  expect(await rowsAt(page, amount.text)).toBe(1);
  await page.goto("/home");
  expect(await balanceOn(page)).toBe(before - amount.paise);
  await removeEntry(page, op!.command.draft!.id);
});

test("a save that dies on a bad connection goes to the queue instead of being lost", async ({
  page,
}) => {
  await readyForOffline(page);
  const before = await balanceOn(page);
  const amount = uniqueAmount();

  await page.route(
    "**/home",
    (route) => (route.request().method() === "POST" ? route.abort() : route.continue()),
    { times: 1 },
  );
  await addTile(page, amount);
  await expect(toast(page)).toContainText(/Saved on this device|synced/);
  await expect(main(page).getByTestId("home-balance")).toHaveAttribute(
    "data-paise",
    String(before - amount.paise),
    { timeout: 30_000 },
  );
  const op = await queuedOp(page, amount.paise);
  expect(await rowsAt(page, amount.text)).toBe(1);
  await removeEntry(page, op!.command.draft!.id);
});

test("Undo offline removes the entry before it ever leaves the device", async ({
  page,
  context,
}) => {
  await readyForOffline(page);
  const amount = uniqueAmount();
  await context.setOffline(true);
  await addTile(page, amount);
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toContainText("It was never sent");
  await expect(main(page).getByTestId("waiting-entries")).toBeHidden();
  expect(await queuedOp(page, amount.paise)).toBeNull();
  await context.setOffline(false);
});

test("the full form and typed entry both work offline", async ({ page, context, isMobile }) => {
  test.skip(isMobile, "The screens are the same; Journey G covers the phone.");
  await readyForOffline(page);
  const before = await balanceOn(page);
  const typed = uniqueAmount();
  const form = { text: "37.11", paise: 3711 };

  await context.setOffline(true);

  await page.goto("/add/text");
  await main(page).getByRole("textbox").first().fill(`offline chai ${typed.text}`);
  await page.getByRole("button", { name: "Review entries" }).click();
  await page.getByRole("button", { name: /^Save 1 entry/ }).click();
  await expect(toast(page)).toContainText("Saved on this device");

  await page.goto("/transactions/new");
  await page.getByLabel("Amount").fill(form.text);
  await page.getByRole("button", { name: "Save entry" }).click();
  // The same checks run on the device: no category, no entry.
  await expect(page.getByText("Choose a category.")).toBeVisible();
  await page.getByLabel("Description").fill("Offline lunch");
  await expect(page.getByText(/^Suggested: /)).toBeVisible();
  await page.getByRole("button", { name: "Save entry" }).click();
  await expect(toast(page)).toContainText("Saved on this device");

  await page.goto("/home");
  await expect(main(page).getByTestId("waiting-entries")).toContainText(rupees(form.paise));
  const first = await queuedOp(page, form.paise);
  const second = await queuedOp(page, typed.paise);

  await context.setOffline(false);
  await expect(main(page).getByTestId("home-balance")).toHaveAttribute(
    "data-paise",
    String(before - form.paise - typed.paise),
    { timeout: 45_000 },
  );

  await removeEntry(page, first!.command.draft!.id);
  const batch = (second!.command as unknown as { drafts: { id: string }[] }).drafts;
  await removeEntry(page, batch[0]!.id);
});

test("an offline edit that meets a newer one waits for a decision, then lands", async ({
  page,
  context,
  isMobile,
}) => {
  test.skip(isMobile, "The conflict screen runs once; it's the same screen on a phone.");
  await readyForOffline(page);
  const before = await balanceOn(page);
  const { page: laptop, other } = await otherDevice(context);
  const amount = uniqueAmount();
  await addTile(page, amount);
  await expect(toast(page)).toContainText(`Saved ${rupees(amount.paise)}`);
  await page.goto(`/transactions?type=expense&min=${amount.text}&max=${amount.text}`);
  const link = main(page).getByTestId("history-table").getByRole("link").first();
  const entryId = (await link.getAttribute("href"))!.split("/").at(-1)!;
  await page.goto(`/transactions/${entryId}/edit`);
  await expect(page.getByLabel("Amount")).toHaveValue(amount.text);

  await context.setOffline(true);
  await page.getByLabel("Amount").fill("61.25");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(toast(page)).toContainText("Change saved on this device");

  // Meanwhile, the other device changes the same entry.
  await laptop.goto(`/transactions/${entryId}/edit`);
  await laptop.getByLabel("Amount").fill("42.50");
  await laptop.getByRole("button", { name: "Save changes" }).click();
  await expect(laptop).toHaveURL(new RegExp(`/transactions/${entryId}$`));

  await expect(page).toHaveURL(/\/settings\/sync$/);
  await expect(main(page).getByTestId("sync-op")).toContainText("₹61.25");

  await context.setOffline(false);
  await expect(banner(page)).toContainText("couldn’t sync", { timeout: 30_000 });
  const versions = main(page).getByTestId("conflict-versions");
  await expect(versions).toContainText("₹61.25");
  await expect(versions).toContainText("₹42.50");
  await laptop.goto("/home");
  // The server keeps the newer value until a decision is made.
  expect(await balanceOn(laptop)).toBe(before - 4250);

  await main(page).getByRole("button", { name: "Use my change" }).click();
  await expect(main(page).getByRole("heading", { name: /Everything on this device/ })).toBeVisible({
    timeout: 30_000,
  });
  await laptop.reload();
  expect(await balanceOn(laptop)).toBe(before - 6125);

  await removeEntry(page, entryId);
  await other.close();
});

test("offline, a screen that wasn't saved says so and leads back to recording", async ({
  page,
  context,
}) => {
  await readyForOffline(page);
  await context.setOffline(true);
  await page.goto("/insights/leaks");
  await expect(page.getByRole("heading", { name: /isn’t saved on this device/ })).toBeVisible();
  await page.getByRole("link", { name: "Add an entry" }).click();
  await expect(page).toHaveURL(/\/add$/);
  await expect(page.getByRole("list", { name: "Quick-add tiles" })).toBeVisible();

  // Reconnecting on the stand-in screen opens the page that was asked for.
  await page.goto("/insights/leaks");
  await expect(page.getByRole("heading", { name: /isn’t saved on this device/ })).toBeVisible();
  await context.setOffline(false);
  await expect(main(page).getByRole("heading", { name: "Money leaks" })).toBeVisible();
});

test("forms that need a connection say so, and keep what was typed", async ({ page, context }) => {
  await page.goto("/budgets");
  await context.setOffline(true);
  await main(page).getByRole("button", { name: "Add budget" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Limit").fill("500");
  await dialog.getByRole("button", { name: "Add budget" }).click();
  await expect(dialog.getByRole("alert")).toContainText("You’re offline");
  await expect(dialog.getByLabel("Limit")).toHaveValue("500");
  await context.setOffline(false);
});

test("reminders say plainly that they only show while the app is open", async ({ page }) => {
  await page.goto("/reminders");
  await expect(main(page).getByTestId("reminders-open-note")).toContainText(
    "Reminders only appear while PocketPulse is open",
  );
  await page.goto("/settings");
  await expect(main(page).getByText(/only appear while PocketPulse is open/)).toBeVisible();
});

test("signing out clears saved screens, and a queue waits for its own account", async ({
  browser,
}) => {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    serviceWorkers: "allow",
  });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_EMAIL!);
  await page.getByLabel("Password").fill(E2E_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await readyForOffline(page);

  const amount = uniqueAmount();
  await context.setOffline(true);
  await addTile(page, amount);
  // Block uploads before reconnecting, or the entry can sync before sign-out is tapped.
  await page.route("**/api/sync", (route) => route.abort());
  await context.setOffline(false);
  await expect(page.getByTestId("account-menu")).toBeVisible();

  await page.getByTestId("account-menu").click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("dialog")).toContainText("hasn’t synced");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);

  await expect
    .poll(() =>
      page.evaluate(async () => {
        const cache = await caches.open("pp-pages-v1");
        return (await cache.keys()).length;
      }),
    )
    .toBe(0);
  const kept = await queuedOp(page, amount.paise);
  expect(kept).not.toBeNull();
  await page.unroute("**/api/sync");
  await page.close();

  const again = await context.newPage();
  await again.goto("/login");
  await again.getByLabel("Email").fill(E2E_EMAIL!);
  await again.getByLabel("Password").fill(E2E_PASSWORD!);
  await again.getByRole("button", { name: "Sign in" }).click();
  await expect(again).toHaveURL(/\/home$/);
  // It went up on its own, with no tap, once its own account was back.
  await expect.poll(() => rowsAt(again, amount.text), { timeout: 60_000 }).toBe(1);
  await removeEntry(again, kept!.command.draft!.id);
  await context.close();
});

test("the app is installable, and the sync route answers only for its own session", async ({
  page,
  browser,
  baseURL,
}) => {
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({
    display: "standalone",
    start_url: "/home",
    name: "PocketPulse",
  });
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(
    expect.arrayContaining(["192x192", "512x512"]),
  );
  expect(manifest.icons.some((i: { purpose: string }) => i.purpose === "maskable")).toBe(true);
  for (const { src } of manifest.icons as { src: string }[]) {
    const icon = await page.request.get(src);
    expect(icon.status()).toBe(200);
    expect(icon.headers()["content-type"]).toBe("image/png");
  }
  const worker = await page.request.get("/sw.js", { maxRedirects: 0 });
  expect(worker.status()).toBe(200);
  expect(worker.headers()["cache-control"]).toContain("no-cache");

  const signedOut = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const anonymous = await signedOut.request.post(`${baseURL}/api/sync`, {
    data: {},
    maxRedirects: 0,
  });
  expect(anonymous.status()).toBe(401);
  await signedOut.close();

  const crossSite = await page.request.post("/api/sync", {
    data: {},
    headers: { origin: "https://example.com" },
  });
  expect(crossSite.status()).toBe(403);
});
