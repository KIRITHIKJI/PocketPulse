import {
  type Budget,
  budgetSchema,
  evaluateBudget,
  newlyReachedThresholds,
  suggestMonthlyLimit,
} from "@/domain";

import { FOOD, OWNER, TRANSPORT, expense, id, ist, istMs, refund } from "./fixtures";

const makeBudget = (over: Partial<Budget> = {}): Budget =>
  budgetSchema.parse({ id: id(700), ownerId: OWNER, limitPaise: 300_000, ...over });

describe("evaluateBudget", () => {
  const midMonth = istMs("2026-10-16", "00:00"); // exactly 15 of 31 days elapsed

  it("computes spent, remaining, % used and pace for a monthly total budget", () => {
    const ledger = [
      expense(100_000, { occurredAt: ist("2026-10-03") }),
      expense(50_000, { occurredAt: ist("2026-10-10") }),
    ];
    const r = evaluateBudget(makeBudget(), ledger, midMonth);
    expect(r.period.startDate).toBe("2026-10-01");
    expect(r.spentPaise).toBe(150_000);
    expect(r.remainingPaise).toBe(150_000);
    expect(r.usedBp).toBe(5_000);
    expect(r.elapsedBp).toBe(4_838); // 15/31, floored
    expect(r.projectedPaise).toBe(310_000); // 150 000 × 31/15
    expect(r.status).toBe("over_pace");
    expect(r.dailyAllowancePaise).toBe(9_375); // 150 000 / 16 days left
    expect(r.reachedThresholdsBp).toEqual([5_000]);
    expect(r.explanation).toMatch(/₹1,500 of ₹3,000 spent on all spending; ₹1,500 left/);
    expect(r.explanation).toMatch(/target, not money set aside/);
  });

  it("only counts its category, net of refunds", () => {
    const shoes = expense(80_000, { categoryId: FOOD, occurredAt: ist("2026-10-03") });
    const ledger = [
      shoes,
      refund(30_000, shoes.id, { occurredAt: ist("2026-10-05") }),
      expense(99_000, { categoryId: TRANSPORT, occurredAt: ist("2026-10-04") }),
    ];
    const r = evaluateBudget(
      makeBudget({ categoryId: FOOD, limitPaise: 150_000 }),
      ledger,
      midMonth,
    );
    expect(r.spentPaise).toBe(50_000);
    expect(r.status).toBe("on_track");
  });

  it("reports exceeded budgets with a negative remaining and every threshold reached", () => {
    const r = evaluateBudget(
      makeBudget(),
      [expense(330_000, { occurredAt: ist("2026-10-02") })],
      midMonth,
    );
    expect(r.status).toBe("exceeded");
    expect(r.remainingPaise).toBe(-30_000);
    expect(r.usedBp).toBe(11_000);
    expect(r.dailyAllowancePaise).toBe(0);
    expect(r.reachedThresholdsBp).toEqual([5_000, 8_000, 10_000]);
    expect(r.explanation).toMatch(/₹300 over the target/);
  });

  it("doesn't project pace too early in the period", () => {
    const r = evaluateBudget(
      makeBudget(),
      [expense(100_000, { occurredAt: ist("2026-10-01", "08:00") })],
      istMs("2026-10-02"),
    );
    expect(r.projectedPaise).toBeNull();
    expect(r.status).toBe("on_track");
  });

  it("recalculates when history is edited and alerts each threshold once", () => {
    const e = expense(200_000, { occurredAt: ist("2026-10-03") });
    const before = evaluateBudget(makeBudget(), [e], midMonth);
    const edited = evaluateBudget(makeBudget(), [{ ...e, amountPaise: 260_000 }], midMonth);
    expect(newlyReachedThresholds(before, edited)).toEqual([8_000]);
    expect(newlyReachedThresholds(edited, edited)).toEqual([]);
    const deleted = evaluateBudget(
      makeBudget(),
      [{ ...e, deletedAt: ist("2026-10-04") }],
      midMonth,
    );
    expect(deleted.spentPaise).toBe(0);
  });

  it("supports weekly and custom periods", () => {
    const weekly = evaluateBudget(makeBudget({ period: "weekly" }), [], midMonth);
    expect([weekly.period.startDate, weekly.period.endDate]).toEqual(["2026-10-12", "2026-10-18"]);
    const custom = evaluateBudget(
      makeBudget({ period: "custom", customFrom: "2026-10-10", customTo: "2026-10-20" }),
      [],
      istMs("2026-10-25"),
    );
    expect(custom.status).toBe("ended");
    expect(custom.dailyAllowancePaise).toBeNull();
  });

  it("validates budget input", () => {
    const base = { id: id(1), ownerId: OWNER, limitPaise: 1000 };
    expect(budgetSchema.safeParse({ ...base, period: "custom" }).success).toBe(false);
    expect(budgetSchema.safeParse({ ...base, limitPaise: 0 }).success).toBe(false);
    expect(
      budgetSchema.safeParse({
        ...base,
        period: "custom",
        customFrom: "2026-10-10",
        customTo: "2026-10-01",
      }).success,
    ).toBe(false);
  });
});

describe("suggestMonthlyLimit", () => {
  it("uses the median of complete previous months, rounded up to ₹50", () => {
    const ledger = [
      expense(250_000, { occurredAt: ist("2026-07-10") }),
      expense(310_000, { occurredAt: ist("2026-08-10") }),
      expense(290_100, { occurredAt: ist("2026-09-10") }),
      expense(999_999, { occurredAt: ist("2026-10-02") }), // current month ignored
    ];
    const s = suggestMonthlyLimit(ledger, "2026-10-14")!;
    expect(s.basedOnMonths).toBe(3);
    expect(s.limitPaise).toBe(295_000);
    expect(s.explanation).toMatch(/₹2,901.*₹2,950/);
  });

  it("returns null without a complete month of tracked history", () => {
    expect(suggestMonthlyLimit([], "2026-10-14")).toBeNull();
    expect(
      suggestMonthlyLimit([expense(1000, { occurredAt: ist("2026-10-02") })], "2026-10-14", {
        trackingStart: "2026-10-01",
      }),
    ).toBeNull();
  });
});
