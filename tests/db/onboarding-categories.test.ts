import { readFileSync } from "node:fs";
import { join } from "node:path";

import { consolidatedBalanceAt } from "@/domain";
import { rowToAccount, rowToTransaction } from "@/lib/data/mappers";

import { A, A_CASH, B, type Fixtures, expenseJson, seedFixtures, tid } from "./fixtures";
import {
  ADMIN_URL,
  SKIP_REASON,
  type Session,
  type TestDb,
  as,
  createTestDb,
  createUser,
} from "./harness";

const FRESH = "eeeeeeee-0000-4000-8000-000000000005";
const LEGACY = "ffffffff-0000-4000-8000-000000000006";
const EXTRA_BANK = "eeeeeeee-0000-4000-8000-0000000000b1";
const BACKFILL = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20261026000600_backfill_defaults.sql"),
  "utf8",
);

describe.skipIf(!ADMIN_URL)("Phase 4: onboarding, accounts and categories", () => {
  let db: TestDb;
  let f: Fixtures;

  beforeAll(async () => {
    db = await createTestDb();
    f = await seedFixtures(db);
    await createUser(db, FRESH, "fresh@example.test");
    // A user whose defaults came from the backfill migration, not the signup trigger.
    await db.client.query("alter table auth.users disable trigger on_auth_user_created");
    await createUser(db, LEGACY, "legacy@example.test");
    await db.client.query("alter table auth.users enable trigger on_auth_user_created");
    await db.client.query(BACKFILL);
  });
  afterAll(async () => {
    await db?.close();
  });

  describe("default wallet", () => {
    it.each([
      ["a signup-trigger user", FRESH],
      ["a backfilled user", LEGACY],
    ])("ensure_default_account creates one Cash wallet from today for %s", async (_, user) => {
      await as(db, user, async (s) => {
        const first = await s.q("select (public.ensure_default_account()).*");
        const second = await s.q("select (public.ensure_default_account()).*");
        expect(second.rows[0]!.id).toBe(first.rows[0]!.id);
        const today = (await s.q("select (now() at time zone 'Asia/Kolkata')::date::text as d"))
          .rows[0]!.d;
        expect(first.rows[0]).toMatchObject({
          name: "Cash",
          kind: "cash",
          currency: "INR",
          is_default: true,
          opening_balance_date: today,
        });
        expect(Number(first.rows[0]!.opening_balance_paise)).toBe(0);
        expect((await s.q("select count(*)::int as n from public.accounts")).rows[0]!.n).toBe(1);
      });
    });

    it("promotes an existing active account called Cash instead of duplicating it", async () => {
      await as(db, FRESH, async (s) => {
        await s.q(
          "insert into public.accounts (name, opening_balance_paise, opening_balance_date) values (' cash ', 5000, '2026-10-01')",
        );
        const { rows } = await s.q("select (public.ensure_default_account()).*");
        expect(rows[0]).toMatchObject({ is_default: true, name: " cash " });
        expect((await s.q("select count(*)::int as n from public.accounts")).rows[0]!.n).toBe(1);
      });
    });

    it("the default wallet can't be archived; set_default_account moves the flag", async () => {
      await as(db, A, async (s) => {
        const err = await s.error("update public.accounts set archived_at = now() where id = $1", [
          A_CASH,
        ]);
        expect(err?.message).toBe("default_account_archived");
        const bank = (await s.q("select id from public.accounts where name = 'Bank'")).rows[0]!.id;
        await s.q("select public.set_default_account($1)", [bank]);
        const { rows } = await s.q(
          "select name from public.accounts where is_default order by name",
        );
        expect(rows).toEqual([{ name: "Bank" }]);
        expect(
          await s.error("update public.accounts set archived_at = now() where id = $1", [A_CASH]),
        ).toBeNull();
        const restoreFirst = await s.error("select public.set_default_account($1)", [A_CASH]);
        expect(restoreFirst?.message).toBe("account_archived");
      });
    });

    it("another user's wallet can't be made default", async () => {
      await as(db, B, async (s) => {
        const err = await s.error("select public.set_default_account($1)", [A_CASH]);
        expect(err?.message).toBe("account_not_found");
      });
      const { rows } = await db.client.query(
        "select is_default from public.accounts where id = $1",
        [A_CASH],
      );
      expect(rows[0].is_default).toBe(true);
    });
  });

  describe("onboarding opening balances", () => {
    it("saves the opening balance and date exactly, for a backfilled user too", async () => {
      for (const user of [FRESH, LEGACY]) {
        await as(db, user, async (s) => {
          await s.rpc("save_opening_balances", ["2026-10-20", 125050, "Cash", JSON.stringify([])]);
          const { rows } = await s.q("select * from public.accounts");
          expect(rows).toHaveLength(1);
          expect(rows[0]).toMatchObject({
            is_default: true,
            opening_balance_date: "2026-10-20",
          });
          expect(Number(rows[0]!.opening_balance_paise)).toBe(125050);

          // The same row through the domain layer: balance on the date = the opening balance.
          const account = rowToAccount(rows[0]!);
          const at = Date.parse("2026-10-21T00:00:00+05:30");
          expect(consolidatedBalanceAt([account], [], at).balancePaise).toBe(125050);
          expect(
            consolidatedBalanceAt([account], [], Date.parse("2026-10-19T12:00:00+05:30"))
              .untrackedAccountIds,
          ).toEqual([account.id]);
        });
      }
    });

    it("re-submitting the step updates wallets instead of duplicating them", async () => {
      await as(db, FRESH, async (s) => {
        const extra = (paise: number) =>
          JSON.stringify([
            { id: EXTRA_BANK, name: "SBI", kind: "bank", opening_balance_paise: paise },
          ]);
        await s.rpc("save_opening_balances", ["2026-10-20", 50000, null, extra(200000)]);
        await s.rpc("save_opening_balances", ["2026-10-22", 40000, "Wallet", extra(-1500)]);
        const { rows } = await s.q(
          "select name, kind, is_default, opening_balance_paise::int as o, opening_balance_date as d from public.accounts order by is_default desc",
        );
        expect(rows).toEqual([
          { name: "Wallet", kind: "cash", is_default: true, o: 40000, d: "2026-10-22" },
          { name: "SBI", kind: "bank", is_default: false, o: -1500, d: "2026-10-22" },
        ]);
      });
    });

    it("is all-or-nothing: a bad extra wallet leaves the default wallet unchanged", async () => {
      await as(db, FRESH, async (s) => {
        await s.rpc("save_opening_balances", ["2026-10-20", 50000, null, JSON.stringify([])]);
        const err = await s.error("select public.save_opening_balances($1, $2, $3, $4)", [
          "2026-10-25",
          99900,
          null,
          JSON.stringify([
            { id: EXTRA_BANK, name: "Cash", kind: "bank", opening_balance_paise: 1 },
          ]),
        ]);
        expect(err?.code).toBe("23505"); // duplicate active name
        const { rows } = await s.q(
          "select opening_balance_paise::int as o, opening_balance_date as d from public.accounts",
        );
        expect(rows).toEqual([{ o: 50000, d: "2026-10-20" }]);
      });
    });

    it("can't write into another user's wallet through an extra-wallet id", async () => {
      await as(db, B, async (s) => {
        const err = await s.error("select public.save_opening_balances($1, $2, $3, $4)", [
          "2026-10-20",
          0,
          null,
          JSON.stringify([{ id: A_CASH, name: "Mine", kind: "cash", opening_balance_paise: 1 }]),
        ]);
        expect(err).not.toBeNull();
      });
      const { rows } = await db.client.query("select name from public.accounts where id = $1", [
        A_CASH,
      ]);
      expect(rows[0].name).toBe("Cash");
    });
  });

  describe("currency", () => {
    it("changes everything together before the first entry, then locks", async () => {
      await as(db, FRESH, async (s) => {
        await s.q("select public.ensure_default_account()");
        await s.q("select public.change_currency('USD')");
        const { rows } = await s.q(
          "select (select currency from public.profiles) as p, (select currency from public.accounts) as a",
        );
        expect(rows[0]).toEqual({ p: "USD", a: "USD" });
      });
      await as(db, A, async (s) => {
        await s.rpc("create_transaction", [JSON.stringify(expenseJson(tid(400), 1000))]);
        const err = await s.error("select public.change_currency('EUR')");
        expect(err?.message).toBe("currency_locked");
      });
    });
  });

  describe("categories", () => {
    const sub = async (s: Session, name: string, parent: string) =>
      (
        await s.q(
          "select c.id from public.categories c join public.categories p on p.id = c.parent_id where c.name = $1 and p.name = $2",
          [name, parent],
        )
      ).rows[0]!.id as string;

    it("merging a subcategory keeps every transaction and its totals", async () => {
      await as(db, A, async (s) => {
        const coffee = await sub(s, "Coffee", "Food & Drinks");
        for (let i = 0; i < 3; i++) {
          await s.rpc("create_transaction", [
            JSON.stringify(
              expenseJson(tid(500 + i), 2000 + i, { category_id: f.aFood, subcategory_id: coffee }),
            ),
          ]);
        }
        await s.rpc("create_transaction", [
          JSON.stringify(
            expenseJson(tid(510), 1500, { category_id: f.aFood, subcategory_id: f.aTea }),
          ),
        ]);
        await s.q(
          "insert into public.category_rules (match_text, category_id, subcategory_id) values ('filter coffee', $1, $2)",
          [f.aFood, coffee],
        );
        const before = await s.q(
          "select count(*)::int as n, sum(amount_paise)::int as total from public.transactions where deleted_at is null",
        );

        const result = await s.rpc<{ status: string; transactions_moved: number }>(
          "merge_category",
          [coffee, f.aTea],
        );
        expect(result).toMatchObject({ status: "applied", transactions_moved: 3 });

        const after = await s.q(
          "select count(*)::int as n, sum(amount_paise)::int as total from public.transactions where deleted_at is null",
        );
        expect(after.rows[0]).toEqual(before.rows[0]);
        const tea = await s.q(
          "select count(*)::int as n, sum(amount_paise)::int as total from public.transactions where subcategory_id = $1",
          [f.aTea],
        );
        expect(tea.rows[0]).toEqual({ n: 4, total: 2000 + 2001 + 2002 + 1500 });
        // The source is kept as a record, archived and pointing at the target.
        const src = await s.q(
          "select archived_at, merged_into_id from public.categories where id = $1",
          [coffee],
        );
        expect(src.rows[0]!.merged_into_id).toBe(f.aTea);
        expect(src.rows[0]!.archived_at).not.toBeNull();
        const rule = await s.q("select subcategory_id from public.category_rules");
        expect(rule.rows[0]!.subcategory_id).toBe(f.aTea);
        // Rows still map cleanly into the domain.
        const rows = (await s.q("select * from public.transactions")).rows;
        expect(rows.map(rowToTransaction)).toHaveLength(rows.length);
      });
    });

    it("merging a main category moves subcategories and folds same-named ones", async () => {
      await as(db, A, async (s) => {
        // A custom "Food out" main category with a "Tea" (same name as Food & Drinks › Tea) and a
        // "Chaat" subcategory.
        const out = (
          await s.q("insert into public.categories (name) values ('Food out') returning id")
        ).rows[0]!.id;
        const outTea = (
          await s.q(
            "insert into public.categories (name, parent_id) values ('tea', $1) returning id",
            [out],
          )
        ).rows[0]!.id;
        const chaat = (
          await s.q(
            "insert into public.categories (name, parent_id) values ('Chaat', $1) returning id",
            [out],
          )
        ).rows[0]!.id;
        await s.rpc("create_transaction", [
          JSON.stringify(expenseJson(tid(600), 1000, { category_id: out, subcategory_id: outTea })),
        ]);
        await s.rpc("create_transaction", [
          JSON.stringify(expenseJson(tid(601), 3000, { category_id: out, subcategory_id: chaat })),
        ]);
        await s.rpc("create_transaction", [
          JSON.stringify(expenseJson(tid(602), 500, { category_id: out })),
        ]);
        await s.q("insert into public.budgets (category_id, limit_paise) values ($1, 100000)", [
          out,
        ]);
        await s.q("insert into public.budgets (category_id, limit_paise) values ($1, 200000)", [
          f.aFood,
        ]);

        const result = await s.rpc<{ transactions_moved: number }>("merge_category", [
          out,
          f.aFood,
        ]);
        expect(result.transactions_moved).toBe(3);

        const txs = await s.q(
          "select id, category_id, subcategory_id from public.transactions where id = any($1) order by id",
          [[tid(600), tid(601), tid(602)]],
        );
        expect(txs.rows).toEqual([
          { id: tid(600), category_id: f.aFood, subcategory_id: f.aTea },
          { id: tid(601), category_id: f.aFood, subcategory_id: chaat },
          { id: tid(602), category_id: f.aFood, subcategory_id: null },
        ]);
        const chaatRow = await s.q(
          "select parent_id, archived_at from public.categories where id = $1",
          [chaat],
        );
        expect(chaatRow.rows[0]).toEqual({ parent_id: f.aFood, archived_at: null });
        const folded = await s.q("select merged_into_id from public.categories where id = $1", [
          outTea,
        ]);
        expect(folded.rows[0]!.merged_into_id).toBe(f.aTea);
        // The target's budget wins; the source's is archived, not deleted.
        const budgets = await s.q(
          "select limit_paise::int as l, archived_at is not null as archived from public.budgets order by l",
        );
        expect(budgets.rows).toEqual([
          { l: 100000, archived: true },
          { l: 200000, archived: false },
        ]);
      });
    });

    it("rejects merges across kinds, main into sub, into itself, and across users", async () => {
      await as(db, A, async (s) => {
        expect(
          (await s.error("select public.merge_category($1, $2)", [f.aFood, f.aAllowance]))?.message,
        ).toBe("category_kind_mismatch");
        expect(
          (await s.error("select public.merge_category($1, $2)", [f.aTransport, f.aTea]))?.message,
        ).toBe("merge_main_into_sub");
        expect(
          (await s.error("select public.merge_category($1, $2)", [f.aTea, f.aTea]))?.message,
        ).toBe("merge_same_category");
        expect(await s.rpc("merge_category", [f.aTea, f.bFood])).toEqual({ status: "not_found" });
      });
    });

    it("reorders exactly the active siblings", async () => {
      await as(db, A, async (s) => {
        const { rows } = await s.q(
          "select id from public.categories where parent_id = $1 and archived_at is null order by sort_order",
          [f.aFood],
        );
        const ids = rows.map((r) => r.id as string).reverse();
        await s.q("select public.reorder_categories($1, 'expense', $2)", [f.aFood, ids]);
        const after = await s.q(
          "select id from public.categories where parent_id = $1 order by sort_order",
          [f.aFood],
        );
        expect(after.rows.map((r) => r.id)).toEqual(ids);
        const err = await s.error("select public.reorder_categories($1, 'expense', $2)", [
          f.aFood,
          ids.slice(1),
        ]);
        expect(err?.message).toBe("reorder_mismatch");
      });
    });
  });
  describe("starting budgets", () => {
    it("sets, updates and clears monthly budgets in one call without duplicates", async () => {
      await as(db, A, async (s) => {
        const budgets = () =>
          s.q(
            "select category_id, limit_paise::int as l, archived_at is null as active from public.budgets order by l",
          );
        await s.rpc("set_monthly_budgets", [
          JSON.stringify([
            { category_id: null, limit_paise: 800000 },
            { category_id: f.aFood, limit_paise: 300000 },
          ]),
        ]);
        await s.rpc("set_monthly_budgets", [
          JSON.stringify([
            { category_id: null, limit_paise: 900000 },
            { category_id: f.aFood, limit_paise: null },
          ]),
        ]);
        expect((await budgets()).rows).toEqual([
          { category_id: f.aFood, l: 300000, active: false },
          { category_id: null, l: 900000, active: true },
        ]);
        // A subcategory can't carry a budget (the integrity trigger), and nothing is half-saved.
        const err = await s.error("select public.set_monthly_budgets($1)", [
          JSON.stringify([
            { category_id: null, limit_paise: 100 },
            { category_id: f.aTea, limit_paise: 100 },
          ]),
        ]);
        expect(err?.message).toBe("category_not_top_level");
        expect((await budgets()).rows.find((r) => r.active)?.l).toBe(900000);
      });
    });
  });
});

describe.skipIf(ADMIN_URL)("Phase 4 database tests (skipped)", () => {
  it.skip(SKIP_REASON, () => {});
});
