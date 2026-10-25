/**
 * PROJECT_SPEC.md §7 "Financial invariants — non-negotiable", one block per invariant.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  type Transaction,
  accountBalanceAt,
  accountDelta,
  applyMutation,
  applyMutations,
  calculateSafeToSpend,
  categoryBreakdown,
  consolidatedBalanceAt,
  evaluateBudget,
  formatINR,
  netSpending,
  resolvePeriod,
  summarizePeriod,
  totalEarmarked,
  transactionSchema,
} from "@/domain";

import {
  BANK,
  CASH,
  FOOD,
  OWNER,
  UPI,
  account,
  allocate,
  commitment,
  expense,
  id,
  income,
  ist,
  istMs,
  refund,
  release,
  transfer,
} from "./fixtures";

const NOW = istMs("2026-10-20", "18:00");
const accounts = [account(CASH, 50_000), account(BANK, 200_000), account(UPI, 0)];
const balance = (ledger: Transaction[], at = NOW) =>
  consolidatedBalanceAt(accounts, ledger, at).balancePaise;

describe("1. amounts are positive integer paise; type gives direction", () => {
  const base = {
    id: id(1),
    ownerId: OWNER,
    type: "expense",
    accountId: CASH,
    occurredAt: ist("2026-10-05"),
    createdAt: ist("2026-10-05"),
    updatedAt: ist("2026-10-05"),
  };

  it.each([0, -1500, 12.5, Number.NaN, Number.POSITIVE_INFINITY, 1e15])(
    "rejects amountPaise %s",
    (amountPaise) => {
      expect(transactionSchema.safeParse({ ...base, amountPaise }).success).toBe(false);
    },
  );

  it("accepts a positive integer and derives direction from the type", () => {
    const tx = transactionSchema.parse({ ...base, amountPaise: 1500 });
    expect(accountDelta(tx, CASH)).toBe(-1500);
    const inc = transactionSchema.parse({ ...base, type: "income", amountPaise: 1500 });
    expect(accountDelta(inc, CASH)).toBe(1500);
  });
});

describe("2. account balance = opening + income + transfers in + refunds − expenses − transfers out", () => {
  const coffee = expense(2500, { accountId: CASH });
  const ledger = [
    income(100_000, { accountId: BANK }),
    coffee,
    refund(1000, coffee.id, { accountId: CASH, occurredAt: ist("2026-10-06") }),
    transfer(30_000, BANK, CASH),
    transfer(5_000, CASH, UPI),
    expense(4_000, { accountId: UPI }),
  ];

  it("computes each account from its own activity", () => {
    expect(accountBalanceAt(accounts[0]!, ledger, NOW).balancePaise).toBe(
      50_000 - 2500 + 1000 + 30_000 - 5_000,
    );
    expect(accountBalanceAt(accounts[1]!, ledger, NOW).balancePaise).toBe(
      200_000 + 100_000 - 30_000,
    );
    expect(accountBalanceAt(accounts[2]!, ledger, NOW).balancePaise).toBe(5_000 - 4_000);
  });

  it("transfers net to zero across all owned accounts", () => {
    const transfers = ledger.filter((t) => t.type === "transfer");
    for (const t of transfers) {
      expect(accounts.reduce((sum, a) => sum + accountDelta(t, a.id), 0)).toBe(0);
    }
  });
});

describe("3. consolidated = opening total + income + refunds − expenses; transfers don't change it", () => {
  const coffee = expense(2500);
  const ledger = [income(100_000, { accountId: BANK }), coffee, refund(1000, coffee.id)];

  it("matches the flow formula", () => {
    expect(balance(ledger)).toBe(250_000 + 100_000 + 1000 - 2500);
  });

  it("is unchanged by any number of internal transfers", () => {
    const withTransfers = [
      ...ledger,
      transfer(30_000, BANK, CASH),
      transfer(10_000, CASH, UPI),
      transfer(10_000, UPI, BANK),
    ];
    expect(balance(withTransfers)).toBe(balance(ledger));
    const oct = resolvePeriod({ kind: "this_month" }, NOW);
    const summary = summarizePeriod(accounts, withTransfers, oct, NOW);
    expect(summary.incomePaise).toBe(100_000);
    expect(summary.expensesPaise).toBe(2500);
    expect(summary.transferredPaise).toBe(50_000);
  });
});

describe("4. savings allocations don't change tracked money", () => {
  it("changes earmarks and safe-to-spend only", () => {
    const base = [income(100_000)];
    const withSavings = [...base, allocate(40_000), release(10_000)];
    expect(balance(withSavings)).toBe(balance(base));
    expect(totalEarmarked(withSavings)).toBe(30_000);

    const oct = resolvePeriod({ kind: "this_month" }, NOW);
    expect(netSpending(withSavings, oct)).toBe(0);
    expect(summarizePeriod(accounts, withSavings, oct, NOW).incomePaise).toBe(100_000);

    const sts = (ledger: Transaction[]) =>
      calculateSafeToSpend({
        accounts,
        ledger,
        commitments: [],
        now: NOW,
        nextIncomeDate: "2026-11-01",
      }).flexiblePaise;
    expect(sts(base) - sts(withSavings)).toBe(30_000);
  });
});

describe("5. safe-to-spend never double-subtracts paid expenses or commitments", () => {
  it("subtracts an unpaid bill once, and only the expense once it's paid", () => {
    const rentDue = commitment(20_000, "2026-10-25");
    const before = calculateSafeToSpend({
      accounts,
      ledger: [],
      commitments: [rentDue],
      now: NOW,
      nextIncomeDate: "2026-11-01",
    });
    expect(before.flexiblePaise).toBe(250_000 - 20_000);

    const payment = expense(20_000, { occurredAt: ist("2026-10-20", "09:00") });
    const after = calculateSafeToSpend({
      accounts,
      ledger: [payment],
      commitments: [{ ...rentDue, paidTransactionId: payment.id }],
      now: NOW,
      nextIncomeDate: "2026-11-01",
    });
    expect(after.flexiblePaise).toBe(before.flexiblePaise);
    expect(after.inputs.commitmentIds).toEqual([]);
  });
});

describe("6. one set of period boundaries for every figure", () => {
  it("summary, breakdown and budget agree on the same transactions at midnight edges", () => {
    const ledger = [
      expense(1000, { occurredAt: ist("2026-09-30", "23:59") }),
      expense(2000, { occurredAt: ist("2026-10-01", "00:00") }),
      expense(3000, { occurredAt: ist("2026-10-31", "23:59") }),
      expense(4000, { occurredAt: ist("2026-11-01", "00:00") }),
    ];
    const now = istMs("2026-11-05");
    const oct = resolvePeriod({ kind: "previous_month" }, now);
    const summary = summarizePeriod(accounts, ledger, oct, now);
    const breakdown = categoryBreakdown(ledger, oct);
    const budget = evaluateBudget(
      {
        id: id(1),
        ownerId: OWNER,
        categoryId: null,
        limitPaise: 10_000,
        period: "monthly",
        customFrom: null,
        customTo: null,
        alertThresholdsBp: [],
      },
      ledger,
      now,
      undefined,
      oct,
    );
    expect(summary.expensesPaise).toBe(5000);
    expect(breakdown.netPaise).toBe(5000);
    expect(budget.spentPaise).toBe(5000);
    expect(summary.closing.balancePaise - summary.opening.balancePaise).toBe(-5000);
  });
});

describe("7. edits and deletes recalculate; retries never duplicate", () => {
  it("replaying a create is a no-op and edits/deletes flow into every total", () => {
    const tea = expense(1500, { categoryId: FOOD });
    const oct = resolvePeriod({ kind: "this_month" }, NOW);
    let { ledger } = applyMutations(
      [],
      [
        { kind: "create", tx: tea },
        { kind: "create", tx: tea }, // network retry
        { kind: "create", tx: tea }, // sync replay
      ],
    );
    expect(ledger).toHaveLength(1);
    expect(balance(ledger)).toBe(250_000 - 1500);

    const edited = { ...tea, amountPaise: 2000, updatedAt: ist("2026-10-06") };
    ledger = applyMutation(ledger, {
      kind: "update",
      tx: edited,
      expectedUpdatedAt: tea.updatedAt,
    }).ledger;
    expect(balance(ledger)).toBe(250_000 - 2000);
    expect(netSpending(ledger, oct, FOOD)).toBe(2000);

    ledger = applyMutation(ledger, { kind: "delete", id: tea.id, at: ist("2026-10-07") }).ledger;
    expect(balance(ledger)).toBe(250_000);
    expect(categoryBreakdown(ledger, oct).categories).toEqual([]);

    ledger = applyMutation(ledger, {
      kind: "restore",
      id: tea.id,
      at: ist("2026-10-07", "12:01"),
    }).ledger;
    expect(balance(ledger)).toBe(250_000 - 2000);
  });
});

describe("8. no binary floating point for money", () => {
  const domainDir = join(process.cwd(), "src", "domain");
  const sources = readdirSync(domainDir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => readFileSync(join(domainDir, f), "utf8"));

  it("domain code never uses parseFloat or toFixed", () => {
    for (const src of sources) {
      expect(src).not.toMatch(/parseFloat\(|\.toFixed\(/);
    }
  });

  it("10 000 × ₹0.10 is exactly ₹1,000", () => {
    const ledger = Array.from({ length: 10_000 }, (_, i) =>
      expense(10, { id: id(50_000 + i), occurredAt: ist("2026-10-05") }),
    );
    const oct = resolvePeriod({ kind: "this_month" }, NOW);
    expect(netSpending(ledger, oct)).toBe(100_000);
    expect(formatINR(netSpending(ledger, oct))).toBe("₹1,000");
  });
});

describe("9. every balance figure states its scope and time", () => {
  it("balances and summaries carry scope and as-of instants", () => {
    const b = consolidatedBalanceAt(accounts, [], NOW);
    expect(b).toMatchObject({ scope: "consolidated", asOfMs: NOW });
    expect(accountBalanceAt(accounts[0]!, [], NOW)).toMatchObject({
      scope: "account",
      asOfMs: NOW,
    });
    const s = summarizePeriod(accounts, [], resolvePeriod({ kind: "this_month" }, NOW), NOW);
    expect(s.closing).toEqual({ balancePaise: 250_000, asOfMs: NOW, provisional: true });
    expect(s.opening.asOfMs).toBe(istMs("2026-10-01", "00:00"));
  });
});

describe("10. historical closing balances come from the ledger, not today's balance", () => {
  it("reconstructs September's month-end even after later activity", () => {
    const sepAccounts = [account(CASH, 100_000, "2026-09-01")];
    const ledger = [
      income(50_000, { occurredAt: ist("2026-09-10") }),
      expense(20_000, { occurredAt: ist("2026-09-20") }),
      expense(70_000, { occurredAt: ist("2026-10-02") }),
    ];
    const sep = resolvePeriod({ kind: "previous_month" }, NOW);
    const summary = summarizePeriod(sepAccounts, ledger, sep, NOW);
    expect(summary.opening.balancePaise).toBe(100_000);
    expect(summary.closing).toEqual({
      balancePaise: 130_000,
      asOfMs: istMs("2026-10-01", "00:00"),
      provisional: false,
    });
    expect(consolidatedBalanceAt(sepAccounts, ledger, NOW).balancePaise).toBe(60_000);
    expect(summary.closing.balancePaise).not.toBe(60_000);
  });
});
