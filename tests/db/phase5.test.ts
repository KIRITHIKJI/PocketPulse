import {
  type Transaction,
  accountBalanceAt,
  categoryBreakdown,
  consolidatedBalanceAt,
  resolvePeriod,
} from "@/domain";
import { rowToAccount, rowToTransaction } from "@/lib/data/mappers";
import type { LedgerCommand, LedgerCommandInput } from "@/lib/ledger/commands";
import { ledgerCommandSchema } from "@/lib/ledger/commands";
import { type LedgerPort, runLedgerCommandWith } from "@/lib/ledger/executor";

import { A, A_BANK, A_CASH, B, type Fixtures, seedFixtures, tid } from "./fixtures";
import { ADMIN_URL, SKIP_REASON, type Session, type TestDb, as, createTestDb } from "./harness";

// Phase 5: the app's single mutation layer (commands → executor → RPCs) against the real schema,
// RLS and integrity triggers. Balances and category totals are recomputed by the domain layer
// from the rows, exactly as the screens do.

const AS_OF = Date.parse("2026-11-01T00:00:00+05:30");
const TZ = "Asia/Kolkata";
let ops = 0;
const op = () => tid(900_000 + ++ops);

function cast(value: unknown): string {
  if (typeof value === "boolean") return "::boolean";
  if (typeof value === "number") return "::integer";
  if (typeof value === "string") return "::uuid";
  return "::jsonb";
}

/** The executor's port over a test session: same reads and RPC calls as the Supabase client. */
let n = 0;
function pgPort(s: Session): LedgerPort {
  return {
    async readRow(id) {
      const { rows } = await s.q("select * from public.transactions where id = $1", [id]);
      return { row: rows[0] ?? null, error: null };
    },
    async call({ fn, args }) {
      const entries = Object.entries(args);
      const sql = `select public.${fn}(${entries
        .map(([name, value], i) => `${name} => $${i + 1}${cast(value)}`)
        .join(", ")}) as r`;
      const params = entries.map(([, v]) =>
        v !== null && typeof v === "object" ? JSON.stringify(v) : v,
      );
      const sp = `cmd_${n++}`;
      await s.q(`savepoint ${sp}`);
      try {
        const { rows } = await s.q(sql, params);
        await s.q(`release savepoint ${sp}`);
        return { data: rows[0]!.r, error: null };
      } catch (e) {
        await s.q(`rollback to savepoint ${sp}`);
        const err = e as { code?: string; message?: string };
        return { data: null, error: { code: err.code, message: err.message } };
      }
    },
  };
}

async function ledgerOf(s: Session) {
  const accounts = (await s.q("select * from public.accounts")).rows.map(rowToAccount);
  const ledger: Transaction[] = (await s.q("select * from public.transactions")).rows.map(
    rowToTransaction,
  );
  return { accounts, ledger };
}

async function totals(s: Session) {
  const { accounts, ledger } = await ledgerOf(s);
  const total = consolidatedBalanceAt(accounts, ledger, AS_OF, TZ).balancePaise;
  const of = (id: string) =>
    accountBalanceAt(
      accounts.find((a) => a.id === id)!,
      ledger,
      AS_OF,
      TZ,
    ).balancePaise;
  return { total, cash: of(A_CASH), bank: of(A_BANK), ledger };
}

describe.skipIf(!ADMIN_URL)("Phase 5: ledger mutation layer", () => {
  let db: TestDb;
  let f: Fixtures;
  // A starts with ₹1,000 cash + ₹5,000 bank (+ an empty USD wallet).
  const START = 600_000;

  beforeAll(async () => {
    db = await createTestDb();
    f = await seedFixtures(db);
  });
  afterAll(async () => {
    await db?.close();
  });

  const create = (id: string, draft: Record<string, unknown>, opId = op()): LedgerCommand =>
    ledgerCommandSchema.parse({
      kind: "create",
      opId,
      draft: {
        id,
        type: "expense",
        amountPaise: 1500,
        occurredAt: "2026-10-05T09:30:00+05:30",
        accountId: A_CASH,
        categoryId: f.aFood,
        subcategoryId: f.aTea,
        description: "Tea",
        source: "quick_add",
        ...draft,
      },
    } satisfies LedgerCommandInput);

  it("income and expense change the balance in the right direction", async () => {
    await as(db, A, async (s) => {
      const run = (c: LedgerCommand) => runLedgerCommandWith(pgPort(s), c);
      expect((await totals(s)).total).toBe(START);
      expect(await run(create(tid(1), {}))).toMatchObject({ ok: true, status: "applied" });
      expect((await totals(s)).total).toBe(START - 1500);
      const salary = create(tid(2), {
        type: "income",
        amountPaise: 50_000,
        categoryId: f.aAllowance,
        subcategoryId: null,
        description: "Pocket money",
      });
      expect(await run(salary)).toMatchObject({ ok: true, status: "applied" });
      const t = await totals(s);
      expect(t.total).toBe(START - 1500 + 50_000);
      expect(t.cash).toBe(100_000 - 1500 + 50_000);
    });
  });

  it("a double submit or retry of the same command never duplicates the expense", async () => {
    await as(db, A, async (s) => {
      const run = (c: LedgerCommand) => runLedgerCommandWith(pgPort(s), c);
      const tea = create(tid(10), {});
      // One connection runs statements in order, so a double tap here is two sequential sends.
      expect(await run(tea)).toMatchObject({ ok: true, status: "applied" });
      const again = await run(tea);
      expect(again).toMatchObject({ ok: true, status: "duplicate" });
      // The duplicate still offers the same undo target, never a second row.
      expect(again.ok && again.undo).toMatchObject({ kind: "delete", id: tid(10) });
      const { rows } = await s.q(
        "select count(*)::int as n from public.transactions where id = $1",
        [tid(10)],
      );
      expect(rows[0]!.n).toBe(1);
      expect((await totals(s)).total).toBe(START - 1500);

      // Reusing the id for different content is a conflict, not an overwrite.
      const changed = create(tid(10), { amountPaise: 9_900 }, tea.opId);
      expect(await run(changed)).toMatchObject({ ok: false, status: "conflict" });
      // Reusing the operation id (idempotency key) for another entry is refused too.
      expect(await run(create(tid(11), {}, tea.opId))).toMatchObject({
        ok: false,
        status: "conflict",
      });
      expect((await totals(s)).total).toBe(START - 1500);
    });
  });

  it("an edit recalculates balance and category totals; undo restores the old values", async () => {
    await as(db, A, async (s) => {
      const run = (c: LedgerCommand) => runLedgerCommandWith(pgPort(s), c);
      await run(create(tid(20), {}));
      const edit = ledgerCommandSchema.parse({
        kind: "update",
        opId: op(),
        id: tid(20),
        expectedVersion: 1,
        patch: { amountPaise: 4_000, subcategoryId: f.aSnacks, description: "Samosa" },
      });
      const edited = await run(edit);
      expect(edited).toMatchObject({
        ok: true,
        status: "applied",
        record: { amountPaise: 4_000, version: 2 },
      });
      let t = await totals(s);
      expect(t.total).toBe(START - 4_000);
      const october = resolvePeriod(
        { kind: "custom", from: "2026-10-01", to: "2026-10-31" },
        AS_OF,
        {
          timeZone: TZ,
          weekStartsOn: 1,
        },
      );
      const food = categoryBreakdown(t.ledger, october).categories.find((c) => c.key === f.aFood)!;
      expect(food.subcategories.map((g) => [g.key, g.netPaise])).toEqual([[f.aSnacks, 4_000]]);

      // A stale edit (from another device) is a conflict and changes nothing.
      const stale = await run({
        kind: "update",
        opId: op(),
        id: tid(20),
        expectedVersion: 1,
        patch: { amountPaise: 100 },
      });
      expect(stale).toMatchObject({ ok: false, status: "conflict" });
      expect((await totals(s)).total).toBe(START - 4_000);

      // Undo puts back exactly what the edit replaced.
      if (!edited.ok || !edited.undo) throw new Error("expected an undo");
      expect(edited.undo).toMatchObject({
        kind: "update",
        expectedVersion: 2,
        patch: { amountPaise: 1_500, subcategoryId: f.aTea, description: "Tea" },
      });
      expect(await run(edited.undo)).toMatchObject({ ok: true, status: "applied" });
      t = await totals(s);
      expect(t.total).toBe(START - 1_500);
      const tea = categoryBreakdown(t.ledger, october).categories.find((c) => c.key === f.aFood)!;
      expect(tea.subcategories.map((g) => [g.key, g.netPaise])).toEqual([[f.aTea, 1_500]]);
      // Replaying the undo is harmless.
      expect(await run(edited.undo)).toMatchObject({ ok: true, status: "duplicate" });
    });
  });

  it("delete recalculates the balance and undo restores the same entry", async () => {
    await as(db, A, async (s) => {
      const run = (c: LedgerCommand) => runLedgerCommandWith(pgPort(s), c);
      const added = await run(create(tid(30), {}));
      expect((await totals(s)).total).toBe(START - 1_500);
      const del = await run({ kind: "delete", opId: op(), id: tid(30) });
      expect(del).toMatchObject({
        ok: true,
        status: "applied",
        undo: { kind: "restore", id: tid(30) },
      });
      expect((await totals(s)).total).toBe(START);
      // Soft delete: the row is kept for history and sync, but excluded from every total.
      const { rows } = await s.q("select deleted_at from public.transactions where id = $1", [
        tid(30),
      ]);
      expect(rows[0]!.deleted_at).not.toBeNull();
      expect(await run({ kind: "delete", opId: op(), id: tid(30) })).toMatchObject({
        status: "duplicate",
      });

      if (!del.ok || !del.undo) throw new Error("expected an undo");
      expect(await run(del.undo)).toMatchObject({ ok: true, status: "applied" });
      expect((await totals(s)).total).toBe(START - 1_500);

      // Undo of the original create removes it again.
      if (!added.ok || !added.undo) throw new Error("expected an undo");
      expect(added.undo).toMatchObject({ kind: "delete", id: tid(30) });
      expect(await run(added.undo)).toMatchObject({ ok: true, status: "applied" });
      expect((await totals(s)).total).toBe(START);
    });
  });

  it("a transfer moves money between wallets without changing the consolidated balance", async () => {
    await as(db, A, async (s) => {
      const run = (c: LedgerCommand) => runLedgerCommandWith(pgPort(s), c);
      const move = create(tid(40), {
        type: "transfer",
        amountPaise: 20_000,
        accountId: null,
        fromAccountId: A_CASH,
        toAccountId: A_BANK,
        categoryId: null,
        subcategoryId: null,
        description: null,
        source: "manual",
      });
      expect(await run(move)).toMatchObject({ ok: true, status: "applied" });
      const t = await totals(s);
      expect(t.total).toBe(START);
      expect(t.cash).toBe(100_000 - 20_000);
      expect(t.bank).toBe(500_000 + 20_000);
      const edit = await run({
        kind: "update",
        opId: op(),
        id: tid(40),
        expectedVersion: 1,
        patch: { amountPaise: 5_000 },
      });
      expect(edit).toMatchObject({ ok: true, status: "applied" });
      expect((await totals(s)).total).toBe(START);
      expect((await totals(s)).cash).toBe(100_000 - 5_000);
    });
  });

  it("refunds add money back, can't exceed the expense, and block deleting it", async () => {
    await as(db, A, async (s) => {
      const run = (c: LedgerCommand) => runLedgerCommandWith(pgPort(s), c);
      await run(create(tid(50), { amountPaise: 30_000, description: "Book" }));
      const back = create(tid(51), {
        type: "refund",
        amountPaise: 10_000,
        refundOfId: tid(50),
        categoryId: null,
        subcategoryId: null,
        occurredAt: "2026-10-06T10:00:00+05:30",
      });
      expect(await run(back)).toMatchObject({ ok: true, status: "applied" });
      expect((await totals(s)).total).toBe(START - 30_000 + 10_000);
      const tooMuch = await run(
        create(tid(52), {
          type: "refund",
          amountPaise: 25_000,
          refundOfId: tid(50),
          categoryId: null,
          subcategoryId: null,
          occurredAt: "2026-10-06T11:00:00+05:30",
        }),
      );
      expect(tooMuch).toMatchObject({
        ok: false,
        status: "rejected",
        message: "Refunds can’t add up to more than the original expense.",
      });
      expect(await run({ kind: "delete", opId: op(), id: tid(50) })).toMatchObject({
        ok: false,
        status: "rejected",
        message: "This expense has refunds. Delete the refunds first.",
      });
    });
  });

  it("another user's entry can't be edited, deleted or restored, and their wallet can't be used", async () => {
    await as(db, A, async (s) => {
      await runLedgerCommandWith(pgPort(s), create(tid(60), {}));
      await s.q("commit");
      await s.q("begin");
    });
    try {
      await as(db, B, async (s) => {
        const run = (c: LedgerCommand) => runLedgerCommandWith(pgPort(s), c);
        expect(
          await run({
            kind: "update",
            opId: op(),
            id: tid(60),
            expectedVersion: 1,
            patch: { amountPaise: 1 },
          }),
        ).toMatchObject({
          ok: false,
          status: "not_found",
        });
        expect(await run({ kind: "delete", opId: op(), id: tid(60) })).toMatchObject({
          ok: false,
          status: "not_found",
        });
        expect(await run({ kind: "restore", opId: op(), id: tid(60) })).toMatchObject({
          ok: false,
          status: "not_found",
        });
        // B can't book against A's wallet or categories (same-owner foreign keys).
        const foreign = await run(create(tid(61), { categoryId: f.bFood, subcategoryId: null }));
        expect(foreign).toMatchObject({ ok: false, status: "rejected" });
      });
      await as(db, A, async (s) => {
        const { rows } = await s.q(
          "select amount_paise, deleted_at from public.transactions where id = $1",
          [tid(60)],
        );
        expect(rows[0]).toMatchObject({ amount_paise: "1500", deleted_at: null });
      });
    } finally {
      await db.client.query("delete from public.transactions where id = $1", [tid(60)]);
    }
  });
});

describe.skipIf(ADMIN_URL)("Phase 5 database tests (skipped)", () => {
  it.skip(SKIP_REASON, () => {});
});
