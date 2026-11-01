import {
  type Transaction,
  consolidatedBalanceAt,
  parseEntries,
  uncategorizedQueue,
} from "@/domain";
import { rowToAccount, rowToTransaction } from "@/lib/data/mappers";
import { buildDrafts, commandFromDrafts } from "@/lib/drafts";
import { type LedgerCommand, ledgerCommandSchema } from "@/lib/ledger/commands";
import { runLedgerCommandWith } from "@/lib/ledger/executor";

import { A, A_CASH, B, B_CASH, type Fixtures, seedFixtures, tid } from "./fixtures";
import { ADMIN_URL, SKIP_REASON, type Session, type TestDb, as, createTestDb } from "./harness";
import { pgPort } from "./ledger-port";

// Phase 6: text → parser → drafts → one atomic batch, through the same executor as the app.

const AS_OF = Date.parse("2026-12-01T00:00:00+05:30");
const TZ = "Asia/Kolkata";
const TODAY = "2026-11-04";
const START = 600_000; // A's ₹1,000 cash + ₹5,000 bank
const CONFIRMED_AT = "2026-11-04T10:00:00.000Z";

describe.skipIf(!ADMIN_URL)("Phase 6: batch confirm of parsed drafts", () => {
  let db: TestDb;
  let f: Fixtures;
  let ids = 0;

  beforeAll(async () => {
    db = await createTestDb();
    f = await seedFixtures(db);
  });
  afterAll(async () => {
    await db?.close();
  });

  async function context(s: Session) {
    const { accounts, ledger } = await rows(s);
    const categories = (await s.q("select * from public.categories")).rows.map((r) => ({
      id: r.id as string,
      ownerId: r.owner_id as string,
      parentId: (r.parent_id as string | null) ?? null,
      kind: r.kind as "expense" | "income",
      name: r.name as string,
      icon: null,
      color: null,
      sortOrder: Number(r.sort_order),
      isDefault: Boolean(r.is_default),
      mergedIntoId: null,
      archivedAt: null,
    }));
    return { categories, rules: [], history: ledger, accounts };
  }

  async function rows(s: Session) {
    const accounts = (await s.q("select * from public.accounts")).rows.map(rowToAccount);
    const ledger: Transaction[] = (await s.q("select * from public.transactions")).rows.map(
      rowToTransaction,
    );
    return { accounts, ledger };
  }

  async function balance(s: Session) {
    const { accounts, ledger } = await rows(s);
    return consolidatedBalanceAt(accounts, ledger, AS_OF, TZ).balancePaise;
  }

  async function batchFrom(
    s: Session,
    text: string,
    opId: string,
    source: "parsed_text" | "voice",
  ) {
    const drafts = buildDrafts(parseEntries(text, TODAY), await context(s), () => tid(++ids + 700));
    return ledgerCommandSchema.parse(
      commandFromDrafts({
        drafts,
        opId,
        accountId: A_CASH,
        currency: "INR",
        source,
        today: TODAY,
        confirmedAt: CONFIRMED_AT,
        timeZone: TZ,
      }),
    );
  }

  it("Journey B: 'tea 15, bus 20, snacks 35' saves three categorised entries at once", async () => {
    await as(db, A, async (s) => {
      const command = await batchFrom(s, "tea 15, bus 20, snacks 35", tid(9001), "parsed_text");
      const result = await runLedgerCommandWith(pgPort(s), command);
      expect(result).toMatchObject({ ok: true, status: "applied" });
      expect(await balance(s)).toBe(START - 7_000);
      const saved = await s.q<{ source: string; batch_id: string; category_id: string }>(
        "select source, batch_id, category_id from public.transactions order by amount_paise",
      );
      expect(saved.rows).toHaveLength(3);
      for (const row of saved.rows) {
        expect(row).toMatchObject({ source: "parsed_text", batch_id: tid(9001) });
      }
      expect(saved.rows[0]!.category_id).toBe(f.aFood); // tea → Food & Drinks by keyword
    });
  });

  it("replaying a confirmed batch adds nothing, and undo removes all of it", async () => {
    await as(db, A, async (s) => {
      const command = await batchFrom(s, "₹40 lunch and ₹15 tea yesterday", tid(9002), "voice");
      const first = await runLedgerCommandWith(pgPort(s), command);
      const replay = await runLedgerCommandWith(pgPort(s), command);
      expect(replay).toMatchObject({ ok: true, status: "duplicate" });
      const count = await s.q("select count(*)::int as n from public.transactions");
      expect(count.rows[0]!.n).toBe(2);
      expect(await balance(s)).toBe(START - 5_500);

      // Both are dated yesterday at midday IST, not today.
      const dates = await s.q<{ d: string }>(
        "select distinct (occurred_at at time zone 'Asia/Kolkata')::text as d from public.transactions",
      );
      expect(dates.rows.map((r) => r.d)).toEqual(["2026-11-03 12:00:00"]);

      if (!first.ok || !first.undo) throw new Error("expected an undo");
      expect(first.undo.kind).toBe("delete_many");
      expect(await runLedgerCommandWith(pgPort(s), first.undo)).toMatchObject({
        ok: true,
        status: "applied",
      });
      expect(await balance(s)).toBe(START);
      // Undo is safe to repeat (that's how a partly failed one resumes).
      expect(await runLedgerCommandWith(pgPort(s), first.undo)).toMatchObject({ ok: true });
      expect(await balance(s)).toBe(START);
    });
  });

  it("one bad entry rolls back the whole batch and says so", async () => {
    await as(db, A, async (s) => {
      const command = await batchFrom(s, "tea 15, bus 20", tid(9003), "parsed_text");
      if (command.kind !== "batch") throw new Error("expected a batch");
      const broken: LedgerCommand = {
        ...command,
        // A category that belongs to another user: the database refuses this row.
        drafts: command.drafts.map((d, i) => (i === 1 ? { ...d, categoryId: f.bFood } : d)),
      };
      const result = await runLedgerCommandWith(pgPort(s), broken);
      expect(result).toMatchObject({ ok: false, status: "rejected" });
      if (result.ok) throw new Error("expected a rejection");
      expect(result.message).toMatch(/Nothing was saved\.$/);
      const count = await s.q("select count(*)::int as n from public.transactions");
      expect(count.rows[0]!.n).toBe(0);
      expect(await balance(s)).toBe(START);
    });
  });

  it("an entry with no suggestion is saved uncategorized and joins the queue", async () => {
    await as(db, A, async (s) => {
      const command = await batchFrom(s, "xyzzy 25", tid(9004), "parsed_text");
      await runLedgerCommandWith(pgPort(s), command);
      const { ledger } = await rows(s);
      expect(uncategorizedQueue(ledger).map((t) => t.description)).toEqual(["Xyzzy"]);
      expect(await balance(s)).toBe(START - 2_500); // it still counts
    });
  });

  it("can't write into another user's wallet", async () => {
    await as(db, A, async (s) => {
      const command = await batchFrom(s, "tea 15", tid(9005), "parsed_text");
      if (command.kind !== "batch") throw new Error("expected a batch");
      const foreign: LedgerCommand = {
        ...command,
        drafts: command.drafts.map((d) => ({ ...d, accountId: B_CASH })),
      };
      expect(await runLedgerCommandWith(pgPort(s), foreign)).toMatchObject({
        ok: false,
        status: "rejected",
      });
    });
    await as(db, B, async (s) => {
      const count = await s.q("select count(*)::int as n from public.transactions");
      expect(count.rows[0]!.n).toBe(0);
    });
  });
});

describe.skipIf(ADMIN_URL)("Phase 6 database tests (skipped)", () => {
  it.skip(SKIP_REASON, () => {});
});
