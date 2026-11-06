import "fake-indexeddb/auto";

import { type Transaction, consolidatedBalanceAt } from "@/domain";
import { rowToAccount, rowToTransaction } from "@/lib/data/mappers";
import type { LedgerCommand } from "@/lib/ledger/commands";
import { runLedgerCommandWith } from "@/lib/ledger/executor";
import {
  enqueue,
  flushQueue,
  listOps,
  offlineDb,
  replaceOp,
  type SendResult,
} from "@/lib/offline/queue";
import { resolutionCommands } from "@/lib/offline/resolve";
import { toSendResult } from "@/lib/offline/transport";

import { A, A_CASH, A_GOAL, type Fixtures, seedFixtures, tid } from "./fixtures";
import { ADMIN_URL, SKIP_REASON, type Session, type TestDb, as, createTestDb } from "./harness";
import { pgPort } from "./ledger-port";

// Phase 10: the real queue against the real mutation layer and database. Whatever the connection
// does, an entry lands once, the balance moves once, and a real conflict waits for the user.

const AS_OF = Date.parse("2026-12-01T00:00:00+05:30");
let next = 700_000;
const fresh = () => tid(++next);

function expense(f: Fixtures, amountPaise = 1500): Extract<LedgerCommand, { kind: "create" }> {
  return {
    kind: "create",
    opId: fresh(),
    draft: {
      id: fresh(),
      type: "expense",
      amountPaise,
      currency: "INR",
      occurredAt: "2026-11-01T10:00:00.000Z",
      accountId: A_CASH,
      fromAccountId: null,
      toAccountId: null,
      refundOfId: null,
      categoryId: f.aFood,
      subcategoryId: f.aTea,
      description: "Tea",
      merchant: null,
      note: null,
      tags: [],
      source: "quick_add",
      presetId: null,
    },
  };
}

async function balance(s: Session) {
  const accounts = (await s.q("select * from public.accounts")).rows.map(rowToAccount);
  const ledger: Transaction[] = (await s.q("select * from public.transactions")).rows.map(
    rowToTransaction,
  );
  return consolidatedBalanceAt(accounts, ledger, AS_OF, "Asia/Kolkata").balancePaise;
}

/** What `/api/sync` does with an operation, on a test session. */
function sender(s: Session) {
  return async (op: { command: LedgerCommand }): Promise<SendResult> => {
    const outcome = await runLedgerCommandWith(pgPort(s), op.command);
    if (outcome.ok) {
      return toSendResult({ ok: true, status: outcome.status, id: null, undo: outcome.undo });
    }
    return toSendResult({
      ok: false,
      status: outcome.status,
      message: outcome.message,
      record: outcome.record,
      ...(outcome.reason ? { reason: outcome.reason } : {}),
    });
  };
}

async function count(s: Session, id: string) {
  const { rows } = await s.q("select count(*)::int as n from public.transactions where id = $1", [
    id,
  ]);
  return (rows[0] as { n: number }).n;
}

describe.skipIf(!ADMIN_URL)("Phase 10: offline sync on a real database", () => {
  let db: TestDb;
  let f: Fixtures;

  beforeAll(async () => {
    db = await createTestDb();
    f = await seedFixtures(db);
  });
  afterAll(async () => {
    await db?.close();
  });
  beforeEach(async () => {
    await offlineDb().ops.clear();
  });

  it("an offline entry syncs once and moves the balance once", async () => {
    await as(db, A, async (s) => {
      const before = await balance(s);
      const command = expense(f);
      await enqueue(A, command);
      expect(await balance(s)).toBe(before);

      expect(await flushQueue(A, sender(s))).toEqual({ synced: 1, stopped: null });
      expect(await count(s, command.draft.id)).toBe(1);
      expect(await balance(s)).toBe(before - 1500);
    });
  });

  it("the answer is lost after saving: the replay finds it and changes nothing", async () => {
    await as(db, A, async (s) => {
      const before = await balance(s);
      const command = expense(f);
      await enqueue(A, command);
      const send = sender(s);
      await flushQueue(A, async (op) => {
        await send(op);
        throw new TypeError("Failed to fetch");
      });
      expect(await listOps(A)).toMatchObject([{ status: "pending" }]);

      expect(await flushQueue(A, send, { force: true })).toEqual({ synced: 1, stopped: null });
      expect(await count(s, command.draft.id)).toBe(1);
      expect(await balance(s)).toBe(before - 1500);
    });
  });

  it("a batch lost the same way lands once, every entry of it", async () => {
    await as(db, A, async (s) => {
      const before = await balance(s);
      const batch: LedgerCommand = {
        kind: "batch",
        opId: fresh(),
        drafts: [expense(f, 1500).draft, expense(f, 2000).draft],
      };
      await enqueue(A, batch);
      const send = sender(s);
      await flushQueue(A, async (op) => {
        await send(op);
        throw new TypeError("Failed to fetch");
      });
      await flushQueue(A, send, { force: true });
      expect(await balance(s)).toBe(before - 3500);
    });
  });

  it("goal money and bill payments replay once too", async () => {
    await as(db, A, async (s) => {
      const before = await balance(s);
      const moveId = fresh();
      await enqueue(A, {
        kind: "goal_move",
        opId: fresh(),
        id: moveId,
        goalId: A_GOAL,
        moveType: "allocation",
        amountPaise: 5000,
        occurredAt: "2026-11-01T10:00:00.000Z",
        note: null,
      });
      const send = sender(s);
      await flushQueue(A, async (op) => {
        await send(op);
        throw new TypeError("Failed to fetch");
      });
      await flushQueue(A, send, { force: true });
      expect(await count(s, moveId)).toBe(1);
      expect(await balance(s)).toBe(before);
    });
  });

  it("an entry added and edited offline arrive in order", async () => {
    await as(db, A, async (s) => {
      const before = await balance(s);
      const command = expense(f);
      await enqueue(A, command);
      await enqueue(A, {
        kind: "update",
        opId: fresh(),
        id: command.draft.id,
        expectedVersion: 1,
        patch: { amountPaise: 4000 },
      });
      await flushQueue(A, sender(s));
      expect(await balance(s)).toBe(before - 4000);
    });
  });

  it("an offline edit of something changed elsewhere waits, and overwrites nothing", async () => {
    await as(db, A, async (s) => {
      const run = (c: LedgerCommand) => runLedgerCommandWith(pgPort(s), c);
      const command = expense(f);
      await run(command);
      // This device goes offline holding version 1 while another device changes the entry.
      await enqueue(A, {
        kind: "update",
        opId: fresh(),
        id: command.draft.id,
        expectedVersion: 1,
        patch: { amountPaise: 9900 },
      });
      await run({
        kind: "update",
        opId: fresh(),
        id: command.draft.id,
        expectedVersion: 1,
        patch: { amountPaise: 3000 },
      });

      await flushQueue(A, sender(s));
      const [op] = await listOps(A);
      expect(op).toMatchObject({ status: "conflict", conflictReason: "stale_version" });
      expect(op!.serverRecord).toMatchObject({ amountPaise: 3000, version: 2 });
      const row = await s.q("select amount_paise from public.transactions where id = $1", [
        command.draft.id,
      ]);
      expect(Number((row.rows[0] as { amount_paise: string }).amount_paise)).toBe(3000);

      // Choosing "use my change" then lands it, against the newest version.
      const choice = resolutionCommands(op!, "keep_mine")!;
      await replaceOp(op!.opId, choice.command);
      await flushQueue(A, sender(s));
      expect((await listOps(A))[0]!.status).toBe("synced");
      const after = await s.q("select amount_paise from public.transactions where id = $1", [
        command.draft.id,
      ]);
      expect(Number((after.rows[0] as { amount_paise: string }).amount_paise)).toBe(9900);
    });
  });

  it("an offline edit of something deleted elsewhere is kept, and can bring it back", async () => {
    await as(db, A, async (s) => {
      const run = (c: LedgerCommand) => runLedgerCommandWith(pgPort(s), c);
      const before = await balance(s);
      const command = expense(f);
      await run(command);
      await enqueue(A, {
        kind: "update",
        opId: fresh(),
        id: command.draft.id,
        expectedVersion: 1,
        patch: { amountPaise: 2200 },
      });
      await run({ kind: "delete", opId: fresh(), id: command.draft.id });
      expect(await balance(s)).toBe(before);

      await flushQueue(A, sender(s));
      const [op] = await listOps(A);
      expect(op!.status).toBe("conflict");
      expect(op!.serverRecord?.deletedAt).not.toBeNull();

      const choice = resolutionCommands(op!, "restore_with_mine")!;
      await replaceOp(op!.opId, choice.command, {}, choice.then);
      await flushQueue(A, sender(s));
      expect((await listOps(A)).map((o) => o.status)).toEqual(["synced", "synced"]);
      expect(await balance(s)).toBe(before - 2200);
    });
  });

  it("an offline delete of something changed elsewhere asks first", async () => {
    await as(db, A, async (s) => {
      const run = (c: LedgerCommand) => runLedgerCommandWith(pgPort(s), c);
      const command = expense(f);
      await run(command);
      await enqueue(A, { kind: "delete", opId: fresh(), id: command.draft.id, expectedVersion: 1 });
      await run({
        kind: "update",
        opId: fresh(),
        id: command.draft.id,
        expectedVersion: 1,
        patch: { amountPaise: 3300 },
      });

      await flushQueue(A, sender(s));
      const [op] = await listOps(A);
      expect(op).toMatchObject({ status: "conflict", conflictReason: "changed_since" });
      const row = await s.q("select deleted_at from public.transactions where id = $1", [
        command.draft.id,
      ]);
      expect((row.rows[0] as { deleted_at: string | null }).deleted_at).toBeNull();
    });
  });

  it("a delete that already happened elsewhere is simply done", async () => {
    await as(db, A, async (s) => {
      const run = (c: LedgerCommand) => runLedgerCommandWith(pgPort(s), c);
      const command = expense(f);
      await run(command);
      await run({ kind: "delete", opId: fresh(), id: command.draft.id });
      await enqueue(A, { kind: "delete", opId: fresh(), id: command.draft.id, expectedVersion: 1 });
      expect(await flushQueue(A, sender(s))).toEqual({ synced: 1, stopped: null });
    });
  });

  it("a delete sent twice doesn't conflict with itself", async () => {
    await as(db, A, async (s) => {
      const run = (c: LedgerCommand) => runLedgerCommandWith(pgPort(s), c);
      const command = expense(f);
      await run(command);
      const del: LedgerCommand = {
        kind: "delete",
        opId: fresh(),
        id: command.draft.id,
        expectedVersion: 1,
      };
      expect((await run(del)).status).toBe("applied");
      expect((await run(del)).status).toBe("duplicate");
    });
  });

  it("a refused entry is reported, and later entries still arrive", async () => {
    await as(db, A, async (s) => {
      const before = await balance(s);
      const bad = expense(f);
      bad.draft.categoryId = tid(999_999);
      bad.draft.subcategoryId = null;
      const good = expense(f, 700);
      await enqueue(A, bad);
      await enqueue(A, good);
      expect(await flushQueue(A, sender(s))).toEqual({ synced: 1, stopped: null });
      expect((await listOps(A)).map((o) => o.status)).toEqual(["failed", "synced"]);
      expect(await count(s, bad.draft.id)).toBe(0);
      expect(await balance(s)).toBe(before - 700);
    });
  });
});

it.skipIf(ADMIN_URL)(`Phase 10 offline sync on a real database: ${SKIP_REASON}`, () => undefined);
