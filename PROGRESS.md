# PocketPulse — Progress

Durable project state. Update before a context reset or at the end of each work session.
Source of truth for requirements: `PROJECT_SPEC.md`. Working rules: `CLAUDE.md`.

_Last updated: 2026-10-26 — end of Phase 4 (built and tested locally; migration 0700 waits for `db push`)._

## Build stages

One integrated product. Stages are an internal build order only; nothing is deferred past Phase 10.

| # | Stage | Status |
| --- | --- | --- |
| 1 | Foundation: tooling, design system, app shell, every route, shared states | ✅ Done |
| 2 | Financial domain core: paise math, INR formatting, Asia/Kolkata period boundaries, ledger/balance invariants (income, expense, refund, transfer, allocation, release), opening/closing balances, aggregation, budgets, savings, safe-to-spend — pure + unit-tested (`src/domain/`) | ✅ Done |
| 3 | Supabase: schema + migrations, RLS on every private table, cross-user denial tests, server data access, auth (register, login, logout, recovery) and route protection | ✅ Done — applied to the hosted project (`qzmqvytrekenzciasvph`) and verified live in Phase 3a: registration, login, logout, defaults, signed-in e2e, cross-user RLS, account-deletion cascade. The live password-reset email is still pending (see blockers) |
| 4 | Onboarding (balance + effective date, wallets, currency/timezone, allowance, budgets, goals, prefs), accounts, categories/subcategories management, profile/preferences sync | 🟨 Built; DB + unit tests pass locally; live e2e of `/onboarding` and `/accounts` waits for migration 0700 to be pushed (see blockers) |
| 5 | Transactions (⬜ Next): quick-add tiles, full form, repeat/frequent, history with search/filters, detail/edit/delete/undo (real `notFound()` + re-check 404 status, see Checks note), idempotency keys | ⬜ |
| 6 | Natural-language parser + voice entry with draft review and atomic batch confirm | ⬜ |
| 7 | Insights + charts with drill-down, sparse-data honesty, Money Leak Detector with what-ifs | ⬜ |
| 8 | Budgets (alerts, pace, suggestions), savings goals + allocation ledger, safe-to-spend, survival mode, recurring templates + commitments | ⬜ |
| 9 | Parent report (preview, PDF, CSV, text; reconciled totals), gamification (XP, levels, streaks, quests, achievements; idempotent), reminders, data export + account deletion | ⬜ |
| 10 | PWA + IndexedDB offline queue, sync states, conflict handling; full e2e at mobile/desktop; a11y/perf pass; docs; final verification | ⬜ |

## Spec §23 acceptance checklist

Status key: ⬜ not started · 🟨 partial (detail given) · ✅ done and verified.

- 🟨 Registration, login and recovery work with real configured auth. — **Live:** registration through `/register` (2 new accounts, signed in straight to `/onboarding`), login, the signed-in redirect away from `/login`, and logout via the account menu (signed-in e2e, 129 passed). **Recovery:** the forgot/reset forms, `/auth/confirm` (PKCE `code` + `token_hash`), invalid-link handling and the no-session reset page are built and e2e-tested, but the **live reset email is not yet tested** (see blockers). Live sign-up ran with "Confirm email" temporarily off, so the confirmation-email path is built and tested locally only.
- ✅ All user data is private and protected by tested access rules. — RLS on all 20 tables, owner-only. Proven locally (`tests/db`, 34 tests on PostgreSQL 18) **and live** (`npm run test:live`, publishable key only, 6/6): user B can't read, update, re-own, delete, soft-delete, link to or reuse the ids of user A's rows, and anonymous callers get `42501` on tables and RPCs.
- ⬜ Adding income and expense updates correct balance immediately.
- ⬜ Quick-add presets/custom amounts work.
- ⬜ Text and voice routes create reviewable drafts and confirm before save. — Routes `/add/text`, `/add/voice` exist.
- ⬜ History, search, filters, editing, deletion and undo work. — Routes exist; `/transactions/[id]` and `/edit` return a genuine 404 until the ledger exists.
- 🟨 Category/subcategory totals reconcile with transactions. — Domain `categoryBreakdown` is tested to reconcile category → subcategory → period total (refunds included, including refunds landing in a later period); screens wire it in Phases 5/7.
- ⬜ Insights point to real supporting records and handle sparse data honestly.
- ⬜ Money Leak Detector groups and totals correctly.
- 🟨 Budgets/alerts recalculate on changes. — Domain `evaluateBudget` (spent/remaining/%/pace/thresholds) and `newlyReachedThresholds` are tested, including edits/deletes; UI and alert delivery in Phase 8.
- 🟨 Savings allocations do not count as purchases or reduce consolidated total balance. — Proven in domain tests (invariant 4); end-to-end in Phase 8.
- 🟨 Transfers between owned accounts do not inflate consolidated income/expense. — Proven in domain tests (invariants 2–3); end-to-end in Phases 4–5.
- 🟨 Safe-to-spend and allowance predictions avoid double counting. — Domain `calculateSafeToSpend` tested (invariant 5, paid-commitment linkage, goal purchase + release); UI in Phase 8.
- 🟨 Parent report balances and totals reconcile for the selected historical period. — Domain `summarizePeriod` rebuilds opening/closing from the ledger and is tested to reconcile (invariant 10); report UI/exports in Phase 9.
- ⬜ PDF/CSV exports are real and contain correct data.
- ⬜ XP, streaks, quests and achievements work consistently.
- 🟨 PWA works on supported devices; responsive app works on laptop/mobile. — Responsive shell done (sidebar ≥1024px; header + 5-tab bottom nav + "All sections" sheet + add FAB on mobile), Playwright runs at desktop and Pixel 7 sizes. No PWA manifest/service worker yet (Phase 10).
- ⬜ Offline entries persist and sync without loss or duplication. — Only an online/offline banner exists; it truthfully says changes can't be saved offline.
- 🟨 Loading, empty, error, permission-denied and offline states are handled. — Shared `StatePanel` (empty/error/offline/denied), `PageSkeleton`, route `loading.tsx`, `error.tsx`, in-shell and global `not-found.tsx`, `global-error.tsx`, offline banner. Each feature must still wire these to its real data states.
- ⬜ No required action is a placeholder or fake success. — Phase 1 has no fake actions: every button/link navigates or changes a real preference. Feature screens are empty states until built.
- 🟨 Lint/typecheck/tests/production build are run and failures are addressed. — All pass for Phase 3 (see Checks).
- 🟨 Setup documentation accurately describes what needs a real Supabase project/credentials. — README › Setup was followed for the hosted project: init/login/link/db push (login/link/db push must run in an interactive terminal), URL configuration, token-hash email templates, `.env.e2e.local`. Re-check at final delivery.

## Routes (spec §5)

Every screen has a route; feature screens show a real empty state until their stage lands.

| Screen | Route(s) | State |
| --- | --- | --- |
| Welcome / onboarding | `/welcome`, `/onboarding?step=…` | 6-step wizard (region, balance, income, budgets, goal, preferences); every step skippable; "Skip setup" |
| Register, login, recovery | `/register`, `/login`, `/forgot-password`, `/reset-password`, `/auth/confirm` | Real forms (Phase 3); config panel only when Supabase env is missing |
| Home | `/home` | Empty state + links to add flows (Phase 5/7) |
| Quick add / type / voice / full form | `/add`, `/add/text`, `/add/voice`, `/transactions/new` | Empty state (Phases 5–6) |
| History, detail, edit | `/transactions`, `/transactions/[id]`, `/transactions/[id]/edit` | Empty / 404 (Phase 5) |
| Wallets | `/accounts` | Create, edit (name/type/opening balance + date), default, archive/restore, balances now |
| Categories | `/categories?tab=…` | Hierarchy, create/edit/icon/colour, reorder, archive/restore, merge, rules + live tester, Uncategorized queue |
| Insights, Money leaks | `/insights`, `/insights/leaks` | Empty state (Phase 7) |
| Budgets, goals, safe-to-spend, survival | `/budgets`, `/goals`, `/safe-to-spend`, `/survival` | Empty state (Phase 8) |
| Income & recurring | `/recurring` | Empty state (Phase 8) |
| Parent report | `/reports` | Empty state (Phase 9) |
| Rewards, reminders | `/rewards`, `/reminders` | Empty state (Phase 9) |
| Settings: profile/preferences | `/settings` | Name, theme/motion (synced), currency/timezone/week start, income, small-purchase threshold, reminders, privacy |
| Privacy, sync, data export/deletion | `/settings/privacy`, `/settings/sync`, `/settings/data` | Privacy: real content + report default. Data: section structure only; export/deletion say "not connected in this build yet" (wired in Phase 9, per your instruction). Sync: Phase 10 |

`src/proxy.ts` (Next 16's name for middleware): `/` → `/home` (signed in) or `/welcome`; signed-out app routes and `/onboarding` → `/login?next=<path>`; signed-in visits to login/register/forgot → `/home`; `/reset-password` and `/auth/*` are always reachable. Without Supabase env, app routes → `/login`, which explains the missing configuration.

## Architecture decisions

- **Stack:** Next.js 16.4.3 App Router (Turbopack), React 19.3.1, TypeScript 6.0.3 strict (`noUncheckedIndexedAccess`), Tailwind 4.3.3, `typedRoutes` on.
- **Version pinning:** exact versions, chosen for peer compatibility rather than "latest". TypeScript 7.0 was rejected because `typescript-eslint` supports `<6.1`. ESLint stays on 9.39.5 (npm marks it deprecated) because `eslint-plugin-react`, `-import` and `-jsx-a11y` don't support ESLint 10 yet. Vitest 5 + Vite 8 + `@vitejs/plugin-react` 6.
- **Components:** shadcn/ui-style components written directly on the unified `radix-ui` package + `class-variance-authority` (not generated by the CLI, so it couldn't rewrite our tokens). `components.json` is set up for future `shadcn add`.
- **Animation:** `motion` 14 (the current Framer Motion package, `motion/react`). `MotionConfig.reducedMotion` comes from the user preference.
- **Reduced motion:** preference `system | reduce | full` in localStorage (`pp-motion`), applied before paint by an inline script as `html[data-motion]`. CSS kills transitions/animations under OS reduce (unless overridden to `full`) or `data-motion="reduce"`. Moves to synced profile preferences in Phase 4.
- **Theming:** `next-themes`, class strategy, default `dark` (midnight), plus `light` and "match device". Tokens are CSS variables in `globals.css` (oklch), mapped via `@theme inline`. `positive` (lime/green) is reserved for progress/success.
- **Fonts:** Geist via the `geist` package (self-hosted; no build-time network fetch).
- **Navigation:** one config (`src/lib/navigation.ts`) drives the sidebar, bottom tabs, "All sections" sheet and section tabs. Longest-prefix matching on segment boundaries picks the active item. Mobile tabs: Home, Activity (`/transactions`), Insights, Plan (`/budgets` + goals/safe-to-spend/survival), Reports.
- **Server/client boundary:** server pages pass serialisable keys (e.g. `SectionTabs section="plan"`), not icon components, to client components.
- **Supabase keys:** the new key scheme — `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`) and server-only `SUPABASE_SECRET_KEY` (`sb_secret_…`), matching the user's `.env.local`. The legacy anon key works as a fallback. `src/lib/env.ts` reads only public values.
- **Money:** integer paise everywhere (`int8` in Postgres; JS `number` limited to safe integers, checked on every add/subtract). Amounts are positive; the transaction type gives direction. Division only goes through `divRound` (BigInt, explicit half-up/floor/ceil). Percentages are integer basis points. Formatting is string arithmetic on the integer (Indian grouping for INR), never `Intl` on a float. Amount input with more than 2 decimals is **rejected**, not rounded. Max single amount ₹9,99,99,99,999.99.
- **Domain layer (`src/domain/`, Phase 2):** pure TypeScript + Zod, no React/Next/Supabase imports. ESLint enforces this for `src/domain/**` (no framework or `@/` imports, no `parseFloat`, no `toFixed`). Modules: `money`, `time`, `schemas`, `ledger`, `balances`, `aggregation`, `budgets`, `savings`, `safe-to-spend`, re-exported from `@/domain`. **Every later screen, chart, budget, goal, forecast and report must call these functions; none may reimplement the math.**
- **Time:** instants are epoch ms; calendar days are `LocalDate` "YYYY-MM-DD" in the user's timezone (default Asia/Kolkata; any IANA zone works, DST-safe). All periods are half-open `[start, end)` and built by `resolvePeriod` (today, yesterday, this/previous week, this/previous month, custom, all-time). Weeks start Monday by default (configurable). `previousPeriod` gives the comparable earlier period.
- **Transactions:** `income`, `expense`, `refund`, `transfer`, `allocation`, `allocation_release` (Zod discriminated union). The client-generated UUID `id` is the idempotency key. `deletedAt` (soft delete; undo = restore) and `voidedAt` (audit) both exclude a row from every calculation. Income, expense and refund need an `accountId`: onboarding will create a default wallet and preselect it, so picking an account stays optional for the user while balances stay well-defined.
- **Refund convention (the only one):** a refund is a separate `refund` transaction with a positive amount, linked to the original expense by `refundOfId`. It adds to the account balance. It is **never income** and never a negative expense row. Net spending = expenses − refunds. The refund reduces spending in the original expense's category/subcategory (unless it names its own), and counts in the period of the refund's own date. Refunds for one expense may not exceed it or predate it (`validateLedger`). Reports show refunds as their own line.
- **Opening balance:** per account, at local midnight of `openingBalanceDate`. Ledger rows dated earlier count as already included, so balances ignore them (`validateLedger` flags them). For dates before an account's tracking started, historical balances list it as untracked instead of guessing. Period summaries report `newlyTrackedOpeningPaise`, so closing = opening + newly tracked + income + refunds − expenses always reconciles.
- **Budgets** are targets, not reserved cash. Spent = net spending. Pace projection waits until 10 % of the period has passed. Suggested limit = median of up to 3 complete previous months, rounded up to ₹50; no suggestion without a full month of history.
- **Savings:** earmarked = allocations − releases per goal, including paused/completed/archived goals until the money is released. Buying the goal item = a real expense + a release sized by `releaseForGoalPurchase`.
- **Safe-to-spend:** balance now − all earmarks − unpaid, uncancelled commitments due on or before the horizon (default: next income date) − optional reserve. A commitment counts as paid only while its `paidTransactionId` points at an active transaction. A missing or past next-income date → `not_enough_info`, with null daily/weekly limits. Recent pace = average daily net spending over up to 14 complete days, never before tracking started. Every result returns `inputs`, `explanation[]` and `warnings[]`.
- **Mutations:** `applyMutation` (create/update/delete/restore) is idempotent. A replayed create is `duplicate`; the same id with different content, or a stale `expectedUpdatedAt`, is `conflict`, never a silent overwrite. Phase 5 server actions and Phase 10 sync use the same rules.
- **Negative category spending (refund in a later period):** a category's net spending for a period can go below zero when it holds a refund for a purchase made earlier. Totals stay exact and signed (the earlier period is never rewritten). Charts and reports use `spendingDisplay(group)`: the bar or ring is drawn at **zero**, never negative, with a note like "Refunds exceeded purchases here by ₹350 (₹500 of it refunds purchases from an earlier period)". The refund also stays visible as its own line. Shares (`shareBp`) are `null` for a negative group or a non-positive total.

### Database (Phase 3, `supabase/migrations/`)

- **Files:** `…0100_schema` (tables, constraints, indexes), `…0200_integrity` (triggers mirroring domain rules), `…0300_rls`, `…0400_rpc`, `…0500_seed_defaults`.
- **Tables (20):** `profiles`, `accounts`, `categories` (one level of subcategories), `category_rules`, `savings_goals`, `recurring_templates`, `transactions` (the single ledger, including allocations/releases, i.e. the goal allocation ledger), `commitments`, `budgets`, `quick_add_presets`, `notification_preferences`, `notifications`, `achievements` + `quests` (read-only catalogs), `xp_events`, `user_achievements`, `user_quests`, `streak_state`, `sync_operations`, `sync_devices`. Money is `bigint` paise; the `currency_code` domain matches `SUPPORTED_CURRENCIES`.
- **Same-owner references:** every link between private rows is a composite `(owner_id, id)` foreign key, so a row can only point at the same user's account, category, goal, template or expense. This is enforced by the database even for the service role.
- **No silent cascades over history:** accounts, categories, goals and templates referenced by the ledger are `ON DELETE RESTRICT` (archive them instead). Clients can't hard-delete transactions (no grant, no policy); deletion is `deleted_at`. Only deleting the auth user (explicit account deletion, Phase 9) cascades that user's data.
- **Domain rules in the database** (`transactions_guard` trigger, every write path):
  - `amount_paise > 0` (≤ ₹9,99,99,99,999.99).
  - A per-type shape check: e.g. a transfer needs two different accounts and no category.
  - Currency matches every account involved, the goal, and the refunded expense.
  - Categories must be the right kind (expense vs income), top-level, and the subcategory must belong to its category.
  - A refund must link to an active expense of the same user, can't predate it, and the active refunds can't exceed it. The expense row is locked, so concurrent refunds serialise.
  - An expense with refunds can't be deleted, shrunk below them, moved after them, or change currency.
  - Per-goal earmark (allocations − releases) never drops below zero. The goal row is locked.
  - Immutable after insert: `id`, `owner_id`, `type`, `idempotency_key`, `batch_id`, `created_at`. `version` bumps on every update.
  - Errors use SQLSTATE `P0001` with a machine-readable message (`refund_exceeds_expense`, `currency_mismatch`, …) and a human detail.
- **Idempotency:** the client UUID `id`, plus `idempotency_key` unique per user (defaulting to the id), plus `(recurring_template_id, recurring_occurrence)` unique. Replays return `duplicate`; same id or key with different content returns `conflict`.
- **RPCs** (`SECURITY INVOKER`: RLS and triggers apply; the owner is always `auth.uid()`; a payload `owner_id` is ignored): `create_transaction`, `log_transactions_batch` (1–50 income/expense entries, all-or-nothing), `create_transfer`, `move_goal_money` (allocation/release), `record_goal_purchase` (expense + release in one transaction), `pay_commitment` (expense + link), `update_transaction` (optimistic concurrency on `version`), `set_transaction_deleted` (soft delete/undo). Each returns `{status: applied | duplicate | conflict | not_found, …}`.
- **RLS:** enabled on all 20 tables. Owner-only CRUD on ordinary tables. Ledger: select/insert/update only. Rewards state and profile/notification preferences can't be inserted by clients. Catalogs are read-only. `anon` has no table or RPC access. Helper functions callable from triggers are granted to `authenticated`; seeding is `SECURITY DEFINER` and not callable by clients (`ensure_my_defaults()` seeds only the caller).
- **Per-user defaults:** the `on_auth_user_created` trigger creates the profile (display name from sign-up metadata), notification preferences (quiet by default; only in-app budget alerts on), streak state, the spec §9 hierarchy (8 expense categories / 39 subcategories) + 5 income categories, and 12 quick-add tiles. **Tiles are seeded without amounts**: the app never invents prices, and a tile remembers the amount the user saves (Phase 5). No wallet is seeded (see Phase 4 notes).
- **Auth app side:**
  - `src/lib/supabase/server.ts` (cookie-based, `getCurrentUser()` via verified `getClaims()`), `client.ts` (browser, publishable key) and `admin.ts` (`server-only`; secret key read at call time; not imported anywhere yet).
  - Server actions in `src/lib/auth/actions.ts`, with Zod form schemas, mapped error copy (never confirms whether an email has an account), `safeNextPath` open-redirect protection, and `/auth/confirm` for email links.
  - `NEXT_PUBLIC_SITE_URL` builds email-link URLs, falling back to the request host.
- **Row → domain mapping:** `src/lib/data/mappers.ts` converts DB rows (PostgREST numbers or node-postgres int8 strings) into Zod-validated domain records. All math stays in `@/domain`. The DB tests feed real rows through it into `consolidatedBalanceAt` / `totalEarmarked`.

### Phase 4 decisions

- **Migration `…0700_onboarding_accounts_categories`** (SECURITY INVOKER; RLS applies): `ensure_default_account()` (creates "Cash", ₹0 from today in the user's timezone, or promotes an active account named Cash; idempotent and race-safe), `set_default_account`, `save_opening_balances` (default + up to 10 extra wallets, one effective date, client ids so resubmission updates), `change_currency` (all-or-nothing; refused once any transaction exists, deleted ones included), `set_monthly_budgets`, `reorder_categories`, `merge_category` (+ helper `repoint_subcategory`), and a trigger refusing to archive the default wallet.
- **Default wallet:** created when `/onboarding` loads, by "Finish/Skip setup", and by `/accounts`, so it exists for backfilled users too. Phase 5 forms must call `ensureDefaultAccount()` and preselect it.
- **One currency per user.** New wallets/goals/budgets take the profile currency; Settings disables other currencies once an entry exists.
- **Archived wallets still count** in the consolidated balance (their history is real); they only leave the pickers. The Wallets screen explains entries dated before an opening date (`entriesBeforeOpening`). **Phase 5:** the entry form must show the same note when the chosen date is before the wallet's opening date (`isBeforeOpeningDate`).
- **Category merge rewrites references** (transactions, rules, tiles, templates, commitments, budgets — the target's budget wins) to the target in one transaction; the source stays archived with `merged_into_id` as the record. Merged transactions get a new `version`, so a stale offline edit reports a conflict (Phase 10). Main → main moves subcategories, folding same-named ones; main → sub is refused. Archive (not delete) is the only removal.
- **Suggestion service** `suggestCategory` (`src/domain/categorize.ts`), deterministic: user rules (priority, longest phrase, id) → exact prior choices (count, then most recent) → similar words → built-in keywords matched by category *name* → null (Uncategorized). Every suggestion has a plain-language `reason`; archived categories are skipped, merged ones resolved. Phases 5–6 call it with `{categories, rules, history: ledger}`.
- **Theme/motion sync:** stored in `profiles`; `PreferenceSync` applies a profile value only when it changed since this device last synced (`pp-synced-appearance`), so a just-made local choice is never reverted by a save still in flight.
- **Forms:** `ActionForm` runs `useActionState` actions without React's post-submit reset, so typed values survive server validation errors. Money fields use the domain parsers (`parseAmountInput`, new `parseSignedAmountInput` for opening balances); more than 2 decimals is rejected.
- **Per request:** one JWT verification (`optionalSession`/`requireSession`, cached), one profile read, one `requestNow()`. Loaders page past PostgREST's 1000-row cap.
- **E2E:** at most 4 workers (2 on CI) — more parallel browsers hit Supabase Auth rate limits and timed out. Tests that write the shared test profile run on desktop only and restore defaults.

### Phase 9 notes: account deletion (recorded in Phase 3a)

Clients can't hard-delete transactions (no grant or policy), so account deletion runs **server-side**:

1. `/settings/data` → "Delete account" shows the consequences (all records, permanently) and offers the data export first. The user types a confirmation phrase and re-enters their password, which the server checks with `signInWithPassword`, so a stolen session alone can't delete the account.
2. A server action (never client code) calls `createSupabaseAdminClient().auth.admin.deleteUser(userId)` from `src/lib/supabase/admin.ts` (secret key, `server-only`). `userId` comes from the verified session (`getCurrentUser()`), never from the form. Hard delete, not `shouldSoftDelete`.
3. Postgres removes everything in that one statement: every `owner_id` FK is `ON DELETE CASCADE` to `auth.users`, and the same-owner links are `NO ACTION` (checked at end of statement), so the refunds → expenses → accounts graph cascades in any order. Verified locally (`tests/db/account-deletion.test.ts`) and live (pp-a/pp-b, 2026-10-26).
4. Then sign out locally and clear cookies. Existing access tokens stay valid until they expire (≤ 1 h), but the user's rows and refresh tokens are gone.
5. If goal images are stored in Supabase Storage (Phase 8), delete the user's objects **before** `deleteUser`; Storage isn't covered by the database cascade.
6. Log only that a deletion happened, never the user's data or email.

### Phase 4 notes (recorded from the Phase 2 review)

- ✅ Done in Phase 4 (see decisions above). Onboarding must **auto-create a default "Cash" wallet** (`accounts.is_default = true`, one per user, enforced by a unique index) together with the opening balance and its effective date. It is pre-selected in every form that needs an account (quick add, full form, batch, recurring, commitments).
- When a user logs a transaction dated **before an account's opening balance date**, the UI must explain why the balance didn't change: it is treated as already included in the opening balance. The domain's `validateLedger` reports it as `before_opening_date`; the database deliberately allows it, so history can still be recorded.
- After sign-up the user lands on `/onboarding`. Today it shows the steps and "Go to Home"; Phase 4 replaces it with the real wizard.

## Verification status: live vs local (Phase 3a, 2026-10-26)

Hosted project `qzmqvytrekenzciasvph`. Live checks use the publishable key only, except the account-deletion cleanup, which used the secret key from a local server-side script.

| Area | Live (hosted project) | Locally only |
| --- | --- | --- |
| Migrations 0100–0500 | ✅ applied by `supabase db push` (your terminal) | ✅ PG 18 |
| Migration 0600 (backfill defaults) | ❓ **push output not received**: the message contained the literal `<paste output here>`. Confirm with `npx supabase@2.120.0 migration list` | ✅ PG 18 (`tests/db/defaults.test.ts`) |
| Sign-up trigger seeds defaults | ✅ 2 new accounts via `/register`: profile with display name, 52 categories (8 expense top-level), 12 tiles without amounts | ✅ |
| Defaults for users created before the trigger | ✅ dashboard test user went from 0 rows to profile + 52 categories + 12 tiles + prefs + streak, via the sign-in safety net (`ensure_my_defaults()`) | ✅ migration 0600 + RPC |
| Login, signed-in redirect, logout | ✅ signed-in e2e, desktop + Pixel 7 | ✅ |
| All 22 signed-in routes render (no console errors / overflow) | ✅ 129 passed, 0 skipped | — |
| Cross-user RLS, anon denial | ✅ `npm run test:live` 6/6 | ✅ `tests/db/rls.test.ts` |
| Idempotent RPC replay | ✅ `create_transaction` replay → `duplicate` | ✅ all RPCs |
| Account deletion cascade | ✅ `auth.admin.deleteUser` on pp-a/pp-b: every owned table → 0 rows (incl. pp-a's soft-deleted expense, which clients can't hard-delete); sign-in then fails; dashboard user unchanged | ✅ `tests/db/account-deletion.test.ts` |
| Sign-up with "Confirm email" ON (email → `/auth/confirm`) | ⏳ not tested live (built-in email quota was exhausted) | ✅ code path + invalid-link e2e |
| Forgot / reset password email | ⏳ **pending**: the dashboard test user's address belongs to someone else, so no reset email was sent | ✅ forms, validation, no-session page, invalid link |
| Transfers, refunds, goal money, batch rollback | — (no UI yet) | ✅ PG 18 |

## Checks run (Phase 4, 2026-10-26)

| Command / action | Result |
| --- | --- |
| Signed-in e2e with your new test user, before any Phase 4 change | **129 passed**. The user is email-confirmed and has defaults (profile, 52 categories, 12 tiles, prefs, streak; 0 wallets) |
| `npx supabase@2.120.0 migration list` (agent) | 0100–0600 applied remotely — **0600 confirmed**. (Your message contained the literal `<paste>` again, so I checked myself.) |
| `npm run test:db` (local PG 18) | Pass, 5 files / 49 tests. 15 new in `tests/db/phase4.test.ts`: default wallet for trigger *and* backfilled users, promote existing Cash, idempotent and atomic opening balances, cross-user writes refused, default can't be archived, currency lock, budgets, reorder, merges keep history and totals |
| Mutation check | Disabling the merge's transaction repoint and the default-archive guard made 3 tests fail; restored |
| `npm test` | Pass, 14 files / 290 tests (48 new: suggestion service, signed amounts, opening-date helpers, every Phase 4 schema, onboarding redirect whitelist) |
| `npm run lint` / `typecheck` / `format:check` / `build` | Pass. The secret key value and `sb_secret_` occur 0 times in `.next` / `.next/static` |
| `npx supabase db push --dry-run` | Would push only `…0700` |
| `npx supabase db push` | **Blocked**: the agent's permission classifier denied writing to the hosted project. Not applied |
| `npm run test:e2e` (hosted project, without 0700) | **130 passed, 5 failed, 6 skipped**. All 5 failures need 0700: `/accounts` and `/onboarding` route checks (desktop + mobile) and the onboarding journey (`ensure_default_account` doesn't exist yet); the wallet and threshold tests are skipped behind it in the serial group. Categories (create/rename/archive, rule tester, queue), settings, theme sync across two "devices", reduced motion and all earlier tests pass |
| Visual check (screenshots, Pixel 7 + desktop) | Categories, category dialog, rules, settings, data page. Fixed: tabs wrap instead of clipping "Uncategorized" on phones |

## Checks run (Phase 3a, 2026-10-26)

| Command / action | Result |
| --- | --- |
| `npx supabase@2.120.0 init` (agent) | OK: `supabase/config.toml`, `supabase/.gitignore` |
| `npx supabase@2.120.0 login` (agent) | Failed: `LoginMissingTokenError`, the CLI needs an interactive terminal. You ran `login`, `link` and `db push` yourself; the push applied 0100–0500 |
| Pre-push fix | Same-owner FKs `ON DELETE RESTRICT` → `NO ACTION`, so deleting an auth user cascades regardless of trigger order. Deleting a referenced account/category/goal is still refused (`23503`) |
| `npm run test:db` (local PG 18) | Pass, 4 files / 34 tests (adds account deletion + backfill) |
| `npm test` / `npm run lint` / typecheck / format / `npm run build` | Pass (241 unit tests) |
| `npm run test:e2e` against the hosted project | **129 passed, 0 skipped** (1 setup sign-in + 64 × desktop + 64 × Pixel 7) |
| Registration via `/register` (production build, port 3000) | 2 accounts (`test2+pp-a@gmail.com`, `test2+pp-b@gmail.com`) → `/onboarding`. "Confirm email" was off; no email sent |
| `npm run test:live` | 6 passed. The first run had 1 failure from a wrong expectation: reusing A's id returns `conflict/id_in_use` with nothing written, not an FK error. Fixed the test |
| Cleanup | pp-a and pp-b **deleted** with `auth.admin.deleteUser` (secret key, local script). Rows verified 0; their credentials removed from `.env.e2e.local` |

## Checks run (Phase 3, 2026-10-26)

| Command | Result |
| --- | --- |
| `npm install --save-exact @supabase/supabase-js@2.117.3 @supabase/ssr@0.12.7 server-only@0.0.1` + dev `pg@8.23.1 @types/pg@8.23.1` | OK |
| `npm audit` | Flagged zod 4.6.5 (GHSA-mrhx-c7xc-m3w5, memory exhaustion on oversized collections), so zod was upgraded to **4.6.7**. Now 0 vulnerabilities |
| Migrations on PostgreSQL 18.3 (throwaway local cluster, no Docker) | All 5 apply cleanly. Signup trigger seeds profile + 52 categories + 12 tiles |
| `npm run test:db` (`POCKETPULSE_TEST_DB_URL` → local PG 18) | Pass, 2 files / 29 tests: RLS (enabled on every table, anon denied everywhere, cross-user read/insert/update/delete/re-own denied, cross-user FK links rejected, payload owner ignored, foreign ids not revealed, no hard deletes, no client reward writes, seeding private), idempotent create/batch/transfer/goal-purchase/commitment replays, batch rollback on invalid or conflicting entry, transfer rollback (foreign account, currency mismatch, same account), refund/currency/category/goal rules, optimistic-concurrency edits, soft delete/restore, DB rows → domain balance |
| Mutation check of the DB tests | Temporarily disabling the refund-limit check and one RLS policy made 6 tests fail; files restored |
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm test` | Pass, 12 files / 241 tests (adds the later-period refund tests, auth routes/schemas/errors, row mappers) |
| `npm run build` | Pass. 32 routes + `ƒ Proxy (Middleware)` |
| Secret-key bundle search | The `SUPABASE_SECRET_KEY` value, `sb_secret_` and the variable name occur **0 times** in `.next/static`, and the value 0 times anywhere in `.next`. (The admin client isn't imported yet; `server-only` makes a client import a build error.) |
| `npm run test:e2e` | Pass: **70 passed, 58 skipped**. Signed-out suite × desktop Chrome + Pixel 7: `/` → `/welcome`; all 22 app routes (incl. onboarding) → `/login?next=…`; public pages render with no console errors or overflow; server-side validation on sign-in/register/forgot; reset page without a recovery session; invalid email link → explained error; `next=//evil.example` neutralised; theme persists. The signed-in shell suite (29 tests × 2) is **skipped**: no `E2E_EMAIL`/`E2E_PASSWORD`, and the project has no migrations yet. The first run failed 2 tests because a test locator also matched Next's route announcer; fixed the locator, not the app |

## Checks run (Phase 2, 2026-10-26)

| Command | Result |
| --- | --- |
| `npm install --save-exact zod@4.6.5` | OK (only new dependency) |
| `npm run lint` | Pass, 0 problems. Domain guard verified on a probe file: a `react` import, `parseFloat` and `toFixed` are each reported as errors |
| `npm run typecheck` | Pass |
| `npm test` | Pass, 10 files / 216 tests (152 new in `tests/unit/domain/`: money, time, ledger/balances, aggregation, budgets, savings/safe-to-spend, plus `invariants.test.ts` with one block per spec §7 invariant) |
| `npm run build` | Pass, same 30 routes |
| `npm run test:e2e` | Not re-run: Phase 2 changes no UI or routes |

## Checks run (Phase 1, 2026-10-25)

| Command | Result |
| --- | --- |
| `npm install` | OK, 0 vulnerabilities |
| `npm run lint` | Pass, 0 problems |
| `npm run typecheck` | Pass |
| `npm test` | Pass, 3 files / 64 tests (navigation + route coverage for every spec §5 screen, motion/env preferences, StatePanel, BottomNav, appearance settings) |
| `npm run build` | Pass, 30 routes (28 static, 2 dynamic) |
| `npm run test:e2e` | Pass, 68 tests (34 × desktop Chrome + Pixel 7): every route renders an h1 with no console errors, no horizontal overflow and no "coming soon"; `/` → `/welcome`; sidebar vs bottom-nav/sheet/FAB navigation; theme persists across reload; reduced-motion override + OS reduced motion; offline banner; unknown transaction → in-shell not-found |

Note: because of the `(app)` loading boundary, Next.js streams `notFound()` pages with HTTP 200 + `noindex` instead of a 404 status. The e2e test (`e2e/shell.spec.ts`, "unknown transaction ids…") asserts the in-shell not-found UI and the `noindex` meta, not the status code.

**Phase 5 follow-up:** when the ledger exists, `/transactions/[id]` and `/transactions/[id]/edit` must look up the record (owner-scoped via RLS) and call `notFound()` for a missing or other-user id. Re-check the HTTP status then. If a real 404 is wanted, give the detail route its own `loading.tsx` or resolve the record before streaming starts, and update the e2e test to assert the status.

## Known blockers / notes

- ⚠️ **Push migration 0700:** run `npx supabase@2.120.0 db push` in your terminal (it applies only `…0700_onboarding_accounts_categories.sql`), then `npm run test:e2e`. Until then `/onboarding` and `/accounts` show the error state on the hosted project.
- ✅ "Confirm email" is back on, 0600 is applied, and the e2e user is on an address you control (your report; 0600 and the user's defaults verified by the agent).
- ⏳ **Remind at the start of Phase 9: verify the live password-reset email.** Status: built and tested locally; live email test pending. Needs a test user whose address you can open and that Supabase's built-in email will deliver to (a team member's address, or custom SMTP), plus available hourly email quota.
- Supabase's built-in email service only delivers to team-member addresses and allows a few emails per hour. Configure custom SMTP (Authentication → Emails → SMTP) before real users sign up.
- The Supabase CLI's `login`, `link` and `db push` need an interactive terminal (or `SUPABASE_ACCESS_TOKEN` + `SUPABASE_DB_PASSWORD`), so they run in your terminal, not the agent's.
- Docker isn't installed, so `supabase start` isn't available. DB tests run on local PostgreSQL 18 with `tests/db/supabase-shim.sql`; hosted-project behaviour is covered by the live checks above.
- The e2e "invalid email link" test sends one bogus `verifyOtp` request to the configured project (it fails by design and creates nothing).
- npm's allow-scripts warns that `unrs-resolver`'s postinstall hasn't run; lint works without it (it ships prebuilt binaries).
- Git: `main` tracks `origin` (https://github.com/KIRITHIKJI/PocketPulse.git). Work is committed and pushed at the end of every phase; Phase 1 = `93ff182`, Phase 2 = `08288e7`.

## Next concrete tasks

Before Phase 5 (needs you): `npx supabase@2.120.0 db push`, then `npm run test:e2e` — the 5 Phase 4 failures above should pass.

Phase 5 (transactions):

1. Quick-add tiles, full form, repeat/frequent. Every form preselects `ensureDefaultAccount()` and pre-fills `suggestCategory(...)` with its reason; the user can override.
2. When the chosen date is before the wallet's opening date, show the `isBeforeOpeningDate` explanation in the form and on the saved entry.
3. History with search/filters, detail/edit/delete/undo via the existing RPCs (see the `notFound()` follow-up); the Uncategorized queue then fills from real entries.
4. The budgets and goal created in onboarding become editable on the Phase 8 screens.
