/**
 * Live checks against the configured Supabase project, using ONLY the publishable key (exactly
 * what a browser has). Needs two real accounts in .env.e2e.local:
 *   E2E_USER_A_EMAIL / E2E_USER_A_PASSWORD and E2E_USER_B_EMAIL / E2E_USER_B_PASSWORD.
 * Writes a few rows to user A's account (a test wallet and one soft-deleted expense per run).
 */
import { randomUUID } from "node:crypto";

import { type SupabaseClient, createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const users = {
  a: { email: process.env.E2E_USER_A_EMAIL, password: process.env.E2E_USER_A_PASSWORD },
  b: { email: process.env.E2E_USER_B_EMAIL, password: process.env.E2E_USER_B_PASSWORD },
};
const ready = Boolean(
  url && key && users.a.email && users.a.password && users.b.email && users.b.password,
);

const client = () =>
  createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });

async function signIn(who: "a" | "b") {
  const sb = client();
  const { data, error } = await sb.auth.signInWithPassword({
    email: users[who].email!,
    password: users[who].password!,
  });
  if (error) throw new Error(`sign-in ${who} failed: ${error.code}`);
  return { sb, id: data.user.id };
}

describe.skipIf(!ready)("live Supabase project", () => {
  let a: { sb: SupabaseClient; id: string };
  let b: { sb: SupabaseClient; id: string };
  const accountId = randomUUID();
  const txId = randomUUID();

  beforeAll(async () => {
    a = await signIn("a");
    b = await signIn("b");
  });
  afterAll(async () => {
    if (a) {
      await a.sb.rpc("set_transaction_deleted", { p_id: txId, p_deleted: true });
      await a.sb
        .from("accounts")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", accountId);
      await a.sb.auth.signOut({ scope: "local" });
    }
    await b?.sb.auth.signOut({ scope: "local" });
  });

  it.each(["a", "b"] as const)("user %s was seeded with defaults on sign-up", async (who) => {
    const { sb, id } = who === "a" ? a : b;
    const profile = await sb.from("profiles").select("id, display_name, currency, time_zone");
    expect(profile.data).toEqual([
      {
        id,
        display_name: `PP Live ${who.toUpperCase()}`,
        currency: "INR",
        time_zone: "Asia/Kolkata",
      },
    ]);
    const cats = await sb.from("categories").select("name, kind, parent_id");
    expect(cats.data).toHaveLength(52);
    expect(
      cats
        .data!.filter((c) => c.kind === "expense" && !c.parent_id)
        .map((c) => c.name)
        .sort(),
    ).toEqual([
      "Bills & Subscriptions",
      "College",
      "Entertainment",
      "Food & Drinks",
      "Health & Fitness",
      "Other",
      "Personal",
      "Transport",
    ]);
    const tiles = await sb
      .from("quick_add_presets")
      .select("label, amount_paise")
      .order("sort_order");
    expect(tiles.data!.map((t) => t.label)).toEqual([
      "Tea",
      "Coffee",
      "Snacks",
      "Breakfast",
      "Lunch",
      "Dinner",
      "Bus",
      "Train",
      "Auto/Cab",
      "Recharge",
      "Groceries",
      "Custom",
    ]);
    expect(tiles.data!.every((t) => t.amount_paise === null)).toBe(true);
  });

  it("user A can write their own rows through RLS and the RPCs", async () => {
    const acct = await a.sb
      .from("accounts")
      .insert({
        id: accountId,
        owner_id: a.id,
        name: `Live RLS ${accountId.slice(0, 8)}`,
        opening_balance_date: "2026-10-01",
      })
      .select("id, owner_id");
    expect(acct.error).toBeNull();
    const food = await a.sb
      .from("categories")
      .select("id")
      .eq("name", "Food & Drinks")
      .is("parent_id", null)
      .single();
    const r = await a.sb.rpc("create_transaction", {
      p_tx: {
        id: txId,
        type: "expense",
        amount_paise: 1500,
        occurred_at: new Date().toISOString(),
        account_id: accountId,
        category_id: food.data!.id,
      },
    });
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({
      status: "applied",
      transaction: { owner_id: a.id, amount_paise: 1500 },
    });
    const replay = await a.sb.rpc("create_transaction", {
      p_tx: {
        id: txId,
        type: "expense",
        amount_paise: 1500,
        occurred_at: r.data.transaction.occurred_at,
        account_id: accountId,
        category_id: food.data!.id,
      },
    });
    expect(replay.data.status).toBe("duplicate");
  });

  it("user B cannot read user A's rows", async () => {
    for (const table of [
      "transactions",
      "accounts",
      "categories",
      "quick_add_presets",
      "notification_preferences",
      "streak_state",
    ]) {
      const { data, error } = await b.sb.from(table).select("owner_id");
      expect(error, table).toBeNull();
      expect(
        data!.every((row) => row.owner_id === b.id),
        table,
      ).toBe(true);
    }
    expect((await b.sb.from("transactions").select("id").eq("id", txId)).data).toEqual([]);
    expect((await b.sb.from("accounts").select("id").eq("id", accountId)).data).toEqual([]);
    expect((await b.sb.from("profiles").select("id").eq("id", a.id)).data).toEqual([]);
  });

  it("user B cannot change, re-own, link to or delete user A's rows", async () => {
    const update = await b.sb
      .from("transactions")
      .update({ amount_paise: 1 })
      .eq("id", txId)
      .select("id");
    expect(update.data).toEqual([]);
    const rename = await b.sb
      .from("accounts")
      .update({ name: "Mine now" })
      .eq("id", accountId)
      .select("id");
    expect(rename.data).toEqual([]);
    const del = await b.sb.from("accounts").delete().eq("id", accountId).select("id");
    expect(del.data).toEqual([]);
    const hardDelete = await b.sb.from("transactions").delete().eq("id", txId);
    expect(hardDelete.error?.code).toBe("42501");

    const sneakyInsert = await b.sb
      .from("accounts")
      .insert({ owner_id: a.id, name: "Sneaky", opening_balance_date: "2026-10-01" });
    expect(sneakyInsert.error?.code).toBe("42501"); // RLS WITH CHECK

    const link = await b.sb.rpc("create_transaction", {
      p_tx: {
        id: randomUUID(),
        type: "expense",
        amount_paise: 100,
        occurred_at: new Date().toISOString(),
        account_id: accountId,
        owner_id: a.id,
      },
    });
    expect(link.error?.code).toBe("23503"); // (owner_id, account_id) must be B's own account

    const softDelete = await b.sb.rpc("set_transaction_deleted", { p_id: txId, p_deleted: true });
    expect(softDelete.data).toEqual({ status: "not_found" });
    const reuseId = await b.sb.rpc("create_transaction", {
      p_tx: {
        id: txId,
        type: "expense",
        amount_paise: 100,
        occurred_at: new Date().toISOString(),
        account_id: accountId,
      },
    });
    expect(reuseId.error).toBeNull();
    expect(reuseId.data).toEqual({ status: "conflict", reason: "id_in_use" }); // nothing written, nothing revealed

    // A's row is unchanged.
    const mine = await a.sb
      .from("transactions")
      .select("amount_paise, deleted_at")
      .eq("id", txId)
      .single();
    expect(mine.data).toEqual({ amount_paise: 1500, deleted_at: null });
  });

  it("anonymous callers get nothing", async () => {
    const anon = client();
    for (const table of ["transactions", "accounts", "profiles", "categories"]) {
      const { data, error } = await anon.from(table).select("*").limit(1);
      expect(error?.code, table).toBe("42501");
      expect(data, table).toBeNull();
    }
    expect((await anon.rpc("create_transaction", { p_tx: {} })).error?.code).toBe("42501");
  });
});

describe.skipIf(ready)("live Supabase project (skipped)", () => {
  it.skip("Set E2E_USER_A_* and E2E_USER_B_* in .env.e2e.local to run live checks.", () => {});
});
