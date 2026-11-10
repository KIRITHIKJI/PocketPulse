import { existsSync } from "node:fs";

import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { type Page, expect, test } from "@playwright/test";

import { AUTH_FILE, E2E_EMAIL, E2E_PASSWORD, SIGNED_IN_SKIP_REASON } from "./routes";

// Rewards, reminders and account deletion on the real project. Account deletion only ever touches
// a throwaway user this spec created through the admin API.
test.skip(!E2E_EMAIL || !E2E_PASSWORD, SIGNED_IN_SKIP_REASON);
test.use({ storageState: AUTH_FILE });
test.describe.configure({ mode: "serial", timeout: 120_000 });

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const WORD = "zzrewarditem";
const main = (page: Page) => page.locator("#main");
const toast = (page: Page) => page.getByTestId("toast");
const dialog = (page: Page) => page.getByRole("dialog");
const xpOf = async (page: Page) =>
  Number(/^(\d+) XP/.exec((await main(page).getByTestId("reward-xp").textContent()) ?? "")?.[1]);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

async function signedInClient(): Promise<SupabaseClient> {
  const client = createClient(url, publishable, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({
    email: E2E_EMAIL!,
    password: E2E_PASSWORD!,
  });
  if (error) throw new Error(`sign-in failed: ${error.code}`);
  return client;
}

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
    await dialog(page).getByRole("button", { name: "Delete" }).click();
    await expect(toast(page)).toContainText("Entry deleted.");
  }
}

/** Everything that counts as a pop-up: never more than one at a time. */
const popUps = async (page: Page) =>
  (await page.getByTestId("toast").count()) + (await page.getByTestId("level-up").count());

/** Unlocked achievements, which stay unlocked (with their XP) whatever happens to entries. */
async function unlockedXp(page: Page) {
  await page.goto("/rewards/achievements?show=unlocked");
  await expect(
    main(page).getByRole("heading", { name: "Achievements", exact: true }),
  ).toBeVisible();
  const badges = main(page).locator('[data-testid="achievement"][data-state="unlocked"]');
  let sum = 0;
  for (const text of await badges.allTextContents())
    sum += Number(/\+(\d+) XP/.exec(text)?.[1] ?? 0);
  return sum;
}

test("daily XP follows the entries; achievements stay; re-adding never earns twice", async ({
  page,
}) => {
  await deleteEntries(page);
  await page.goto("/rewards");
  await expect(main(page).getByTestId("reward-xp")).toBeVisible();
  const without = await xpOf(page);
  const achievementsBefore = await unlockedXp(page);

  // Saving: one confirmation at a time, whatever the save earned.
  await page.goto("/add/text");
  await expect(async () => {
    await page.getByRole("textbox", { name: "What did you spend?" }).fill(`${WORD} 50`);
    await page.getByRole("button", { name: "Review entries" }).click();
    await expect(page.getByRole("heading", { name: /^Check/ })).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await page.getByRole("button", { name: /^Save 1 entry/ }).click();
  await expect(toast(page)).toContainText("Saved");
  for (let i = 0; i < 15; i += 1) {
    expect(await popUps(page)).toBeLessThanOrEqual(1);
    await page.waitForTimeout(200);
  }

  await page.goto("/rewards");
  await expect(main(page).getByRole("heading", { name: "Today and this week" })).toBeVisible();
  const xp = await xpOf(page);
  expect(xp).toBeGreaterThanOrEqual(without);
  await page.goto("/rewards/status");
  await expect(main(page).getByTestId("streak-daily")).not.toHaveText(/^0/);
  await page.goto("/rewards/achievements");
  await expect(main(page).getByTestId("achievement")).toHaveCount(7);

  // Same data, same XP, however many times it's worked out.
  await page.goto("/rewards");
  await page.reload();
  await expect(main(page).getByTestId("reward-xp")).toBeVisible();
  expect(await xpOf(page)).toBe(xp);

  // Deleting the entry puts the daily XP back where it was; an achievement it unlocked stays.
  // Re-adding earns the day once more, not twice.
  const kept = (await unlockedXp(page)) - achievementsBefore;
  for (let round = 0; round < 2; round += 1) {
    await deleteEntries(page);
    await page.goto("/rewards");
    await expect(main(page).getByTestId("reward-xp")).toBeVisible();
    expect(await xpOf(page)).toBe(without + kept);
    if (round === 0) {
      await logEntry(page, `${WORD} 50`);
      await page.goto("/rewards");
      await expect(main(page).getByTestId("reward-xp")).toBeVisible();
      expect(await xpOf(page)).toBe(xp);
    }
  }
  await expect(main(page)).not.toContainText(/broke|lost your|don.t lose/i);
});

test("a mission can be skipped and brought back, and a review only counts once", async ({
  page,
}) => {
  await page.goto("/rewards/missions");
  const daily = main(page).getByTestId("missions-daily");
  const mission = daily.locator('[data-testid="mission"][data-code="log_today"]');
  await expect(mission).toBeVisible();
  await mission.getByRole("button", { name: "Skip the Log today mission" }).click();
  await expect(mission).toHaveCount(0);
  await daily.getByRole("button", { name: "Bring back the Log today mission" }).click();
  await expect(mission).toBeVisible();

  // On a phone the groups are one at a time; on a laptop all three columns show.
  await expect(main(page).getByTestId("missions-once")).toBeAttached();

  await page.goto("/rewards");
  const review = main(page).getByRole("button", { name: "I’ve reviewed this week" });
  if ((await review.count()) > 0) {
    await review.click();
    await expect(
      main(page).locator('[data-testid="mission"][data-code="weekly_review"]'),
    ).toHaveAttribute("data-state", "done");
  }
  const xp = await xpOf(page);
  await page.reload();
  await expect(main(page).getByTestId("reward-xp")).toBeVisible();
  expect(await xpOf(page)).toBe(xp);
});

test("Home links its progress to Player status and shows Safe to Spend as an estimate", async ({
  page,
}) => {
  await page.goto("/home");
  await expect(main(page).getByTestId("player-chip")).toHaveAttribute("href", "/rewards/status");
  const card = main(page).getByTestId("safe-to-spend-card");
  await expect(card).toContainText("Safe to Spend · estimate");
  await expect(card).toHaveAttribute("href", "/safe-to-spend");
  await main(page).getByTestId("player-chip").click();
  await expect(page).toHaveURL(/\/rewards\/status$/);
  await expect(
    main(page).getByRole("heading", { name: "Player status", exact: true }),
  ).toBeVisible();
});

test("a reminder appears once, only when on, and can be dismissed", async ({ page }) => {
  const client = await signedInClient();
  const { data: before } = await client.from("notification_preferences").select("*").single();
  const clear = () => client.from("notifications").delete().like("dedupe_key", "review:%");
  try {
    await clear();
    const today = new Date(Date.now() + 5.5 * 3_600_000).getUTCDay();

    // Off: nothing appears.
    await client
      .from("notification_preferences")
      .update({ all_disabled: false, weekly_review: false, weekly_review_day: today })
      .eq("owner_id", before!.owner_id);
    await page.goto("/reminders");
    await page.waitForLoadState("networkidle");
    const note = main(page).getByTestId("notification").filter({ hasText: "weekly review" });
    await expect(note).toHaveCount(0);

    // Turned on from the screen.
    await main(page)
      .getByRole("switch", { name: /^Weekly review/ })
      .click();
    await main(page)
      .getByTestId("reminder-switches")
      .getByRole("button", { name: /^Save/ })
      .click();
    await expect(main(page).getByTestId("reminder-switches").getByRole("status")).toBeVisible();
    await page.reload();
    await expect(note).toHaveCount(1);
    await expect(page.getByTestId("notification-bell")).toHaveAttribute("aria-label", /unread/);

    // It doesn't repeat, and a dismissed one stays gone.
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(note).toHaveCount(1);
    await note.getByRole("button", { name: /^Dismiss/ }).click();
    await expect(note).toHaveCount(0);
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(note).toHaveCount(0);

    // The schedule saves, and a lead time out of range is refused with a reason.
    const bills = main(page).getByLabel("Days before a bill");
    await bills.fill("99");
    await main(page).getByRole("button", { name: "Save schedule" }).click();
    await expect(main(page).getByText("Use a whole number from 0 to 14.")).toBeVisible();
    await bills.fill("5");
    await main(page).getByRole("button", { name: "Save schedule" }).click();
    await expect(main(page).getByText("Saved.")).toBeVisible();
    await page.reload();
    await expect(main(page).getByLabel("Days before a bill")).toHaveValue("5");

    // "Turn off all" beats the switch that's still on.
    // Off first: a check from the page before could otherwise recreate it after the clear.
    await client
      .from("notification_preferences")
      .update({ all_disabled: true, weekly_review: true })
      .eq("owner_id", before!.owner_id);
    await page.goto("/settings/data");
    await page.waitForLoadState("networkidle");
    await clear();
    await page.goto("/reminders");
    await page.waitForLoadState("networkidle");
    await expect(note).toHaveCount(0);
  } finally {
    const { owner_id: owner, updated_at: _updated, ...restore } = before!;
    await client.from("notification_preferences").update(restore).eq("owner_id", owner);
    await clear();
  }
});

test.describe("deleting an account", () => {
  const secret = process.env.SUPABASE_SECRET_KEY;
  test.skip(!secret, "Needs SUPABASE_SECRET_KEY to create a throwaway user.");
  test.use({ storageState: { cookies: [], origins: [] } });

  test("removes a throwaway account, and only after the phrase and password", async ({ page }) => {
    const admin = createClient(url, secret!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const email = `pp-delete-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.test`;
    const password = `Throwaway-${Date.now()}!`;
    // This spec must never be able to reach the real test accounts.
    for (const kept of [E2E_EMAIL, process.env.E2E_USER_B_EMAIL]) expect(email).not.toBe(kept);
    expect(email).toMatch(/^pp-delete-\d+-\d+@example\.test$/);

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(error).toBeNull();
    const id = data.user!.id;
    try {
      await page.goto("/login");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: /^Sign in/ }).click();
      await page.waitForURL(/\/(home|onboarding)/);

      await page.goto("/settings/data");
      const phrase = main(page).getByLabel("Type DELETE MY ACCOUNT");
      const secretField = main(page).getByLabel("Your password");
      const submit = main(page).getByRole("button", { name: "Delete my account permanently" });

      // The wrong phrase, then the wrong password: nothing happens.
      await phrase.fill("delete it");
      await secretField.fill(password);
      await submit.click();
      await expect(main(page).getByText("Type DELETE MY ACCOUNT exactly.")).toBeVisible();

      await phrase.fill("DELETE MY ACCOUNT");
      await secretField.fill("not-the-password");
      await submit.click();
      await expect(main(page).getByRole("alert")).toContainText("Nothing was deleted");
      const stillThere = await admin.auth.admin.getUserById(id);
      expect(stillThere.error).toBeNull();
      expect(stillThere.data.user?.id).toBe(id);

      await secretField.fill(password);
      await submit.click();
      await page.waitForURL(/\/welcome\?deleted=1/);
      await expect(page.getByRole("status").filter({ hasText: "have been deleted" })).toBeVisible();

      // Gone: from auth, from the tables, and from this browser.
      expect((await admin.auth.admin.getUserById(id)).data.user ?? null).toBeNull();
      for (const table of ["profiles", "categories", "quick_add_presets"]) {
        const key = table === "profiles" ? "id" : "owner_id";
        const { data: rows } = await admin.from(table).select("id").eq(key, id);
        expect(rows, table).toEqual([]);
      }
      await page.goto("/home");
      await expect(page).toHaveURL(/\/login/);
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: /^Sign in/ }).click();
      await expect(page.getByRole("alert")).toBeVisible();
    } finally {
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });
});
