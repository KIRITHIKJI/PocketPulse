import { render, screen } from "@testing-library/react";

import { BudgetRemaining } from "@/components/plan/parts";
import { expense, ist } from "./domain/fixtures";
import { commitmentSchema, formatMoney, recurringTemplateSchema } from "@/domain";
import { ledgerCommandSchema, toRpcCall, inverseCommand } from "@/lib/ledger/commands";
import { dueItems, occurredItems } from "@/lib/plan-view";
import {
  billFormSchema,
  budgetFormSchema,
  goalFormSchema,
  planningSchema,
  recurringFormSchema,
  thresholdsField,
} from "@/lib/validation/plan";

const money = (paise: number) => formatMoney(paise, { currency: "INR" });
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("BudgetRemaining", () => {
  it.each([
    [50_000, "₹500 left"],
    [0, "₹0 left"],
    [-12_000, "₹120 over target"],
  ])("always says target, not reserved money beside %s", (remaining, text) => {
    render(<BudgetRemaining remainingPaise={remaining} money={money} />);
    const line = screen.getByTestId("budget-remaining");
    expect(line).toHaveTextContent(text);
    expect(line).toHaveTextContent("target, not reserved money");
  });
});

describe("threshold input", () => {
  const parse = (value: string) => thresholdsField.safeParse(value);

  it("reads percents as basis points, sorted and without repeats", () => {
    expect(parse("80, 50 100%").data).toEqual([5_000, 8_000, 10_000]);
    expect(parse("80,80").data).toEqual([8_000]);
    expect(parse("").data).toEqual([]);
  });

  it.each(["0", "1001", "12.5", "abc", "1,2,3,4,5,6"])("refuses %s", (value) => {
    expect(parse(value).success).toBe(false);
  });
});

describe("plan forms", () => {
  const budget = {
    id: uuid(1),
    categoryId: "",
    limit: "1,500",
    period: "monthly",
    customFrom: "",
    customTo: "",
    thresholds: "50, 100",
  };

  it("budget: amounts in paise, total budget has no category", () => {
    expect(budgetFormSchema.parse(budget)).toMatchObject({
      limit: 150_000,
      categoryId: null,
      thresholds: [5_000, 10_000],
    });
  });

  it("budget: custom periods need both dates, in order", () => {
    const custom = { ...budget, period: "custom" };
    expect(budgetFormSchema.safeParse(custom).success).toBe(false);
    expect(
      budgetFormSchema.safeParse({ ...custom, customFrom: "2026-11-02", customTo: "2026-11-01" })
        .success,
    ).toBe(false);
    expect(
      budgetFormSchema.safeParse({ ...custom, customFrom: "2026-11-01", customTo: "2026-11-30" })
        .success,
    ).toBe(true);
  });

  it("goal: needs a title, an icon the app can draw and a positive target", () => {
    const goal = { id: uuid(2), title: "Laptop", icon: "laptop", target: "45,000", targetDate: "" };
    expect(goalFormSchema.parse(goal)).toMatchObject({ target: 4_500_000, targetDate: null });
    expect(goalFormSchema.safeParse({ ...goal, icon: "nope" }).success).toBe(false);
    expect(goalFormSchema.safeParse({ ...goal, target: "0" }).success).toBe(false);
    expect(goalFormSchema.safeParse({ ...goal, title: " " }).success).toBe(false);
  });

  it("bill and recurring item: refuse three-decimal amounts and impossible dates", () => {
    const bill = {
      id: uuid(3),
      title: "Hostel",
      amount: "100.123",
      dueDate: "2026-11-20",
      categoryId: "",
      subcategoryId: "",
      accountId: "",
      note: "",
    };
    expect(billFormSchema.safeParse(bill).success).toBe(false);
    expect(billFormSchema.safeParse({ ...bill, amount: "100.12" }).success).toBe(true);
    const item = {
      id: uuid(4),
      kind: "expense",
      title: "Rent",
      amount: "500",
      cadence: "monthly",
      intervalCount: "1",
      nextDueDate: "2026-11-20",
      endDate: "2026-11-19",
      mode: "confirm",
      categoryId: "",
      subcategoryId: "",
      accountId: "",
    };
    expect(recurringFormSchema.safeParse(item).success).toBe(false);
    expect(recurringFormSchema.safeParse({ ...item, endDate: "" }).success).toBe(true);
    expect(
      recurringFormSchema.safeParse({ ...item, endDate: "", intervalCount: "13" }).success,
    ).toBe(false);
  });

  it("planning: both fields are optional", () => {
    expect(planningSchema.parse({ nextIncomeDate: "", reserve: "" })).toEqual({
      nextIncomeDate: null,
      reserve: null,
    });
  });
});

describe("plan commands", () => {
  const entry = {
    id: uuid(10),
    type: "expense",
    amountPaise: 5_000,
    occurredAt: "2026-11-10T12:00:00+05:30",
    accountId: uuid(11),
    source: "manual",
  };
  const base = { opId: uuid(12), draft: entry };

  it("maps each to one RPC, with the operation id as the idempotency key", () => {
    const pay = ledgerCommandSchema.parse({
      ...base,
      kind: "pay_commitment",
      commitmentId: uuid(13),
    });
    expect(toRpcCall(pay)).toMatchObject({
      fn: "pay_commitment",
      args: { p_commitment_id: uuid(13), p_expense: { idempotency_key: uuid(12) } },
    });
    const purchase = ledgerCommandSchema.parse({
      ...base,
      kind: "goal_purchase",
      goalId: uuid(14),
      releaseId: uuid(15),
    });
    expect(toRpcCall(purchase)).toMatchObject({
      fn: "record_goal_purchase",
      args: { p_release_id: uuid(15), p_goal_id: uuid(14) },
    });
    const confirm = ledgerCommandSchema.parse({
      ...base,
      kind: "confirm_recurring",
      templateId: uuid(16),
      occurrence: "2026-11-15",
    });
    expect(toRpcCall(confirm)).toMatchObject({
      fn: "confirm_recurring",
      args: { p_template_id: uuid(16), p_occurrence: "2026-11-15" },
    });
  });

  it("undoes a purchase as a batch, and a confirmation by the entry that exists", () => {
    const purchase = ledgerCommandSchema.parse({
      ...base,
      kind: "goal_purchase",
      goalId: uuid(14),
      releaseId: uuid(15),
    });
    expect(inverseCommand(purchase, null, null, uuid(20))).toEqual({
      kind: "undo_batch",
      opId: uuid(20),
      batchId: uuid(15),
    });
    const confirm = ledgerCommandSchema.parse({
      ...base,
      kind: "confirm_recurring",
      templateId: uuid(16),
      occurrence: "2026-11-15",
    });
    const fromOtherDevice = { id: uuid(30) } as Parameters<typeof inverseCommand>[2];
    expect(inverseCommand(confirm, null, fromOtherDevice, uuid(20))).toMatchObject({
      kind: "delete",
      id: uuid(30),
    });
  });

  it("refuses income on a bill or goal purchase, and a tile on anything but an expense", () => {
    const income = { ...entry, type: "income" };
    expect(
      ledgerCommandSchema.safeParse({
        opId: uuid(12),
        draft: income,
        kind: "pay_commitment",
        commitmentId: uuid(13),
      }).success,
    ).toBe(false);
    expect(
      ledgerCommandSchema.safeParse({
        kind: "create",
        opId: uuid(12),
        draft: { ...income, presetId: uuid(17) },
      }).success,
    ).toBe(false);
  });
});

describe("what's due", () => {
  const template = (over: Record<string, unknown>) =>
    recurringTemplateSchema.parse({
      id: uuid(50),
      ownerId: uuid(1),
      kind: "expense",
      title: "Rent",
      amountPaise: 50_000,
      cadence: "monthly",
      anchorDate: "2026-11-15",
      nextDueDate: "2026-11-15",
      ...over,
    });
  const bill = (over: Record<string, unknown> = {}) =>
    commitmentSchema.parse({
      id: uuid(51),
      ownerId: uuid(1),
      title: "Hostel",
      amountPaise: 300_000,
      dueDate: "2026-11-05",
      ...over,
    });
  const input = {
    today: "2026-11-10",
    until: "2026-11-30",
    ledger: [],
    countedIds: [uuid(51)],
  };

  it("labels what's a forecast, a reminder or a bill, and what's overdue or counted", () => {
    const items = dueItems({
      ...input,
      commitments: [bill()],
      templates: [
        template({}),
        template({ id: uuid(52), title: "Mess", mode: "remind" }),
        template({ id: uuid(53), title: "Allowance", kind: "income" }),
      ],
    });
    expect(items[0]).toMatchObject({
      title: "Hostel",
      label: "Bill",
      overdue: true,
      counted: true,
    });
    const named = new Map(items.map((i) => [i.title, i]));
    expect(named.get("Rent")).toMatchObject({ label: "Forecast", counted: false });
    expect(named.get("Mess")).toMatchObject({ label: "Reminder" });
    expect(named.get("Allowance")).toMatchObject({ kind: "income", counted: false });
  });

  it("a paid bill leaves the list and shows as having happened, with what was really paid", () => {
    const paid = expense(310_000, { occurredAt: ist("2026-11-06") });
    const commitments = [bill({ paidTransactionId: paid.id })];
    expect(dueItems({ ...input, commitments, templates: [], ledger: [paid] })).toEqual([]);
    expect(occurredItems(commitments, [], [paid], 5)).toEqual([
      {
        key: uuid(51),
        title: "Hostel",
        amountPaise: 310_000,
        transactionId: paid.id,
        kind: "expense",
      },
    ]);
  });
});
