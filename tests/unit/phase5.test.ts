import {
  type Category,
  categorySchema,
  instantFromLocalDateTime,
  frequentExpenses,
  lastExpense,
  toLocalTime,
} from "@/domain";
import { entryView } from "@/lib/entry-view";
import { formatClock, formatDayLabel } from "@/lib/format";
import { filterHistory, groupByDay, parseHistoryFilters } from "@/lib/history";
import {
  type LedgerCommand,
  type LedgerRecord,
  inverseCommand,
  ledgerCommandSchema,
  toRpcCall,
} from "@/lib/ledger/commands";
import { beforeOpeningText, entriesBeforeOpeningText } from "@/lib/opening-note";
import { presetIcon, shortcutEntries, tileEntries } from "@/lib/quick-entries";
import { commandFromForm, entryFormSchema, parseTags } from "@/lib/validation/transactions";

import {
  BANK,
  BUS,
  CASH,
  FOOD,
  OWNER,
  SNACKS,
  TEA,
  TRANSPORT,
  account,
  expense,
  id,
  income,
  ist,
  istMs,
  refund,
  transfer,
} from "./domain/fixtures";

const uuid = (n: number) => id(8000 + n);

const category = (
  categoryId: string,
  name: string,
  parentId: string | null = null,
  kind: "expense" | "income" = "expense",
): Category => categorySchema.parse({ id: categoryId, ownerId: OWNER, name, parentId, kind });

const CATEGORIES = [
  category(FOOD, "Food & Drinks"),
  category(TEA, "Tea", FOOD),
  category(SNACKS, "Snacks", FOOD),
  category(TRANSPORT, "Transport"),
  category(BUS, "Bus", TRANSPORT),
];

const draft = (overrides: Record<string, unknown> = {}) => ({
  id: uuid(1),
  type: "expense",
  amountPaise: 1500,
  occurredAt: ist("2026-10-05", "09:30"),
  accountId: CASH,
  categoryId: FOOD,
  subcategoryId: TEA,
  ...overrides,
});

const record = (tx: ReturnType<typeof expense>, version = 1): LedgerRecord => ({ ...tx, version });

describe("ledger commands (the single mutation layer)", () => {
  it("maps a create to create_transaction with the client ids and no owner", () => {
    const command = ledgerCommandSchema.parse({ kind: "create", opId: uuid(2), draft: draft() });
    const call = toRpcCall(command);
    expect(call.fn).toBe("create_transaction");
    const tx = call.args.p_tx as Record<string, unknown>;
    expect(tx).toMatchObject({
      id: uuid(1),
      idempotency_key: uuid(2),
      type: "expense",
      amount_paise: 1500,
      currency: "INR",
      account_id: CASH,
      category_id: FOOD,
      subcategory_id: TEA,
      source: "manual",
      tags: [],
    });
    expect(tx).not.toHaveProperty("owner_id");
  });

  it("maps edits, deletes and restores to their RPCs", () => {
    const update = ledgerCommandSchema.parse({
      kind: "update",
      opId: uuid(3),
      id: uuid(1),
      expectedVersion: 2,
      patch: { amountPaise: 2000, subcategoryId: null },
    });
    expect(toRpcCall(update)).toEqual({
      fn: "update_transaction",
      args: {
        p_id: uuid(1),
        p_expected_version: 2,
        p_patch: { amount_paise: 2000, subcategory_id: null },
      },
    });
    expect(toRpcCall({ kind: "delete", opId: uuid(4), id: uuid(1) })).toEqual({
      fn: "set_transaction_deleted",
      args: { p_id: uuid(1), p_deleted: true },
    });
    expect(toRpcCall({ kind: "restore", opId: uuid(5), id: uuid(1) }).args.p_deleted).toBe(false);
  });

  it("rejects malformed commands at the boundary", () => {
    const bad = (d: Record<string, unknown>) =>
      ledgerCommandSchema.safeParse({ kind: "create", opId: uuid(2), draft: draft(d) }).success;
    expect(bad({ amountPaise: 0 })).toBe(false);
    expect(bad({ amountPaise: 12.5 })).toBe(false);
    expect(bad({ accountId: null })).toBe(false);
    expect(bad({ type: "refund" })).toBe(false); // no refundOfId
    expect(
      bad({
        type: "transfer",
        accountId: null,
        categoryId: null,
        subcategoryId: null,
        fromAccountId: CASH,
        toAccountId: CASH,
      }),
    ).toBe(false);
    expect(
      bad({
        type: "transfer",
        accountId: null,
        categoryId: null,
        subcategoryId: null,
        fromAccountId: CASH,
        toAccountId: BANK,
      }),
    ).toBe(true);
    expect(bad({ type: "allocation" })).toBe(false);
    expect(
      ledgerCommandSchema.safeParse({ kind: "create", opId: "x", draft: draft() }).success,
    ).toBe(false);
    // Type and ownership can't be patched; an empty patch isn't a change.
    const patch = (p: Record<string, unknown>) =>
      ledgerCommandSchema.safeParse({
        kind: "update",
        opId: uuid(3),
        id: uuid(1),
        expectedVersion: 1,
        patch: p,
      }).success;
    expect(patch({ type: "income" })).toBe(false);
    expect(patch({ ownerId: OWNER })).toBe(false);
    expect(patch({})).toBe(false);
  });

  it("builds the undo of each command", () => {
    const create = ledgerCommandSchema.parse({ kind: "create", opId: uuid(2), draft: draft() });
    expect(inverseCommand(create, null, null, uuid(9))).toEqual({
      kind: "delete",
      opId: uuid(9),
      id: uuid(1),
    });
    expect(
      inverseCommand({ kind: "delete", opId: uuid(4), id: uuid(1) }, null, null, uuid(9)),
    ).toEqual({
      kind: "restore",
      opId: uuid(9),
      id: uuid(1),
    });

    const before = record(
      expense(1500, { id: uuid(1), categoryId: FOOD, subcategoryId: TEA, description: "chai" }),
      3,
    );
    const after: LedgerRecord = { ...before, amountPaise: 2000, description: "coffee", version: 4 };
    const update: LedgerCommand = {
      kind: "update",
      opId: uuid(3),
      id: uuid(1),
      expectedVersion: 3,
      patch: { amountPaise: 2000, description: "coffee" },
    };
    expect(inverseCommand(update, before, after, uuid(9))).toEqual({
      kind: "update",
      opId: uuid(9),
      id: uuid(1),
      expectedVersion: 4,
      patch: { amountPaise: 1500, description: "chai" },
    });
    expect(inverseCommand(update, null, after, uuid(9))).toBeNull();
  });
});

describe("full form → command", () => {
  const now = istMs("2026-10-26", "18:00");
  const schema = entryFormSchema({ timeZone: "Asia/Kolkata", now });
  const base = {
    mode: "create",
    id: uuid(1),
    opId: uuid(2),
    version: "",
    type: "expense",
    amount: "40",
    categoryId: FOOD,
    subcategoryId: "",
    accountId: CASH,
    fromAccountId: "",
    toAccountId: "",
    refundOfId: "",
    date: "2026-10-26",
    time: "09:30",
    description: "",
    merchant: "",
    note: "",
    tags: "",
  };
  const parse = (o: Record<string, string> = {}) => schema.safeParse({ ...base, ...o });
  const errors = (o: Record<string, string>) => {
    const r = parse(o);
    return r.success
      ? {}
      : Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message]));
  };

  it("needs only an amount and a category (wallet and date come prefilled)", () => {
    const r = parse();
    expect(r.success).toBe(true);
    expect(errors({ amount: "" }).amount).toBe("Enter an amount.");
    expect(errors({ categoryId: "" }).categoryId).toBe("Choose a category.");
    expect(errors({ amount: "12.345" }).amount).toBe("Use at most 2 decimal places (paise).");
  });

  it("records the wall-clock time in the user's timezone (IST by default)", () => {
    const r = parse();
    expect(r.success && r.data.occurredAt).toBe("2026-10-26T04:00:00.000Z");
  });

  it("allows historical dates but not the future", () => {
    expect(parse({ date: "2024-01-15" }).success).toBe(true);
    expect(errors({ date: "2026-10-27", time: "08:00" }).date).toMatch(/future/);
    expect(errors({ time: "18:30" }).date).toMatch(/future/);
  });

  it("checks type-specific fields", () => {
    expect(errors({ type: "refund", categoryId: "" }).refundOfId).toBe(
      "Choose the expense it refunds.",
    );
    expect(
      errors({ type: "transfer", categoryId: "", fromAccountId: CASH, toAccountId: CASH })
        .toAccountId,
    ).toBe("Choose two different wallets.");
    expect(errors({ accountId: "" }).accountId).toBe("Choose a wallet.");
    expect(errors({ mode: "edit", version: "" }).form).toMatch(/out of date/);
  });

  it("builds a create with the user's currency and an update quoting the version", () => {
    const create = parse({ tags: "project, Project, trip" });
    if (!create.success) throw new Error("expected valid");
    const command = commandFromForm(create.data, "INR");
    expect(command).toMatchObject({
      kind: "create",
      opId: uuid(2),
      draft: {
        id: uuid(1),
        type: "expense",
        amountPaise: 4000,
        currency: "INR",
        source: "manual",
        tags: ["project", "trip"],
      },
    });
    expect(ledgerCommandSchema.safeParse(command).success).toBe(true);

    const transfer = parse({ type: "transfer", fromAccountId: CASH, toAccountId: BANK });
    if (!transfer.success) throw new Error("expected valid");
    const t = commandFromForm(transfer.data, "INR");
    expect(t.kind === "create" && t.draft).toMatchObject({
      accountId: null,
      categoryId: null,
      fromAccountId: CASH,
      toAccountId: BANK,
    });
    expect(ledgerCommandSchema.safeParse(t).success).toBe(true);

    const edit = parse({ mode: "edit", version: "3", amount: "55" });
    if (!edit.success) throw new Error("expected valid");
    const u = commandFromForm(edit.data, "INR");
    expect(u).toMatchObject({
      kind: "update",
      id: uuid(1),
      expectedVersion: 3,
      patch: { amountPaise: 5500 },
    });
    expect(ledgerCommandSchema.safeParse(u).success).toBe(true);
  });

  it("parses tags", () => {
    expect(parseTags(" #trip, food ,, Trip ")).toEqual(["trip", "food"]);
  });
});

describe("local date and time", () => {
  it("round-trips wall-clock times in IST and across a DST change", () => {
    const ms = instantFromLocalDateTime("2026-10-26", "23:59", "Asia/Kolkata");
    expect(new Date(ms).toISOString()).toBe("2026-10-26T18:29:00.000Z");
    expect(toLocalTime(ms, "Asia/Kolkata")).toBe("23:59");
    const ny = instantFromLocalDateTime("2026-03-08", "03:30", "America/New_York"); // after spring-forward
    expect(new Date(ny).toISOString()).toBe("2026-03-08T07:30:00.000Z");
  });

  it("formats day headings and clock times", () => {
    expect(formatDayLabel("2026-10-26", "2026-10-26")).toBe("Today");
    expect(formatDayLabel("2026-10-25", "2026-10-26")).toBe("Yesterday");
    expect(formatDayLabel("2026-10-24", "2026-10-26")).toBe("Sat, 24 Oct");
    expect(formatDayLabel("2025-12-31", "2026-10-26")).toBe("Wed, 31 Dec 2025");
    expect(formatClock("00:05")).toBe("12:05 am");
    expect(formatClock("16:05")).toBe("4:05 pm");
  });
});

describe("history", () => {
  const cash = account(CASH, 0, "2026-10-01", "Cash");
  const bank = account(BANK, 0, "2026-10-01", "Bank");
  const tea = expense(1500, {
    categoryId: FOOD,
    subcategoryId: TEA,
    description: "masala chai",
    occurredAt: ist("2026-10-05", "23:30"),
  });
  const bus = expense(2000, {
    categoryId: TRANSPORT,
    subcategoryId: BUS,
    occurredAt: ist("2026-10-06", "00:10"),
    tags: ["college"],
  });
  const back = refund(500, tea.id, { occurredAt: ist("2026-10-07") });
  const move = transfer(10000, CASH, BANK, { occurredAt: ist("2026-10-08") });
  const pay = income(50000, { accountId: BANK, categoryId: null, occurredAt: ist("2026-10-09") });
  const ledger = [tea, bus, back, move, pay];
  const ctx = {
    categoriesById: new Map(CATEGORIES.map((c) => [c.id, c])),
    accountsById: new Map([cash, bank].map((a) => [a.id, a])),
    ledgerById: new Map(ledger.map((t) => [t.id, t])),
    timeZone: "Asia/Kolkata",
  };
  const run = (params: Record<string, string>) =>
    filterHistory(ledger, parseHistoryFilters(params).filters, ctx);

  it("parses filters and reports invalid values instead of guessing", () => {
    const { filters, errors } = parseHistoryFilters({
      type: "nope",
      min: "abc",
      from: "2026-02-30",
      max: "10",
    });
    expect(filters.type).toBeNull();
    expect(errors.min).toBeDefined();
    expect(errors.from).toBe("Choose a valid date.");
    expect(filters.maxPaise).toBe(1000);
    expect(parseHistoryFilters({ from: "2026-10-09", to: "2026-10-01" }).errors.to).toMatch(
      /before/,
    );
  });

  it("filters by type, category (refunds count under their expense), wallet, dates and amount", () => {
    expect(run({ type: "expense" }).map((t) => t.id)).toEqual([bus.id, tea.id]);
    expect(run({ category: TEA }).map((t) => t.id)).toEqual([back.id, tea.id]);
    expect(run({ category: "uncategorized" }).map((t) => t.id)).toEqual([pay.id]);
    expect(run({ account: BANK }).map((t) => t.id)).toEqual([pay.id, move.id]);
    // IST day boundaries: 23:30 on the 5th is the 5th; 00:10 on the 6th is the 6th.
    expect(run({ from: "2026-10-06", to: "2026-10-06" }).map((t) => t.id)).toEqual([bus.id]);
    expect(run({ min: "15", max: "20" }).map((t) => t.id)).toEqual([bus.id, tea.id]);
  });

  it("searches descriptions, tags, category and wallet names", () => {
    expect(run({ q: "chai" }).map((t) => t.id)).toEqual([tea.id]);
    expect(run({ q: "COLLEGE" }).map((t) => t.id)).toEqual([bus.id]);
    expect(run({ q: "transport bus" }).map((t) => t.id)).toEqual([bus.id]);
    expect(run({ q: "bank" }).map((t) => t.id)).toEqual([pay.id, move.id]);
  });

  it("groups newest first by local day", () => {
    const groups = groupByDay(run({}), "Asia/Kolkata");
    expect(groups.map((g) => g.date)).toEqual([
      "2026-10-09",
      "2026-10-08",
      "2026-10-07",
      "2026-10-06",
      "2026-10-05",
    ]);
  });

  it("presents signs by type: out, in, neutral", () => {
    const view = (t: (typeof ledger)[number]) => entryView(t, { ...ctx, currency: "INR" });
    expect(view(tea)).toMatchObject({
      amountLabel: "−₹15",
      tone: "out",
      categoryLabel: "Food & Drinks › Tea",
      walletLabel: "Cash",
    });
    expect(view(pay)).toMatchObject({
      amountLabel: "+₹500",
      tone: "in",
      categoryLabel: "Uncategorized",
    });
    expect(view(back)).toMatchObject({
      amountLabel: "+₹5",
      tone: "in",
      categoryLabel: "Food & Drinks › Tea",
    });
    expect(view(move)).toMatchObject({
      amountLabel: "₹100",
      tone: "neutral",
      walletLabel: "Cash → Bank",
      title: "Transfer",
    });
  });
});

describe("repeat and frequent shortcuts", () => {
  const now = istMs("2026-10-26", "18:00");
  const at = (d: string, created: string) => ({
    occurredAt: ist(d),
    createdAt: created,
    updatedAt: created,
  });

  it("repeats the most recently recorded expense", () => {
    const older = expense(1500, { ...at("2026-10-25", "2026-10-25T10:00:00+05:30") });
    const backdated = expense(9900, { ...at("2026-10-01", "2026-10-26T09:00:00+05:30") });
    expect(lastExpense([older, backdated])?.id).toBe(backdated.id);
    expect(lastExpense([income(100)])).toBeNull();
    expect(lastExpense([expense(100, { deletedAt: "2026-10-26T00:00:00+05:30" })])).toBeNull();
  });

  it("finds entries repeated in the last 60 days, most frequent first", () => {
    const tea = (d: string) =>
      expense(1500, {
        categoryId: FOOD,
        subcategoryId: TEA,
        description: "Tea",
        occurredAt: ist(d),
      });
    const bus = (d: string) =>
      expense(2000, {
        categoryId: TRANSPORT,
        subcategoryId: BUS,
        description: "bus",
        occurredAt: ist(d),
      });
    const ledger = [
      tea("2026-10-20"),
      tea("2026-10-21"),
      tea("2026-10-22"),
      bus("2026-10-21"),
      bus("2026-10-23"),
      expense(1500, {
        categoryId: FOOD,
        subcategoryId: TEA,
        description: "Tea",
        occurredAt: ist("2026-06-01"),
      }), // too old
      expense(4000, { description: "once" }),
    ];
    const frequent = frequentExpenses(ledger, now);
    expect(frequent.map((f) => [f.template.description, f.count])).toEqual([
      ["Tea", 3],
      ["bus", 2],
    ]);
    expect(frequent[0]!.template.occurredAt).toBe(ist("2026-10-22"));
  });

  it("builds tiles from presets and never invents an amount", () => {
    const tiles = tileEntries(
      [
        {
          id: uuid(20),
          label: "Tea",
          icon: "coffee",
          amountPaise: null,
          categoryId: FOOD,
          subcategoryId: TEA,
          archived: false,
        },
        {
          id: uuid(21),
          label: "Custom",
          icon: "plus",
          amountPaise: null,
          categoryId: null,
          subcategoryId: null,
          archived: false,
        },
        {
          id: uuid(22),
          label: "Hidden",
          icon: null,
          amountPaise: 500,
          categoryId: FOOD,
          subcategoryId: null,
          archived: true,
        },
      ],
      CATEGORIES,
    );
    expect(tiles.map((t) => [t.title, t.amountPaise, t.askDetails, t.icon])).toEqual([
      ["Tea", null, false, "coffee"],
      ["Custom", null, true, "circle-plus"],
    ]);
    expect(presetIcon("not-an-icon")).toBeNull();
    const shortcuts = shortcutEntries(
      [expense(1500, { categoryId: FOOD, subcategoryId: TEA, description: "Tea" })],
      CATEGORIES,
      now,
    );
    expect(shortcuts).toHaveLength(1);
    expect(shortcuts[0]).toMatchObject({
      kind: "repeat",
      entry: { title: "Tea", amountPaise: 1500, accountId: CASH },
    });
  });
});

describe("opening-date wording", () => {
  it("is shared by the wallet card, the form and the saved entry", () => {
    expect(entriesBeforeOpeningText(1)).toMatch(/^1 entry is dated before the opening date/);
    expect(entriesBeforeOpeningText(2)).toMatch(/they’re treated as already included/);
    expect(beforeOpeningText("Cash", "1 Oct 2026")).toBe(
      "This date is before Cash’s opening date (1 Oct 2026), so it’s treated as already included in the opening balance and won’t change Cash’s balance. Move the opening date earlier on Wallets if you want it counted.",
    );
    expect(beforeOpeningText("Cash", "1 Oct 2026", true)).toMatch(
      /^This entry is before.*doesn’t change/,
    );
  });
});
