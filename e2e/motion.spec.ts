import { type Page, expect, test } from "@playwright/test";

import { AUTH_FILE, E2E_EMAIL, E2E_PASSWORD, SIGNED_IN_SKIP_REASON } from "./routes";

// Animation stops under reduced motion, whether that comes from the OS or the in-app setting. Each
// case is measured against a control that really does animate, so a test that couldn't see any
// animation at all fails instead of passing. Runs in the serial ledger projects.
test.skip(!E2E_EMAIL || !E2E_PASSWORD, SIGNED_IN_SKIP_REASON);
test.use({ storageState: AUTH_FILE });
test.describe.configure({ mode: "serial" });

const WORD = "zzmotion";
const GOAL = "zzmotiongoal";
const main = (page: Page) => page.locator("#main");
const toast = (page: Page) => page.getByTestId("toast");
const dialog = (page: Page) => page.getByRole("dialog");

/** Records what actually moved: bar heights as Recharts redraws them, CSS animations started. */
const RECORDER = () => {
  const log = { barHeights: [] as number[][], celebration: [] as string[] };
  (window as unknown as { __motion: typeof log }).__motion = log;
  document.addEventListener(
    "animationstart",
    (event) => {
      if (event.animationName.startsWith("pp-celebrate")) {
        log.celebration.push(getComputedStyle(event.target as Element).animationDuration);
      }
    },
    true,
  );
  // Sampled every frame, so this sees the bars move however the chart library moves them.
  const sample = () => {
    document.querySelectorAll(".recharts-bar-rectangle path").forEach((bar, index) => {
      (log.barHeights[index] ??= []).push(Math.round(bar.getBoundingClientRect().height));
    });
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
};

/** The in-app setting, as its control stores it, on a device already synced with the profile. */
const inAppSetting = (motion: "reduce" | "full") => async (page: Page) => {
  await page.addInitScript((value) => {
    localStorage.setItem("pp-motion", value);
    localStorage.setItem("pp-synced-appearance", JSON.stringify({ motion: "system" }));
  }, motion);
};

const barHeights = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __motion: { barHeights: number[][] } }).__motion.barHeights,
  );
const celebration = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __motion: { celebration: string[] } }).__motion.celebration,
  );

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

async function openGoal(page: Page) {
  await page.goto("/goals");
  const card = main(page).getByRole("link", { name: new RegExp(GOAL) });
  await expect(
    main(page).getByRole("heading", { name: "Savings goals", exact: true }),
  ).toBeVisible();
  await card.first().click();
  await expect(main(page).getByRole("heading", { name: GOAL, level: 1 })).toBeVisible();
}

async function deleteEntries(page: Page) {
  for (;;) {
    await page.goto(`/transactions?q=${WORD}`);
    const rows = main(page)
      .getByRole("link", { name: new RegExp(WORD, "i") })
      .locator("visible=true");
    await expect(
      main(page).getByRole("heading", { name: "Transactions", exact: true }),
    ).toBeVisible();
    if ((await rows.count()) === 0) return;
    await rows.first().click();
    await page.getByRole("button", { name: "Delete" }).click();
    await dialog(page).getByRole("button", { name: "Delete" }).click();
    await expect(toast(page)).toContainText("Entry deleted.");
  }
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  const page = await browser.newPage({ storageState: AUTH_FILE });
  await deleteEntries(page);
  await logEntry(page, `${WORD} 40`);
  await logEntry(page, `${WORD} 25 yesterday`);

  // A goal already at its target. It's reused between runs; goals with history can't be deleted.
  await page.goto("/goals");
  await expect(
    main(page).getByRole("heading", { name: "Savings goals", exact: true }),
  ).toBeVisible();
  const card = main(page).getByRole("link", { name: new RegExp(GOAL) });
  if ((await card.count()) === 0) {
    await main(page).getByRole("button", { name: "Add goal" }).first().click();
    await dialog(page).getByLabel("What are you saving for?").fill(GOAL);
    await dialog(page).getByLabel("Target amount").fill("1");
    await dialog(page).getByRole("button", { name: "Add goal" }).click();
    await expect(dialog(page)).toBeHidden();
  }
  await openGoal(page);
  const reopen = main(page).getByRole("button", { name: /^(Restore|Reopen)$/ });
  if ((await reopen.count()) > 0) {
    await reopen.click();
    await expect(main(page).getByRole("button", { name: "Mark complete" })).toBeVisible();
  }
  if ((await main(page).getByTestId("goal-reached").count()) === 0) {
    await main(page).getByRole("button", { name: "Set money aside" }).click();
    await dialog(page).getByLabel("Amount").fill("1");
    await dialog(page).getByRole("button", { name: "Set aside", exact: true }).click();
    await expect(main(page).getByTestId("goal-reached")).toBeVisible();
  }
  await page.close();
});

test.afterAll(async ({ browser }) => {
  test.setTimeout(120_000);
  const page = await browser.newPage({ storageState: AUTH_FILE });
  await deleteEntries(page);
  await openGoal(page);
  await main(page).getByRole("button", { name: "Release money" }).click();
  await dialog(page).getByLabel("Amount").fill("1");
  await dialog(page).getByRole("button", { name: "Release", exact: true }).click();
  await expect(dialog(page)).toBeHidden();
  await main(page).getByRole("button", { name: "Archive" }).click();
  await dialog(page).getByRole("button", { name: "Archive" }).click();
  await expect(main(page).getByRole("button", { name: "Restore" })).toBeVisible();
  await page.close();
});

/** Loads the chart and waits past the animation's 300 ms, however long the data takes. */
async function chartHeights(page: Page) {
  await page.addInitScript(RECORDER);
  await page.goto("/insights?period=all_time&trend=day");
  await expect(main(page).locator(".recharts-bar-rectangle path").first()).toBeVisible();
  await page.waitForTimeout(800);
  return barHeights(page);
}

/** Completes the goal, reads what the celebration did, and puts the goal back. */
async function celebrate(page: Page) {
  await page.addInitScript(RECORDER);
  await openGoal(page);
  await main(page).getByRole("button", { name: "Mark complete" }).click();
  const message = main(page).getByTestId("goal-celebration");
  await expect(message).toContainText(`You did it: ${GOAL} is complete`);
  await page.waitForTimeout(300);
  const started = await celebration(page);
  const pieces = await message
    .locator(".pp-celebrate-piece")
    .evaluateAll((all) => all.filter((p) => getComputedStyle(p).display !== "none").length);
  await main(page).getByRole("button", { name: "Reopen" }).click();
  await expect(main(page).getByRole("button", { name: "Mark complete" })).toBeVisible();
  return { started, pieces };
}

/** A new device hasn't seen any achievement yet, so the rewards screen greets them. */
async function achievementBurst(page: Page) {
  await page.goto("/rewards");
  const message = main(page).getByTestId("achievement-celebration");
  await expect(message).toContainText("achievement");
  return message
    .locator(".pp-celebrate-piece")
    .evaluateAll((all) => all.filter((p) => getComputedStyle(p).display !== "none").length);
}

const seconds = (durations: string[]) => durations.map((d) => parseFloat(d));

/** The most different heights any one bar was drawn at. */
const steps = (bars: number[][]) => Math.max(...bars.map((h) => new Set(h.filter(Boolean)).size));

function expectAnimated(bars: number[][]) {
  // A rising bar passes through many heights on the way to its final one.
  expect(steps(bars)).toBeGreaterThan(3);
}
function expectStill(bars: number[][]) {
  // At most the chart's one layout pass as it measures its axes: no frames in between.
  expect(steps(bars)).toBeLessThanOrEqual(2);
}

test.describe("with motion allowed", () => {
  test.use({ reducedMotion: "no-preference" });

  test("the control: chart bars do animate", async ({ page }) => {
    expectAnimated(await chartHeights(page));
  });

  test("the control: an achievement bursts", async ({ page }) => {
    expect(await achievementBurst(page)).toBe(14);
  });

  test("the control: the celebration does animate", async ({ page }) => {
    const { started, pieces } = await celebrate(page);
    expect(Math.max(...seconds(started))).toBeGreaterThan(0.2);
    expect(pieces).toBe(14);
  });

  test.describe("and the in-app setting at Reduced", () => {
    test.beforeEach(({ page }) => inAppSetting("reduce")(page));

    test("chart bars don't animate", async ({ page }) => {
      expectStill(await chartHeights(page));
      await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
    });

    test("the celebration shows its message, with no burst and no movement", async ({ page }) => {
      const { started, pieces } = await celebrate(page);
      expect(pieces).toBe(0);
      for (const duration of seconds(started)) expect(duration).toBeLessThan(0.001);
    });

    test("an achievement shows its message with no burst", async ({ page }) => {
      expect(await achievementBurst(page)).toBe(0);
    });
  });
});

test.describe("with the OS set to reduce motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("chart bars don't animate", async ({ page }) => {
    expectStill(await chartHeights(page));
  });

  test("the celebration shows its message, with no burst and no movement", async ({ page }) => {
    const { started, pieces } = await celebrate(page);
    expect(pieces).toBe(0);
    for (const duration of seconds(started)) expect(duration).toBeLessThan(0.001);
  });

  test("an achievement shows its message with no burst", async ({ page }) => {
    expect(await achievementBurst(page)).toBe(0);
  });

  test.describe("and the in-app setting at Full", () => {
    test.beforeEach(({ page }) => inAppSetting("full")(page));

    test("the choice in the app wins: chart bars animate", async ({ page }) => {
      expectAnimated(await chartHeights(page));
    });

    test("the choice in the app wins: the celebration animates", async ({ page }) => {
      const { started, pieces } = await celebrate(page);
      expect(Math.max(...seconds(started))).toBeGreaterThan(0.2);
      expect(pieces).toBe(14);
    });
  });
});
