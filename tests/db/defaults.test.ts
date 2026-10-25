import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ADMIN_URL, SKIP_REASON, type TestDb, as, createTestDb, createUser } from "./harness";

const LEGACY = "cccccccc-0000-4000-8000-000000000003";
const SEEDED = "dddddddd-0000-4000-8000-000000000004";
const BACKFILL = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20261026000600_backfill_defaults.sql"),
  "utf8",
);

async function defaults(db: TestDb, user: string) {
  const { rows } = await db.client.query(
    `select
       (select count(*)::int from public.profiles where id = $1) as profiles,
       (select count(*)::int from public.categories where owner_id = $1) as categories,
       (select count(*)::int from public.categories where owner_id = $1 and parent_id is null and kind = 'expense') as expense_top,
       (select count(*)::int from public.quick_add_presets where owner_id = $1) as tiles,
       (select count(*)::int from public.notification_preferences where owner_id = $1) as notification_prefs,
       (select count(*)::int from public.streak_state where owner_id = $1) as streaks`,
    [user],
  );
  return rows[0];
}

const FULL = {
  profiles: 1,
  categories: 52,
  expense_top: 8,
  tiles: 12,
  notification_prefs: 1,
  streaks: 1,
};
const EMPTY = {
  profiles: 0,
  categories: 0,
  expense_top: 0,
  tiles: 0,
  notification_prefs: 0,
  streaks: 0,
};

describe.skipIf(!ADMIN_URL)("default seeding for users created before the trigger", () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestDb();
    await createUser(db, SEEDED, "seeded@example.test");
    // A user created before the signup trigger existed (e.g. added in the Dashboard before db push).
    await db.client.query("alter table auth.users disable trigger on_auth_user_created");
    await createUser(db, LEGACY, "legacy@example.test");
    await db.client.query("alter table auth.users enable trigger on_auth_user_created");
  });
  afterAll(async () => {
    await db?.close();
  });

  it("starts with no defaults for the legacy user", async () => {
    expect(await defaults(db, LEGACY)).toEqual(EMPTY);
    expect(await defaults(db, SEEDED)).toEqual(FULL);
  });

  it("the backfill migration seeds missing users once and is safe to re-run", async () => {
    // Customise the seeded user so we can prove the backfill leaves them alone.
    await db.client.query("update public.profiles set display_name = 'Kept' where id = $1", [
      SEEDED,
    ]);
    await db.client.query(BACKFILL);
    expect(await defaults(db, LEGACY)).toEqual(FULL);
    await db.client.query(BACKFILL);
    expect(await defaults(db, LEGACY)).toEqual(FULL);
    expect(await defaults(db, SEEDED)).toEqual(FULL);
    const { rows } = await db.client.query(
      "select display_name from public.profiles where id = $1",
      [SEEDED],
    );
    expect(rows[0].display_name).toBe("Kept");
  });

  it("ensure_my_defaults repairs only the caller and never duplicates", async () => {
    await db.client.query("delete from public.quick_add_presets where owner_id = $1", [LEGACY]);
    await as(db, LEGACY, async (s) => {
      await s.q("select public.ensure_my_defaults()");
      await s.q("select public.ensure_my_defaults()");
      expect(
        (await s.q("select count(*)::int as n from public.quick_add_presets")).rows[0]!.n,
      ).toBe(12);
      expect((await s.q("select count(*)::int as n from public.categories")).rows[0]!.n).toBe(52);
    });
  });
});

describe.skipIf(ADMIN_URL)("default seeding (skipped)", () => {
  it.skip(SKIP_REASON, () => {});
});
