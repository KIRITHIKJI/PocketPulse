/**
 * Clears what browser-test runs leave behind in the two e2e accounts: archived wallets, categories
 * and goals with no money entries pointing at them.
 *
 * Shows what it would remove and changes nothing unless run with --apply:
 *   node scripts/clean-e2e-data.mjs
 *   node scripts/clean-e2e-data.mjs --apply
 *
 * It signs in as each account with the publishable key, so the database only lets it touch that
 * account's own rows. Any row with an entry linked to it stays, deleted entries included: entries
 * are history, this never removes one, and the database would refuse if it tried. Only names that
 * tests use are candidates, so anything a person made is left alone.
 */
/* eslint-disable no-console -- its output is the point: this script reports what it does. */
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
process.loadEnvFile(".env.e2e.local");

const APPLY = process.argv.includes("--apply");
const TEST_NAME =
  /^(e2e\b|visual check|zz|check wallet|phase\s?\d|pp-|test\b|goa trip$|new laptop for college$)/i;

const accounts = [
  [process.env.E2E_EMAIL, process.env.E2E_PASSWORD],
  [process.env.E2E_USER_B_EMAIL, process.env.E2E_USER_B_PASSWORD],
];

async function all(query) {
  const { data, error } = await query;
  if (error) throw new Error(`${error.code}: ${error.message}`);
  return data;
}

const used = (rows, ...fields) =>
  new Set(rows.flatMap((row) => fields.map((field) => row[field])).filter(Boolean));

async function cleanAccount(email, password, label) {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false } },
  );
  const { error } = await sb.auth.signInWithPassword({
    email: email.trim(),
    password: password.trim(),
  });
  if (error) throw new Error(`sign-in failed for ${label}: ${error.code}`);

  // Deleted entries count: they're history, and the foreign keys protect them too.
  const ledger = await all(
    sb
      .from("transactions")
      .select("account_id, from_account_id, to_account_id, category_id, subcategory_id, goal_id")
      .limit(100000),
  );
  const walletsInUse = used(ledger, "account_id", "from_account_id", "to_account_id");
  const categoriesInUse = used(ledger, "category_id", "subcategory_id");
  const goalsInUse = used(ledger, "goal_id");

  const wallets = await all(sb.from("accounts").select("id, name, archived_at, is_default"));
  const goals = await all(sb.from("savings_goals").select("id, title, status"));
  const categories = await all(
    sb.from("categories").select("id, name, archived_at, parent_id, merged_into_id"),
  );
  const parents = used(categories, "parent_id", "merged_into_id");

  const plan = [
    [
      "accounts",
      wallets
        .filter(
          (w) =>
            w.archived_at && !w.is_default && !walletsInUse.has(w.id) && TEST_NAME.test(w.name),
        )
        .map((w) => [w.id, w.name]),
    ],
    [
      "savings_goals",
      goals
        .filter((g) => g.status === "archived" && !goalsInUse.has(g.id) && TEST_NAME.test(g.title))
        .map((g) => [g.id, g.title]),
    ],
    [
      "categories",
      categories
        .filter(
          (c) =>
            c.archived_at &&
            !categoriesInUse.has(c.id) &&
            !parents.has(c.id) &&
            TEST_NAME.test(c.name),
        )
        .map((c) => [c.id, c.name]),
    ],
  ];

  console.log(`\n${label}: ${ledger.length} entries kept, untouched`);
  for (const [table, rows] of plan) {
    console.log(`  ${table}: ${rows.length} to remove`, [...new Set(rows.map(([, n]) => n))]);
    if (!APPLY) continue;
    for (const [id, name] of rows) {
      const { error: failed } = await sb.from(table).delete().eq("id", id);
      // Something else still points at it, so it stays.
      if (failed) console.log(`    kept ${name}: ${failed.code}`);
    }
  }

  const left = await all(sb.from("accounts").select("id").not("archived_at", "is", null));
  const after = await all(sb.from("transactions").select("id").limit(100000));
  console.log(`  now: ${left.length} archived wallets, ${after.length} entries`);
  await sb.auth.signOut({ scope: "local" });
}

let n = 0;
for (const [email, password] of accounts) {
  n += 1;
  await cleanAccount(email, password, `Account ${n}`);
}
console.log(APPLY ? "\nDone." : "\nDry run. Nothing changed. Add --apply to remove these.");
