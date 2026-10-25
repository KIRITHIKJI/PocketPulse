import { consolidatedBalanceAt, totalEarmarked } from "@/domain";
import { rowToAccount, rowToTransaction } from "@/lib/data/mappers";

import {
  A,
  A_BANK,
  A_CASH,
  A_GOAL,
  A_USD,
  B,
  B_CASH,
  type Fixtures,
  expenseJson,
  seedFixtures,
  tid,
} from "./fixtures";
import { ADMIN_URL, SKIP_REASON, type Session, type TestDb, as, createTestDb } from "./harness";

type Result = { status: string; reason?: string; transaction?: Record<string, unknown> };

const count = async (s: Session, where = "true", params: unknown[] = []) =>
  (
    await s.q<{ n: number }>(
      `select count(*)::int as n from public.transactions where ${where}`,
      params,
    )
  ).rows[0]!.n;

describe.skipIf(!ADMIN_URL)("ledger RPCs and integrity rules", () => {
  let db: TestDb;
  let f: Fixtures;

  beforeAll(async () => {
    db = await createTestDb();
    f = await seedFixtures(db);
  });
  afterAll(async () => {
    await db?.close();
  });

  describe("idempotent inserts", () => {
    it("a retried create is a duplicate, never a second row", async () => {
      await as(db, A, async (s) => {
        const tx = expenseJson(tid(100), 1500, { category_id: f.aFood, subcategory_id: f.aTea });
        expect((await s.rpc<Result>("create_transaction", [tx])).status).toBe("applied");
        expect((await s.rpc<Result>("create_transaction", [tx])).status).toBe("duplicate");
        expect((await s.rpc<Result>("create_transaction", [tx])).status).toBe("duplicate");
        expect(await count(s, "id = $1", [tid(100)])).toBe(1);
      });
    });

    it("same id or idempotency key with different content is a conflict, not an overwrite", async () => {
      await as(db, A, async (s) => {
        await s.rpc("create_transaction", [
          expenseJson(tid(101), 1500, { idempotency_key: "op-1" }),
        ]);
        const sameId = await s.rpc<Result>("create_transaction", [expenseJson(tid(101), 9999)]);
        expect(sameId).toMatchObject({ status: "conflict", reason: "different_content" });
        const sameKey = await s.rpc<Result>("create_transaction", [
          expenseJson(tid(102), 1500, { idempotency_key: "op-1" }),
        ]);
        expect(sameKey).toMatchObject({ status: "conflict", reason: "different_content" });
        expect(await count(s)).toBe(1);
        const row = await s.q("select amount_paise from public.transactions where id = $1", [
          tid(101),
        ]);
        expect(row.rows[0]!.amount_paise).toBe("1500");
      });
    });

    it("the same idempotency key is independent per user", async () => {
      await as(db, A, async (s) => {
        expect(
          (
            await s.rpc<Result>("create_transaction", [
              expenseJson(tid(103), 100, { idempotency_key: "k" }),
            ])
          ).status,
        ).toBe("applied");
      });
      await as(db, B, async (s) => {
        expect(
          (
            await s.rpc<Result>("create_transaction", [
              expenseJson(tid(104), 100, { idempotency_key: "k", account_id: B_CASH }),
            ])
          ).status,
        ).toBe("applied");
      });
    });
  });

  describe("batch logging", () => {
    const batch = () => [
      expenseJson(tid(110), 1500, {
        category_id: f.aFood,
        subcategory_id: f.aTea,
        source: "parsed_text",
      }),
      expenseJson(tid(111), 2000, { category_id: f.aTransport, source: "parsed_text" }),
      expenseJson(tid(112), 3500, {
        category_id: f.aFood,
        subcategory_id: f.aSnacks,
        source: "parsed_text",
      }),
    ];

    it("saves every entry atomically and replays as a duplicate", async () => {
      await as(db, A, async (s) => {
        const r = await s.rpc<{ status: string; results: Result[] }>("log_transactions_batch", [
          tid(1100),
          JSON.stringify(batch()),
        ]);
        expect(r.status).toBe("applied");
        expect(r.results.map((x) => x.status)).toEqual(["applied", "applied", "applied"]);
        expect(await count(s, "batch_id = $1", [tid(1100)])).toBe(3);
        const replay = await s.rpc<{ status: string }>("log_transactions_batch", [
          tid(1100),
          JSON.stringify(batch()),
        ]);
        expect(replay.status).toBe("duplicate");
        expect(await count(s)).toBe(3);
      });
    });

    it("rolls back every entry when one is invalid", async () => {
      await as(db, A, async (s) => {
        const bad = [...batch(), expenseJson(tid(113), 0)];
        const err = await s.error("select public.log_transactions_batch($1, $2)", [
          tid(1101),
          JSON.stringify(bad),
        ]);
        expect(err?.message).toMatch(/transactions_amount_positive/);
        expect(await count(s)).toBe(0);
      });
    });

    it("rolls back every entry when one conflicts with an existing transaction", async () => {
      await as(db, A, async (s) => {
        await s.rpc("create_transaction", [expenseJson(tid(112), 777)]);
        const err = await s.error("select public.log_transactions_batch($1, $2)", [
          tid(1102),
          JSON.stringify(batch()),
        ]);
        expect(err?.message).toBe("batch_conflict");
        expect(await count(s)).toBe(1);
      });
    });

    it("only accepts income and expense entries", async () => {
      await as(db, A, async (s) => {
        const items = [
          { ...expenseJson(tid(114), 100), type: "allocation", goal_id: A_GOAL, account_id: null },
        ];
        expect(
          (
            await s.error("select public.log_transactions_batch($1, $2)", [
              tid(1103),
              JSON.stringify(items),
            ])
          )?.message,
        ).toBe("invalid_payload");
      });
    });
  });

  describe("transfers", () => {
    const at = "2026-10-06T10:00:00+05:30";

    it("moves money between own accounts without changing the consolidated balance", async () => {
      await as(db, A, async (s) => {
        const r = await s.rpc<Result>("create_transfer", [
          tid(120),
          A_BANK,
          A_CASH,
          30000,
          at,
          null,
          "manual",
        ]);
        expect(r.status).toBe("applied");
        expect(r.transaction).toMatchObject({
          type: "transfer",
          from_account_id: A_BANK,
          to_account_id: A_CASH,
        });
        expect(
          (
            await s.rpc<Result>("create_transfer", [
              tid(120),
              A_BANK,
              A_CASH,
              30000,
              at,
              null,
              "manual",
            ])
          ).status,
        ).toBe("duplicate");
        const accounts = (await s.q("select * from public.accounts")).rows.map(rowToAccount);
        const ledger = (await s.q("select * from public.transactions")).rows.map(rowToTransaction);
        const now = Date.parse("2026-10-07T00:00:00+05:30");
        const balance = consolidatedBalanceAt(accounts, ledger, now);
        expect(balance.balancePaise).toBe(600000);
        expect(balance.accounts.find((b) => b.accountId === A_CASH)?.balancePaise).toBe(130000);
      });
    });

    it("rolls back completely when the destination isn't the user's", async () => {
      await as(db, A, async (s) => {
        expect(
          (
            await s.error("select public.create_transfer($1, $2, $3, 100, now())", [
              tid(121),
              A_CASH,
              B_CASH,
            ])
          )?.message,
        ).toBe("account_not_found");
        expect(await count(s)).toBe(0);
      });
    });

    it("rejects transfers across currencies and to the same account, saving nothing", async () => {
      await as(db, A, async (s) => {
        expect(
          (
            await s.error("select public.create_transfer($1, $2, $3, 100, now())", [
              tid(122),
              A_CASH,
              A_USD,
            ])
          )?.message,
        ).toBe("currency_mismatch");
        expect(
          (
            await s.error("select public.create_transfer($1, $2, $3, 100, now())", [
              tid(123),
              A_CASH,
              A_CASH,
            ])
          )?.message,
        ).toMatch(/transactions_shape/);
        expect(await count(s)).toBe(0);
      });
    });
  });

  describe("domain rules mirrored in the database", () => {
    it("rejects non-positive amounts", async () => {
      await as(db, A, async (s) => {
        for (const amount of [0, -100]) {
          expect(
            (await s.error("select public.create_transaction($1)", [expenseJson(tid(130), amount)]))
              ?.message,
          ).toMatch(/transactions_amount_positive/);
        }
      });
    });

    it("requires the transaction currency to match its account", async () => {
      await as(db, A, async (s) => {
        expect(
          (
            await s.error("select public.create_transaction($1)", [
              expenseJson(tid(131), 100, { currency: "USD" }),
            ])
          )?.message,
        ).toBe("currency_mismatch");
        expect(
          (
            await s.rpc<Result>("create_transaction", [
              expenseJson(tid(132), 100, { currency: "USD", account_id: A_USD }),
            ])
          ).status,
        ).toBe("applied");
      });
    });

    it("checks category kind and subcategory parent", async () => {
      await as(db, A, async (s) => {
        expect(
          (
            await s.error("select public.create_transaction($1)", [
              expenseJson(tid(133), 100, { category_id: f.aAllowance }),
            ])
          )?.message,
        ).toBe("category_kind_mismatch");
        expect(
          (
            await s.error("select public.create_transaction($1)", [
              expenseJson(tid(134), 100, { category_id: f.aTransport, subcategory_id: f.aTea }),
            ])
          )?.message,
        ).toBe("subcategory_mismatch");
        expect(
          (
            await s.error("select public.create_transaction($1)", [
              expenseJson(tid(135), 100, { category_id: f.aTea }),
            ])
          )?.message,
        ).toBe("category_not_top_level");
      });
    });

    it("links refunds only to the user's own active expense, within its amount and date", async () => {
      await as(db, A, async (s) => {
        await s.rpc("create_transaction", [expenseJson(tid(140), 50000, { category_id: f.aFood })]);
        await s.rpc("create_transaction", [
          { ...expenseJson(tid(141), 90000), type: "income", category_id: f.aAllowance },
        ]);
        const refund = (id: number, amount: number, extra: Record<string, unknown> = {}) => ({
          ...expenseJson(tid(id), amount),
          type: "refund",
          refund_of_id: tid(140),
          occurred_at: "2026-10-08T12:00:00+05:30",
          ...extra,
        });

        expect((await s.rpc<Result>("create_transaction", [refund(142, 30000)])).status).toBe(
          "applied",
        );
        expect(
          (await s.error("select public.create_transaction($1)", [refund(143, 20001)]))?.message,
        ).toBe("refund_exceeds_expense");
        expect((await s.rpc<Result>("create_transaction", [refund(144, 20000)])).status).toBe(
          "applied",
        );
        expect(
          (await s.error("select public.create_transaction($1)", [refund(145, 1)]))?.message,
        ).toBe("refund_exceeds_expense");
        expect(
          (
            await s.error("select public.create_transaction($1)", [
              refund(146, 100, { refund_of_id: tid(141) }),
            ])
          )?.message,
        ).toBe("refund_without_expense");
        expect(
          (
            await s.error("select public.create_transaction($1)", [
              refund(147, 100, { occurred_at: "2026-10-01T12:00:00+05:30" }),
            ])
          )?.message,
        ).toBe("refund_before_expense");

        // The expense can't be deleted, shrunk below or moved after its refunds.
        expect(
          (await s.error("select public.set_transaction_deleted($1, true)", [tid(140)]))?.message,
        ).toBe("expense_has_refunds");
        const shrink = await s.error("select public.update_transaction($1, 1, $2)", [
          tid(140),
          { amount_paise: 40000 },
        ]);
        expect(shrink?.message).toBe("expense_below_refunds");
        const later = await s.error("select public.update_transaction($1, 1, $2)", [
          tid(140),
          { occurred_at: "2026-10-09T12:00:00+05:30" },
        ]);
        expect(later?.message).toBe("refund_before_expense");

        // Deleting a refund frees its amount again.
        await s.rpc("set_transaction_deleted", [tid(144), true]);
        expect((await s.rpc<Result>("create_transaction", [refund(148, 20000)])).status).toBe(
          "applied",
        );
      });
    });

    it("never lets goal releases exceed what was set aside", async () => {
      await as(db, A, async (s) => {
        const at = "2026-10-05T12:00:00+05:30";
        expect(
          (
            await s.rpc<Result>("move_goal_money", [
              tid(150),
              A_GOAL,
              "allocation",
              40000,
              at,
              null,
            ])
          ).status,
        ).toBe("applied");
        expect(
          (
            await s.error(
              "select public.move_goal_money($1, $2, 'allocation_release', 40001, $3)",
              [tid(151), A_GOAL, at],
            )
          )?.message,
        ).toBe("release_exceeds_allocation");
        expect(
          (
            await s.rpc<Result>("move_goal_money", [
              tid(152),
              A_GOAL,
              "allocation_release",
              15000,
              at,
              null,
            ])
          ).status,
        ).toBe("applied");
        // Deleting the allocation would leave the release uncovered.
        expect(
          (await s.error("select public.set_transaction_deleted($1, true)", [tid(150)]))?.message,
        ).toBe("release_exceeds_allocation");
        const ledger = (await s.q("select * from public.transactions")).rows.map(rowToTransaction);
        expect(totalEarmarked(ledger)).toBe(25000);
        // Allocations never touch the tracked balance.
        const accounts = (await s.q("select * from public.accounts")).rows.map(rowToAccount);
        expect(
          consolidatedBalanceAt(accounts, ledger, Date.parse("2026-10-07T00:00:00Z")).balancePaise,
        ).toBe(600000);
      });
    });

    it("records a goal purchase as one expense plus a release, atomically and idempotently", async () => {
      await as(db, A, async (s) => {
        await s.rpc("move_goal_money", [
          tid(160),
          A_GOAL,
          "allocation",
          40000,
          "2026-10-05T12:00:00+05:30",
          null,
        ]);
        const purchase = expenseJson(tid(161), 55000, { category_id: f.aFood });
        const r = await s.rpc<{ status: string; released_paise: number }>("record_goal_purchase", [
          purchase,
          tid(162),
          A_GOAL,
        ]);
        expect(r).toMatchObject({ status: "applied", released_paise: 40000 });
        const replay = await s.rpc<{ status: string }>("record_goal_purchase", [
          purchase,
          tid(162),
          A_GOAL,
        ]);
        expect(replay.status).toBe("duplicate");
        expect(await count(s)).toBe(3);
        const ledger = (await s.q("select * from public.transactions")).rows.map(rowToTransaction);
        expect(totalEarmarked(ledger)).toBe(0);
      });
    });
  });

  describe("edits, deletes and commitments", () => {
    it("updates with optimistic concurrency and ignores identity fields in the patch", async () => {
      await as(db, A, async (s) => {
        await s.rpc("create_transaction", [expenseJson(tid(170), 1500)]);
        const r = await s.rpc<Result>("update_transaction", [
          tid(170),
          1,
          { amount_paise: 2000, type: "income", owner_id: B },
        ]);
        expect(r.status).toBe("applied");
        expect(r.transaction).toMatchObject({
          amount_paise: 2000,
          type: "expense",
          owner_id: A,
          version: 2,
        });
        expect(
          (await s.rpc<Result>("update_transaction", [tid(170), 1, { amount_paise: 2000 }])).status,
        ).toBe("duplicate");
        const stale = await s.rpc<Result>("update_transaction", [
          tid(170),
          1,
          { amount_paise: 2500 },
        ]);
        expect(stale).toMatchObject({ status: "conflict", reason: "stale_version" });
        expect(
          (await s.rpc<Result>("update_transaction", [tid(999), 1, { amount_paise: 1 }])).status,
        ).toBe("not_found");
      });
    });

    it("soft-deletes and restores idempotently, excluded from domain totals while deleted", async () => {
      await as(db, A, async (s) => {
        await s.rpc("create_transaction", [expenseJson(tid(180), 10000)]);
        expect((await s.rpc<Result>("set_transaction_deleted", [tid(180), true])).status).toBe(
          "applied",
        );
        expect((await s.rpc<Result>("set_transaction_deleted", [tid(180), true])).status).toBe(
          "duplicate",
        );
        const accounts = (await s.q("select * from public.accounts")).rows.map(rowToAccount);
        const balanceNow = async () =>
          consolidatedBalanceAt(
            accounts,
            (await s.q("select * from public.transactions")).rows.map(rowToTransaction),
            Date.parse("2026-10-07T00:00:00Z"),
          ).balancePaise;
        expect(await balanceNow()).toBe(600000);
        expect((await s.rpc<Result>("set_transaction_deleted", [tid(180), false])).status).toBe(
          "applied",
        );
        expect(await balanceNow()).toBe(590000);
      });
    });

    it("pays a commitment by linking a real expense, once", async () => {
      await as(db, A, async (s) => {
        const { rows } = await s.q<{ id: string }>(
          `insert into public.commitments (owner_id, title, amount_paise, due_date) values ($1, 'Hostel fee', 300000, '2026-10-25') returning id`,
          [A],
        );
        const commitmentId = rows[0]!.id;
        const payment = expenseJson(tid(190), 300000);
        expect((await s.rpc<Result>("pay_commitment", [commitmentId, payment])).status).toBe(
          "applied",
        );
        expect((await s.rpc<Result>("pay_commitment", [commitmentId, payment])).status).toBe(
          "duplicate",
        );
        const other = await s.rpc<Result>("pay_commitment", [
          commitmentId,
          expenseJson(tid(191), 300000),
        ]);
        expect(other).toMatchObject({ status: "conflict", reason: "already_paid" });
        const c = await s.q("select paid_transaction_id from public.commitments where id = $1", [
          commitmentId,
        ]);
        expect(c.rows[0]!.paid_transaction_id).toBe(tid(190));
        expect(await count(s)).toBe(1);
      });
    });
  });
});

describe.skipIf(ADMIN_URL)("ledger RPCs and integrity rules (skipped)", () => {
  it.skip(SKIP_REASON, () => {});
});
