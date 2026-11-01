import {
  type Account,
  type Commitment,
  type RecurringTemplate,
  type Transaction,
  KEPT_FLEXIBLE_TAG,
  calculatePlan,
  consolidatedBalanceAt,
  orphanedPurchaseReleases,
  purchaseGroups,
  resolvePeriod,
  totalEarmarked,
  unpaidCommitmentsDue,
} from "@/domain";
import {
  rowToAccount,
  rowToCommitment,
  rowToRecurringTemplate,
  rowToTransaction,
} from "@/lib/data/mappers";
import { type LedgerCommand, ledgerCommandSchema } from "@/lib/ledger/commands";
import { runLedgerCommandWith } from "@/lib/ledger/executor";
import { goalReleaseNotes } from "@/lib/plan-view";

import { A, A_CASH, A_GOAL, B, B_CASH, type Fixtures, seedFixtures, tid } from "./fixtures";
import { ADMIN_URL, SKIP_REASON, type Session, type TestDb, as, createTestDb } from "./harness";
import { pgPort } from "./ledger-port";

// Phase 8: every multi-row money operation, through the real mutation layer and the same domain
// functions the screens call. "Never subtracted twice" is checked on the safe-to-spend figure
// itself, before and after each save and each retry.

const NOW = Date.parse("2026-11-10T12:00:00+05:30");
const TZ = "Asia/Kolkata";
const AT = "2026-11-10T10:00:00+05:30";
const NEXT_INCOME = "2026-12-01";
const START = 600_000; // A's ₹1,000 cash + ₹5,000 bank
const settings = { timeZone: TZ, weekStartsOn: 1 as const };

const draft = (id: string, amountPaise: number, extra: Record<string, unknown> = {}) => ({
  id,
  type: "expense",
  amountPaise,
  occurredAt: AT,
  accountId: A_CASH,
  source: "manual",
  ...extra,
});

const command = (input: Record<string, unknown>): LedgerCommand => ledgerCommandSchema.parse(input);

async function records(s: Session) {
  const ledger: Transaction[] = (
    await s.q("select * from public.transactions where deleted_at is null")
  ).rows.map(rowToTransaction);
  const accounts: Account[] = (
    await s.q("select * from public.accounts where currency = 'INR'")
  ).rows.map(rowToAccount);
  const commitments: Commitment[] = (await s.q("select * from public.commitments")).rows.map(
    rowToCommitment,
  );
  const templates: RecurringTemplate[] = (
    await s.q("select * from public.recurring_templates")
  ).rows.map(rowToRecurringTemplate);
  return { ledger, accounts, commitments, templates };
}

/** Exactly what Safe to spend and Survival Mode calculate. */
async function plan(s: Session) {
  const r = await records(s);
  return calculatePlan({ ...r, now: NOW, settings, nextIncomeDate: NEXT_INCOME });
}

const balance = async (s: Session) => {
  const { accounts, ledger } = await records(s);
  return consolidatedBalanceAt(accounts, ledger, NOW, TZ).balancePaise;
};

describe.skipIf(!ADMIN_URL)("Phase 8: money operations", () => {
  let db: TestDb;
  let f: Fixtures;

  beforeAll(async () => {
    db = await createTestDb();
    f = await seedFixtures(db);
  });
  afterAll(async () => {
    await db?.close();
  });

  const run = (s: Session, input: Record<string, unknown>) =>
    runLedgerCommandWith(pgPort(s), command(input), () => tid(9_000));

  const allocate = (s: Session, id: string, amountPaise: number) =>
    run(s, {
      kind: "goal_move",
      opId: tid(8_000 + Number(id.slice(-4))),
      id,
      goalId: A_GOAL,
      moveType: "allocation",
      amountPaise,
      occurredAt: AT,
      note: null,
    });

  describe("the quick-add tile on an entry", () => {
    const tile = async (s: Session, label: string, category: string | null = f.aFood) => {
      const { rows } = await s.q<{ id: string }>(
        `insert into public.quick_add_presets (owner_id, label, category_id) values ($1, $2, $3) returning id`,
        [A, label, category],
      );
      return rows[0]!.id;
    };
    const quickEntry = (id: string, description: string, presetId: string | null = null) =>
      run(s_(), {
        kind: "create",
        opId: id,
        draft: { ...draft(id, 2_000), source: "quick_add", description, presetId },
      });
    let current: Session;
    const s_ = () => current;

    it("keeps a renamed tile's entries in one group", async () => {
      await as(db, A, async (s) => {
        current = s;
        const preset = await tile(s, "Chai");
        expect((await quickEntry(tid(1), "Chai", preset)).ok).toBe(true);
        await s.q("update public.quick_add_presets set label = 'Masala chai' where id = $1", [
          preset,
        ]);
        expect((await quickEntry(tid(2), "Masala chai", preset)).ok).toBe(true);

        const { ledger } = await records(s);
        const period = resolvePeriod({ kind: "all_time" }, 0, settings);
        const groups = purchaseGroups(ledger, period, {
          by: "tile",
          tileLabels: new Map([[preset, "Masala chai"]]),
        });
        expect(groups).toHaveLength(1);
        expect(groups[0]).toMatchObject({ key: preset, label: "Masala chai", count: 2 });
      });
    });

    it("treats another tile on a replay as a conflict, and an edit can't change the tile", async () => {
      await as(db, A, async (s) => {
        current = s;
        const first = await tile(s, "One");
        const second = await tile(s, "Two");
        expect((await quickEntry(tid(3), "One", first)).status).toBe("applied");
        expect((await quickEntry(tid(3), "One", first)).status).toBe("duplicate");
        expect((await quickEntry(tid(3), "One", second)).status).toBe("conflict");
        await s.rpc("update_transaction", [tid(3), 1, { preset_id: second, note: "edited" }]);
        const { rows } = await s.q(
          "select preset_id, note from public.transactions where id = $1",
          [tid(3)],
        );
        expect(rows[0]).toMatchObject({ preset_id: first, note: "edited" });
      });
    });

    it("refuses a tile on income, and another user's tile", async () => {
      await as(db, A, async (s) => {
        const preset = await tile(s, "Mine");
        const row = {
          ...{ id: tid(4), type: "income", amount_paise: 100, occurred_at: AT },
          ...{ account_id: A_CASH, category_id: f.aAllowance, preset_id: preset },
        };
        expect(await s.error("select public.create_transaction($1)", [row])).toMatchObject({
          code: "23514",
        });
      });
      const { rows } = await db.client.query<{ id: string }>(
        "select id from public.quick_add_presets where owner_id = $1 limit 1",
        [B],
      );
      await as(db, A, async (s) => {
        const entry = draft(tid(5), 100, { source: "quick_add", presetId: rows[0]!.id });
        const outcome = await run(s, { kind: "create", opId: tid(5), draft: entry });
        expect(outcome.ok).toBe(false);
      });
    });

    it("backfills by label only where it's unambiguous, without touching versions", async () => {
      await as(db, A, async (s) => {
        current = s;
        const unique = await tile(s, "Backfill Tea");
        await tile(s, "Same Label");
        await tile(s, "same label");
        const hidden = await tile(s, "Twice");
        await s.q("update public.quick_add_presets set archived_at = now() where id = $1", [
          hidden,
        ]);
        await tile(s, "Twice");
        await tile(s, "Blank", null);

        await quickEntry(tid(10), "backfill tea ");
        await quickEntry(tid(11), "Same Label");
        await quickEntry(tid(12), "Twice");
        await quickEntry(tid(13), "Blank");
        await quickEntry(tid(14), "No such tile");
        // Same words, but not a quick-add entry.
        await run(s, {
          kind: "create",
          opId: tid(15),
          draft: draft(tid(15), 100, { description: "Backfill Tea" }),
        });
        await s.q("update public.transactions set note = 'bump' where id = $1", [tid(10)]);

        const stamp = await s.q(
          "select version, updated_at from public.transactions where id = $1",
          [tid(10)],
        );
        expect(await s.error("select public.backfill_entry_presets()")).toMatchObject({
          code: "42501",
        });
        await s.q("reset role");
        await s.q("select public.backfill_entry_presets()");
        await s.q("set local role authenticated");

        const { rows } = await s.q<{ id: string; preset_id: string | null }>(
          "select id, preset_id from public.transactions where id = any($1) order by id",
          [[tid(10), tid(11), tid(12), tid(13), tid(14), tid(15)]],
        );
        expect(rows.map((r) => r.preset_id)).toEqual([unique, null, null, null, null, null]);
        const after = await s.q(
          "select version, updated_at from public.transactions where id = $1",
          [tid(10)],
        );
        expect(after.rows[0]).toEqual(stamp.rows[0]);
      });
    });
  });

  describe("goals", () => {
    it("allocates and releases without changing the balance, and replays harmlessly", async () => {
      await as(db, A, async (s) => {
        expect((await allocate(s, tid(101), 40_000)).status).toBe("applied");
        expect((await allocate(s, tid(101), 40_000)).status).toBe("duplicate");
        const released = await run(s, {
          kind: "goal_move",
          opId: tid(102),
          id: tid(102),
          goalId: A_GOAL,
          moveType: "allocation_release",
          amountPaise: 15_000,
          occurredAt: AT,
          note: "Changed my mind",
        });
        expect(released.ok).toBe(true);
        const { ledger } = await records(s);
        expect(totalEarmarked(ledger)).toBe(25_000);
        expect(await balance(s)).toBe(START);
        expect((await plan(s)).flexiblePaise).toBe(START - 25_000);

        // Undo of a set-aside is a soft delete, and the money goes back to flexible.
        if (released.ok && released.undo) {
          expect((await runLedgerCommandWith(pgPort(s), released.undo)).ok).toBe(true);
        }
        expect((await plan(s)).flexiblePaise).toBe(START - 40_000);
      });
    });

    it("refuses to release more than is set aside, and to add to an archived goal", async () => {
      await as(db, A, async (s) => {
        await allocate(s, tid(103), 10_000);
        const tooMuch = await run(s, {
          kind: "goal_move",
          opId: tid(104),
          id: tid(104),
          goalId: A_GOAL,
          moveType: "allocation_release",
          amountPaise: 10_001,
          occurredAt: AT,
          note: null,
        });
        expect(tooMuch).toMatchObject({ ok: false, status: "rejected" });
        expect((tooMuch as { message: string }).message).toMatch(/more than is set aside/);

        await s.q("update public.savings_goals set status = 'archived' where id = $1", [A_GOAL]);
        expect((await allocate(s, tid(105), 1)).ok).toBe(false);
      });
    });

    it("keeps history and the earmark through pause, complete and archive", async () => {
      await as(db, A, async (s) => {
        await allocate(s, tid(106), 5_000_000);
        for (const status of ["paused", "completed", "archived"]) {
          await s.q("update public.savings_goals set status = $1 where id = $2", [status, A_GOAL]);
          expect((await plan(s)).inputs.earmarkedPaise).toBe(5_000_000);
        }
        // A goal with history can't be deleted out from under it.
        expect(
          await s.error("delete from public.savings_goals where id = $1", [A_GOAL]),
        ).toMatchObject({ code: "23503" });
      });
    });
  });

  describe("I bought the thing I saved for", () => {
    const purchase = (s: Session, id: string, releaseId: string, amountPaise: number) =>
      run(s, {
        kind: "goal_purchase",
        opId: id,
        goalId: A_GOAL,
        releaseId,
        draft: draft(id, amountPaise, { categoryId: f.aFood, description: "Laptop" }),
      });

    it("records the expense and the release once: spending counts, money isn't lost twice", async () => {
      await as(db, A, async (s) => {
        await allocate(s, tid(201), 40_000);
        const flexible = (await plan(s)).flexiblePaise;
        expect(flexible).toBe(START - 40_000);

        expect((await purchase(s, tid(202), tid(203), 30_000)).status).toBe("applied");
        const { ledger } = await records(s);
        expect(totalEarmarked(ledger)).toBe(10_000);
        expect(await balance(s)).toBe(START - 30_000);
        // Paid from the earmark: flexible money doesn't move.
        expect((await plan(s)).flexiblePaise).toBe(flexible);
      });
    });

    it("a purchase above the earmark releases what's there and spends the rest", async () => {
      await as(db, A, async (s) => {
        await allocate(s, tid(211), 40_000);
        const before = (await plan(s)).flexiblePaise;
        await purchase(s, tid(212), tid(213), 55_000);
        expect(totalEarmarked((await records(s)).ledger)).toBe(0);
        expect((await plan(s)).flexiblePaise).toBe(before - 15_000);
      });
    });

    it("a retry changes nothing, even if more was set aside in between", async () => {
      await as(db, A, async (s) => {
        // Nothing to release the first time, so there's no release row for a retry to find.
        expect((await purchase(s, tid(221), tid(222), 5_000)).status).toBe("applied");
        await allocate(s, tid(223), 40_000);
        expect((await purchase(s, tid(221), tid(222), 5_000)).status).toBe("duplicate");
        expect(totalEarmarked((await records(s)).ledger)).toBe(40_000);
        const { rows } = await s.q("select count(*)::int as n from public.transactions");
        expect(rows[0]!.n).toBe(2);
      });
    });

    it("rolls the expense back if the release can't be written", async () => {
      await as(db, A, async (s) => {
        await allocate(s, tid(231), 40_000);
        await run(s, { kind: "create", opId: tid(233), draft: draft(tid(233), 1_000) });
        // The release id is taken by an expense, so the release can't apply and nothing may be
        // left behind. (An allocation's id would be stopped earlier, by the earmark trigger.)
        const outcome = await purchase(s, tid(232), tid(233), 10_000);
        expect(outcome).toMatchObject({ ok: false, status: "rejected" });
        expect((outcome as { message: string }).message).toMatch(/Nothing was saved/);
        const { rows } = await s.q("select id from public.transactions where id = $1", [tid(232)]);
        expect(rows).toEqual([]);
        expect(await balance(s)).toBe(START - 1_000);
      });
    });

    describe("when the purchase alone is deleted from history", () => {
      const orphans = async (s: Session) => orphanedPurchaseReleases((await records(s)).ledger);

      it("leaves the money out of the goal and says so; setting it aside again restores it", async () => {
        await as(db, A, async (s) => {
          await allocate(s, tid(261), 40_000);
          await purchase(s, tid(262), tid(263), 30_000);
          expect(await orphans(s)).toEqual([]);

          await run(s, { kind: "delete", opId: tid(264), id: tid(262) });
          expect(await balance(s)).toBe(START);
          expect(totalEarmarked((await records(s)).ledger)).toBe(10_000);
          expect((await orphans(s)).map((r) => r.id)).toEqual([tid(263)]);
          expect((await plan(s)).flexiblePaise).toBe(START - 10_000);

          // The note's button: removing the release puts back exactly that amount.
          const again = await run(s, { kind: "delete", opId: tid(265), id: tid(263) });
          expect(again.status).toBe("applied");
          expect(totalEarmarked((await records(s)).ledger)).toBe(40_000);
          expect(await orphans(s)).toEqual([]);
          expect((await plan(s)).flexiblePaise).toBe(START - 40_000);
          expect(await balance(s)).toBe(START);

          // A double tap, and its Undo, both behave.
          expect((await run(s, { kind: "delete", opId: tid(265), id: tid(263) })).status).toBe(
            "duplicate",
          );
          await runLedgerCommandWith(pgPort(s), again.ok ? again.undo! : (null as never));
          expect((await orphans(s)).map((r) => r.id)).toEqual([tid(263)]);
        });
      });

      it("keeping it flexible clears the note and moves no money, and can be undone", async () => {
        await as(db, A, async (s) => {
          await allocate(s, tid(271), 40_000);
          await purchase(s, tid(272), tid(273), 30_000);
          await run(s, { kind: "delete", opId: tid(274), id: tid(272) });
          const flexible = (await plan(s)).flexiblePaise;
          const [note] = goalReleaseNotes((await records(s)).ledger, [], new Map());

          const kept = await run(s, {
            kind: "update",
            opId: tid(275),
            id: tid(273),
            expectedVersion: 1,
            patch: { tags: [...note!.tags, KEPT_FLEXIBLE_TAG] },
          });
          expect(kept.status).toBe("applied");
          expect(await orphans(s)).toEqual([]);
          expect((await plan(s)).flexiblePaise).toBe(flexible);

          await runLedgerCommandWith(pgPort(s), kept.ok ? kept.undo! : (null as never));
          expect((await orphans(s)).map((r) => r.id)).toEqual([tid(273)]);
        });
      });

      it("shows nothing after a normal purchase, an Undo, or a plain release", async () => {
        await as(db, A, async (s) => {
          await allocate(s, tid(281), 40_000);
          const saved = await purchase(s, tid(282), tid(283), 10_000);
          expect(await orphans(s)).toEqual([]);
          await runLedgerCommandWith(pgPort(s), saved.ok ? saved.undo! : (null as never));
          expect(await orphans(s)).toEqual([]);
          await run(s, {
            kind: "goal_move",
            opId: tid(284),
            id: tid(284),
            goalId: A_GOAL,
            moveType: "allocation_release",
            amountPaise: 5_000,
            occurredAt: AT,
            note: null,
          });
          expect(await orphans(s)).toEqual([]);
        });
      });
    });

    it("undo brings back both, and a retried undo does nothing more", async () => {
      await as(db, A, async (s) => {
        await allocate(s, tid(241), 40_000);
        const saved = await purchase(s, tid(242), tid(243), 30_000);
        const undo = saved.ok ? saved.undo! : null;
        expect(undo).toMatchObject({ kind: "undo_batch", batchId: tid(243) });
        expect((await runLedgerCommandWith(pgPort(s), undo!)).status).toBe("applied");
        expect(totalEarmarked((await records(s)).ledger)).toBe(40_000);
        expect(await balance(s)).toBe(START);
        expect((await runLedgerCommandWith(pgPort(s), undo!)).status).toBe("duplicate");
        expect(totalEarmarked((await records(s)).ledger)).toBe(40_000);
      });
    });

    it("won't touch another user's goal", async () => {
      await as(db, B, async (s) => {
        const outcome = await run(s, {
          kind: "goal_purchase",
          opId: tid(251),
          goalId: A_GOAL,
          releaseId: tid(252),
          draft: draft(tid(251), 100, { accountId: B_CASH }),
        });
        expect(outcome.ok).toBe(false);
      });
    });
  });

  describe("paying a commitment", () => {
    const bill = async (s: Session, amount: number, due = "2026-11-20") => {
      const { rows } = await s.q<{ id: string }>(
        `insert into public.commitments (owner_id, title, amount_paise, due_date) values ($1, 'Hostel', $2, $3) returning id`,
        [A, amount, due],
      );
      return rows[0]!.id;
    };
    const pay = (s: Session, commitmentId: string, id: string, amount: number) =>
      run(s, { kind: "pay_commitment", opId: id, commitmentId, draft: draft(id, amount) });

    it("leaves unpaid in the same save, and is never subtracted twice, even on retry", async () => {
      await as(db, A, async (s) => {
        const id = await bill(s, 300_000);
        const planned = await plan(s);
        expect(planned.inputs.commitmentsDuePaise).toBe(300_000);
        expect(planned.flexiblePaise).toBe(START - 300_000);

        expect((await pay(s, id, tid(301), 300_000)).status).toBe("applied");
        const paid = await plan(s);
        expect(paid.inputs.balancePaise).toBe(START - 300_000);
        expect(paid.inputs.commitmentsDuePaise).toBe(0);
        expect(paid.flexiblePaise).toBe(START - 300_000);
        const r = await records(s);
        expect(unpaidCommitmentsDue(r.commitments, r.ledger, null)).toEqual([]);

        // The response was lost and the client sent it again.
        expect((await pay(s, id, tid(301), 300_000)).status).toBe("duplicate");
        // A second device tries with a new id.
        expect(await pay(s, id, tid(302), 300_000)).toMatchObject({
          ok: false,
          status: "conflict",
        });
        const retried = await plan(s);
        expect(retried.inputs.balancePaise).toBe(START - 300_000);
        expect(retried.flexiblePaise).toBe(paid.flexiblePaise);
        expect(retried.inputs.commitmentIds).toEqual([]);
      });
    });

    it("rolls the expense back if the commitment can't be updated", async () => {
      await as(db, A, async (s) => {
        const id = await bill(s, 10_000);
        await s.q("reset role");
        await s.q(`create function public.test_refuse() returns trigger language plpgsql as $$
          begin raise exception using errcode = 'P0001', message = 'test_refused'; end; $$`);
        await s.q(`create trigger test_refuse before update on public.commitments
          for each row execute function public.test_refuse()`);
        await s.q("set local role authenticated");

        expect((await pay(s, id, tid(311), 10_000)).ok).toBe(false);
        const { rows } = await s.q("select id from public.transactions where id = $1", [tid(311)]);
        expect(rows).toEqual([]);
        expect((await plan(s)).inputs.commitmentsDuePaise).toBe(10_000);
      });
    });

    it("is due again if the payment is deleted, and a stale retry can't look paid", async () => {
      await as(db, A, async (s) => {
        const id = await bill(s, 20_000);
        const saved = await pay(s, id, tid(321), 20_000);
        await runLedgerCommandWith(pgPort(s), saved.ok ? saved.undo! : (null as never));
        const unpaid = await plan(s);
        expect(unpaid.inputs.commitmentsDuePaise).toBe(20_000);
        expect(unpaid.inputs.balancePaise).toBe(START);

        const stale = await pay(s, id, tid(321), 20_000);
        expect(stale).toMatchObject({ ok: false, status: "conflict" });
        expect((await plan(s)).flexiblePaise).toBe(unpaid.flexiblePaise);

        // Paying it properly, with a new entry, works.
        expect((await pay(s, id, tid(322), 20_000)).status).toBe("applied");
        expect((await plan(s)).inputs.commitmentsDuePaise).toBe(0);
      });
    });

    it("won't pay a cancelled bill, or someone else's", async () => {
      const id = await as(db, A, async (s) => {
        const cancelled = await bill(s, 10_000);
        await s.q("update public.commitments set cancelled_at = now() where id = $1", [cancelled]);
        expect((await pay(s, cancelled, tid(331), 10_000)).ok).toBe(false);
        expect((await plan(s)).inputs.commitmentsDuePaise).toBe(0);
        return cancelled;
      });
      await as(db, B, async (s) => {
        const outcome = await run(s, {
          kind: "pay_commitment",
          opId: tid(332),
          commitmentId: id,
          draft: draft(tid(332), 100, { accountId: B_CASH }),
        });
        expect(outcome).toMatchObject({ ok: false, status: "not_found" });
      });
    });
  });

  describe("confirming a recurring occurrence", () => {
    const FIRST = "2026-11-15";
    const template = async (s: Session, kind = "expense", amount = 50_000) => {
      const { rows } = await s.q<{ id: string }>(
        `insert into public.recurring_templates
           (owner_id, kind, title, amount_paise, cadence, anchor_date, next_due_date)
         values ($1, $2, 'Rent', $3, 'monthly', $4, $4) returning id`,
        [A, kind, amount, FIRST],
      );
      return rows[0]!.id;
    };
    const confirm = (s: Session, templateId: string, id: string, occurrence = FIRST) =>
      run(s, {
        kind: "confirm_recurring",
        opId: id,
        templateId,
        occurrence,
        draft: draft(id, 50_000),
      });

    it("creates exactly one entry and clears the forecast in the same save", async () => {
      await as(db, A, async (s) => {
        const id = await template(s);
        const planned = await plan(s);
        expect(planned.inputs.commitmentsDuePaise).toBe(50_000);
        expect(await balance(s)).toBe(START); // a forecast is not an expense
        expect(planned.flexiblePaise).toBe(START - 50_000);

        expect((await confirm(s, id, tid(401))).status).toBe("applied");
        const done = await plan(s);
        expect(done.inputs.balancePaise).toBe(START - 50_000);
        expect(done.inputs.commitmentsDuePaise).toBe(0);
        expect(done.flexiblePaise).toBe(planned.flexiblePaise);

        expect((await confirm(s, id, tid(401))).status).toBe("duplicate");
        expect((await confirm(s, id, tid(402))).status).toBe("duplicate"); // another device
        const { rows } = await s.q(
          "select source, recurring_occurrence from public.transactions where recurring_template_id = $1",
          [id],
        );
        expect(rows).toEqual([{ source: "recurring", recurring_occurrence: FIRST }]);
        expect((await plan(s)).flexiblePaise).toBe(done.flexiblePaise);
      });
    });

    it("is due again after undo, can be confirmed again, and can't be restored into a duplicate", async () => {
      await as(db, A, async (s) => {
        const id = await template(s);
        const saved = await confirm(s, id, tid(411));
        await runLedgerCommandWith(pgPort(s), saved.ok ? saved.undo! : (null as never));
        expect((await plan(s)).inputs.commitmentsDuePaise).toBe(50_000);

        // A stale retry of the deleted entry neither revives it nor reads as saved.
        expect(await confirm(s, id, tid(411))).toMatchObject({ ok: false, status: "conflict" });

        expect((await confirm(s, id, tid(412))).status).toBe("applied");
        expect((await plan(s)).inputs.commitmentsDuePaise).toBe(0);

        const restore = await run(s, { kind: "restore", opId: tid(413), id: tid(411) });
        expect(restore).toMatchObject({ ok: false, status: "rejected" });
        expect((restore as { message: string }).message).toMatch(/already recorded/);
        expect(await balance(s)).toBe(START - 50_000);
      });
    });

    it("a skipped occurrence isn't forecast, and confirming it clears the skip", async () => {
      await as(db, A, async (s) => {
        const id = await template(s);
        await s.q(
          `insert into public.commitments
             (owner_id, title, amount_paise, due_date, recurring_template_id, recurring_occurrence, cancelled_at)
           values ($1, 'Rent', 50000, $2, $3, $2, now())`,
          [A, FIRST, id],
        );
        expect((await plan(s)).inputs.commitmentsDuePaise).toBe(0);
        expect((await confirm(s, id, tid(421))).status).toBe("applied");
        const { rows } = await s.q("select id from public.commitments");
        expect(rows).toEqual([]);
      });
    });

    it("never counts expected income, and income confirms as income", async () => {
      await as(db, A, async (s) => {
        const id = await template(s, "income", 200_000);
        expect((await plan(s)).flexiblePaise).toBe(START);
        const outcome = await run(s, {
          kind: "confirm_recurring",
          opId: tid(431),
          templateId: id,
          occurrence: FIRST,
          draft: draft(tid(431), 200_000, { type: "income", categoryId: f.aAllowance }),
        });
        expect(outcome.status).toBe("applied");
        expect(await balance(s)).toBe(START + 200_000);
      });
    });

    it("refuses an entry of the wrong kind, and another user's template", async () => {
      const id = await as(db, A, async (s) => {
        const income = await template(s, "income");
        expect((await confirm(s, income, tid(441))).ok).toBe(false);
        return income;
      });
      await as(db, B, async (s) => {
        const outcome = await run(s, {
          kind: "confirm_recurring",
          opId: tid(442),
          templateId: id,
          occurrence: FIRST,
          draft: draft(tid(442), 100, { type: "income", accountId: B_CASH }),
        });
        expect(outcome).toMatchObject({ ok: false, status: "not_found" });
      });
    });
  });

  it("deleting an account still cascades through tiles linked to entries", async () => {
    const user = "cccccccc-0000-4000-8000-000000000003";
    await db.client.query("begin");
    try {
      await db.client.query("insert into auth.users (id, email) values ($1, 'c@example.test')", [
        user,
      ]);
      const { rows } = await db.client.query<{ id: string; category: string }>(
        `select p.id, p.category_id as category from public.quick_add_presets p
          where p.owner_id = $1 and p.category_id is not null limit 1`,
        [user],
      );
      await db.client.query(
        `insert into public.accounts (id, owner_id, name, opening_balance_date, is_default)
         values ($1, $2, 'Cash', '2026-10-01', true)`,
        [tid(501), user],
      );
      await db.client.query(
        `insert into public.transactions
           (id, owner_id, type, amount_paise, occurred_at, account_id, category_id, source, preset_id, idempotency_key)
         values ($1, $2, 'expense', 100, now(), $3, $4, 'quick_add', $5, $6)`,
        [tid(502), user, tid(501), rows[0]!.category, rows[0]!.id, tid(502)],
      );
      await db.client.query("delete from auth.users where id = $1", [user]);
      const left = await db.client.query("select 1 from public.transactions where owner_id = $1", [
        user,
      ]);
      expect(left.rows).toEqual([]);
    } finally {
      await db.client.query("rollback");
    }
  });
});

describe.skipIf(ADMIN_URL)("Phase 8: money operations (skipped)", () => {
  it.skip(SKIP_REASON, () => {});
});
