import { type TestDb, createUser } from "./harness";

export const A = "aaaaaaaa-0000-4000-8000-000000000001";
export const B = "bbbbbbbb-0000-4000-8000-000000000002";
export const A_CASH = "aaaaaaaa-0000-4000-8000-0000000000c1";
export const A_BANK = "aaaaaaaa-0000-4000-8000-0000000000b1";
export const A_USD = "aaaaaaaa-0000-4000-8000-0000000000d1";
export const B_CASH = "bbbbbbbb-0000-4000-8000-0000000000c1";
export const A_GOAL = "aaaaaaaa-0000-4000-8000-0000000000f1";

/** Deterministic v4 UUIDs for test transactions. */
export const tid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export interface Fixtures {
  aFood: string;
  aTea: string;
  aSnacks: string;
  aTransport: string;
  aAllowance: string;
  bFood: string;
}

/** Two users (seeded by the signup trigger) plus accounts and a goal, written as the DB owner. */
export async function seedFixtures(db: TestDb): Promise<Fixtures> {
  await createUser(db, A, "a@example.test");
  await createUser(db, B, "b@example.test");
  const q = (text: string, params: unknown[]) => db.client.query(text, params);
  await q(
    `insert into public.accounts (id, owner_id, name, kind, currency, opening_balance_paise, opening_balance_date, is_default)
     values ($1, $4, 'Cash', 'cash', 'INR', 100000, '2026-10-01', true),
            ($2, $4, 'Bank', 'bank', 'INR', 500000, '2026-10-01', false),
            ($3, $4, 'Dollars', 'bank', 'USD', 0, '2026-10-01', false)`,
    [A_CASH, A_BANK, A_USD, A],
  );
  await q(
    `insert into public.accounts (id, owner_id, name, opening_balance_paise, opening_balance_date, is_default)
     values ($1, $2, 'Cash', 20000, '2026-10-01', true)`,
    [B_CASH, B],
  );
  await q(
    `insert into public.savings_goals (id, owner_id, title, target_paise) values ($1, $2, 'Laptop', 5000000)`,
    [A_GOAL, A],
  );
  const cat = async (owner: string, name: string, parent?: string) => {
    const { rows } = await db.client.query(
      `select c.id from public.categories c left join public.categories p on p.id = c.parent_id
       where c.owner_id = $1 and c.name = $2 and coalesce(p.name, '') = $3`,
      [owner, name, parent ?? ""],
    );
    return rows[0].id as string;
  };
  return {
    aFood: await cat(A, "Food & Drinks"),
    aTea: await cat(A, "Tea", "Food & Drinks"),
    aSnacks: await cat(A, "Snacks", "Food & Drinks"),
    aTransport: await cat(A, "Transport"),
    aAllowance: await cat(A, "Allowance"),
    bFood: await cat(B, "Food & Drinks"),
  };
}

export function expenseJson(id: string, amount: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    type: "expense",
    amount_paise: amount,
    currency: "INR",
    occurred_at: "2026-10-05T12:00:00+05:30",
    account_id: A_CASH,
    ...extra,
  };
}
