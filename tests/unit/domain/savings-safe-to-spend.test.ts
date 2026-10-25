import {
  calculateSafeToSpend,
  consolidatedBalanceAt,
  earmarkedByGoal,
  goalProgress,
  releaseForGoalPurchase,
  totalEarmarked,
  unpaidCommitmentsDue,
} from "@/domain";

import {
  CASH,
  LAPTOP_GOAL,
  TRIP_GOAL,
  account,
  allocate,
  commitment,
  expense,
  goal,
  income,
  ist,
  istMs,
  release,
} from "./fixtures";

const NOW = istMs("2026-10-20", "18:00");

describe("savings goals", () => {
  const ledger = [
    allocate(30_000, LAPTOP_GOAL, { occurredAt: ist("2026-10-02") }),
    allocate(20_000, LAPTOP_GOAL, { occurredAt: ist("2026-10-09") }),
    release(5_000, LAPTOP_GOAL, { occurredAt: ist("2026-10-10") }),
    allocate(10_000, TRIP_GOAL, { occurredAt: ist("2026-10-11") }),
    { ...allocate(99_000, LAPTOP_GOAL), deletedAt: ist("2026-10-12") },
  ];

  it("totals earmarks per goal and overall, optionally as of a date", () => {
    expect(Object.fromEntries(earmarkedByGoal(ledger))).toEqual({
      [LAPTOP_GOAL]: 45_000,
      [TRIP_GOAL]: 10_000,
    });
    expect(totalEarmarked(ledger)).toBe(55_000);
    expect(totalEarmarked(ledger, istMs("2026-10-09", "00:00"))).toBe(30_000);
  });

  it("computes progress, remaining and a suggested weekly allocation", () => {
    const p = goalProgress(goal(LAPTOP_GOAL, 100_000, "2026-11-30"), ledger, "2026-10-20");
    expect(p).toMatchObject({
      savedPaise: 45_000,
      remainingPaise: 55_000,
      progressBp: 4_500,
      completed: false,
      daysLeft: 41,
    });
    expect(p.suggested).toEqual({ cadence: "weekly", amountPaise: 9_167, periods: 6 }); // ceil(55 000 / 6)
    expect(
      goalProgress(goal(LAPTOP_GOAL, 100_000, "2026-11-30"), ledger, "2026-10-20", "monthly")
        .suggested,
    ).toEqual({
      cadence: "monthly",
      amountPaise: 27_500,
      periods: 2,
    });
  });

  it("explains missing or passed target dates instead of inventing a suggestion", () => {
    expect(goalProgress(goal(LAPTOP_GOAL, 100_000), ledger, "2026-10-20").suggested).toBeNull();
    const late = goalProgress(goal(LAPTOP_GOAL, 100_000, "2026-10-01"), ledger, "2026-10-20");
    expect(late.suggested).toBeNull();
    expect(late.explanation).toMatch(/target date has passed/);
  });

  it("caps progress at 100% and marks completion", () => {
    const p = goalProgress(goal(TRIP_GOAL, 8_000), ledger, "2026-10-20");
    expect(p).toMatchObject({ progressBp: 10_000, remainingPaise: 0, completed: true });
  });

  it("buying the goal item: one expense + one release, no double counting", () => {
    const accounts = [account(CASH, 200_000)];
    const savings = [allocate(50_000, LAPTOP_GOAL, { occurredAt: ist("2026-10-02") })];
    const before = calculateSafeToSpend({
      accounts,
      ledger: savings,
      commitments: [],
      now: NOW,
      nextIncomeDate: "2026-11-01",
    });

    const purchase = expense(60_000, { occurredAt: ist("2026-10-20", "10:00") });
    const releasePaise = releaseForGoalPurchase(LAPTOP_GOAL, purchase.amountPaise, savings);
    expect(releasePaise).toBe(50_000); // only what was set aside
    const after = [
      ...savings,
      purchase,
      release(releasePaise, LAPTOP_GOAL, { occurredAt: ist("2026-10-20", "10:00") }),
    ];

    expect(totalEarmarked(after)).toBe(0);
    expect(consolidatedBalanceAt(accounts, after, NOW).balancePaise).toBe(140_000);
    const sts = calculateSafeToSpend({
      accounts,
      ledger: after,
      commitments: [],
      now: NOW,
      nextIncomeDate: "2026-11-01",
    });
    // Flexible money only drops by the part not covered by savings.
    expect(before.flexiblePaise - sts.flexiblePaise).toBe(10_000);
  });
});

describe("unpaidCommitmentsDue", () => {
  it("skips paid, cancelled and out-of-horizon commitments; a deleted payment re-opens one", () => {
    const pay = expense(5_000);
    const paid = commitment(5_000, "2026-10-22", { paidTransactionId: pay.id });
    const cancelled = commitment(3_000, "2026-10-22", { cancelledAt: ist("2026-10-19") });
    const later = commitment(7_000, "2026-11-15");
    const due = commitment(2_000, "2026-10-28");
    const all = [paid, cancelled, later, due];

    expect(unpaidCommitmentsDue(all, [pay], "2026-11-01").map((c) => c.id)).toEqual([due.id]);
    expect(unpaidCommitmentsDue(all, [pay], null).map((c) => c.id)).toEqual([later.id, due.id]);
    expect(
      unpaidCommitmentsDue(all, [{ ...pay, deletedAt: ist("2026-10-20") }], "2026-11-01").map(
        (c) => c.id,
      ),
    ).toEqual([paid.id, due.id]);
  });
});

describe("calculateSafeToSpend", () => {
  const accounts = [account(CASH, 200_000, "2026-10-01")];

  it("balance − savings − commitments − reserve, spread over the days until income", () => {
    const ledger = [
      expense(14_000, { occurredAt: ist("2026-10-10") }), // 14 days of history → ₹10/day pace
      allocate(30_000, LAPTOP_GOAL, { occurredAt: ist("2026-10-05") }),
    ];
    const r = calculateSafeToSpend({
      accounts,
      ledger,
      commitments: [commitment(16_000, "2026-10-25"), commitment(50_000, "2026-11-10")],
      now: NOW,
      nextIncomeDate: "2026-11-01",
      reservePaise: 10_000,
    });
    expect(r.status).toBe("ok");
    expect(r.inputs).toMatchObject({
      today: "2026-10-20",
      balancePaise: 186_000,
      earmarkedPaise: 30_000,
      commitmentsDuePaise: 16_000, // the 10 Nov bill is after the horizon
      reservePaise: 10_000,
      horizonEndDate: "2026-11-01",
      recentDailySpendingPaise: 1_000,
      paceLookbackDays: 14,
    });
    expect(r.flexiblePaise).toBe(130_000);
    expect(r.daysUntilNextIncome).toBe(12);
    expect(r.suggestedDailyPaise).toBe(10_833); // floor(130 000 / 12)
    expect(r.suggestedWeeklyPaise).toBe(75_831);
    expect(r.expectedEndBalancePaise).toBe(186_000 - 16_000 - 12 * 1_000);
    expect(r.endBalanceAssumption).toMatch(/₹10 a day/);
    expect(r.runOutInDays).toBe(130);
    expect(r.warnings).toEqual([]);
    expect(r.explanation.join("\n")).toMatch(/Flexible money: ₹1,300\./);
    expect(r.explanation.join("\n")).toMatch(/not a verified bank balance/);
  });

  it("returns 'not enough info' with no daily limit when the next income date is missing", () => {
    const r = calculateSafeToSpend({
      accounts,
      ledger: [],
      commitments: [commitment(50_000, "2026-12-10")],
      now: NOW,
      nextIncomeDate: null,
    });
    expect(r.status).toBe("not_enough_info");
    expect(r.missing).toEqual(["next_income_date"]);
    expect(r.suggestedDailyPaise).toBeNull();
    expect(r.suggestedWeeklyPaise).toBeNull();
    expect(r.expectedEndBalancePaise).toBeNull();
    expect(r.flexiblePaise).toBe(150_000); // conservative: all unpaid commitments
    expect(r.explanation.at(-1)).toMatch(/Add your next allowance or income date/);
  });

  it("treats a past next-income date as missing info", () => {
    const r = calculateSafeToSpend({
      accounts,
      ledger: [],
      commitments: [],
      now: NOW,
      nextIncomeDate: "2026-10-20",
    });
    expect(r.missing).toEqual(["next_income_date_passed"]);
    expect(r.suggestedDailyPaise).toBeNull();
  });

  it("warns when the recent pace would run out before income and when over-committed", () => {
    const ledger = [expense(140_000, { occurredAt: ist("2026-10-15") })]; // ₹100/day over 14 days
    const r = calculateSafeToSpend({
      accounts,
      ledger,
      commitments: [commitment(10_000, "2026-10-18")], // overdue, still unpaid
      now: NOW,
      nextIncomeDate: "2026-11-01",
    });
    expect(r.flexiblePaise).toBe(50_000);
    expect(r.runOutInDays).toBe(5);
    expect(r.warnings[0]).toMatch(/last about 5 days, but your next income is 12 days away/);
    expect(r.warnings[1]).toMatch(/past due/);

    const over = calculateSafeToSpend({
      accounts,
      ledger: [allocate(250_000, LAPTOP_GOAL, { occurredAt: ist("2026-10-02") })],
      commitments: [],
      now: NOW,
      nextIncomeDate: "2026-11-01",
    });
    expect(over.flexiblePaise).toBe(-50_000);
    expect(over.suggestedDailyPaise).toBe(0);
    expect(over.suggestedWeeklyPaise).toBe(0);
    expect(over.warnings.join(" ")).toMatch(/more than your tracked balance/);
  });

  it("uses the suggested limit as the assumption when there's no history yet", () => {
    const fresh = [account(CASH, 120_000, "2026-10-20")];
    const r = calculateSafeToSpend({
      accounts: fresh,
      ledger: [],
      commitments: [],
      now: NOW,
      nextIncomeDate: "2026-11-01",
    });
    expect(r.inputs.recentDailySpendingPaise).toBeNull();
    expect(r.suggestedDailyPaise).toBe(10_000);
    expect(r.expectedEndBalancePaise).toBe(0);
    expect(r.endBalanceAssumption).toMatch(/Not enough history/);
    expect(r.runOutInDays).toBeNull();
  });

  it("ignores future-dated and income activity in pace, and income raises the balance", () => {
    const ledger = [
      income(50_000, { occurredAt: ist("2026-10-12") }),
      expense(99_000, { occurredAt: ist("2026-10-25") }),
    ];
    const r = calculateSafeToSpend({
      accounts,
      ledger,
      commitments: [],
      now: NOW,
      nextIncomeDate: "2026-11-01",
    });
    expect(r.inputs.balancePaise).toBe(250_000);
    expect(r.inputs.recentDailySpendingPaise).toBe(0);
  });
});
