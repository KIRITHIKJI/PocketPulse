import { type Page, expect, test } from "@playwright/test";

import { AUTH_FILE, E2E_EMAIL, E2E_PASSWORD, SIGNED_IN_SKIP_REASON } from "./routes";

// Phase 6: typed and voice entry on the real project. Like transactions.spec.ts this asserts
// exact balance changes, so it runs in the serial ledger projects, and every test undoes what it
// saves. Voice uses a stand-in for the browser's speech recognition: the app's handling is real,
// but no microphone or speech service is exercised here.
test.skip(!E2E_EMAIL || !E2E_PASSWORD, SIGNED_IN_SKIP_REASON);
test.use({ storageState: AUTH_FILE });
test.describe.configure({ mode: "serial" });

const main = (page: Page) => page.locator("#main");
const toast = (page: Page) => page.getByTestId("toast");
const drafts = (page: Page) => main(page).getByTestId("draft-card");

async function balance(page: Page): Promise<number> {
  await page.goto("/home");
  return Number(await main(page).getByTestId("home-balance").getAttribute("data-paise"));
}

/** Distinct rupee amounts per run, so a leftover can't be mistaken for this run's entries. */
function amounts() {
  const base = 100 + (Date.now() % 300); // keeps totals under ₹1,000, so no digit grouping
  return { first: base, second: base + 1 };
}

/** Clicks before hydration do nothing (a form just reloads), so retry until drafts appear. */
async function review(page: Page, text: string) {
  await expect(async () => {
    await page.getByRole("textbox", { name: /What did you spend|Transcript/ }).fill(text);
    await page.getByRole("button", { name: "Review entries" }).click();
    await expect(page.getByRole("heading", { name: /^Check/ })).toBeVisible({ timeout: 1_000 });
  }).toPass();
}

test("Journey B: typed entries are reviewed, saved together, and undone together", async ({
  page,
}) => {
  const before = await balance(page);
  const { first, second } = amounts();

  await page.goto("/add/text");
  await review(page, `tea ${first}, bus ${second} yesterday`);

  // Drafts only: nothing has been saved yet.
  await expect(drafts(page)).toHaveCount(2);
  await expect(drafts(page).first()).toContainText("From “tea");
  await expect(drafts(page).first().getByRole("combobox", { name: "Category" })).toHaveValue(/\|/);

  // The user corrects a draft before confirming.
  await drafts(page)
    .first()
    .getByLabel("Amount")
    .fill(String(first + 5));
  const total = first + 5 + second;
  await page.getByRole("button", { name: `Save 2 entries · ₹${total}` }).click();
  await expect(toast(page)).toContainText(`Saved 2 entries · ₹${total}`);
  await expect(page.getByRole("textbox", { name: "What did you spend?" })).toHaveValue("");

  // The toast's Undo removes both.
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toContainText("Undone");
  expect(await balance(page)).toBe(before);
});

test("saving updates the balance by the total, then Undo restores it", async ({ page }) => {
  const before = await balance(page);
  const { first, second } = amounts();
  await page.goto("/add/text");
  await review(page, `tea ${first}, bus ${second}`);
  await page.getByRole("button", { name: /^Save 2 entries/ }).click();
  await expect(toast(page)).toContainText("Saved 2 entries");
  // The toast lives in the app layout, so client-side navigation keeps its Undo.
  await page.getByRole("link", { name: "Home" }).filter({ visible: true }).first().click();
  await expect(main(page).getByTestId("home-balance")).toHaveAttribute(
    "data-paise",
    String(before - (first + second) * 100),
  );
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toContainText("Undone");
  await expect(main(page).getByTestId("home-balance")).toHaveAttribute(
    "data-paise",
    String(before),
  );
});

test("ambiguous and missing amounts block saving until answered; removing a draft works", async ({
  page,
}) => {
  await page.goto("/add/text");
  await review(page, "2 samosa 30, tea");
  const save = page.getByRole("button", { name: /^Save/ });
  await expect(save).toBeDisabled();
  await expect(main(page).getByText("2 entries need your attention")).toBeVisible();
  await expect(main(page).getByText("Is ₹30 the price?")).toBeVisible();

  await page.getByRole("button", { name: "Yes, ₹30" }).click();
  await expect(main(page).getByText("1 entry needs your attention")).toBeVisible();
  await drafts(page).nth(1).getByLabel("Amount").fill("15");
  await expect(save).toBeEnabled();

  await page.getByRole("button", { name: "Remove Tea" }).click();
  await expect(drafts(page)).toHaveCount(1);
  await expect(save).toHaveText("Save 1 entry · ₹30");
  // Leave without saving: nothing was recorded.
  await page.getByRole("button", { name: "Back to edit" }).click();
  await expect(page.getByRole("textbox", { name: "What did you spend?" })).toHaveValue(
    "2 samosa 30, tea",
  );
});

test("empty text explains itself instead of showing an empty review", async ({ page }) => {
  await page.goto("/add/text");
  await expect(async () => {
    await page.getByRole("button", { name: "Review entries" }).click();
    await expect(main(page).getByText("Write at least one thing you spent")).toBeVisible({
      timeout: 1_000,
    });
  }).toPass();
});

test("voice: a spoken phrase becomes an editable transcript, then reviewed drafts", async ({
  page,
}) => {
  const before = await balance(page);
  await page.addInitScript(() => {
    class FakeRecognition {
      onresult: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        setTimeout(() => {
          const final = Object.assign([{ transcript: "tea fifteen bus twenty" }], {
            isFinal: true,
          });
          this.onresult?.({ resultIndex: 0, results: [final] });
          this.onend?.();
        }, 50);
      }
      stop() {}
      abort() {}
    }
    Object.assign(window, {
      SpeechRecognition: FakeRecognition,
      webkitSpeechRecognition: FakeRecognition,
    });
  });

  await page.goto("/add/voice");
  // The disclosure is on screen before anything listens.
  await expect(main(page).getByText("PocketPulse only receives the text")).toBeVisible();
  const mic = page.getByRole("button", { name: "Start listening" });
  await expect(mic).toBeEnabled();
  const transcript = page.getByRole("textbox", { name: "Transcript (edit if needed)" });
  await expect(async () => {
    await mic.click();
    await expect(transcript).toHaveValue("tea fifteen bus twenty", { timeout: 1_000 });
  }).toPass();

  // Nothing is saved from speech alone; the transcript can be corrected first.
  await transcript.fill("tea fifteen bus twenty five");
  await page.getByRole("button", { name: "Review entries" }).click();
  await expect(drafts(page)).toHaveCount(2);
  await page.getByRole("button", { name: "Save 2 entries · ₹40" }).click();
  await expect(toast(page)).toContainText("Saved 2 entries · ₹40");
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(toast(page)).toContainText("Undone");
  expect(await balance(page)).toBe(before);
});

test("voice: unsupported browsers get the typed route", async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, { webkitSpeechRecognition: undefined, SpeechRecognition: undefined });
  });
  await page.goto("/add/voice");
  await expect(main(page).getByTestId("voice-unsupported")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start listening" })).toBeHidden();
  await review(page, "tea 15");
  await expect(drafts(page)).toHaveCount(1);
});

test("voice: a denied microphone is explained and typing still works", async ({ page }) => {
  await page.addInitScript(() => {
    class DeniedRecognition {
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        setTimeout(() => {
          this.onerror?.({ error: "not-allowed" });
          this.onend?.();
        }, 50);
      }
      stop() {}
      abort() {}
    }
    Object.assign(window, {
      SpeechRecognition: DeniedRecognition,
      webkitSpeechRecognition: DeniedRecognition,
    });
  });
  await page.goto("/add/voice");
  await expect(async () => {
    await page.getByRole("button", { name: "Start listening" }).click();
    await expect(main(page).getByText("Microphone access is off")).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await review(page, "tea 15");
  await expect(drafts(page)).toHaveCount(1);
});
