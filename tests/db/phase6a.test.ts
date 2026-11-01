import pg from "pg";

import { rowToAccount, rowToTransaction } from "@/lib/data/mappers";
import { type LedgerCommand, ledgerCommandSchema } from "@/lib/ledger/commands";
import { runLedgerCommandWith } from "@/lib/ledger/executor";
import { consolidatedBalanceAt } from "@/domain";

import { A, A_CASH, B, type Fixtures, expenseJson, seedFixtures, tid } from "./fixtures";
import { ADMIN_URL, SKIP_REASON, type Session, type TestDb, as, createTestDb } from "./harness";
import { pgPort } from "./ledger-port";

// Phase 6a: undo of a batch is one RPC, all-or-nothing, and a retry can't undo twice.

const AS_OF = Date.parse("2026-12-01T00:00:00+05:30");
const TZ = "Asia/Kolkata";
const START = 600_000; // A's ₹1,000 cash + ₹5,000 bank

type Result = { status: string; reason?: string; removed?: number; total?: number };

describe.skipIf(!ADMIN_URL)("Phase 6a: atomic, idempotent batch undo", () => {
  let db: TestDb;
  let f: Fixtures;

  beforeAll(async () => {
    db = await createTestDb();
    f = await seedFixtures(db);
  });
  afterAll(async () => {
    await db?.close();
  });

  const undoCommand = (opId: string, batchId: string): LedgerCommand =>
    ledgerCommandSchema.parse({ kind: "undo_batch", opId, batchId });

  /** Three expenses in one batch. Ids ascend, and the RPC works through them in id order. */
  async function saveBatch(s: Session, batchId: string, first: number) {
    const ids = [tid(first), tid(first + 1), tid(first + 2)];
    const items = ids.map((id, i) => expenseJson(id, 1_000 * (i + 1)));
    await s.rpc("log_transactions_batch", [batchId, JSON.stringify(items)]);
    return ids;
  }

  async function active(s: Session, batchId: string) {
    const { rows } = await s.q<{ id: string }>(
      "select id from public.transactions where batch_id = $1 and deleted_at is null order by id",
      [batchId],
    );
    return rows.map((r) => r.id);
  }

  async function balance(s: Session) {
    const accounts = (await s.q("select * from public.accounts")).rows.map(rowToAccount);
    const ledger = (await s.q("select * from public.transactions")).rows.map(rowToTransaction);
    return consolidatedBalanceAt(accounts, ledger, AS_OF, TZ).balancePaise;
  }

  it("removes every entry of the batch and nothing else", async () => {
    await as(db, A, async (s) => {
      await s.rpc("create_transaction", [JSON.stringify(expenseJson(tid(99), 500))]);
      await saveBatch(s, tid(1), 100);
      expect(await balance(s)).toBe(START - 500 - 6_000);

      const result = await s.rpc<Result>("undo_transactions_batch", [tid(2), tid(1)]);
      expect(result).toMatchObject({ status: "applied", removed: 3, total: 3 });
      expect(await active(s, tid(1))).toEqual([]);
      expect(await balance(s)).toBe(START - 500); // the unrelated entry stays
    });
  });

  it("a retry with the same operation changes nothing", async () => {
    await as(db, A, async (s) => {
      await saveBatch(s, tid(1), 100);
      await s.rpc("undo_transactions_batch", [tid(2), tid(1)]);
      const versions = await s.q("select id, version, deleted_at from public.transactions");

      const retry = await s.rpc<Result>("undo_transactions_batch", [tid(2), tid(1)]);
      expect(retry).toMatchObject({ status: "duplicate", removed: 0, total: 3 });
      const after = await s.q("select id, version, deleted_at from public.transactions");
      expect(after.rows).toEqual(versions.rows);
    });
  });

  it("a retry can't remove an entry restored after the first undo", async () => {
    await as(db, A, async (s) => {
      const [first] = await saveBatch(s, tid(1), 100);
      await s.rpc("undo_transactions_batch", [tid(2), tid(1)]);
      await s.rpc("set_transaction_deleted", [first, false]);
      expect(await balance(s)).toBe(START - 1_000);

      const retry = await s.rpc<Result>("undo_transactions_batch", [tid(2), tid(1)]);
      expect(retry.status).toBe("duplicate");
      expect(await active(s, tid(1))).toEqual([first]);
      expect(await balance(s)).toBe(START - 1_000);
    });
  });

  it("a separate undo of an already removed batch reports it and changes nothing", async () => {
    await as(db, A, async (s) => {
      await saveBatch(s, tid(1), 100);
      await s.rpc("undo_transactions_batch", [tid(2), tid(1)]);
      const other = await s.rpc<Result>("undo_transactions_batch", [tid(3), tid(1)]);
      expect(other).toMatchObject({ status: "duplicate", removed: 0, total: 3 });
    });
  });

  it("finishes the batch when one entry was already deleted on its own", async () => {
    await as(db, A, async (s) => {
      const [first] = await saveBatch(s, tid(1), 100);
      await s.rpc("set_transaction_deleted", [first, true]);
      const result = await s.rpc<Result>("undo_transactions_batch", [tid(2), tid(1)]);
      expect(result).toMatchObject({ status: "applied", removed: 2, total: 3 });
      expect(await active(s, tid(1))).toEqual([]);
    });
  });

  it("refuses to reuse an operation id for a different batch", async () => {
    await as(db, A, async (s) => {
      await saveBatch(s, tid(1), 100);
      const second = await saveBatch(s, tid(5), 200);
      await s.rpc("undo_transactions_batch", [tid(2), tid(1)]);
      const reused = await s.rpc<Result>("undo_transactions_batch", [tid(2), tid(5)]);
      expect(reused).toMatchObject({ status: "conflict", reason: "op_reused" });
      expect(await active(s, tid(5))).toEqual(second);
    });
  });

  it("an unknown batch is not_found and records nothing", async () => {
    await as(db, A, async (s) => {
      const result = await s.rpc<Result>("undo_transactions_batch", [tid(2), tid(404)]);
      expect(result.status).toBe("not_found");
      const ops = await s.q("select id from public.sync_operations");
      expect(ops.rows).toEqual([]);
    });
  });

  it("another user's batch is not_found and untouched; signed-out callers are refused", async () => {
    await as(db, A, async (s) => {
      await saveBatch(s, tid(1), 100);
      await s.q("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: B, role: "authenticated" }),
      ]);
      const foreign = await s.rpc<Result>("undo_transactions_batch", [tid(2), tid(1)]);
      expect(foreign.status).toBe("not_found");
      await s.q("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: A, role: "authenticated" }),
      ]);
      expect(await active(s, tid(1))).toHaveLength(3);
    });
    await as(db, null, async (s) => {
      const denied = await s.error("select public.undo_transactions_batch($1, $2)", [
        tid(2),
        tid(1),
      ]);
      expect(denied?.code).toBe("42501");
    });
  });

  it("through the executor: an undo that fails says nothing was removed, and a retry succeeds", async () => {
    await as(db, A, async (s) => {
      const [, second] = await saveBatch(s, tid(1), 100);
      await s.rpc("create_transaction", [
        JSON.stringify({
          id: tid(190),
          type: "refund",
          amount_paise: 500,
          currency: "INR",
          occurred_at: "2026-10-06T12:00:00+05:30",
          account_id: A_CASH,
          refund_of_id: second,
        }),
      ]);
      const command = undoCommand(tid(2), tid(1));
      const refused = await runLedgerCommandWith(pgPort(s), command);
      expect(refused).toMatchObject({
        ok: false,
        status: "rejected",
        message: "This expense has refunds. Delete the refunds first. Nothing was removed.",
      });
      expect(await active(s, tid(1))).toHaveLength(3);

      await s.rpc("set_transaction_deleted", [tid(190), true]);
      expect(await runLedgerCommandWith(pgPort(s), command)).toMatchObject({
        ok: true,
        status: "applied",
        undo: null,
      });
      expect(await active(s, tid(1))).toEqual([]);
      expect(await runLedgerCommandWith(pgPort(s), command)).toMatchObject({
        ok: true,
        status: "duplicate",
      });
    });
  });

  it("an entry from the queue can be categorised through a ledger edit, then undone with its batch", async () => {
    await as(db, A, async (s) => {
      const [first] = await saveBatch(s, tid(1), 100);
      const command = ledgerCommandSchema.parse({
        kind: "update",
        opId: tid(7),
        id: first,
        expectedVersion: 1,
        patch: { categoryId: f.aFood, subcategoryId: f.aTea },
      });
      expect(await runLedgerCommandWith(pgPort(s), command)).toMatchObject({
        ok: true,
        status: "applied",
      });
      const stale = await runLedgerCommandWith(pgPort(s), {
        ...command,
        patch: { categoryId: f.aTransport, subcategoryId: null },
      } as LedgerCommand);
      expect(stale).toMatchObject({ ok: false, status: "conflict" });

      await s.rpc("undo_transactions_batch", [tid(2), tid(1)]);
      expect(await active(s, tid(1))).toEqual([]);
    });
  });

  // Everything above runs inside a test transaction. These two use real commits, as PostgREST
  // does: one transaction per call, so what survives a failed undo is what a user would see.
  describe("with committed data", () => {
    const batchId = tid(9100);
    const ids = [tid(9101), tid(9102), tid(9103)];
    const refundId = tid(9190);
    const opId = tid(9200);
    const notices: string[] = [];
    const onNotice = (notice: { message?: string }) => notices.push(notice.message ?? "");

    async function asA<T>(run: (client: pg.Client) => Promise<T>) {
      const { client } = db;
      await client.query("set role authenticated");
      await client.query("select set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ sub: A, role: "authenticated" }),
      ]);
      try {
        return await run(client);
      } finally {
        await client.query("reset role");
      }
    }

    /** A separate connection to the test database, optionally signed in as A. */
    async function connect(signedIn = false) {
      const url = new URL(ADMIN_URL!);
      url.pathname = `/${db.name}`;
      const client = new pg.Client({ connectionString: url.toString() });
      await client.connect();
      if (signedIn) {
        await client.query("set role authenticated");
        await client.query("select set_config('request.jwt.claims', $1, false)", [
          JSON.stringify({ sub: A, role: "authenticated" }),
        ]);
      }
      return client;
    }

    const rows = async () =>
      (
        await db.client.query<{ id: string; deleted: boolean }>(
          "select id, deleted_at is not null as deleted from public.transactions where batch_id = $1 order by id",
          [batchId],
        )
      ).rows;

    beforeAll(async () => {
      // Notices escape a rollback, so this shows how far the undo got before it failed.
      await db.client.query(`
        create function public.report_soft_delete() returns trigger language plpgsql as $$
        begin
          raise notice 'soft-deleted %', new.id;
          return new;
        end;
        $$;
        grant execute on function public.report_soft_delete() to authenticated;
        create trigger report_soft_delete after update on public.transactions for each row
          when (old.deleted_at is null and new.deleted_at is not null)
          execute function public.report_soft_delete();
      `);
      db.client.on("notice", onNotice);
      await asA(async (client) => {
        const items = ids.map((id, i) => expenseJson(id, 1_000 * (i + 1)));
        await client.query("select public.log_transactions_batch($1, $2)", [
          batchId,
          JSON.stringify(items),
        ]);
        // The last entry in id order has a refund, so the undo fails after removing two.
        await client.query("select public.create_transaction($1::jsonb)", [
          JSON.stringify({
            id: refundId,
            type: "refund",
            amount_paise: 500,
            currency: "INR",
            occurred_at: "2026-10-06T12:00:00+05:30",
            account_id: A_CASH,
            refund_of_id: ids[2],
          }),
        ]);
      });
    });
    afterAll(async () => {
      db.client.off("notice", onNotice);
    });

    it("a failure part-way through rolls back every entry", async () => {
      const failure = await asA((client) =>
        client
          .query("select public.undo_transactions_batch($1, $2)", [opId, batchId])
          .then(() => null)
          .catch((e: Error & { code?: string }) => e),
      );
      // It really failed mid-batch: two rows were removed before the third raised.
      expect(failure?.code).toBe("P0001");
      expect(failure?.message).toBe("expense_has_refunds");
      expect(notices).toEqual([`soft-deleted ${ids[0]}`, `soft-deleted ${ids[1]}`]);

      // And none of that was kept: every row is back, and the failed op left no record.
      expect(await rows()).toEqual(ids.map((id) => ({ id, deleted: false })));
      const ops = await db.client.query(
        "select id from public.sync_operations where id = $1 and owner_id = $2",
        [opId, A],
      );
      expect(ops.rows).toEqual([]);
    });

    it("the same operation can then be retried, and two at once remove the batch once", async () => {
      await asA((client) =>
        client.query("select public.set_transaction_deleted($1, true)", [refundId]),
      );
      const before = await db.client.query<{ n: number }>(
        "select coalesce(sum(version), 0)::int as n from public.transactions where batch_id = $1",
        [batchId],
      );

      // Holding a row lock makes both undos wait, so they truly overlap instead of running in
      // turn; only once both are blocked is the lock released.
      const [first, second, gate] = await Promise.all([connect(true), connect(true), connect()]);
      try {
        await gate.query("begin");
        await gate.query("select 1 from public.transactions where id = $1 for update", [ids[0]]);
        const call = "select public.undo_transactions_batch($1, $2) as r";
        const undos = [first, second].map((c) => c.query(call, [opId, batchId]));
        await expect
          .poll(async () => {
            const { rows: waiting } = await db.client.query<{ n: number }>(
              `select count(*)::int as n from pg_stat_activity
               where datname = current_database() and wait_event_type = 'Lock'`,
            );
            return waiting[0]!.n;
          })
          .toBe(2);
        await gate.query("commit");
        const results = await Promise.all(undos);
        const statuses = results.map((r) => (r.rows[0].r as Result).status).sort();
        expect(statuses).toEqual(["applied", "duplicate"]);
      } finally {
        await Promise.all([first.end(), second.end(), gate.end()]);
      }

      expect(await rows()).toEqual(ids.map((id) => ({ id, deleted: true })));
      const after = await db.client.query<{ n: number }>(
        "select coalesce(sum(version), 0)::int as n from public.transactions where batch_id = $1",
        [batchId],
      );
      expect(after.rows[0]!.n).toBe(before.rows[0]!.n + 3); // each row changed exactly once
    });
  });
});

describe.skipIf(ADMIN_URL)("Phase 6a database tests (skipped)", () => {
  it.skip(SKIP_REASON, () => {});
});
