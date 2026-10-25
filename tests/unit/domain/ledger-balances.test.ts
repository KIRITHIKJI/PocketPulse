import {
  accountBalanceAt,
  activeTransactions,
  applyMutation,
  consolidatedBalanceAt,
  refundableAmount,
  refundedAmount,
  resolvePeriod,
  summarizePeriod,
  transactionSchema,
  validateLedger,
} from "@/domain";

import {
  BANK,
  CASH,
  OTHER_OWNER,
  OWNER,
  account,
  allocate,
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

describe("transaction schema", () => {
  const common = {
    id: id(1),
    ownerId: OWNER,
    amountPaise: 1000,
    occurredAt: ist("2026-10-05"),
    createdAt: ist("2026-10-05"),
    updatedAt: ist("2026-10-05"),
  };

  it("applies defaults for optional fields", () => {
    const tx = transactionSchema.parse({ ...common, type: "expense", accountId: CASH });
    expect(tx).toMatchObject({
      currency: "INR",
      source: "manual",
      tags: [],
      categoryId: null,
      deletedAt: null,
      voidedAt: null,
      note: null,
    });
  });

  it("requires the right links per type", () => {
    expect(
      transactionSchema.safeParse({ ...common, type: "refund", accountId: CASH }).success,
    ).toBe(false);
    expect(transactionSchema.safeParse({ ...common, type: "allocation" }).success).toBe(false);
    expect(
      transactionSchema.safeParse({ ...common, type: "transfer", fromAccountId: CASH }).success,
    ).toBe(false);
    expect(transactionSchema.safeParse({ ...common, type: "bonus", accountId: CASH }).success).toBe(
      false,
    );
  });

  it("rejects transfers to the same account and orphan subcategories", () => {
    const sameAccount = transactionSchema.safeParse({
      ...common,
      type: "transfer",
      fromAccountId: CASH,
      toAccountId: CASH,
    });
    expect(sameAccount.success).toBe(false);
    const orphan = transactionSchema.safeParse({
      ...common,
      type: "expense",
      accountId: CASH,
      subcategoryId: id(5),
    });
    expect(orphan.success).toBe(false);
  });

  it("rejects timestamps without an offset and unsupported currencies", () => {
    const base = { ...common, type: "expense", accountId: CASH };
    expect(transactionSchema.safeParse({ ...base, occurredAt: "2026-10-05 12:00" }).success).toBe(
      false,
    );
    expect(transactionSchema.safeParse({ ...base, currency: "XYZ" }).success).toBe(false);
  });
});

describe("opening balance and effective date", () => {
  const cash = account(CASH, 100_000, "2026-10-10");

  it("is the balance at local midnight of the effective date", () => {
    expect(accountBalanceAt(cash, [], istMs("2026-10-10", "00:00")).balancePaise).toBe(100_000);
    const before = accountBalanceAt(cash, [], istMs("2026-10-09", "23:59"));
    expect(before).toMatchObject({ balancePaise: null, tracked: false });
  });

  it("ignores activity dated before the effective date (already in the opening balance)", () => {
    const ledger = [
      expense(5000, { occurredAt: ist("2026-10-09", "23:59") }),
      expense(3000, { occurredAt: ist("2026-10-10", "00:00") }),
    ];
    expect(accountBalanceAt(cash, ledger, NOW).balancePaise).toBe(97_000);
    expect(validateLedger(ledger, [cash]).map((i) => i.code)).toEqual(["before_opening_date"]);
  });

  it("excludes not-yet-tracked accounts from consolidated history and names them", () => {
    const bank = account(BANK, 40_000, "2026-10-15");
    const result = consolidatedBalanceAt([cash, bank], [], istMs("2026-10-12"));
    expect(result.balancePaise).toBe(100_000);
    expect(result.untrackedAccountIds).toEqual([BANK]);
  });

  it("reconciles a period in which an account started being tracked", () => {
    const bank = account(BANK, 40_000, "2026-10-15");
    const ledger = [income(10_000, { accountId: BANK, occurredAt: ist("2026-10-16") })];
    const oct = resolvePeriod({ kind: "this_month" }, NOW);
    const s = summarizePeriod([cash, bank], ledger, oct, NOW);
    expect(s.opening.balancePaise).toBe(0); // neither tracked on 1 Oct
    expect(s.newlyTrackedOpeningPaise).toBe(140_000);
    expect(s.closing.balancePaise).toBe(150_000);
    expect(s.closing.balancePaise).toBe(
      s.opening.balancePaise + s.newlyTrackedOpeningPaise + s.netMovementPaise,
    );
  });

  it("allows negative and zero opening balances", () => {
    const overdrawn = account(CASH, -2_000);
    expect(accountBalanceAt(overdrawn, [income(5_000)], NOW).balancePaise).toBe(3_000);
  });
});

describe("period summary", () => {
  const accounts = [account(CASH, 100_000, "2026-09-01"), account(BANK, 0, "2026-09-01")];
  const shoes = expense(80_000, { occurredAt: ist("2026-10-03") });
  const ledger = [
    income(300_000, { accountId: BANK, occurredAt: ist("2026-09-01", "10:00") }),
    expense(20_000, { occurredAt: ist("2026-09-15") }),
    income(300_000, { accountId: BANK, occurredAt: ist("2026-10-01", "10:00") }),
    shoes,
    refund(30_000, shoes.id, { occurredAt: ist("2026-10-08") }),
    transfer(50_000, BANK, CASH, { occurredAt: ist("2026-10-04") }),
    allocate(25_000, undefined, { occurredAt: ist("2026-10-05") }),
    expense(1_000, { occurredAt: ist("2026-10-25") }), // after NOW: not in a balance "as of now"
  ];

  it("closing = opening + income + refunds − expenses (+ newly tracked)", () => {
    const oct = resolvePeriod({ kind: "this_month" }, NOW);
    const s = summarizePeriod(accounts, ledger, oct, NOW);
    expect(s.opening.balancePaise).toBe(100_000 + 300_000 - 20_000);
    expect(s.incomePaise).toBe(300_000);
    expect(s.expensesPaise).toBe(80_000);
    expect(s.refundsPaise).toBe(30_000);
    expect(s.netSpendingPaise).toBe(50_000);
    expect(s.netMovementPaise).toBe(250_000);
    expect(s.closing.balancePaise).toBe(s.opening.balancePaise + s.netMovementPaise);
    expect(s.allocatedPaise).toBe(25_000);
    expect(s.counts).toEqual({ income: 1, expense: 1, refund: 1, transfer: 1, allocation: 1 });
  });

  it("previous month's opening and closing chain into this month", () => {
    const sep = summarizePeriod(
      accounts,
      ledger,
      resolvePeriod({ kind: "previous_month" }, NOW),
      NOW,
    );
    const oct = summarizePeriod(accounts, ledger, resolvePeriod({ kind: "this_month" }, NOW), NOW);
    expect(sep.opening.balancePaise).toBe(100_000);
    expect(sep.closing.balancePaise).toBe(380_000);
    expect(oct.opening.balancePaise).toBe(sep.closing.balancePaise);
  });

  it("all-time starts from the opening balances", () => {
    const all = summarizePeriod(accounts, ledger, resolvePeriod({ kind: "all_time" }, NOW), NOW);
    expect(all.opening).toEqual({ balancePaise: 100_000, asOfMs: null });
    expect(all.closing.balancePaise).toBe(100_000 + all.netMovementPaise);
    expect(all.closing.balancePaise).toBe(
      consolidatedBalanceAt(accounts, ledger, NOW).balancePaise,
    );
  });

  it("excludes voided and deleted transactions everywhere", () => {
    const voided = { ...income(999_999), voidedAt: ist("2026-10-06") };
    const deleted = { ...expense(888_888), deletedAt: ist("2026-10-06") };
    const oct = resolvePeriod({ kind: "this_month" }, NOW);
    const plain = summarizePeriod(accounts, ledger, oct, NOW);
    const noisy = summarizePeriod(accounts, [...ledger, voided, deleted], oct, NOW);
    expect(noisy).toEqual(plain);
    expect(activeTransactions([voided, deleted])).toEqual([]);
  });
});

describe("refunds", () => {
  const cash = account(CASH, 0);
  const order = expense(50_000);

  it("track refunded and refundable amounts", () => {
    const r1 = refund(20_000, order.id, { occurredAt: ist("2026-10-06") });
    const ledger = [order, r1];
    expect(refundedAmount(order.id, ledger)).toBe(20_000);
    expect(refundableAmount(order.id, ledger)).toBe(30_000);
    expect(refundableAmount(order.id, [order, { ...r1, deletedAt: ist("2026-10-07") }])).toBe(
      50_000,
    );
    expect(refundableAmount(id(424242), ledger)).toBe(0);
  });

  it("flag over-refunds, refunds before the expense and missing links", () => {
    const ledger = [
      order,
      refund(30_000, order.id, { occurredAt: ist("2026-10-06") }),
      refund(30_000, order.id, { occurredAt: ist("2026-10-07") }),
      refund(1_000, order.id, { occurredAt: ist("2026-10-04") }),
      refund(1_000, id(424242)),
    ];
    const codes = validateLedger(ledger, [cash]).map((i) => i.code);
    expect(codes).toContain("refund_exceeds_expense");
    expect(codes).toContain("refund_before_expense");
    expect(codes).toContain("refund_without_expense");
  });

  it("is counted as a refund, never as income", () => {
    const oct = resolvePeriod({ kind: "this_month" }, NOW);
    const s = summarizePeriod([cash], [order, refund(20_000, order.id)], oct, NOW);
    expect(s.incomePaise).toBe(0);
    expect(s.refundsPaise).toBe(20_000);
    expect(s.closing.balancePaise).toBe(-30_000);
  });
});

describe("validateLedger", () => {
  const cash = account(CASH, 0);

  it("accepts a clean ledger", () => {
    expect(
      validateLedger([income(10_000), expense(2_000), allocate(5_000), release(5_000)], [cash]),
    ).toEqual([]);
  });

  it("flags releasing more than was set aside, in date order", () => {
    const ledger = [
      allocate(5_000, undefined, { occurredAt: ist("2026-10-02") }),
      release(6_000, undefined, { occurredAt: ist("2026-10-03") }),
    ];
    expect(validateLedger(ledger, [cash]).map((i) => i.code)).toEqual([
      "release_exceeds_allocation",
    ]);
  });

  it("flags unknown accounts, foreign owners and currency mismatches", () => {
    const usd = { ...expense(100), currency: "USD" as const };
    const foreign = { ...expense(100), ownerId: OTHER_OWNER };
    const codes = validateLedger([usd, foreign, expense(100, { accountId: BANK })], [cash], {
      ownerId: OWNER,
    }).map((i) => i.code);
    expect(codes).toEqual(["currency_mismatch", "foreign_owner", "unknown_account"]);
  });
});

describe("applyMutation", () => {
  const tea = expense(1500);

  it("treats a re-used id with different content as a conflict, not an overwrite", () => {
    const r = applyMutation([tea], { kind: "create", tx: { ...tea, amountPaise: 9_999 } });
    expect(r.outcome).toBe("conflict");
    expect(r.ledger).toEqual([tea]);
  });

  it("rejects stale updates, owner changes and unknown ids", () => {
    const changed = { ...tea, amountPaise: 2000, updatedAt: ist("2026-10-09") };
    expect(
      applyMutation([tea], { kind: "update", tx: changed, expectedUpdatedAt: ist("2026-09-01") })
        .outcome,
    ).toBe("conflict");
    expect(
      applyMutation([tea], {
        kind: "update",
        tx: { ...changed, ownerId: OTHER_OWNER },
        expectedUpdatedAt: tea.updatedAt,
      }).outcome,
    ).toBe("conflict");
    expect(applyMutation([], { kind: "delete", id: tea.id, at: ist("2026-10-09") }).outcome).toBe(
      "not_found",
    );
  });

  it("makes delete, restore and repeated updates idempotent", () => {
    const at = ist("2026-10-09");
    const deleted = applyMutation([tea], { kind: "delete", id: tea.id, at });
    expect(deleted.outcome).toBe("applied");
    expect(deleted.ledger[0]!.deletedAt).toBe(at);
    expect(applyMutation(deleted.ledger, { kind: "delete", id: tea.id, at }).outcome).toBe(
      "duplicate",
    );
    const restored = applyMutation(deleted.ledger, { kind: "restore", id: tea.id, at });
    expect(restored.ledger[0]!.deletedAt).toBeNull();
    expect(applyMutation(restored.ledger, { kind: "restore", id: tea.id, at }).outcome).toBe(
      "duplicate",
    );

    const changed = { ...tea, amountPaise: 2000, updatedAt: at };
    const once = applyMutation([tea], {
      kind: "update",
      tx: changed,
      expectedUpdatedAt: tea.updatedAt,
    });
    const twice = applyMutation(once.ledger, {
      kind: "update",
      tx: changed,
      expectedUpdatedAt: tea.updatedAt,
    });
    expect(twice.outcome).toBe("duplicate");
    expect(twice.ledger).toEqual(once.ledger);
  });

  it("never mutates the input ledger", () => {
    const ledger = Object.freeze([tea]);
    applyMutation(ledger, { kind: "delete", id: tea.id, at: ist("2026-10-09") });
    expect(ledger[0]!.deletedAt).toBeNull();
  });
});
