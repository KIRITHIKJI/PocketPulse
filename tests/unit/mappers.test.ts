import { rowToAccount, rowToTransaction } from "@/lib/data/mappers";

const OWNER = "00000000-0000-4000-8000-000000000001";
const ACCOUNT = "00000000-0000-4000-8000-000000000002";
const base = {
  id: "00000000-0000-4000-8000-000000000010",
  owner_id: OWNER,
  currency: "INR",
  description: null,
  merchant: null,
  note: null,
  tags: [],
  source: "quick_add",
  created_at: "2026-10-05T06:30:00+00:00",
  updated_at: "2026-10-05T06:30:00+00:00",
  deleted_at: null,
  voided_at: null,
  occurred_at: "2026-10-05T06:30:00+00:00",
};

describe("rowToTransaction", () => {
  it("maps PostgREST rows (numbers, ISO strings)", () => {
    const tx = rowToTransaction({
      ...base,
      type: "expense",
      amount_paise: 1500,
      account_id: ACCOUNT,
      category_id: null,
    });
    expect(tx).toMatchObject({
      type: "expense",
      amountPaise: 1500,
      accountId: ACCOUNT,
      source: "quick_add",
    });
  });

  it("maps node-postgres rows (int8 strings, Date objects)", () => {
    const tx = rowToTransaction({
      ...base,
      type: "transfer",
      amount_paise: "30000",
      from_account_id: ACCOUNT,
      to_account_id: "00000000-0000-4000-8000-000000000003",
      occurred_at: new Date("2026-10-05T06:30:00Z"),
      created_at: new Date("2026-10-05T06:30:00Z"),
      updated_at: new Date("2026-10-05T06:30:00Z"),
    });
    expect(tx).toMatchObject({
      type: "transfer",
      amountPaise: 30000,
      occurredAt: "2026-10-05T06:30:00.000Z",
    });
  });

  it("maps refunds and goal movements with their links", () => {
    const refund = rowToTransaction({
      ...base,
      type: "refund",
      amount_paise: 100,
      account_id: ACCOUNT,
      refund_of_id: base.id.replace("10", "11"),
    });
    expect(refund.type === "refund" && refund.refundOfId).toBeTruthy();
    const alloc = rowToTransaction({
      ...base,
      type: "allocation",
      amount_paise: 100,
      goal_id: ACCOUNT,
    });
    expect(alloc).toMatchObject({ type: "allocation", goalId: ACCOUNT });
  });

  it("fails loudly on corrupt money instead of guessing", () => {
    expect(() =>
      rowToTransaction({ ...base, type: "expense", amount_paise: "12.5", account_id: ACCOUNT }),
    ).toThrow(/integer paise/);
    expect(() =>
      rowToTransaction({ ...base, type: "expense", amount_paise: 0, account_id: ACCOUNT }),
    ).toThrow();
  });
});

describe("rowToAccount", () => {
  it("keeps the opening balance date as a calendar day", () => {
    const account = rowToAccount({
      id: ACCOUNT,
      owner_id: OWNER,
      name: "Cash",
      kind: "cash",
      currency: "INR",
      opening_balance_paise: "-2500",
      opening_balance_date: "2026-10-01",
      archived_at: null,
    });
    expect(account).toMatchObject({ openingBalancePaise: -2500, openingBalanceDate: "2026-10-01" });
  });
});
