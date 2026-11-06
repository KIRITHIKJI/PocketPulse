import {
  accountSchema,
  consolidatedBalanceAt,
  entriesBeforeOpening,
  isBeforeOpeningDate,
  parseSignedAmountInput,
} from "@/domain";
import { indexedRows } from "@/lib/forms";
import { onboardingRedirect } from "@/lib/onboarding-routes";
import { accountFormSchema } from "@/lib/validation/accounts";
import { categoryFormSchema, mergeSchema, ruleFormSchema } from "@/lib/validation/categories";
import {
  balancesStepSchema,
  budgetsStepSchema,
  goalStepSchema,
  nextStep,
  parseStep,
} from "@/lib/validation/onboarding";
import { incomeSchema, regionSchema, spendingSchema } from "@/lib/validation/settings";

import { CASH, OWNER, expense, id, ist, istMs } from "./domain/fixtures";

const uuid = (n: number) => id(7000 + n);

function form(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
}

describe("parseSignedAmountInput", () => {
  it.each([
    ["1,250.50", 125050],
    ["₹1,25,000", 12500000],
    ["-1,500", -150000],
    ["−₹40", -4000],
    ["₹ -12.50", -1250],
    ["0", 0],
    ["-0", 0],
  ])("%s → %i paise", (input, paise) => {
    expect(parseSignedAmountInput(input)).toEqual({ ok: true, paise });
  });

  it.each(["12.505", "abc", "", "--5"])("rejects %j", (input) => {
    expect(parseSignedAmountInput(input).ok).toBe(false);
  });
});

describe("onboarding: opening balance step", () => {
  const base = {
    openingDate: "2026-10-20",
    cashName: "Cash",
    cashBalance: "₹1,250.50",
    extras: [],
  };

  it("saves the exact opening balance in paise with its effective date", () => {
    const parsed = balancesStepSchema.parse(base);
    expect(parsed).toEqual({
      openingDate: "2026-10-20",
      cashName: "Cash",
      cashBalance: 125050,
      extras: [],
    });
  });

  it("treats a blank balance as ₹0 and accepts an overdrawn (negative) wallet", () => {
    expect(balancesStepSchema.parse({ ...base, cashBalance: "" }).cashBalance).toBe(0);
    const parsed = balancesStepSchema.parse({
      ...base,
      extras: [{ id: uuid(1), name: "SBI", kind: "bank", balance: "-1,500" }],
    });
    expect(parsed.extras[0]).toEqual({ id: uuid(1), name: "SBI", kind: "bank", balance: -150000 });
  });

  it("rejects floating-point-looking input instead of rounding it", () => {
    const result = balancesStepSchema.safeParse({ ...base, cashBalance: "10.999" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["cashBalance"]);
  });

  it("rejects an invalid date and duplicate wallet names", () => {
    expect(balancesStepSchema.safeParse({ ...base, openingDate: "2026-02-30" }).success).toBe(
      false,
    );
    const dup = balancesStepSchema.safeParse({
      ...base,
      extras: [{ id: uuid(2), name: " cash", kind: "upi_wallet", balance: "5" }],
    });
    expect(dup.success).toBe(false);
    expect(dup.error?.issues[0]?.path).toEqual(["extras", 0, "name"]);
  });

  it("the saved opening balance is the tracked balance from that date on (domain)", () => {
    const { cashBalance, openingDate } = balancesStepSchema.parse(base);
    const account = accountSchema.parse({
      id: CASH,
      ownerId: OWNER,
      name: "Cash",
      openingBalancePaise: cashBalance,
      openingBalanceDate: openingDate,
    });
    const lunch = expense(4000, { occurredAt: ist("2026-10-21") });
    expect(
      consolidatedBalanceAt([account], [lunch], istMs("2026-10-21", "09:00")).balancePaise,
    ).toBe(125050);
    expect(consolidatedBalanceAt([account], [lunch], istMs("2026-10-22")).balancePaise).toBe(
      121050,
    );
  });

  it("collects indexed rows from FormData in index order", () => {
    const fd = form({
      "extras.1.name": "GPay",
      "extras.0.name": "SBI",
      "extras.0.kind": "bank",
      "extras.1.kind": "upi_wallet",
      "extras.x.name": "ignored",
      other: "ignored",
    });
    expect(indexedRows(fd, "extras")).toEqual([
      { name: "SBI", kind: "bank" },
      { name: "GPay", kind: "upi_wallet" },
    ]);
  });
});

describe("entries dated before the opening date", () => {
  const account = accountSchema.parse({
    id: CASH,
    ownerId: OWNER,
    name: "Cash",
    openingBalancePaise: 50000,
    openingBalanceDate: "2026-10-10",
  });

  it("are flagged, listed and don't change the balance", () => {
    const before = expense(2000, { occurredAt: ist("2026-10-09", "23:59") });
    const onDay = expense(1000, { occurredAt: ist("2026-10-10", "00:00") });
    expect(isBeforeOpeningDate(account, istMs("2026-10-09", "23:59"))).toBe(true);
    expect(isBeforeOpeningDate(account, istMs("2026-10-10", "00:00"))).toBe(false);
    expect(entriesBeforeOpening(account, [before, onDay]).map((t) => t.id)).toEqual([before.id]);
    expect(
      consolidatedBalanceAt([account], [before, onDay], istMs("2026-10-11")).balancePaise,
    ).toBe(49000);
  });
});

describe("other onboarding steps", () => {
  it("budgets: blank means no budget, amounts parse to paise", () => {
    expect(
      budgetsStepSchema.parse({
        total: "8,000",
        categories: [
          { categoryId: uuid(3), amount: "" },
          { categoryId: uuid(4), amount: "1500" },
        ],
      }),
    ).toEqual({
      total: 800000,
      categories: [
        { categoryId: uuid(3), amount: null },
        { categoryId: uuid(4), amount: 150000 },
      ],
    });
    expect(budgetsStepSchema.safeParse({ total: "0", categories: [] }).success).toBe(false);
  });

  it("goal: needs a title and a positive target; the date is optional", () => {
    expect(
      goalStepSchema.parse({
        goalId: uuid(5),
        title: " Laptop ",
        target: "45,000",
        targetDate: "",
      }),
    ).toEqual({ goalId: uuid(5), title: "Laptop", target: 4500000, targetDate: null });
    expect(
      goalStepSchema.safeParse({ goalId: uuid(5), title: "", target: "1", targetDate: "" }).success,
    ).toBe(false);
  });

  it("income: no regular income clears the next date and amount", () => {
    expect(
      incomeSchema.parse({
        incomeFrequency: "none",
        nextIncomeDate: "2026-11-01",
        expectedIncome: "5000",
      }),
    ).toEqual({ incomeFrequency: "none", nextIncomeDate: null, expectedIncome: null });
    expect(
      incomeSchema.parse({
        incomeFrequency: "monthly",
        nextIncomeDate: "2026-11-01",
        expectedIncome: "5,000",
      }),
    ).toEqual({ incomeFrequency: "monthly", nextIncomeDate: "2026-11-01", expectedIncome: 500000 });
  });

  it("region: known currencies and real IANA timezones only", () => {
    expect(
      regionSchema.parse({ currency: "INR", timeZone: "Asia/Kolkata", weekStartsOn: "1" }),
    ).toEqual({
      currency: "INR",
      timeZone: "Asia/Kolkata",
      weekStartsOn: 1,
    });
    expect(
      regionSchema.safeParse({ currency: "XYZ", timeZone: "Asia/Kolkata", weekStartsOn: "1" })
        .success,
    ).toBe(false);
    expect(
      regionSchema.safeParse({ currency: "INR", timeZone: "Mars/Base", weekStartsOn: "1" }).success,
    ).toBe(false);
  });

  it("small-purchase threshold: positive, default-sized amounts", () => {
    expect(spendingSchema.parse({ smallPurchaseThreshold: "50" })).toEqual({
      smallPurchaseThreshold: 5000,
    });
    expect(spendingSchema.safeParse({ smallPurchaseThreshold: "0" }).success).toBe(false);
  });

  it("steps advance in order and unknown steps start at the beginning", () => {
    expect(parseStep("budgets")).toBe("budgets");
    expect(parseStep("nope")).toBe("region");
    expect(nextStep("region")).toBe("balance");
    expect(nextStep("preferences")).toBeNull();
  });

  it("only continues to known onboarding steps or Home", () => {
    expect(onboardingRedirect("/onboarding?step=goal")).toBe("/onboarding?step=goal");
    expect(onboardingRedirect("/home")).toBe("/home");
    for (const bad of [
      "//evil.example",
      "https://evil.example",
      "/onboarding?step=evil",
      "/settings",
      null,
    ]) {
      expect(onboardingRedirect(bad)).toBeNull();
    }
  });
});

describe("account, category and rule forms", () => {
  it("account: name, type, signed opening balance and date", () => {
    expect(
      accountFormSchema.parse({
        name: " GPay ",
        kind: "upi_wallet",
        openingBalance: "",
        openingDate: "2026-10-26",
      }),
    ).toEqual({ name: "GPay", kind: "upi_wallet", openingBalance: 0, openingDate: "2026-10-26" });
    expect(
      accountFormSchema.safeParse({
        name: "",
        kind: "bank",
        openingBalance: "1",
        openingDate: "2026-10-26",
      }).success,
    ).toBe(false);
    expect(
      accountFormSchema.safeParse({
        name: "X",
        kind: "crypto",
        openingBalance: "1",
        openingDate: "2026-10-26",
      }).success,
    ).toBe(false);
  });

  it("category: known icons only; “none” means inherit", () => {
    expect(
      categoryFormSchema.parse({
        name: "Chai",
        kind: "expense",
        parentId: uuid(6),
        icon: "none",
        color: "none",
      }),
    ).toEqual({ name: "Chai", kind: "expense", parentId: uuid(6), icon: null, color: null });
    expect(
      categoryFormSchema.safeParse({
        name: "X",
        kind: "expense",
        parentId: "",
        icon: "skull",
        color: "",
      }).success,
    ).toBe(false);
    expect(
      categoryFormSchema.safeParse({
        name: "X",
        kind: "expense",
        parentId: "",
        icon: "",
        color: "red",
      }).success,
    ).toBe(false);
  });

  it("merge needs two different categories", () => {
    expect(mergeSchema.safeParse({ sourceId: uuid(7), targetId: uuid(7) }).success).toBe(false);
    expect(mergeSchema.safeParse({ sourceId: uuid(7), targetId: uuid(8) }).success).toBe(true);
  });

  it("rule text must contain letters (digits alone can never match)", () => {
    const base = {
      matchField: "description",
      categoryId: uuid(9),
      subcategoryId: "",
      priority: "0",
    };
    expect(ruleFormSchema.parse({ ...base, matchText: " chai " })).toMatchObject({
      matchText: "chai",
      subcategoryId: null,
      priority: 0,
    });
    expect(ruleFormSchema.safeParse({ ...base, matchText: "1234" }).success).toBe(false);
  });
});
