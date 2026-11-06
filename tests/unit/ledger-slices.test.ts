/**
 * Reading part of the ledger must never change a figure. These check the helpers screens use to
 * pick their rows, and that the domain gives the same answers from those rows as from all of them.
 */
import {
  type InsightWords,
  type TimeSettings,
  type Transaction,
  type Weekday,
  addMonths,
  budgetSchema,
  buildInsights,
  calculatePlan,
  comparisonWindows,
  evaluateBudget,
  formatINR,
  ledgerBalances,
  netSpending,
  occurredAtMs,
  resolvePeriod,
  toLocalDate,
} from "@/domain";
import { rowToLedgerBalances } from "@/lib/data/mappers";
import {
  earliestStart,
  isoInstant,
  mergeLedger,
  missingRefundOriginals,
  startForAnyZone,
} from "@/lib/data/slices";

import {
  BANK,
  CASH,
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
} from "./domain/fixtures";

const ZONES = [
  "Asia/Kolkata",
  "Pacific/Kiritimati", // UTC+14
  "Pacific/Pago_Pago", // UTC−11
  "Pacific/Chatham", // +12:45 / +13:45
  "America/New_York",
  "Australia/Lord_Howe", // half-hour daylight saving
  "Europe/London",
  "UTC",
];
const KINDS = [
  "today",
  "yesterday",
  "this_week",
  "previous_week",
  "this_month",
  "previous_month",
] as const;
// Around month ends, a week start, and daylight-saving changes in the zones above.
const NOWS = [
  "2026-11-01T00:10:00Z",
  "2026-10-31T23:50:00Z",
  "2026-11-01T18:31:00Z",
  "2026-03-08T07:30:00Z",
  "2026-04-05T15:59:00Z",
  "2026-10-04T15:00:00Z",
  "2026-12-31T10:30:00Z",
  "2027-01-01T13:59:00Z",
].map(Date.parse);
const WEEK_STARTS: Weekday[] = [0, 1, 6];

describe("startForAnyZone", () => {
  it("is never after the period's real start, in any zone or week start", () => {
    for (const now of NOWS) {
      for (const kind of KINDS) {
        const since = startForAnyZone((s) => [resolvePeriod({ kind }, now, s)])!;
        for (const timeZone of ZONES) {
          for (const weekStartsOn of WEEK_STARTS) {
            const real = resolvePeriod({ kind }, now, { timeZone, weekStartsOn });
            expect(
              since,
              `${kind} ${timeZone} ${weekStartsOn} ${isoInstant(now)}`,
            ).toBeLessThanOrEqual(real.startMs!);
            // And not much earlier: a day or two, or one more period in the hours around its
            // boundary, while the westernmost zone is still in the period before.
            expect(real.startMs! - since).toBeLessThan(34 * 86_400_000);
          }
        }
      }
    }
  });

  it("covers custom periods and the comparison windows before them", () => {
    const now = Date.parse("2026-11-06T09:00:00Z");
    const periodsFor = (s: TimeSettings) => {
      const period = resolvePeriod(
        { kind: "custom", from: "2026-10-10", to: "2026-10-20" },
        now,
        s,
      );
      return [
        period,
        ...(comparisonWindows(period, toLocalDate(now, s.timeZone), 4)?.previous ?? []),
      ];
    };
    const since = startForAnyZone(periodsFor)!;
    for (const timeZone of ZONES) {
      for (const period of periodsFor({ timeZone, weekStartsOn: 1 })) {
        expect(since).toBeLessThanOrEqual(period.startMs!);
      }
    }
  });

  it("means everything when a period has no start", () => {
    expect(startForAnyZone((s) => [resolvePeriod({ kind: "all_time" }, 0, s)])).toBeNull();
    expect(startForAnyZone(() => [])).toBeNull();
    expect(startForAnyZone(() => [null])).toBeNull();
  });
});

describe("earliestStart", () => {
  it("takes the earliest, and null means everything", () => {
    expect(earliestStart(5, 3, 9)).toBe(3);
    expect(earliestStart(5, null, 9)).toBeNull();
  });
});

describe("mergeLedger and missingRefundOriginals", () => {
  it("keeps each row once, newest first then by id, as the database reads them", () => {
    const a = expense(100, { id: id(2), occurredAt: ist("2026-10-05", "10:00") });
    const b = expense(200, { id: id(1), occurredAt: ist("2026-10-05", "10:00") });
    const c = income(300, { id: id(3), occurredAt: ist("2026-10-06") });
    expect(mergeLedger([a, c], [b, a]).map((tx) => tx.id)).toEqual([id(3), id(1), id(2)]);
  });

  it("names the purchases refunds point at that aren't in the rows", () => {
    const old = expense(500, { occurredAt: ist("2026-09-01") });
    const r1 = refund(100, old.id, { occurredAt: ist("2026-10-05") });
    const inside = expense(200, { occurredAt: ist("2026-10-02") });
    const r2 = refund(50, inside.id, { occurredAt: ist("2026-10-06") });
    expect(missingRefundOriginals([r1, inside, r2])).toEqual([old.id]);
    expect(missingRefundOriginals([r1, old])).toEqual([]);
  });
});

/**
 * Six months of mixed entries in IST: purchases and refunds of older purchases, income,
 * transfers, goal money, a deleted and a voided row, recurring and bill payments.
 */
function history(): Transaction[] {
  const rows: Transaction[] = [];
  const months = ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"];
  let n = 5000;
  for (const month of months) {
    for (const day of ["01", "04", "09", "15", "22", "28"]) {
      if (month === "2026-11" && day > "05") continue;
      const date = `${month}-${day}`;
      rows.push(
        expense(1500 + (n % 7) * 100, {
          id: id(n++),
          occurredAt: ist(date, "09:15"),
          description: "Tea",
        }),
        expense(4000 + (n % 5) * 1000, {
          id: id(n++),
          occurredAt: ist(date, "13:00"),
          description: "Lunch",
        }),
      );
    }
    rows.push(
      income(500_000, { id: id(n++), occurredAt: ist(`${month}-01`, "00:00"), accountId: BANK }),
      transfer(100_000, BANK, CASH, { id: id(n++), occurredAt: ist(`${month}-02`) }),
      allocate(20_000, undefined, { id: id(n++), occurredAt: ist(`${month}-03`) }),
    );
  }
  // A refund this month of a purchase from June, and one at IST midnight.
  rows.push(refund(1000, rows[0]!.id, { id: id(n++), occurredAt: ist("2026-11-02") }));
  rows.push(refund(500, rows[2]!.id, { id: id(n++), occurredAt: ist("2026-11-01", "00:00") }));
  rows.push(release(10_000, undefined, { id: id(n++), occurredAt: ist("2026-11-03") }));
  rows.push(
    expense(99_900, { id: id(n++), occurredAt: ist("2026-11-04"), deletedAt: ist("2026-11-04") }),
    expense(88_800, { id: id(n++), occurredAt: ist("2026-11-04"), voidedAt: ist("2026-11-04") }),
  );
  return mergeLedger(rows);
}

const sinceIn = (ledger: Transaction[], since: number | null) => {
  if (since === null) return ledger;
  const window = ledger.filter((tx) => occurredAtMs(tx) >= since);
  const ids = new Set(missingRefundOriginals(window));
  return mergeLedger(
    window,
    ledger.filter((tx) => ids.has(tx.id)),
  );
};

describe("figures from part of the ledger", () => {
  const ledger = history();
  const accounts = [account(CASH, 100_000, "2026-06-01"), account(BANK, 0, "2026-06-01")];
  const now = istMs("2026-11-05", "21:00");
  const settings: TimeSettings = { timeZone: "Asia/Kolkata", weekStartsOn: 1 };
  const today = toLocalDate(now, settings.timeZone);

  it("Home's spending and budgets", () => {
    const since = startForAnyZone((s) =>
      (["today", "this_week", "this_month"] as const).map((kind) =>
        resolvePeriod({ kind }, now, s),
      ),
    );
    const part = sinceIn(ledger, since);
    expect(part.length).toBeLessThan(ledger.length / 3);
    for (const kind of ["today", "this_week", "this_month"] as const) {
      const period = resolvePeriod({ kind }, now, settings);
      expect(netSpending(part, period)).toBe(netSpending(ledger, period));
    }
    const budget = budgetSchema.parse({
      id: id(1),
      ownerId: accounts[0]!.ownerId,
      limitPaise: 1_000_000,
    });
    expect(evaluateBudget(budget, part, now, settings)).toEqual(
      evaluateBudget(budget, ledger, now, settings),
    );
  });

  it("Insights from all spending plus the period's income", () => {
    for (const kind of ["this_month", "previous_month", "this_week"] as const) {
      const since = startForAnyZone((s) => [resolvePeriod({ kind }, now, s)]);
      const part = mergeLedger(
        ledger.filter((tx) => tx.type === "expense" || tx.type === "refund"),
        ledger.filter(
          (tx) => tx.type === "income" && (since === null || occurredAtMs(tx) >= since),
        ),
      );
      const words: InsightWords = {
        period: "this period",
        previous: "the one before",
        unit: "month",
        money: (paise) => formatINR(paise),
        labelOf: (key) => key,
      };
      const input = {
        period: resolvePeriod({ kind }, now, settings),
        today,
        settings,
        thresholdPaise: 5000,
        words,
      };
      expect(buildInsights({ ...input, ledger: part })).toEqual(
        buildInsights({ ...input, ledger }),
      );
    }
  });

  it("the plan from the last month, goal money, payments and the balance", () => {
    const paid = ledger.find((tx) => tx.type === "expense" && tx.occurredAt < ist("2026-07-01"))!;
    const commitments = [
      commitment(30_000, "2026-11-20", { paidTransactionId: paid.id }),
      commitment(20_000, "2026-11-25"),
    ];
    const since = startForAnyZone((s) => {
      const t = toLocalDate(now, s.timeZone);
      return [resolvePeriod({ kind: "custom", from: addMonths(t, -1), to: t }, now, s)];
    })!;
    const part = mergeLedger(
      sinceIn(ledger, since),
      ledger.filter((tx) => tx.type === "allocation" || tx.type === "allocation_release"),
      [paid],
    );
    const input = {
      accounts,
      commitments,
      templates: [],
      now,
      settings,
      nextIncomeDate: "2026-12-01",
    };
    const balance = rowToLedgerBalances(
      {
        accounts: ledgerBalances(accounts, ledger, now, null, "Asia/Kolkata").closing.accounts.map(
          (b) => ({
            account_id: b.accountId,
            opening_paise: null,
            closing_paise: String(b.balancePaise),
            entries_before_opening: 0,
          }),
        ),
        opening_total_paise: null,
        closing_total_paise: String(
          ledgerBalances(accounts, ledger, now, null, "Asia/Kolkata").closing.balancePaise,
        ),
      },
      now,
      null,
    ).closing;
    expect(calculatePlan({ ...input, ledger: part, balance })).toEqual(
      calculatePlan({ ...input, ledger }),
    );
    // Without the balance, the part alone would get it wrong: that's what the balance is for.
    expect(calculatePlan({ ...input, ledger: part }).inputs.balancePaise).not.toBe(
      calculatePlan({ ...input, ledger }).inputs.balancePaise,
    );
    expect(() =>
      calculatePlan({ ...input, ledger: part, balance: { ...balance, asOfMs: 0 } }),
    ).toThrow();
  });
});

describe("rowToLedgerBalances", () => {
  it("refuses totals that aren't the sum of their wallets", () => {
    const row = {
      accounts: [
        { account_id: CASH, opening_paise: null, closing_paise: "100", entries_before_opening: 0 },
      ],
      opening_total_paise: null,
      closing_total_paise: "101",
    };
    expect(() => rowToLedgerBalances(row, 0, null)).toThrow(/add up/);
  });

  it("reads untracked wallets and exact amounts", () => {
    const balances = rowToLedgerBalances(
      {
        accounts: [
          {
            account_id: CASH,
            opening_paise: "-5",
            closing_paise: "999999999999",
            entries_before_opening: 2,
          },
          { account_id: BANK, opening_paise: null, closing_paise: null, entries_before_opening: 0 },
        ],
        opening_total_paise: "-5",
        closing_total_paise: "999999999999",
      },
      20,
      10,
    );
    expect(balances.closing).toMatchObject({
      balancePaise: 999_999_999_999,
      asOfMs: 20,
      untrackedAccountIds: [BANK],
    });
    expect(balances.opening!.accounts[0]).toMatchObject({
      balancePaise: -5,
      tracked: true,
      asOfMs: 10,
    });
    expect(balances.entriesBeforeOpening.get(CASH)).toBe(2);
  });
});
