# PocketPulse — Progress

Durable project state. Update before a context reset or at the end of each work session.
Source of truth for requirements: `PROJECT_SPEC.md`.

_Last updated: 2026-11-10 — Design 4 final check: sidebar fits 768 px, reward, offline and speed fixes; the complete e2e suite passed in one run (398 passed, 9 skipped, 0 failed; see "Design 4 final check"). Before that, 2026-11-07 — Design 4 of 4, the last design phase (every remaining screen, sidebar groups, full QA; see "Design 4"). No migration. Before that, Design 3 of 4 (Player status, Missions, Achievements, Rewards hub, the feedback ladder, permanent achievements, Safe to Spend on Home; see "Design 3"). Migration `20261106000200_missions` is applied on the hosted project (you ran `db push` on 2026-11-07). Before that, Design 2 of 4 (Home, Quick Add, mobile bar, rewards that follow Undo; see "Design 2"). Before that, Design 1 (audit, `doc/DESIGN_PLAN.md`, foundation). Before that, Code tidy (no behaviour change). Before that, Speed fixes 2. Migrations 0100–1000, 20261105000100 (ledger keyset index) and 20261106000100 (`wallet_balances`) are applied on the hosted project (you ran `db push`; `migration list` confirmed). The app is not deployed yet, so nothing has been tried on a real phone._

## Build stages

One integrated product. Stages are an internal build order only; nothing is deferred past Phase 10.

| # | Stage | Status |
| --- | --- | --- |
| 1 | Foundation: tooling, design system, app shell, every route, shared states | ✅ Done |
| 2 | Financial domain core: paise math, INR formatting, Asia/Kolkata period boundaries, ledger/balance invariants (income, expense, refund, transfer, allocation, release), opening/closing balances, aggregation, budgets, savings, safe-to-spend — pure + unit-tested (`src/domain/`) | ✅ Done |
| 3 | Supabase: schema + migrations, RLS on every private table, cross-user denial tests, server data access, auth (register, login, logout, recovery) and route protection | ✅ Done — applied to the hosted project (`qzmqvytrekenzciasvph`) and verified live in Phase 3a: registration, login, logout, defaults, signed-in e2e, cross-user RLS, account-deletion cascade. The live password-reset email is still pending (see blockers) |
| 4 | Onboarding (balance + effective date, wallets, currency/timezone, allowance, budgets, goals, prefs), accounts, categories/subcategories management, profile/preferences sync | ✅ Done — 0700 confirmed applied (`migration list`); `/onboarding` and `/accounts` e2e pass live |
| 5 | Transactions: one mutation layer (commands + idempotency keys), quick-add tiles, full form, repeat/frequent, history with search/filters, detail/edit/delete/undo with real 404s, Home dashboard | ✅ Done — unit, DB and live e2e (desktop + Pixel 7) pass |
| 6 | Natural-language parser + voice entry with draft review and atomic batch confirm | ✅ Done — unit, DB and live e2e pass. Voice UI is tested with a stand-in for speech recognition; a real microphone is not yet tested (see blockers) |
| 7 | Insights + charts with drill-down, sparse-data honesty, Money Leak Detector with what-ifs | ✅ Done — unit (including figure-by-figure reconciliation with history) and live e2e pass on desktop and Pixel 7 |
| 8 | Budgets (alerts, pace, suggestions), savings goals + allocation ledger, safe-to-spend, survival mode, recurring templates + commitments | ✅ Done — unit, DB and live e2e pass on desktop and Pixel 7; screens checked at laptop and phone sizes |
| 9 | Parent report (preview, PDF, CSV, text; reconciled totals), gamification (XP, levels, streaks, quests, achievements; idempotent), reminders, data export + account deletion | ✅ Done — unit, DB and live e2e pass on desktop and Pixel 7; PDF and screens checked at laptop and phone sizes |
| 10 | PWA + IndexedDB offline queue, sync states, conflict handling; full e2e at mobile/desktop; a11y pass; docs; final verification | ✅ Done in code and in automated browsers. Real-phone install, offline and speech are not verified: the app has to be deployed first |

## Spec §23 acceptance checklist

Status at the end of Phase 10. ✅ = verified, and how. 🟨 = works as far as it could be checked, with the specific gap named.

- ✅ Registration, login and recovery work with real configured auth. — Live: registration, login, logout and redirects in e2e; forgot password confirmed by you on the live project. Sign-up with "Confirm email" on was last checked by you when you turned it back on.
- ✅ All user data is private and protected by tested access rules. — RLS on all 20 tables: `tests/db` on PostgreSQL 18 and live with `npm run test:live` (6 passed, current accounts). `/api/sync` answers 401 signed out and 403 cross-site. Another account's offline queue is never listed or sent.
- ✅ Adding income and expense updates correct balance immediately. — DB tests and Journey A, live, desktop + Pixel 7.
- ✅ Quick-add presets/custom amounts work. — Unit and live e2e.
- 🟨 Text and voice routes create reviewable drafts and confirm before save. — Typed: proven live. Voice: same review, tested with a stand-in for speech recognition. You confirmed the microphone works in Chrome, but what it writes for "kal", "aaj" and "parso" still isn't known: the blanks in the Phase 10 message weren't filled in. Likely mishearings are handled and tested (see Phase 10 decisions).
- ✅ History, search, filters, editing, deletion and undo work. — Live e2e on both viewports, real 404s, cross-user 404.
- ✅ Category/subcategory totals reconcile with transactions. — `tests/unit/insights-reconcile.test.ts`, 7 periods, and Journey C.
- ✅ Insights point to real supporting records and handle sparse data honestly. — Unit and live e2e.
- ✅ Money Leak Detector groups and totals correctly. — Unit and live e2e, entry for entry against history.
- ✅ Budgets/alerts recalculate on changes. — Unit and live e2e.
- ✅ Savings allocations do not count as purchases or reduce consolidated total balance. — Domain invariants, DB tests, Journey D; a queued allocation replayed after a lost answer leaves the balance unchanged (`tests/db/phase10.test.ts`).
- ✅ Transfers between owned accounts do not inflate consolidated income/expense. — Domain invariants and DB tests through the mutation layer.
- ✅ Safe-to-spend and allowance predictions avoid double counting. — `calculatePlan` compared before and after every save and retry on PostgreSQL; Journey E on both viewports.
- ✅ Parent report balances and totals reconcile for the selected historical period. — 4 periods, row for row; Journey F on both viewports.
- ✅ PDF/CSV exports are real and contain correct data. — PDF read back and looked at; CSV checked row by row.
- ✅ XP, streaks, quests and achievements work consistently. — Idempotent by source key: memory, PostgreSQL, live.
- 🟨 PWA works on supported devices; responsive app works on laptop/mobile. — Manifest, icons, service worker and cold start offline pass in Chromium at desktop and Pixel 7 sizes, and every screen was checked at 375 and 1440 px. **Not verified:** installing on a real phone, and Safari/iOS at all. Both need the deployed https address.
- ✅ Offline entries persist and sync without loss or duplication, in Chromium. — Journey G live on both viewports: add offline, reload, reconnect, syncs once, right totals in a second session, replay is `duplicate`. Lost answers, batches, goal money, ordering and edit/delete races on PostgreSQL with the real queue. **Unsupported edge cases, on purpose:** syncing only runs while the app is open, and budgets, goals, wallets, categories and settings can't be changed offline; those forms say so. Not tried on a real phone or iOS (where the browser may clear site storage).
- ✅ Loading, empty, error, permission-denied and offline states are handled. — Shared states, a saved-page age notice, an offline screen for unsaved pages, and an offline form of the error screen. Screens checked by eye at 375 px dark and 1440 px light.
- ✅ No required action is a placeholder or fake success. — Grep (see Phase 10 checks) and the e2e suite. "Saved on this device" is what a queued entry says; it's never reported as synced until the server answers.
- ✅ Lint/typecheck/tests/production build are run and failures are addressed. — See Phase 10 checks.
- ✅ Setup documentation accurately describes what needs a real Supabase project/credentials. — README updated this phase, including phone setup. Its deployment steps haven't been followed end to end, because no deployment exists yet.

## Routes (spec §5)

Every screen has a route; feature screens show a real empty state until their stage lands.

| Screen | Route(s) | State |
| --- | --- | --- |
| Welcome / onboarding | `/welcome`, `/onboarding?step=…` | 6-step wizard (region, balance, income, budgets, goal, preferences); every step skippable; "Skip setup" |
| Register, login, recovery | `/register`, `/login`, `/forgot-password`, `/reset-password`, `/auth/confirm` | Real forms (Phase 3); config panel only when Supabase env is missing |
| Home | `/home` | Labelled tracked balance (animated), spent today / this month, quick-add row + log-again shortcuts, 5 most recent entries, monthly budget and goal snapshots (real data, or empty states linking to the onboarding steps) |
| Quick add / type / voice / full form | `/add`, `/add/text`, `/add/voice`, `/transactions/new` | Quick add + tile editor; full form (expense/income/refund/transfer); typed and voice entry with draft review |
| History, detail, edit | `/transactions`, `/transactions/[id]`, `/transactions/[id]/edit` | History with search and filters; detail (refund links, before-opening note, repeat, record a refund, delete); edit. Real 404s |
| Wallets | `/accounts` | Create, edit (name/type/opening balance + date), default, archive/restore, balances now |
| Categories | `/categories?tab=…` | Hierarchy, create/edit/icon/colour, reorder, archive/restore, merge, rules + live tester, Uncategorized queue |
| Insights, Money leaks | `/insights`, `/insights/category/[id]`, `/insights/leaks` | Period picker, totals, insight cards, trend chart, categories, comparison, frequent, unusual, recurring. Category page (Journey C). Leak groups with what-ifs |
| Budgets | `/budgets` | Total and per-category; monthly, weekly or custom dates; suggested limits, thresholds, alerts, pace, last period |
| Savings goals | `/goals`, `/goals/[id]` | Ring, remaining, suggestion, forecast, set aside/release, "I bought it", pause/complete/archive, history. Real 404s |
| Safe to spend, Survival mode | `/safe-to-spend`, `/survival` | Every input with its explanation; no limit without a next income date |
| Income & recurring | `/recurring` | Due and upcoming (labelled forecast, reminder or planned), recurring items, skipped, what actually happened |
| Parent report | `/reports`, `/reports/export` | Period, what to include, preview, comparison, PDF, CSV, copyable text. Choices live in the URL |
| Rewards | `/rewards` | Level, streaks, optional quests, achievements |
| Reminders | `/reminders` | Notification centre, switches, how often, browser notifications. Header bell shows unread |
| Settings: profile/preferences | `/settings` | Name, theme/motion (synced), currency/timezone/week start, income, small-purchase threshold, reminders, privacy |
| Privacy, sync, data export/deletion | `/settings/privacy`, `/settings/sync`, `/settings/data` | Privacy: real content + report default. Data: JSON and CSV export (`/settings/data/export`), account deletion. Sync: everything on this device that isn't on the server yet, conflict choices, install |
| Offline screen | `/offline?from=…` | What the service worker shows for a screen it hasn't saved. Reopens the real page after a successful check of the connection |

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
- **RPCs** (`SECURITY INVOKER`: RLS and triggers apply; the owner is always `auth.uid()`; a payload `owner_id` is ignored): `create_transaction`, `log_transactions_batch` (1–50 income/expense entries, all-or-nothing), `create_transfer`, `move_goal_money` (allocation/release), `record_goal_purchase` (expense + release in one transaction), `pay_commitment` (expense + link), `update_transaction` (optimistic concurrency on `version`), `set_transaction_deleted` (soft delete/undo), `undo_transactions_batch` (all-or-nothing undo of a batch, migration 0800). Each returns `{status: applied | duplicate | conflict | not_found, …}`.
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

### Phase 5 decisions

- **One mutation layer** (`src/lib/ledger/`):
  - Every financial write is a serialisable `LedgerCommand` (`create | update | delete | restore`), validated by Zod (`commands.ts`).
  - Each command has a client-generated `opId`. A create also carries the client-generated transaction `id` and sends `opId` as the row's `idempotency_key`.
  - `toRpcCall` maps a command to exactly one RPC: `create_transaction`, `update_transaction` (with `expectedVersion`) or `set_transaction_deleted`.
  - `executor.ts` runs the command through a two-method port (read a row, call an RPC). It maps `applied | duplicate | conflict | not_found` and database rule errors to user copy, and builds the **undo** command: create → delete, delete ↔ restore, edit → edit back to the replaced values (quoting the new version).
  - `execute.ts` is the server-only Supabase adapter. The DB tests drive the same executor through a Postgres port.
  - **Phase 10:** queue `LedgerCommand`s in IndexedDB and replay them through `runLedgerCommandWith`. Replays are already safe (`duplicate`), and conflicts come back as `conflict` with the server row.
- **Entry points:**
  - `runLedgerCommand`: quick add, repeat, delete, undo.
  - `saveQuickAdd`: an entry, plus an optional "usual amount" tile update that runs only after the entry is saved.
  - `saveEntryForm`: full-form create/edit via `commandFromForm`.
  - All three call `revalidatePath("/", "layout")`, so balance, history, category totals and every other ledger view re-render in the same response.
- **Double submit:** ids stay fixed until a save succeeds (quick-add sheet, full form, repeat). A second tap while one is in flight is ignored on the client. A retry after that gets `duplicate` (toast: "Already saved — no duplicate was added."). Reusing an id or `opId` for different content is a `conflict`, never an overwrite.
- **Every create, transfers included, uses `create_transaction`.** The transfer RPC can't take a description, tags or an idempotency key. The app leaves archived wallets out of pickers, and the database still checks ownership, currency and shape.
- **Dates:** the form takes a local date and time in the profile timezone (IST by default). `instantFromLocalDateTime` / `toLocalTime` in `src/domain/time.ts` are DST-safe. Past dates are allowed; anything more than 5 minutes in the future is refused ("plan it in Income & recurring").
- **Required fields:** the amount, plus a category for expenses and income. Refunds inherit the original expense's category unless one is picked; transfers have none. The wallet is always prefilled with the default wallet (`ensureDefaultAccount()`). Quick add shows a wallet picker only when there's more than one active wallet.
- **Suggestions** run on the client: the domain's `suggestCategory` over the user's categories, rules and last 400 categorised entries. They prefill the picker with a reason ("Suggested: Matched the word “lunch”") until the user picks a category.
- **Opening-date note:** one wording (`src/lib/opening-note.ts`) on /accounts, in the form (live, via `isBeforeOpeningDate`) and on the saved entry's detail page.
- **Real 404:**
  - Every page except `transactions/[id]` moved into a `(main)` route group, which owns `loading.tsx`. URLs are unchanged.
  - `transactions/[id]/layout.tsx` looks the row up before anything streams. The lookup is RLS-scoped, excludes deleted rows and checks the UUID format.
  - Missing, malformed, deleted and other-user ids therefore get HTTP 404 with the in-shell not-found screen (verified with real HTTP statuses).
- **Delete** is soft (`deleted_at`) and confirmed in a dialog that repeats the entry. An expense with refunds can't be deleted: the dialog explains why, and the database enforces it too. Allocation and release rows show in history but are edited from goals (Phase 8).
- **Undo toast** lives in the `(app)` layout: 8 s, pauses on hover/focus, survives navigation, `role=status`.
- **Motion:** the row just recorded gets a 1.6 s violet wash (`.pp-new-entry`). Home figures count up to new values over 600 ms, in whole paise, ending on the exact value. Both are switched off under reduced motion, and `data-paise` always holds the exact value.
- **Home scopes are labelled:** "Tracked balance · all wallets · now", "Spent today · <date>" and "Spent this month · <month>" (net of refunds), plus income received this month. The budget and goal snapshots use `evaluateBudget` / `goalProgress` on real rows, or show empty states linking to the onboarding budget/goal steps.
- **Tiles never invent prices.** A tile without an amount opens with an empty amount and offers "Make ₹X the usual amount", checked by default only in that case. The seeded "plus" icon is drawn as `circle-plus`.
- **E2E isolation:** the ledger spec runs as `ledger-desktop` then `ledger-mobile`, never in parallel, because it asserts exact balance changes. The Phase 4 wallet test now starts tracking tomorrow, so it can't shift today's totals. Page-content locators are scoped to `#main` because React 19 briefly keeps a hidden copy of streamed content.

### Phase 6 decisions

- **Parser** (`src/domain/parse-entries.ts`): deterministic and pure; no network or API key. It produces drafts only. Anything uncertain becomes an `issue` on the draft, never a silent guess.
  - **Order:** dates are replaced by markers first (so "24/10" is never an amount); then text splits on commas, semicolons, full stops and new lines, and on "and / & / plus / then" unless the left side has no amount ("bread and butter 40" stays one entry).
  - **No separators:** several amounts in one part mean several entries ("tea 15 bus 20"). If that would leave a bare number ("2 samosa 30"), it stays one entry and the amount is flagged. A currency mark settles it ("2 samosa ₹30").
  - **Spoken numbers** count only when the text has no digits ("tea fifteen", "two hundred fifty", and the Indian "one fifty" = 150).
  - **One date applies to every entry.** With several dates, an entry without its own takes the nearest earlier one, else the next. So "tea 15, lunch 40 yesterday" dates both yesterday; each draft shows its date and it can be changed.
  - A day and month with no year means the most recent past one. Income is recognised from "received / earned / salary / stipend / allowance / pocket money / got … from". English, plus the Hindi day words (see Phase 6a).
- **Review** (`src/lib/drafts.ts`, `draft-review.tsx`), shared by typed and voice entry. Nothing saves until confirmed.
  - **Blocks saving:** a missing or invalid amount, a future date, and doubts awaiting an answer (several numbers, another currency, reads like a refund/transfer). Editing the field or tapping the confirm button clears a doubt.
  - **Doesn't block:** no category. The draft is marked Uncategorized, saved, and joins the Uncategorized queue.
  - Suggestions refresh as the words change, but never override the user's own pick. Entries dated today use the time of confirming; earlier ones use 12:00 local.
  - Refunds and transfers need the full form, because `log_transactions_batch` takes only income and expenses and a refund must link to its purchase.
- **Mutation layer:** new command kinds. `batch` calls `log_transactions_batch` (all-or-nothing; `opId` is the batch id; each draft keeps its own id, so a replay is `duplicate`). `undo_batch` undoes a batch (see Phase 6a).
- **Voice honesty:** the old copy said "Audio never leaves your device", which isn't true: Chrome's speech recognition sends audio to Google. It's replaced on `/add/voice` and `/settings/privacy` with an up-front disclosure. Listening starts only from a tap, PocketPulse receives only text, and the transcript is editable. `continuous` is off because it repeats results on Android Chrome, so each tap captures one phrase and appends it. Language is `en-IN`.

### Phase 6a decisions

- **Undo of a batch is one RPC:** `undo_transactions_batch(p_op_id, p_batch_id)`, migration `…0800_undo_batch`. The command `undo_batch` replaces `delete_many`.
  - **All or nothing:** it locks the batch's rows in id order and soft-deletes each through `set_transaction_deleted`, in one transaction. If a row can't go (an expense refunded since), the error rolls back every row, the toast says "Nothing was removed", and Undo stays on offer.
  - **A retry can't undo twice:** the undo's `opId` goes into `sync_operations` in the same transaction. A failed undo leaves no record, so it can be retried. A repeat of one that worked is `duplicate` and touches no row, even if an entry was restored in between; checking row state alone would have deleted that entry again. A different opId for an already removed batch is also `duplicate`. An opId reused for another batch is `conflict`.
  - **It goes by batch id, not a list of ids,** so it can't miss an entry saved by an earlier attempt at the same batch. An entry deleted on its own beforehand doesn't stop the rest.
- **A failed Undo now always shows something.** `useLedger().undo` didn't catch a network failure, so the error vanished and the toast stayed as if nothing had happened.
- **The Uncategorized queue goes through the mutation layer.** `assignCategory` called `update_transaction` directly, against Phase 5's "one mutation layer". It's now an ordinary `update` command. `merge_category` stays a category-level RPC by design (Phase 4); it changes no amounts and bumps `version`.
- **Hindi day words:** `aaj` = today, `kal` = yesterday, `parso` = day before yesterday (also `parson`, as speech often spells it). Any case, whole word only, so "kalakand" is safe. A following subah/dopahar/shaam/raat and ka/ki/ke are absorbed, so "kal raat ka dinner 200" is Dinner.
  - "kal" and "parso" can also mean future days. Only past purchases are recorded, so they default to the past and the draft says so: "“kal” is read as yesterday, <date>. Change the date if you meant another day." It doesn't block saving, and setting the date clears it. "aaj" has one meaning, so it gets no note.
- **"Today" for parsing is read at review time,** not from the page's server render, so a tab left open overnight can't date "aaj" or "kal" a day early.
- **Phase prompts live in `doc/PHASE_PROMPTS.md`.** Phase 6 was first reviewed against the spec because the file wasn't in the repo yet, then again against its Phase 6 prompt, which found the gaps below.
- **Gaps closed against that prompt:**
  - **Entry points:** Home and the quick-add sheet now link to Type it and Say it. They were only reachable through the tabs on `/add`.
  - **Currency:** `rs20` and `inr20` with no space now read as amounts.
  - **Weekdays:** short names work after on/this/last ("auto 60 on mon"). Bare ones don't, so "sun glasses 200" stays a thing, not a date.
  - **Never silently guessed:** "tea 15 bus" used to become "Tea bus ₹15" with no question. Items on both sides of one price now raise `unclear_item` and need one tap to confirm. Words after the price that only describe it (at, with, for…) raise nothing.
  - **Unassigned:** drafts with no category now say "Unassigned". Saved entries still go to the Uncategorized queue, whose name is unchanged.
  - **Save all:** the button reads "Save all 2 entries · ₹55". One entry reads "Save 1 entry".
  - **Garbage:** "..." made an empty draft; it now counts as no entry.
- **"Never upload audio" vs the Web Speech API (settled):** the Phase 6 prompt asks for both. PocketPulse never receives or uploads audio, but Chrome's implementation sends it to Google to recognise it. The page says so before listening starts, which meets the spec's "do not silently upload". Decided by you: voice stays as it is.

### Phase 7 decisions

- **One model, no logic in screens:** `buildInsights` (`src/domain/insights.ts`) makes every figure and sentence; `src/domain/purchases.ts` holds grouping, small purchases, leaks, what-ifs and recurring signals. `src/lib/insights-view.ts` reads the period from the URL, words it, and builds links.
- **Every figure carries a `SpendingScope`:** the history filters behind it, turned into a link by `historyHref`. History gained `type=spending`, `nosub`, `under` and `by` + `key`, each decided by the same domain functions as the figure (`isSmallPurchase`, `purchaseGroupKey`, `refundCategory`). They survive changing other filters, and history says what it's narrowed to.
- **Fair comparison:** a running period is compared with the same days of the earlier one (1–21 Oct against 1–21 Sep), never all of it. Finished periods compare whole. The card names the dates. Below 3 purchases on either side it says "Not enough data to compare yet" and why.
- **Refunds:** a refund joins the group of the purchase it refunds, in the refund's own period. A refund counts as small when its *purchase* was small, whatever its own amount. Income is its own figure; transfers and allocations never enter a group.
- **"Small" is strict:** under the threshold, so at ₹50 a ₹50 purchase isn't small. The threshold, timezone, week start and currency all come from the profile. `spendingDisplay` took INR for granted; it now takes a formatter.
- **Unassigned** is always its own row and insight, drillable, with a link to the Uncategorized queue. The drill-down leaves out unassigned income, which isn't spending.
- **Sparse rules:** average from 2 purchases, median from 3, repeats and leaks from 3, a trend from 2 active days/weeks/months, unusual changes from 3 earlier windows. Windows from before tracking began don't count as ₹0. Below these the screen says so instead of showing a figure.
- **Unusual:** at least 1.5× or at most half the median of up to 4 earlier windows, and a gap of at least the small-purchase amount (no hardcoded rupees). The rule and the numbers are shown under "How we detected this".
- **Recurring signals** look across all history: 3+ dates, even gaps of 6+ days, prices within 25 %, not quiet for more than two gaps. Worded as "looks", not as fact.
- **"Similar description" has no spelling tolerance.** Case, plurals, word order, digits and filler match; "coffee" and "toffee" are one letter apart and must never merge. A typo therefore forms its own group.
- **Tiles are identified by label.** Transactions don't store a preset id, so a renamed tile starts a new group. A `preset_id` column would fix this, but needs a migration.
- **Groupings are separate views,** so one purchase is never counted twice in one list. Purchases a view can't place are counted in a note.
- **`mainDriver` now moves with the category.** It used to take the largest change in either direction, so "increased, mainly due to snacks" could name something that fell. "Mainly" also needs at least half of the change.
- **Charts:** Recharts 3.10.1 for the one-series trend, loaded only on these screens. Category shares are HTML bars, so each one is a real link and keyboard-reachable. Negative buckets draw at zero with a note; `chartShares` keeps percentages at 100 % when a refund-heavy category is at zero. Week buckets are clipped to the period, so a bar's link can't pull in days outside it. Future days aren't drawn. Each chart has a table with links. Animation follows the motion preference.
- **E2E server:** Playwright reuses whatever is on port 3100. A `next start` left over from Phase 6a served the old build to the first runs here. If results look stale, check that port first.

### Phase 8 decisions

- **Migration `…0900_plan_money`:** the only one this phase. Budgets, goals, bills and templates are ordinary owner-only writes that RLS and the existing triggers already cover.
- **Bugs fixed in the Phase 3 RPCs:**
  - `record_goal_purchase` decided a replay by looking for the release row. A purchase that released nothing has no such row, so its retry would release money set aside since. Now the expense already existing means the whole operation already ran.
  - The same function returned `duplicate` when a new expense met a used release id, leaving the expense saved. Now it raises and rolls back.
  - `pay_commitment` answered `duplicate` to a replay whose entry had been deleted, which read as paid while the bill was unpaid again. Now it's a `conflict`.
- **Tile id:** `transactions.preset_id`, expenses only, same-owner foreign key, part of the replay fingerprint, not patchable. Tile groups key on it, and show the tile's current name. A repeat of a tile entry keeps the tile. The custom tile never stamps one: it means something different each time, so those entries group by what was typed.
- **Backfill:** links an entry when exactly one tile of its owner has that label (case and outer spaces ignored, hidden tiles counted, custom tiles skipped). It's kept as `backfill_entry_presets()` so the test can run it on real rows, and clients can't call it. The trigger is off during it, so no row gets a new `version`. An entry made before a rename can't be linked: its label matches no tile. It keeps grouping by description.
- **Recurring occurrences are worked out, not stored.** A template produces dates; an occurrence is done while an active entry points at it, the same rule as a paid commitment. So deleting the entry makes it due again, undo is an ordinary delete, and no date math lives in SQL. `next_due_date` is where the schedule starts counting (resuming moves it past the paused gap).
- **One active entry per occurrence:** the unique constraint became a partial index over active rows, so a confirmation that was undone can be confirmed again, and restoring the old entry over a new one is refused. `confirm_recurring` locks the template, so two devices queue; the second gets `duplicate` with the first's entry.
- **Skips** reuse `commitments`: a cancelled row with the template and occurrence. Repeating a skip does nothing, and "Bring back" deletes the row. These rows aren't bills.
- **Forecast expenses join the commitments list only inside the calculation** (`forecastCommitments`, ids `recurring:<template>:<date>`). Expected income never counts.
- **`calculatePlan`** is the one entry point for Safe to spend and Survival Mode. The horizon is the saved next income date. Without a usable date it's 30 days, for the bills shown, and every limit stays null.
- **Income date:** today or earlier counts as passed. With a regular frequency the screen offers the next date from it, as a button: a passed date is never rolled forward without the user. Survival Mode's "day 12 of 30" also comes from the frequency, and doesn't show for irregular income.
- **Survival status** reads the safe-to-spend result: flexible at or below zero, or a recent pace that runs out early, is `at_risk`; a spend today above the daily amount is `watch`; no pace yet is `too_early`.
- **"I bought it"** releases the price or everything saved, whichever is less, and the two rows share a batch id so `undo_batch` reverses both. Deleting that expense alone from history leaves the release in place: they're separate records, and the balance stays right.
- **Deleting a goal purchase says what happened.** The delete dialog warns first. Then a note on History and the goal's page says the money wasn't put back, with "Set ₹X aside again". No new column: a release whose id is its own batch, with no active expense in that batch, is such a case (`orphanedPurchaseReleases`). The button soft-deletes the release, which puts back that exact amount and clears the note. Without a way to decline the note would stay for good, so "Keep it flexible" tags the release `kept flexible`, an ordinary checked edit. Both have Undo. `batchId` is now on domain records for this.
- **Budget alerts are read from the ledger, not stored.** Each budget shows its highest reached threshold, unless alerts are off in Settings. Writing them to `notifications` belongs with the Phase 9 notification centre.
- **`BudgetRemaining` is the only way a remaining amount is rendered,** so "target, not reserved money" can't be left off. `BUDGET_TARGET_NOTE` is the one wording.
- **Domain text took INR for granted.** Budgets, goals and safe-to-spend now take the profile's formatter; ISO dates in explanations became readable ones.
- **Wording:** "You logged Bus 4 times for ₹20 each: ₹80 this month." It keeps the label as typed and says "logged", which fits rides and recharges too. What-ifs follow: "If you logged 2 fewer Bus entries at ₹20…". This replaces the spec's "You bought coffee 16 times" example, by your instruction.
- **Celebration** is CSS keyframes around a message that stays. It starts only on the Mark complete click, covers nothing, and doesn't replay on reload. Under reduced motion the burst isn't drawn.
- **New-record ids regenerate per dialog opening.** Within one opening a double submit is one record. Keeping one id for the page's life would make a second add overwrite the first.
- **E2E:** the plan and motion specs join the serial ledger projects. Goals with history can't be deleted, so each spec reuses one archived goal.

### Phase 9 decisions

- **One report model** (`buildReport`) feeds the preview, PDF, CSV and text, so they can't disagree. Choices are URL parameters, read the same way by the page and the export route.
- **Report totals are the Insights totals.** `summarizePeriod` leaves out entries dated before a wallet's opening date, but Insights and History count them as spending. Using it directly would have made the report disagree. So spending and income come from `categoryBreakdown`, balances from `summarizePeriod`, and the difference is its own labelled line ("Entries already in opening balances").
- **Hiding a category hides its name and entries, not its money.** It joins an "Other categories" row, so the sums still work.
- **The preview refuses to look fine if it doesn't add up.** `reportDifferences` is checked on the page, and a mismatch says not to share the report.
- **PDF:** `pdf-lib` + `@pdf-lib/fontkit`, drawn from the report model, with Geist embedded because the PDF standard fonts have no ₹. Characters the font lacks become "?" rather than failing the export. `outputFileTracingIncludes` keeps the fonts in a deployment.
- **CSV:** plain decimals, a byte-order mark for Excel, and an apostrophe before any text starting with = + - @ tab or return, so a note can't run as a spreadsheet formula.
- **Rewards are worked out once, in the domain, and written from the server.** Clients can't write reward tables, so `syncRewards` reads with the user's client and writes with the admin client, always for the verified session's id. A SQL version would have duplicated the logic; an RPC taking events from the browser would have let a user grant themselves XP.
- **Every award has a stable key** (`logged_day:2026-11-01`), unique in the database. So repeating a sync, or adding and deleting entries, can't earn anything twice, and nothing is taken away by an edit. A day counts by when an entry was logged, so backdating can't fill a streak, and days already awarded stay even if the entries go.
- **Sync timing:** after each ledger write via `after()`, so it never slows a save, and on opening `/rewards`.
- **Monthly Budget Achieved** needs a total budget created before the month ended and at least 5 purchases that month, so a budget set afterwards, or a month with nothing logged, can't score. **No Mystery Money** needs a finished week with at least 3 expenses.
- **Spending Detective** counts distinct filtered History views opened from an insight (`from_insight=1`, stored as a hash of the filters).
- **Streaks read as a count, not a threat.** One stays current until a whole day passes, longest is kept, and the copy never says lost or broken.
- **Reminders are created while the app is open** (`ReminderSync`, on load and every 30 minutes). There's no background server and no push service, so nothing arrives while it's closed, and the screens say so. Each has a dedupe key. Browser notifications ask permission only from their button.
- **Budget alerts now reach the notification centre,** one per budget, period and level.
- **Account deletion:** the phrase and password are both checked on the server, the password on a throwaway client so the real session isn't touched. The id comes only from the session. Deleting the auth user cascades. No goal images are stored, so there's nothing to clear in Storage.
- **Exports read through the signed-in client,** so RLS decides what comes back, and they send `Cache-Control: private, no-store`. Deleted entries are included and marked.

- **A spoken "call" can mean "kal".** Voice only: `parseEntries(text, today, { spoken: true })`. In one entry with an amount and no date of its own, "call" reads as "kal" unless the words beside it make it a real call ("phone call 50", "call charges 99", "call taxi 200", "for call"). Typed text is never changed. The draft says "We heard “call” and read it as “kal”", and its date stays editable. The word lists are a judgement call; an unlisted real call ("call mom 50") reads as yesterday with that note showing.
- **Dropped reads are retried.** ECONNRESET on about 0.3 % of calls to the hosted project, measured from plain Node, was crashing whole screens, since a page makes about ten reads. `retryingFetch` repeats GET/HEAD and the idempotent `ensure_default_account`, up to twice. Writes aren't retried: they may have worked, and money has its own idempotent retry. HTTP errors pass through.

### Phase 10 decisions

- **The queue sits behind `useLedger`,** so every screen that saves through it works offline with no changes of its own. Without a connection, or if a send fails or takes over 15 seconds, the same command goes to IndexedDB (`src/lib/offline/queue.ts`, Dexie). A send that failed may still have landed; its ids make the replay a `duplicate`.
- **`/api/sync` instead of a server action for replays.** A background server action can redirect the app or re-render the screen. A route returns JSON, and a lost session is a plain 401 that leaves the queue waiting. `/api` is public in `routeAccess`, because a redirect means nothing to a fetch; the route checks the session itself.
- **No migration.** `set_transaction_deleted` has no version argument, so the check for a stale delete lives in the executor (read, compare, then call). It isn't atomic, but the window is a few milliseconds and the delete is soft. A migration would have needed a `db push` from you.
- **Conflicts wait for a decision.** Keeping the user's change, bringing back an entry deleted elsewhere, deleting anyway or saving as a new entry each make new commands, and nothing happens until one is chosen. Operations on the same record stay in order, and a stuck one holds back only its own record.
- **An entry that may have reached the server can't be edited or silently discarded.** After an unanswered send it might already exist, so discarding sends a delete after it instead, and editing is refused. Otherwise "save as new" could create a real duplicate.
- **Figures aren't adjusted for queued entries.** Home and Transactions list them and say they aren't in the figures yet. Two sources of a balance would be worse than one honest label.
- **The service worker is hand-written** (`public/sw.js`): hashed build files cache first, screens network first with a 4-second fallback, and writes, API routes, exports and auth never pass through it. A library would add a build step for about 150 lines. It saves the core screens in the background, because in-app navigation never produces a full page to save.
- **Saved pages hold financial figures,** so they're cleared on sign-out and on any signed-out auth screen, and a generation counter stops a running save from landing afterwards. The queue survives sign-out, keyed by owner, and is cleared only when the account is deleted.
- **`/offline` is a redirect, and it never trusts the `online` event.** Chrome fired `online` while offline and the reload cancelled the user's tap, so it now asks the server first.
- **Misheard day words are one table,** `HEARD_DAY_WORDS` in `parse-entries.ts`. Voice only, only with an amount and no date of its own, and the draft always says what was heard. "age", "person" and "parcel" are left out on purpose, because they're everyday items. Devanagari कल, आज and परसों count in typed text too, since they have one meaning. `dateWord` is now what was heard and `dateMeaning` what it was read as.
- **Reminders:** `REMINDERS_OPEN_NOTE` is the one wording, on `/reminders` (as a notice), Settings and onboarding.
- **`npm run clean:e2e`** lists leftovers and needs `--apply` to act. It signs in as each account, keeps anything with an entry linked to it, and only considers archived rows with names tests use.

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

## Project cleanup (2026-11-05)

- **Removed:** `src/lib/supabase/client.ts` (browser Supabase client; nothing imported it, since all data goes through the server). Untracked output also removed: `test-results/`, `.pgtest/` and `.pgtest.log` (`npm run test:db` setup in the README recreates them; the `.pgtest` server was not running).
- **Kept:** `scripts/make-icons.mjs`, which redraws the app icons if the mark changes. No files were moved.
- **`.gitignore`:** now also ignores `*.log`, `logs/` and `screenshots/` (`test-results/` and `playwright-report/` were already ignored).
- **Checks:** `npm run lint` ✅, `npm run typecheck` ✅, `npm test` ✅ 26 files / 786 tests (two clean runs; the first run after the deletions ended early with 12 files / 228 tests passing and 14 unexplained errors, which did not happen again), `npm run build` ✅. DB and e2e suites not run in this cleanup.

## Speed fixes 1 (2026-11-05)

From `doc/CODEBASE_REPORT.md` §8. Money results are unchanged (checked below).

- **#1 Region:** `vercel.json` runs functions in `bom1` (Mumbai), next to the Supabase project (AWS ap-south-1). README says so.
- **#3 Not done, on purpose.** Next 16.4 clears the whole client cache and re-renders the current page from the root after *any* `revalidatePath` from a server action (`server-action-reducer.js`: "TODO: Evict only segments with matching tags and/or paths"), and this app has no server data cache. Narrower paths would change nothing. The report is corrected. The real cost is that full re-render in every save's response.
- **#4 Reward sync:** `planRewardSync` works out the new rows and the resulting state from one read; `saveRewardPlan` writes the four tables at once; no read-back. `syncRewards` reads stored rewards and the ledger together. The catalog read is `cache`d per request.
- **#5 Reminder check:** at most once per 30 minutes per account per device (`pp-reminders-checked` in localStorage, shared by tabs and reloads). Saving reminder settings clears it (`CheckRemindersAgain`), so a reminder just switched on still shows on the next opening. Without storage it checks on every opening, as before.
- **#6 Default wallet:** `getAccountsWithDefault` finds the default in the wallets already read; the `ensure_default_account` RPC runs only when there's none. Home also loads everything in one `Promise.all` (it used to wait for the entry kit first).
- **#7 `/rewards` writes nothing while it loads:** it renders `previewRewards()` (stored state + what's newly earned, unsaved). When something new was earned, `SaveEarnedRewards` calls `saveEarnedRewards` after the page is on screen; the server works it out again, so the browser can't choose what's saved.
- **#9 Keyset paging:** the ledger is read with `fetchLedgerPages` (`src/lib/data/paging.ts`): each page continues after the last row (`occurred_at desc, id`). Migration `20261105000100_ledger_keyset_index` adds `(owner_id, occurred_at desc, id) where deleted_at is null` and drops `transactions_owner_time` (same columns first, same condition). No query reads transactions by `occurred_at` without `deleted_at is null` (checked by grep before the push).
- **#11:** one read of `notification_preferences`; `getCurrentUser` removed (`/reset-password` uses `optionalSession`).
- **#12:** Dexie and the queue load on first use (`src/lib/offline/load-queue.ts`). The page posts the build files it loaded to the service worker (`save-assets`), so the queue's code is saved even when it loaded before the worker took over on a first visit. The page fade is CSS (`pp-page-enter`, same 180 ms / 6 px); `motion` still loads for `MotionConfig` and the animated balance.

**Money check:** the previous commit (`3c13dd6`) and this code, built side by side and reading the same live data. 792 ₹ figures across 34 screens and both report CSVs were identical (the CSVs byte for byte). On 5 screens the raw HTML listed them in a different order. That's streaming order: two renders of the old build also differed. On screen, the order matched on all 11 screens checked in a browser.

**Timing** (production builds on this machine; old and new alternated in the same session; server render = median of 12, full load = median of 9 alternating hard loads, sidebar nav = median of 6):

| Page | Server render old → new | DB calls | Full load old → new | Sidebar nav old → new |
| --- | --- | --- | --- | --- |
| Home | 542 → 398 ms | 11 in 3 rounds → 10 in 2 | 672 → 368 ms | 646 → 372 ms |
| Transactions | 383 → 396 ms | 7 → 7 | 453 → 457 ms | 419 → 377 ms |
| Insights | 344 → 365 ms | 4 → 4 | 356 → 487 ms | 384 → 378 ms |

JS per page (uncompressed, as loaded): Home 1.07 → 0.94 MB, Transactions 1.06 → 0.93 MB, Insights 1.37 → 1.24 MB.

**Insights full load got slower (+130 ms).** The queries are no slower. The old build's reminder check ran 8 database calls on every page load, and that kept the server's connections to Supabase open. Without it, the first call after a ~2 s idle gap (the profile read) pays for a new connection, about +120 ms. Proof: forcing the reminder check on every load brings the new build's Insights back to 265 ms first byte. In production every page's first call after a pause pays this either way; making the 8 extra calls just to keep connections open isn't worth it.

**Checks:** lint ✅, typecheck ✅, format ✅, `npm test` ✅ 28 files / 806 tests (20 new: paging, reminder timing, reward plan), `npm run test:db` ✅ 117 + 11 placeholders (PostgreSQL 18, all migrations including the new one), `npm run test:live` ✅ 7 + 1 placeholder (new read-only test: keyset pages of 37 equal one full read on the real ledger), `npm run build` ✅. E2E: `offline.spec.ts` + `rewards.spec.ts` on ledger-desktop, 16/16, before the last small Home change. The full e2e suite wasn't run.

**Next speed steps:** both done in Speed fixes 2 (header count; reading only the period a screen needs), except the full re-render on every save.

## Speed fixes 2 (2026-11-06)

From `doc/CODEBASE_REPORT.md` §8 #2, plus the header count from Speed fixes 1's next steps. Money results are unchanged (checked below).

- **Balances from one database function.** Migration `20261106000100_wallet_balances` adds `wallet_balances(p_closing, p_opening default null)`. It returns each wallet's balance at both instants (null before the wallet's tracking starts), the two totals, and how many of each wallet's entries are dated before its opening date. Money is sent as text.
  - **Security:** `SECURITY INVOKER`, no user parameter, the owner is always `auth.uid()`, RLS applies, `anon` can't execute it.
  - **Used by:** Home, Wallets, Safe to spend, Survival, Goals, Recurring, goal detail (all through `loadPlan`), and Reports (opening and closing).
  - **It's called with GET** (read-only, so `retryingFetch` can repeat it). A GET sends arguments as text, so `null` would arrive as `"null"`. No opening is therefore left out rather than sent as null. The live test found this.
- **The domain still holds the rule.** `ledgerBalances` in `src/domain/balances.ts` is the reference the function mirrors; `periodBalanceInstants` gives the instants. `summarizePeriod` and `calculateSafeToSpend` take the function's balances as an optional input and throw if they were taken at another instant.
- **Each screen reads only its rows** (`src/lib/data/queries.ts`, helpers in `src/lib/data/slices.ts`). Explicit columns instead of `select *` (everything but `idempotency_key` and `void_reason`).
  - **Window start without waiting for the profile:** `startForAnyZone` takes the earliest start a screen's periods could have in any zone and week start: dates from UTC−12, minus 14 h (UTC+14), minus a day for DST. In the hours around a period boundary that includes the period before. The domain then filters to the real periods.
  - **Refunds:** a refund of a purchase older than the window brings that purchase in with one extra read, only when one exists. PostgREST can't embed the self-referencing composite key.
  - **All-time side reads:** goal money (`getGoalLedger`), recurring entries, bill payments (embedded in the bills read), the newest 400 categorised entries (suggestions), the expense recorded last ("Repeat last"), and every purchase and refund (`getSpendingLedger`).
  - **Per screen:**

    | Screen | Reads |
    | --- | --- |
    | Home | This day/week/month and the 60-day "frequent" look-back; goal money; the last expense. Budgets reaching further back (custom ones) get a second read only then. The newest five get their own read only when the window has fewer than five rows |
    | Budgets | This and last week, this month and the 3 before it (suggestions); custom budgets as on Home |
    | Plan screens | The last month (pace, today, the income cycle), goal money, recurring entries, bill payments |
    | Insights, category insights | Every purchase and refund (the "looks recurring" card and the history baseline span all of it) + income for the period only |
    | Money leaks | The period and the one before it |
    | Reports, PDF/CSV | The period and its comparison. The balance call waits for the profile, because its instants depend on the time zone; the other reads start at once |
    | Wallets | Balances and counts from the function; no ledger rows |
    | Add | The 60-day look-back + the last expense |
    | Entry detail, edit, full form | Purchases and refunds (+ goal money on detail) |
    | Transactions | From the date filter's start when one is set; otherwise every row, because the list, its count and its totals are all of history |
    | Categories | Every row (usage counts, the Uncategorized queue) |

  - **Not screens, unchanged:** the reminder check and reward sync still read every row (streaks and achievements span all history).
- **Header bell:** `getUnreadCount` is cached and started by the layout with the profile read. Every page lost its second round.
- **Repaired:** `node_modules/pdf-lib` and `@pdf-lib/fontkit` were empty folders, which broke the typecheck and would have broken PDF export. `npm install` restored them from the lockfile (unchanged).

**Money check:** the previous commit (`a989e00`) and this code, built side by side, reading the same live data. 52 screens (including the period, filter and id variants) with 532 ₹ figures and every `data-paise` value: identical, in the same order. 5 CSVs byte for byte: the report for this month (with entries and notes), the previous month, all time (with entries), a custom range, and the data export. **Caveat:** the test account has little spending (2 purchases, 90 goal moves), so the money check covers less than it looks. The unit and DB equivalence tests below carry the rest.

**Timing** (production builds on this machine, alternated; server render = median of 12, full load = median of 9 hard loads, nav = 16 clicks; DB calls counted from a fetch log on the server):

| Page | Server render old → new | DB calls (rounds) | Full load old → new | Sidebar nav p25 old → new |
| --- | --- | --- | --- | --- |
| Home | 441 → 298 ms | 10 (2) → 14 (1) | 553 → 396 ms | 513 → 529 ms |
| Transactions | 430 → 289 ms | 7 (2) → 7 (1) | 592 → 383 ms | 543 → 545 ms |
| Insights | 420 → 252 ms | 4 (2) → 5 (1) | 536 → 388 ms | 564 → 567 ms |

- Most of the gain is the header's round. On this account the ledger is small (92 active rows), so reading fewer rows saves little per query yet; the gain grows with the ledger.
- **Sidebar navigation is bimodal on both builds** (about 520 ms or about 1,000 ms per click), so its median depends on how the clicks fall. The fast mode is the same on both, and I found no regression. The cause of the slow mode isn't known.
- **A first version made Home slower:** 16 calls in 2 rounds, 542 ms. With no budgets, `withBudgetPeriods` read "no periods" as "everything" and re-read the whole ledger. The figures were still right, but the read was wasted. That's fixed, and the newest-five read became conditional.

**Checks:** lint ✅, typecheck ✅, format ✅, `npm test` ✅ 29 files / 817 tests (11 new: `tests/unit/ledger-slices.test.ts`), `npm run test:db` ✅ 123 + 11 placeholders (6 new in `tests/db/wallet-balances.test.ts`), new read-only live test `tests/live/wallet-balances.test.ts` ✅ and `ledger-paging` ✅, `npm run build` ✅.
- **What the DB test proves:**
  - The function equals `ledgerBalances` at 14 instants. Those include IST midnight and 1 ms either side, an instant exactly on an entry, and every opening/closing pair.
  - Its data has transfers (including into a wallet before it starts), allocation and release, a refund, a deleted and a voided row, entries before the opening date, and a wallet that starts later. It runs in IST and again with the profile in New York, and some figures are checked by hand.
  - `summarizePeriod` from window rows + the function's balances equals it from every row, for 6 periods.
  - Cross-user: B sees only B's wallet and total, after A's entry is committed. No user parameter, `SECURITY INVOKER`. Anonymous calls are refused (`42501`).
  - Mutation check: tracking start made exclusive, voided rows counted, the profile's zone ignored. Each break failed 2–3 tests.
- **The unit tests prove:** the window start is never after the real period start, across 8 zones, 3 week starts and 8 boundary instants. Home spending and budgets, Insights and the safe-to-spend plan give the same result from the partial reads as from every row. A plan without the balance would be wrong, and a balance from another instant is refused.
- **Live:** the function equals the domain on both test accounts' real rows, and the accounts share no wallet.
- **E2E** (desktop: `shell`, plus `transactions` (Journey A), `insights`, `offline` and `report` on ledger-desktop): **48 passed, 1 failed, 5 did not run.** The failure is `insights.spec.ts` "with no spending, both screens say so honestly". It expects an account with no purchases, but the account has two active quick-add Tea entries: ₹52.35 on 1 Nov and ₹10.00 on 5 Nov, both saved before this session. The old build shows the same Insights page (money check), so this isn't a code change. The 5 that didn't run are the rest of that serial spec. You then deleted the two entries, and `insights.spec.ts` on ledger-desktop passed in full: **7 passed** (setup + 6), 2026-11-06.

**Next speed steps (not done):** the full re-render on every save; Transactions' default view and Categories still read every row (they'd need SQL aggregates for all-time counts and totals); Reports could save its second round if the function took the period's local dates instead of instants.

## Code tidy (2026-11-06)

No behaviour change: no money logic, migration or UI changes. Baseline: `npm test` 29 files / 817 tests, `npm run test:db` 123.

**Plan**

- **Fix #13:** one `moneyFormatter(currency)` in `@/domain/money` replaces the 20 local `money` lambdas; one `requestToday(timeZone)` in `src/lib/data/session.ts` replaces the 5 `toLocalDate(requestNow(), …)` copies.
- **Fix #14 / split files over ~300 lines** (domain stays the only home of money rules; `@/domain` keeps exporting the same names):
  - `domain/parse-entries.ts` → `parse-dates.ts`, `parse-tokens.ts`, `parse-entries.ts`
  - `domain/insights.ts` → `insight-cards.ts`, `insight-trends.ts`, `insights.ts`
  - `domain/categorize.ts` → `category-tree.ts`, `categorize.ts`
  - `domain/report.ts` → `report.ts`, `report-export.ts`
  - `domain/purchases.ts` → `purchases.ts`, `leaks.ts`, `recurring-signals.ts`
  - `domain/aggregation.ts` → `aggregation.ts`, `period-comparison.ts`
  - `domain/time.ts` → `time.ts`, `periods.ts`
  - `domain/schemas.ts` → `schemas.ts`, `plan-schemas.ts`
  - `lib/data/queries.ts` → folder `lib/data/queries/` (`profile`, `accounts`, `ledger`, `plan`, `records`, `index`)
  - `lib/ledger/commands.ts` → `commands.ts`, `rpc-call.ts`
  - `lib/reports/pdf.ts` → `pdf.ts`, `pdf-layout.ts`
  - `transaction-form.tsx` → `+ entry-fields.tsx`; `goal-actions.tsx` → `+ goal-move-dialog.tsx`, `goal-purchase-dialog.tsx`; `sync-center.tsx` → `+ sync-status.tsx`, `queued-entry-actions.tsx`; `quick-add.tsx` → `+ quick-add-form.tsx`; `draft-review.tsx` → `+ draft-card.tsx`; `settings-forms.tsx` → `+ preference-forms.tsx`; `due-forms.tsx` → `+ recurring-form.tsx`, `wallet-field.tsx`; `step-forms.tsx` → `+ balances-step-form.tsx`
  - Pages `insights`, `home`, `reports`, `recurring`: move sections into components under `src/components/<feature>/`
- **Remove (proved with knip 5 + grep) — done as planned:** `getLedgerBefore`, `timeZoneSchema`, `CardContent`, `SheetClose` (no user at all); drop `export` from the 34 values and 80 types only used in their own file; move test-only `applyMutations`, `TransactionInput`, `LedgerCommandInput` and `AUX_ROUTES` into the tests. Kept on purpose: `newlyReachedThresholds`, `isScheduledOn`, `formatINRCompact` (domain rules pinned by tests; removing them would delete tests), `scripts/make-icons.mjs` (manual icon script), `public/sw.js` and `e2e/auth.setup.ts` (knip false positives). knip found no unused dependencies.
- **Rename:** `lib/actions/account.ts` → `account-deletion.ts` (it sits next to `accounts.ts`, which is wallets). Tests: unit `phase4-validation` → `onboarding-validation`, `phase5` → `transactions`, `phase6` → `draft-review`; DB `phase4` → `onboarding-categories`, `phase5` → `ledger-commands`, `phase6` → `batch-entries`, `phase6a` → `batch-undo`, `phase8` → `plan`, `phase9` → `rewards-reminders`, `phase10` → `offline-sync`; e2e `phase4.spec` → `onboarding-categories.spec`. Not renamed: `accounts`/`presets`/`allocation` in code, because they mirror the database tables and RPCs (a rename would need a migration).

**What was done** (where it differs from the plan, the plan is out of date and this is right)

- **#13:** `moneyFormatter(currency)` (`src/domain/money.ts`, with a new test against `formatMoney`) replaced 20 lambdas in 18 files; `requestToday(timeZone)` (`src/lib/data/session.ts`) replaced the 5 copies.
- **Splits (#14).** No `src` file is over 310 lines now except `globals.css` (312) and `domain/report.ts` (319); `rewards`, `balances` and `money` are 303–310 and were left whole. Everything outside the domain still imports `@/domain`, which re-exports the new modules; helper modules (`parse-*`, `category-keywords`, `insight-*`) stay internal.
  - Domain: `parse-entries` → `parse-dates`, `parse-numbers`, `parse-tokens`, `parse-entries`; `insights` → `insight-scope`, `insight-cards`, `insight-trends`, `insights`; `categorize` → `category-tree`, `category-keywords`, `categorize`; `report` → `report`, `report-export`; `purchases` → `purchases`, `leaks`, `recurring-signals`; `aggregation` → `aggregation`, `period-comparison`, `spending-trend`; `time` → `time`, `periods`; `schemas` → `schemas`, `plan-schemas`.
  - Lib: `data/queries.ts` → `data/queries/{index,profile,accounts,categories,ledger,plan,presets,shared}.ts` (`@/lib/data/queries` still works); `ledger/commands.ts` → `+ rpc-call.ts`; `reports/pdf.ts` → `+ pdf-layout.ts`.
  - Components: as planned, plus `transactions/note-tags-fields.tsx`. Two import cycles the split made were removed: the entry form's types now live in `entry-fields.tsx`, and `OtherEntryRoutes` and `money` in `quick-add-form.tsx`.
  - Pages: `home` → `components/home/plan-snapshots.tsx` (387 → 287); `insights` → `components/insights/insight-panels.tsx` (404 → 268); `reports` → `components/reports/report-options.tsx`, `report-summary.tsx` (380 → 249); `recurring` → `components/plan/recurring-cards.tsx` (333 → 207). Markup moved unchanged.
- **Removed:** as planned. Also deleted, as unused once un-exported: the types `IncomeTransaction`, `TransferTransaction`, `BudgetInput`, `EntryDraftInput`, `AccountForm`, `BalancesStep`, `PresetForm`; `EDITABLE_FIELDS` became the plain union type it was only used as. Re-exported because a new file or a test now needs them: `LedgerMutation`, `MutationOutcome`, `GoalProgress`, `InsightsModel`. A final knip run lists only its 3 false-positive files and the `postcss` peer of Tailwind.
- **Renamed:** as planned. `playwright.config.ts`'s ledger-spec pattern doesn't match the new e2e name, so it still runs in the parallel `desktop`/`mobile` projects.
- **Tests:** no test was deleted or changed in what it checks. Edits were imports only (the moved helpers and types, `toRpcCall` from `rpc-call`, `RecurringFormDialog` from `recurring-form`), plus 6 new `moneyFormatter` cases.

**Checks (2026-11-06):** lint ✅, typecheck ✅, format ✅, `npm test` ✅ 29 files / **823** tests (was 817), `npm run test:db` ✅ **123** + 11 placeholders (was 123; throwaway PostgreSQL 18 cluster on port 54329 per the README, stopped after), `npm run build` ✅, knip ✅. E2E at desktop width (`setup`, `desktop`, `ledger-desktop` on the hosted project, fresh build): ✅ **190 passed**, 0 failed, 0 skipped, in 6.0 min. The mobile projects weren't run this session.

## Design 1 (2026-11-06)

Redesign phase 1 of 4, from `doc/REDESIGN_BRIEF.md` with your overrides (no speed work, no layout sign-off per screen, keep "Safe to Spend" and every route, inspiration only with no Solo Leveling names or symbols, free fonts and libraries, Geist stays). **`doc/DESIGN_PLAN.md` is now the design source of truth** for Design 2–4: audit, strategy, tokens, component specs, a desktop + mobile + empty-state plan for all 20 screens, navigation, and the rules every later phase follows.

- **Audit:** 18 signed-in screens screenshotted in dark at 375 and 1440 px, plus a script that read computed styles. Worst findings: no tappable control reached 44 px on phones; Quick add sat below the fold on a phone Home; three empty-state styles (Budgets' had no action inside); two glowing primary buttons on desktop; four card radii; green meant both money and XP. Ranked tables are in the plan, §0.
- **Strategy:** the job is "log small spends fast, know where money goes". North Star: logged days per week (same rule as the `logged_day` reward). Each game element is mapped to the job; ethics rules (no guilt, no pressure to spend or over-save, no dark patterns, an off switch for progress features in Design 3).
- **Tokens (`src/app/globals.css`):** three layers. Base palette `--pp-*` → meaning (`--surface-*`, `--text-*`, `--money-{positive,neutral,negative,estimate,earmark}`, `--progress-*`, `--feedback-*`, three allowed gradients) → component (`--button-*`, `--surface-card-*`, `--toast-*`). Dark and light. The shadcn names stay as layer-2 aliases, so every screen still works until its phase.
  - **Visible changes on existing screens, on purpose:** positive green moved from lime (hue 128) to a restrained green (hue 150); one radius scale (6/10/14/18/24 px), so cards went 24 → 18 px and controls 14 → 10 px; the primary button lost its glow; on touch screens every button is at least 44 px (`pointer-coarse:`); cards pad 16 px on phones (was 20). Layouts are unchanged.
  - **Type roles:** `type-caption` 12, `type-body` 14, `type-heading` 16, `type-title` 22/24, `type-display` 32/36, and `money` (tabular, slashed zero). Spacing: `p-gutter`, `p-surface`, `gap-stack`, `gap-section`. Motion durations 100–280 ms.
  - `cn` now knows these tokens (`extendTailwindMerge`), so `text-caption` isn't mistaken for a colour.
- **Components:** `ui/surface.tsx` (new; `Card` is its default variant: card, hero, inset, interactive, status; loading keeps the box), `ui/button.tsx` (5 variants; unused `secondary`/`link` removed; `loading` prop; 44 px on touch), `ui/progress.tsx` (new; basis points or steps; money/xp/warning/over/neutral; empty, complete, over, loading, disabled; `role=progressbar` with value text), `states/state-panel.tsx` (the empty state; `size="page" | "section"`, actions inside, no dashed border), `feedback/notice.tsx` (new; info/success/warning/error/offline), `feedback/toast.tsx` (tones success/error/info/progress/milestone; `routine` toasts go compact from the third within two minutes; Undo is kept).
- **Not done here, by plan:** no screen was restyled. `Meter` and `ProgressRing` in `components/plan/parts.tsx` still exist; screens move to `Progress` in their phase. Navigation changes are Design 2.
- **Rendered check:** every component state on a temporary preview page (deleted before the commit), dark, 375 and 1440 px, plus a milestone toast. On an emulated Pixel 7 every button measured ≥ 44 px. Home and Rewards re-checked after the token change: no breakage.

**Checks:** lint ✅, typecheck ✅, format ✅, `npm test` ✅ 30 files / **838** tests (15 new in `tests/unit/design-foundation.test.tsx`), `npm run build` ✅. DB, live and e2e suites weren't run (no data, SQL or route changes).

**Found, not fixed (not design):** `next dev` reports a hydration error on some signed-in screens ("3 issues" on `/rewards`). The dev log names the cause: `<p> cannot contain a nested <form>`. Find the `<p>` wrapping a form (likely a server-action button inside a paragraph) and fix it in a separate change.

**Next (Design 2, only when you send its prompt):** navigation (sidebar groups with the 2 × 2 Record grid and the PlayerChip; mobile bar Home · Activity · Add · Insights · Plan · You), Home and Quick Add per `doc/DESIGN_PLAN.md` §4–5.

## Design 2 (2026-11-06)

Home and Quick Add on the Design 1 components, the mobile bottom bar, rewards that follow Undo, and the dev hydration error. Plan: `doc/DESIGN_PLAN.md` §4–6 (updated where this phase changed it).

- **Rewards now follow the entries (changes a Phase 9 decision, by your instruction).** Phase 9 kept every award forever ("deleting an entry takes nothing away"). Now Undo must remove what an entry earned, so `planRewardSync` (`src/lib/rewards/engine.ts`) reconciles:
  - Awards worked out from entries (`logged_day`, `clean_week`, `saved_week`, `budget_month`, achievements, and the **current** period's missions) are **revoked** (`xp_events.revoked_at`, the column already existed) when the entries behind them are gone, and the **same row is restored** when they're earned again. Keys stay unique, so XP can never be earned twice. Achievements no longer earned are removed; a mission whose completion is undone goes back to open.
  - Not touched: weekly reviews, explored insights, skipped missions (they aren't entries), and missions of earlier periods (only the current period is worked out again).
  - It applies to any delete, not only Undo: the server can't tell them apart, and one rule is simpler and closes the "add, delete, add" loop. Editing an amount or date still changes nothing.
  - The sync still runs after each write (`after()`), so it never slows a save. **Known gap:** if Undo lands before the save's own sync has finished, that sync can award the day after Undo's sync revoked nothing; the next sync (any save, or opening Rewards) corrects it. `/rewards` now saves whenever the plan `changed`, not only when something was earned.
  - **Effect on the shared test account:** the first sync revoked 10 XP for 5 Nov, because the two Tea entries behind it were deleted earlier. Its 5 XP mission award for that day stays (past period). No migration.
- **Quick Add:**
  - A tile with a usual amount and a category saves in **one tap** (`QuickTile` in `src/components/transactions/quick-add.tsx`), with a routine toast and **Undo for 5 s**. The tile shows saving, then a check for 0.9 s.
  - **Double taps:** taps on one tile within 1 s reuse the same ids (`idsForTap`, `src/lib/quick-entries.ts`), so the second is ignored while the first is in flight, or answered `duplicate` by the server after. Same idempotency key as any retry.
  - A small pencil in the tile's corner (44 px tap area) opens the amount sheet. A tile without an amount opens the sheet, which offers "Save ₹X as the usual amount" (checked by default then). One command builder, `quickEntryCommand`, for tiles, shortcuts and the sheet.
  - **Edit tiles** is its own view, `/add?tab=edit`: edit, hide/show, and reorder by **dragging the grip** (pointer events, so mouse and touch) **or Move up / Move down** buttons, announced to screen readers. Order saves in the background (`reorderPresets`, serialised, reverts with a toast on failure).
  - Record tabs (and every `SectionTabs`, so Insights and Plan too) fit a 375 px screen: equal columns, icon over label, no clipping.
- **Home:** balance hero (display figure, scope label, "not a bank balance"), then Spent today / Spent in <month>; Quick Add tiles in a grid (no sideways scroll); compact **player status** (rank word, level, XP bar, streak, total XP) linking to `/rewards` (Player status gets its own page in Design 3); budget and goals with `Progress`; a **Safe to Spend link labelled as an estimate** (no figure: computing it would add Home reads); Recent.
  - Phones: the two columns dissolve into one ordered list (balance → tiles → status → plans → Safe to Spend → recent); the first two tile rows are in the first screen.
  - States: new user (one "Plan when you're ready" card with both actions, "Set amount" tiles, "Log your first expense to start earning XP", Recent empty state), `home/loading.tsx` shaped like Home, `home/error.tsx` (error and offline forms, both offering Quick add), an offline note that the figures are from the last connection, and the existing "On this device" list. The player status streams in a `Suspense` after the money, with a skeleton; if its read fails it shows a quiet link instead of breaking Home.
  - Rank words: Starter (1–2), Tracker (3–4), Planner (5–7), Strategist (8–11), Steward (12+), `rankFor` in `src/domain/rewards.ts`.
  - The balance count-up is 280 ms (was 600) to meet the under-300 ms rule.
- **Mobile bar:** Home · Activity · **Add** (docked, centre) · Insights · Plan · **You**. You opens a sheet: Player status, Parent report, Reminders, Settings, then every section (it replaces the header's "All sections" menu, which is removed). Reports is two taps away. Add stays visible on add screens, marked current. The desktop sidebar is unchanged (Design 4).
- **Hydration error fixed:** the quest footer on `/rewards` was a `<p>` holding the Skip form. It's a `<div>` now. A scan of every `.tsx` found no other `<p>` holding a form, and a browser pass over all 18 signed-in screens logged no console errors. As a control, putting the `<p>` back made the same pass log 2 errors.

**Checks:** lint ✅, typecheck ✅, format ✅, `npm test` ✅ 31 files / 854 tests (new: `tests/unit/quick-add.test.tsx`; reward tests rewritten for the new rule, plus rank words), `npm run test:db` ✅ 13 files / 124 + 12 placeholders (new: `tests/db/undo-rewards.test.ts`; the reward store moved to `tests/db/reward-store.ts`), production build ✅ (through Playwright's web server).
- **What the Undo DB test proves** (real executor, real schema): a one-tap save moves balance, today's spending, a budget and the category total by its amount and earns the day and today's mission; a double tap is `duplicate` with no extra XP; Undo puts all four figures back and revokes the XP, and the mission is open again; a late replay of the undone save adds nothing; three save/Undo cycles end with exactly one row per award key and the same XP as the first save.
- **Mutation checks:** turning revocation off fails 1 DB and 5 unit tests; giving every tap fresh ids fails 2 unit tests.
- **E2E (hosted project):** ledger-desktop `offline`, `rewards`, `transactions` ✅ 21 passed, including Journey A, the new one-tap test (set Tea's usual amount → double tap → one entry → Undo → figures back → tile restored) and the rewritten rewards test. The first run had 2 failures: `offline` "the answer gets lost…" hit `ECONNRESET` in the test's own pass-through request and left a Tea ₹10.99 entry behind, which made `rewards` see +20 XP (deleting its unassigned entry completed "clear the queue"). I soft-deleted the leftover through `set_transaction_deleted`; both passed on the rerun. ledger-mobile (Pixel 7) `transactions` ✅ 4 passed, 1 skipped (the long form journey runs on desktop only, by design), including Journey A and the one-tap test. `shell` navigation on mobile ✅ (You sheet → Money leaks, docked Add). Not run this phase: the rest of the desktop/mobile suites.

**Next (Design 3):** done; see "Design 3".

## Design 3 (2026-11-07)

Player status, Missions, Achievements, the Rewards hub, and the feedback chain after a save. Plan: `doc/DESIGN_PLAN.md` §3–5 (updated where this phase changed it). Skills applied: interaction-design (trigger, rules, feedback, loops; feedback that diminishes with repetition; one peak moment; Undo over confirmation) and ux-strategy (every mission maps to the job; the ethics check is unchanged).

- **Migration `20261106000200_missions` (applied by your `db push`, 2026-11-07; live read as the test account shows all 8 missions and `show_progress = true`):**
  - 4 missions added to the read-only catalog: `review_today` (daily, "Look at today", 5 XP), `set_aside_week` (weekly, "Move money to a goal", any amount, 10 XP), `steady_logging` (long-term, log on 20 different days, 40 XP), `saving_habit` (long-term, set money aside in 4 different weeks, 30 XP). `on conflict do nothing`. The 4 old missions and all 7 achievement codes and rules are untouched.
  - `profiles.show_progress boolean not null default true`, for the "Show progress features" switch.
  - "Looked at today" needs **no** table: it's a zero-XP `daily_review:<date>` row in `xp_events`, written only by the server, like explored insights.
  - **Until it's pushed** the app still works: the new missions don't show, `show_progress` reads as on, and only saving the Settings switch fails (with its error message).
- **Reward rule change (your instruction): achievements stay unlocked once earned, with their XP.** `planRewardSync` no longer revokes `achievement` events or deletes `user_achievements`; `removeAchievements` is gone from the store. Daily XP (`logged_day`, `saved_week`, …) and the current period's mission progress still follow the entries: revoked on delete or Undo, restored on the same row when earned again.
- **Undo syncs after its delete, before it answers.** In `run` (`src/lib/actions/transactions.ts`), for `delete` and `undo_batch`, `syncRewards()` is awaited after the delete and before `revalidatePath`, and the answer carries the new `PlayerStatus`. The re-rendered page never shows revoked XP. A failed sync still reports the delete as done.
- **Saves never wait for rewards.** The `after()` sync on saves is gone. The browser calls `syncRewardFeedback()` right after the save is answered; that call *is* the sync, and it returns what changed (`rewardFeedback` in `src/lib/rewards/feedback.ts`: a diff of the stored state before and after, worked out on the server). Feedback calls run one after another per tab, so two quick saves can't both report one award. If the call never happens (tab closed, offline), the next sync catches up, silently. Offline replay (`/api/sync`) keeps its `after()` sync. The Uncategorized queue (`assignCategory`) now syncs too; it never did, so "Clear the uncategorised queue" couldn't complete from there.
- **A sync can't leave a stale award** (closes Design 2's known gap). `settleRewardSync` reads the rows written since it started (`getLedgerStampsSince`, on the existing `transactions_owner_updated` index). If the ledger moved, it runs again from an uncached read, at most 3 passes. Proven with an Undo landing mid-sync, in memory and on PostgreSQL.
- **The feedback ladder** (`src/lib/feedback-queue.ts`, `components/feedback/{toast,reward-feedback,level-up}.tsx`):
  - One pop-up at a time, always. Rewards queue in ladder order (progress, mission, achievement, level). A new confirmation takes the screen and puts a reward that was showing back in line, in its place.
  - A routine save shows its confirmation with a quiet XP line inside it ("+10 XP · Logged today"; a long mission's step is added: "Steady habit 7 of 20"). From the third XP line within 30 minutes it drops to "+10 XP". A second entry the same day earns nothing, so it shows nothing extra.
  - Mission complete and achievement get milestone toasts (silver ring, one 280 ms pass). Several at once are merged into one toast per tier.
  - Level-up is the only peak: the page dims, the status panel rises (280 ms), with the new level, rank and XP bar. It's a real dialog: focus moves in, and Continue, Escape or a tap outside closes it. It never shows alongside anything else.
  - Undo cancels whatever its save earned that hasn't shown yet, and ignores a late answer for it.
  - Reduced motion: every animation is CSS that the existing rules collapse.
  - The old confetti `AchievementCelebration` is removed (hard-coded colours, its own rules). The rewards pages greet, through the same queue, an achievement this device hasn't seen, if it was unlocked in the last 7 days.
- **Screens.** `/rewards/status`, `/rewards/missions` and `/rewards/achievements` are new; `/rewards` is redesigned. All four use one loader (`src/lib/rewards/view.ts`): a preview of the sync that writes nothing while loading, with `SaveEarnedRewards` saving afterwards.
  - **Player status:** level, rank and XP to the next level; current and longest streak; lifetime XP; milestones (levels reached, dated by the award that crossed them, and achievements). Empty: Level 1, "Your first logged day earns 10 XP", Quick add.
  - **Missions:** Daily, Weekly and Long-term, three columns on desktop, a segmented control on phones. Each row has a status mark, title, rule, XP, reset period, progress for multi-step missions, where to do it, and Skip / Bring back. Empty: "All skipped. That's fine." per group, or a page empty state if no missions exist.
  - **Achievements:** unlocked, then in progress, then locked, with filter links (`?show=`). Progress comes from each achievement's own rule (`achievementProgress` in the domain). Header: "0 of 7. Each one shows how to earn it." Empty state if none exist. One column on phones: two were too narrow at 375 px.
  - **Rewards hub:** status panel with "See status"; the 7-day logged strip (the North Star, neutral colours, no red); up to 4 of today's and this week's missions; the 3 newest achievements (or "None yet" with the closest one's rule); XP history, collapsed behind "Show history" on phones.
  - "Look at today" is recorded when `/insights?period=today` opens (once a day per device).
  - **Navigation:** a Progress group (Player status · Missions · Achievements · Rewards) in the sidebar and the You sheet, plus section tabs on the four screens.
- **Home:** the player chip opens `/rewards/status` and follows the status a save brings back, with no reload. **Safe to Spend** shows the figure ("About ₹X a day until {date}", estimate colour, "Safe to Spend · estimate", "Not a limit to use up"), or asks for the income date. It streams in its own `Suspense` after the money, like the chip, and falls back to the old link if its reads fail.
- **Settings → Progress → "Show progress features":** off hides the chip, the Progress navigation and every reward pop-up. Rewards still sync, and nothing is lost.
- Segmented-control options are now 44 px on touch.

**Home timing.** Production builds side by side on this machine: the previous commit `2f1ba11` on :3201 and this code on :3202. Alternating signed-in loads of `/home`; medians, in ms from request start.

| Loads | Build | First byte | Balance in stream | Safe to Spend in stream | Stream end |
| --- | --- | --- | --- | --- | --- |
| 12 each | before | 211 | 265 | 269 (link only) | 464 |
| 12 each | after | 195 | 260 | 377 (figure) | 499 |
| 20 each | before | 176 | 245 | 248 (link only) | 462 |
| 20 each | after | 169 | 217 | 333 (figure) | 443 |

The money arrives no later. The figure arrives after it, and before the player chip. Stream end is within noise (+35 ms, then −19 ms).

**Checks (Design 3)**

| Check | Result |
| --- | --- |
| lint / typecheck / format | ✅ |
| `npm test` | ✅ 34 files / **899** tests (was 854). One earlier run crashed before any test ran (34 files, "no tests") while a worktree was being removed and a second run was starting; the clean rerun is the result |
| `npm run test:db` (local PostgreSQL 18, all migrations including 20261106000200) | ✅ 14 files, 129 passed + 13 placeholders. New: `tests/db/progression.test.ts` (catalog, `show_progress` RLS, client can't write `daily_review`, Undo mid-sync settles, achievement stays) |
| New unit tests | `progression.test.ts` (missions, achievement progress, feedback diff, no duplicate XP on retry/edit/delete/undo, settle), `feedback-queue.test.tsx` (never two pop-ups, ladder order, quieter XP, Undo cancels, off switch), `undo-sync-order.test.ts` (delete → sync → answer). `rewards.test.ts` rewritten for permanent achievements |
| Mutation check | 8 deliberate breaks, all caught: achievements revocable again, settle never reruns, Undo not waiting for its sync, a pushed-back reward lost, rewards shown over each other, XP line never quietening, late feedback shown after Undo, feedback repeating old XP |
| Screenshots (dark, 375 and 1440 px, Playwright, hosted data) | Home, Rewards, Player status, Missions, Achievements, Settings: no horizontal overflow, no console errors. The ladder (XP line, mission toast, level-up) on a temporary preview page in dev, deleted afterwards: 1 pop-up visible at every step. Fixed after looking: the week strip labelled yesterday "Ye" |
| `npm run build` | ✅ |
| After your push | `e2e/rewards.spec.ts` on ledger-desktop, live with the 8 missions: **6 passed** |
| E2E (hosted project, fresh build; migration NOT pushed, so the hosted catalog has the 4 old missions) | Run 1, `rewards` + `shell` on desktop, mobile, ledger-desktop, ledger-mobile (the ledger projects ran all their specs): **117 passed, 1 failed**. The failure was `motion.spec.ts` "an achievement bursts", which tested the removed confetti. It now checks that the milestone ring, the level-up rise and the dim animate (≤ 280 ms) with motion allowed and don't move under OS or in-app reduced motion. Run 2, ledger-desktop + ledger-mobile (rewards, motion, Journey A–G specs): **76 passed, 0 failed**. The spec's new tests: XP daily follows entries while achievements stay, at most 1 pop-up sampled 15 times after a save, the mission skip/bring back, Home chip → `/rewards/status`, Safe to Spend labelled an estimate |

## Design 4 final check (2026-11-10)

A short final check that grew: each full e2e run surfaced a different real bug. All of them below are fixed. **Run 7 of the complete e2e suite (all 407 tests, desktop and mobile, one run) passed: 398 passed, 9 skipped (the designed one-viewport skips), 0 failed, 0 didn't run, in 14.8 min.** The counts of every run are below. No database change. Commits: `d76865f` (partial, after run 5) and "Design 4 final check".

**What changed**

- **Desktop sidebar fits without scrolling** (`components/layout/app-sidebar.tsx`, `lib/navigation.ts`, compact player chip). Every group is a two-column grid of 32 px links (44 px on touch), Home leads without a label, Record keeps bordered entry buttons, a long label ("Income & recurring") wraps instead of clipping, sidebar 272 px. Measured on the production build in dark and light: with progress features on, the last link ends at 733 px, so it fits 1366 × 768 and 1440 × 900 with no scroll and nothing clipped; with them off it ends at 571 px. `doc/DESIGN_PLAN.md` §5 updated.
- **Sidebar prefetching (found by run 4).** With every link on screen, Next prefetched all 21 routes on every page load (the old scrolling sidebar only prefetched the ~10 in view), each a server render with session and profile reads. Pages took 3–4.5 s and run 4 took 39 min. Sidebar links now prefetch on hover or focus (Next's documented `prefetch={wanted ? null : false}` pattern): 21 → 7 prefetches per load (the 7 are in-page links), `/home` 0.9–1.1 s (was 1.7–4.0 s), `/budgets` 1.5 s (was 4.6 s); hovering "Money leaks" prefetches it and the click lands in 378 ms.
- **Journey E cleanup.** The test clicked "Cancel bill" and polled 10 s for the row, a window that also had to cover the server round trip under load, and a refused action was invisible. `confirmInDialog` in `e2e/plan.spec.ts` now waits for the action's own response (matched by path and `Next-Action` header) and for the dialog to close, so a refusal fails with its message. Traces showed the row goes as soon as the answer arrives (0.2–0.8 s). Two dead ends on the way, both fixed: matching on the multipart body (Chromium doesn't always expose it) and `response.finished()` (not always reported for the streamed action response).
- **Writes after a dropped connection (found by run 1).** Reopening a goal answered "Something went wrong saving that" in 73 ms: the single `UPDATE` failed in transit (the request was valid; nothing in the schema can refuse it). With your approval, `lib/supabase/retrying-fetch.ts` now also retries `PATCH` and `DELETE` after a network-level failure: every one in the app sets an absolute state, so a repeat changes nothing. Inserts, RPCs and HTTP errors are still never repeated. Tests: updates and deletes retried, give up after three, HTTP errors returned as-is, inserts/RPCs/upserts never repeated.
- **Unexpected database errors are logged** (`lib/data/errors.ts`): the code only, or the transport message when there is no code; never row data. It fired 0 times in runs 4–5.
- **Offline edit confirmation (found by run 3).** After an offline edit the app navigates to Sync; offline that is a full page load from the service worker, which wiped the "Change saved on this device" toast (the test only passed when it caught the toast in the ~40 ms before the reload). `carryToast` in `components/feedback/toast.tsx` keeps the message in sessionStorage for the target page: shown once after a reload, cleared without a duplicate after a soft navigation, dropped after 30 s. 3 unit tests.
- **Logging an expense could cost XP (found by run 3).** An uncategorised entry "un-completed" this week's Clear Uncategorized mission and its 20 XP was revoked (seen in `xp_events`: `quest:categorise_week:2026-11-09`, revoked during the rewards test's save), against spec §236. With your decision: only a sync after a delete, an Undo or an edit (`revoke: true`) takes anything back; a new entry never does. A mission done for its day or week keeps showing **Completed**, and a week once fully sorted keeps its sorting XP (`keptKeys`) even after a later, unrelated delete; uncategorised entries logged afterwards show as a separate "N new entries to sort" link. Edits still revoke, so moving a date can't farm XP. The settle loop takes back an award when a delete or edit lands mid-sync. Existing reward tests run with `revoke: true` (the old behaviour) and assert exactly what they did; 8 new progression tests and 3 mission-card tests; a mutation (no sticky rule, always revoke) fails 4 of them. Plan §1 XP rule updated.
- **"Are you sure?" kept** for destructive actions, as you asked and PROJECT_SPEC §149 requires. Plan rule 9 said the opposite; it now says destructive actions confirm first, routine ones use Undo.

**Full e2e runs (all 407 tests, every project, one run each)**

When a ledger-desktop test fails, ledger-mobile (which depends on it) doesn't run, so "didn't run" is mostly the mobile ledger specs.

| Run | Code under test | Passed | Failed | Skipped | Didn't run | Time | Failures |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | sidebar + Journey E wait | 332 | 1 | 4 | 70 | 10.1 min | motion: "Reopen" goal, write failed in transit |
| 2 | + write retry | 335 | 1 | 4 | 67 | 14.1 min | Journey C: deleting an entry answered the generic error (an RPC, not retried by design); not seen again |
| 3 | + DB error logging | 328 | 2 | 4 | 73 | 11.2 min | offline edit toast lost on reload; rewards XP fell 330 → 310 |
| 4 | + carried toast, reward rule | 308 | 17 | 4 | 78 | 39.4 min | pages 3–7 s, timeouts and sign-in bounces across specs: the sidebar prefetching all routes |
| 5 | + intent prefetch | 277 | 8 | 4 | 118 | 13.2 min | every desktop and mobile test passed; in 8 ledger spec files the first test was sent to sign-in or couldn't load the profile |
| 6 | + test-only session diagnostics | 329 | 2 | 4 | 72 | 11.2 min | 0 session rejections logged; insights "no spending" and the Log today skip both saw 2 leftover Tea entries from offline tests that failed in runs 3 and 4 |
| 7 | + offline cleanup that survives failures, leftovers removed | **398** | **0** | 9 | **0** | 14.8 min | none |

**Run 5's session failures: not reproduced, cause not proven.** The request carried a valid, unexpired session cookie, yet the proxy's `getClaims()` treated it as signed out (307 → `/login`), and the server logged 11 "Couldn't load your profile" errors with no database code; only the first test of each ledger spec file failed. Checked: the saved token was valid for the whole run (issued 10:26, expiring 11:26 UTC), so no refresh happened and the shared-refresh-token race (several workers rotating one token) couldn't have occurred; a probe of pooled connections after 5–60 s idle showed no resets. Test-only diagnostics (`lib/diagnostics.ts`, on only when the e2e server sets `PP_E2E_DIAGNOSE=1`; status and error codes only) now log why a session check or profile read fails. Runs 6 and 7 logged **0** such events. The likeliest explanation is a transient Supabase auth or network failure during run 5; if it returns, the log will name it.

**Leftover test data (found by run 6).** The offline spec cleaned up only at the end of each test, so the tests that failed in runs 3 and 4 left two Tea entries (₹74.40, ₹52.84) on the shared account, which later made "no spending" and "log today" wrong for other specs. The spec now records every amount it uses and deletes what's left at those amounts in `afterEach`, which runs whether the test passed or failed. With your approval, the two leftovers were deleted (soft delete, the app's own delete), and Transactions and Insights were checked empty before run 7.

**Checks (2026-11-10, final code)**

| Check | Result |
| --- | --- |
| lint / typecheck / format | ✅ |
| `npm test` | ✅ 36 files / **916** tests |
| `npm run test:db` (throwaway PostgreSQL 18 on 54329, stopped after) | ✅ 14 files, **129** passed + 13 placeholders |
| `npm run build` | ✅ |
| Full e2e (run 7, all 407 tests, one run) | ✅ **398 passed, 9 skipped, 0 failed, 0 didn't run** (14.8 min). The same lint/typecheck/unit/DB/build checks were run once more after it, on the final code, with the same results |


## Design 4 (2026-11-07)

The last design phase: every remaining screen on the Design 1 components, the desktop sidebar groups, then QA of the whole app. Visual changes only: no money logic, query, action or migration changed. Skills applied: design-elevation (one accent, grey for what isn't the finding, finding-first chart titles, tabular figures), design-systems (shared parts changed once, screens consume them) and ux-research (heuristic review below). Five subagents restyled separate screen groups in parallel; only the lead edited shared components, tokens, navigation and layout, and every subagent's diff was checked against `doc/DESIGN_PLAN.md` §6 before it was accepted.

- **Navigation (`src/lib/navigation.ts`, `components/layout/*`):** sidebar groups are now Overview · Record (a 2 × 2 grid) · Activity · Insights · Plan · Progress · You (Parent report, Reminders, Settings). A compact player chip (`SidebarPlayerChip`, streamed in `Suspense`, `data-testid="sidebar-player-chip"`) sits under the logo and is not rendered at all when progress features are off. The header's duplicate desktop "Add expense" is gone; the sidebar's is the one primary. Section-tab indexes are unchanged.
- **Shared parts (lead):** `PageHeader` on `type-title`/`type-body`. `PeriodPicker` is one row on wider screens and a "Period" button that opens a sheet on phones (nothing clips). `TrendCard`, `FigureLink`, `ShareBar`, `NoteLine` on tokens and Surfaces. `EntryList`: goal moves get a silver piggy-bank mark and the earmark colour, two or more goal moves on one day fold into one "N goal moves · Still your money" row that opens, day headers stick on phones. `plan/parts`: `ProgressRing` takes `tone="earmark"`; `FigureRow`, `PlanNote`, `BudgetRemaining` on the type scale with `.money`. `Notice` and `StatePanel` pass `data-testid`; `SurfaceHeader` takes `titleId`. Switches get a 44 px hit area on touch; tabs are 44 px on touch.
- **`.money` no longer sets `white-space: nowrap`.** It's used on sentences that contain figures; the nowrap pushed Money Leaks' what-if sentence 489 px off a phone screen. A figure has no space to break at, so nothing else changed (checked on every screen).
- **Screens:** Insights (display total with comparison beside clickable category shares, trend chart titled with its finding, e.g. "Spending peaked on 3 Nov", one accent colour, peak labelled directly, findings in a 2-column grid), category drill-down, Money Leaks (one table-like Surface: group · times · average · total · what-if; empty state names the real threshold and links to Settings), Budgets (the total as a hero, category budgets in a grid, alerts as warning Notices, empty state with the action inside and "Suggest one from last month" when a suggestion exists), Goals (active goals as cards with the saved amount in the earmark colour, "set aside, still yours"; paused, complete and archived as compact rows, always visible so every goal is one tap away), goal detail (silver ring, saved figure in the earmark colour, no +/− signs on moves), Safe to Spend (estimate hero, breakdown with "Less set aside for goals" in the earmark colour, income-date form inside the empty panel), Survival, Transactions (search + filters toolbar; a "Filters" toggle with the active count on phones; 50 rows per page, was 150), entry detail (one hero amount: spending neutral, income/refunds green, goal moves earmark), Wallets, Categories, Recurring (timeline + items), Reports (options column, paper-width preview, exports above it), Reminders, Settings (section index + one Surface per section), Privacy, Sync, Data. Every route has a `loading.tsx` shaped like its screen; errors use the shared boundary.
- **Bugs fixed while checking:**
  - The goal page crashed with a server error once a goal reached its target: the restyle passed a Lucide icon from a server page to `Notice`, a client component. `Notice` has no hooks, so it's no longer marked `"use client"`.
  - Zero expenses in the report read "−₹0" (preview and PDF). Now "₹0".
  - axe `label-content-name-mismatch` on Home and Quick Add (Design 2/3 components, first caught by this phase's full a11y run): tiles' accessible names now start with their visible text, the tile's title and hint have a space between them, the "Log again" chips say their visible text first, and the player chips have no `aria-label` (their text is the name). One unit test's expected name changed with it ("Tea. Set amount").
  - Reminder title links, category tabs and switches were under 44 px on touch.
- **Heuristic review of the finished app (Nielsen's 10 + the plan's rules), by severity:**

| Severity | Finding | Status |
| --- | --- | --- |
| Critical | Goal detail crashed for a goal at its target (error recovery, visibility of status) | Fixed |
| High | Money Leaks scrolled sideways on phones with data (what-if sentence) | Fixed |
| High | Archived goals as full cards buried active ones (11 cards on the test account); collapsing paused/complete hid goals from a direct tap | Fixed: compact rows, always visible |
| High | Accessible names didn't match visible text on Home, Quick Add and every desktop page (sidebar chip) | Fixed |
| Moderate | Touch targets under 44 px: category tabs, settings switches, reminder titles | Fixed |
| Moderate | Reversible actions still ask "Are you sure?" (remove budget, delete entry, archive goal, cancel bill) against plan rule 9 | Not fixed: needs an Undo action per case, which is behaviour, not a visual change |
| Moderate | Desktop sidebar scrolls at 900 px with progress features on (the plan expected it to fit) | Not fixed; the plan now says so |
| Low | "−₹0" in the report | Fixed |
| Low | Leaks: the selected group opens inline, not in a side panel/sheet; Categories: no two-pane detail on desktop; Recurring on phones uses anchor links, not a segmented control | Not done: each needs new client state or routes |
| Low | "target, not reserved money" repeats on every budget card | Kept: e2e checks it per card |
| Low | Reports' Options panel starts open on phones | Kept: the mobile e2e uses those controls directly |

- **Responsive and themes:** every signed-in screen (27 routes incl. category tabs) screenshotted in dark and light at 375 and 1440 px on a production build, twice (before and after fixes): 108 captures each pass, with overflow, console errors, axe colour contrast and touch targets measured per capture. Final pass: no overflow, no contrast violations, no console errors. The shared test account has no expenses, so the data-filled states of Home, Insights, Leaks, Budgets, Transactions, Reports, Wallets and the Uncategorized queue were also captured on the second test account after logging 5 real entries and a ₹2,000 budget there, which were deleted again afterwards.
- **Progress off, both states checked** on the second test account: with "Show progress features" off, the sidebar, Home, Settings, Insights and the mobile You sheet have no link to `/rewards…` and no player chip (0 found); on, they're all back. The setting was left on.
- **Grep:** no TODO/FIXME, "coming soon", lorem or fake data in `src`; the only placeholders are input hints ("e.g. chai").
- **Speed:** the sidebar chip adds the two small reads Home's chip already makes (`getPlayerStatus`, cached per request), streamed after the page, only when progress features are on. Not measured separately.

**Checks (Design 4)**

| Check | Result |
| --- | --- |
| lint / typecheck / format | ✅ (0 errors, 0 warnings; Prettier clean) |
| `npm test` | ✅ 34 files / **899** tests. One run while the QA server was busy timed out 7 tests at 5 s; the same files passed alone and the final run passed whole |
| `npm run test:db` (local PostgreSQL 18) | ✅ 14 files, 129 passed + 13 placeholders |
| `npm run build` | ✅ |
| E2E full suite, run 1 (all projects: setup, desktop, mobile, ledger-desktop, ledger-mobile; Journeys A–G and every other spec; **407 tests**) | 269 passed, 56 failed, 4 skipped, 78 didn't run. 54 failures were the axe name mismatch; the motion spec hit the goal-page crash, which left ₹1 set aside and made Journey D see ₹101 |
| E2E full suite, run 2, after those fixes (**407 tests**) | **390 passed, 8 failed, 9 skipped.** All 8: the tile name mismatch on `/home` and `/add` (desktop + mobile, dark + light) |
| After the tile fix | `a11y.spec` (desktop + mobile, every route in both themes): **129 passed**. The ledger projects' specs, both viewports: 62 passed, 1 failed: Journey E's last cleanup step (cancel the test bill) didn't see the row go within 10 s; it passed in run 2 on the same code, and cancelling worked normally by hand. The bill it left was cancelled. Then `plan.spec` and the other ledger specs again, both viewports: **70 passed, 0 failed** (Journeys D and E included) |


## Checks run (Phase 10, 2026-11-01)

| Command / action | Result |
| --- | --- |
| `npm run lint` / `typecheck` / `format:check` | Pass on the final code |
| `npm test` | Pass, 26 files / 786 tests (66 new). One test failed in one earlier run and I didn't capture which; the next four runs all passed. It's unexplained, and may be the PDF tests' known timing under load |
| `npm run test:db` (local PostgreSQL 18) | Pass, 11 files / 117 tests, plus 11 "URL not set" placeholders. 11 new in `tests/db/phase10.test.ts`: the real queue against the real mutation layer |
| `npm run test:live` | Pass, 6 tests plus 1 placeholder, on the current two accounts. The 2 tests that named the deleted accounts now check that each account sees exactly its own profile, and allow the extra categories browser tests add |
| `npm run test:e2e` (hosted project, desktop + Pixel 7, fresh build) | **Last full run: 367 passed, 11 skipped, 1 failed. All ledger projects passed, so Journeys A–G passed on both viewports where they run on both.** The failure was a loose test selector (`Default` also matched "Make default"), hit because wallets from earlier failed runs were still active. After archiving them and tightening the selector, `e2e/phase4.spec.ts` passed on its own (6 passed, 4 skipped), which includes the test the failure had stopped. The full suite wasn't repeated after that, but no app code changed. Skips are one-viewport tests |
| Accessibility + overflow (`e2e/a11y.spec.ts`, axe, WCAG 2.2 AA tags) | Every screen, dark and light, at 375 and 1440 px, passes. It found and I fixed: malformed `dl` in `FigureRow`, low contrast on the dark destructive button and light green, no `h1` on the offline screen, "Make default" whose label hid its text. This covers what axe measures, not a manual keyboard or screen-reader pass; 44 px touch targets weren't measured this phase |
| Screens looked at | All of them at 375 px dark, a sample at 1440 px light. Fixed: the logo lost its badge in the app (duplicate gradient id with the hidden sidebar copy), onboarding steps wrapping, archived wallet cards spilling past the gutter |
| Mutation check | 13 breaks of the queue, conflict and voice rules: all 13 fail tests |
| Grep | No `TODO`, `FIXME`, `XXX`, `HACK`, "coming soon" or fake saves in `src`, `e2e`, `tests`, `public`, `supabase` or `scripts`, apart from two tests asserting "coming soon" is absent. Remaining `₹` figures in screens are examples, form hints and validation limits |
| `npm run build` | Pass. The secret key value is in 0 files under `.next`; `sb_secret_` is in 0 files under `.next/static` or `public`, and 0 in tracked files |
| `npm audit --omit=dev` | 0 vulnerabilities |
| Test data | Removed from the first account: 31 archived test wallets (23 + 8), 2 archived goals, 30 archived categories. Archived 5 leftover active "E2E wallet" rows first, each with no entries. Second account: nothing to remove. All entries kept: 835 and 8. Archived rows with entries linked stay, as history |

Real bugs Journey G found, which the unit and DB tests couldn't:

- After an offline edit the app went to the entry's page, which isn't saved, so the user landed on the offline screen, where nothing syncs. An offline edit now lands on Sync, and the offline screen reopens the real page.
- Chrome fires `online` with no working connection, which cancelled the tap on "Add an entry".
- An entry whose tab died mid-send was never retried, because the timer only watched `pending`.

## Checks run (Phase 9, 2026-11-01)

| Command / action | Result |
| --- | --- |
| `npx supabase@2.120.0 migration list` | 0100–1000 applied remotely (you ran `db push`; 1000 confirmed) |
| `npm run lint` / `typecheck` / `format:check` | Pass |
| `npm test` | Pass, 25 files / 720 tests (106 new) |
| `npm run test:db` (local PostgreSQL 18) | Pass, 10 files / 106 tests, plus 10 "URL not set" placeholders. 7 new in `tests/db/phase9.test.ts` |
| `npm run test:e2e` (hosted project, desktop + Pixel 7, fresh build) | **234 passed, 7 skipped, 0 failed** on the final code. The cross-user 404 test now runs. The 7 are one-viewport tests. Build id changed, and port 3100 was empty first |
| Mutation check | 18 breaks of the report, reward and reminder rules: 16 fail tests. One showed a missing test for overdue bills, now added, and it fails too. One (repeat sync) changes nothing because the database's unique key also stops it, which the DB tests prove. Spoken "call": 3 more breaks; one survived until its test was tightened |
| Cross-user | A second user's report, PDF, CSV and JSON exports hold none of the first user's data, and the first user's entry is a 404 |
| Account deletion | On a throwaway `pp-delete-…@example.test` user from the admin API. Wrong phrase and wrong password refused, then gone from auth and tables, and sign-in fails |
| PDF and screens looked at | A rendered sample report, and the new screens at 1280 px and Pixel 7, dark and light, with overflow also checked at 360 px. No overflow or console errors. Fixed in the PDF: "1 entries", and a lone "No subcategory" row |
| `npm run build` | Pass. The secret key value is in 0 files under `.next`; `sb_secret_` is in 0 files under `.next/static` |
| `npm audit --omit=dev` | 0 vulnerabilities after adding `pdf-lib`, `@pdf-lib/fontkit`. The dev-tooling `minimatch` advisory from Phase 8 is unchanged |
| Your live checks | Forgot password worked. The microphone works in Chrome and writes speech correctly. "kal" itself isn't tested yet |

Failures on the way, all fixed:

- A bug in my e2e helper: it waited for any server action, and the new reminder check on page load is one, so it could reload mid-save. It now matches the save itself.
- The appearance tests changed the shared profile while the motion spec depended on it. They moved to `e2e/appearance.spec.ts` in the serial projects.
- A race in the reminder test, between clearing rows and a check still running.
- Heavy PDF tests hit the default 5-second timeout under load.
- The PDF tests have to run in the Node environment, as the export does.

## Checks run (Phase 8, 2026-11-01)

| Command / action | Result |
| --- | --- |
| `npx supabase@2.120.0 migration list` | 0100–0900 applied remotely (you ran `db push`; 0900 confirmed) |
| `npm run lint` / `typecheck` / `format:check` | Pass |
| `npm test` | Pass, 22 files / 614 tests (71 new) |
| `npm run test:db` (local PostgreSQL 18) | Pass, 9 files / 99 tests, plus 9 "URL not set" placeholders. 26 new in `tests/db/phase8.test.ts`, through the real executor, comparing the safe-to-spend figure before and after every save and retry |
| `npm run test:e2e` (hosted project, desktop + Pixel 7, fresh build) | **206 passed, 9 skipped, 0 failed** on the final code. The 9 are the same as Phase 7: one-viewport tests, plus the cross-user 404 that needs a second account |
| Mutation check | 13 breaks of the money rules: 11 failed tests first time. One showed a weak test (the rollback test's taken id was stopped earlier by the earmark trigger; it now uses an expense's id, and the break fails). One showed a redundant line, since removed. Putting the "second add" bug back in each of the 4 forms fails exactly one test each |
| Motion check | Every case runs against a control that animates. The first recorder couldn't see animation and its control failed; heights are now sampled per bar, per frame. Under reduced motion a bar gets at most one layout pass and no in-between frames |
| Visual check (1280 px and Pixel 7, dark and light; overflow also at 360 px) | Real seeded data on 8 screens plus the purchase sheet. No overflow or console errors. Calculations re-added by hand. Fixed: "Released · Released for a purchase", "No monthly budget yet" under an alert when only a custom budget exists, a 16 px alert link, the note's wording. The remaining short tap target is an inline text link in a sentence |
| `npm run build` | Pass. The secret key value is in 0 files under `.next`; `sb_secret_` is in 0 files under `.next/static` |
| `npm audit` | Production dependencies: 0 vulnerabilities. Dev tooling: a new moderate advisory in `minimatch`, through ESLint and its plugins. No package changed this phase, and npm's only fix would install eslint 4, so it's left alone |
| Test data | The account ends with no active money entries. Left behind by design: archived test goals, cancelled bills, archived recurring items, and archived zero-balance check wallets |

Real bugs the live run found, which unit and DB tests didn't:

- A bill whose payment was deleted is unpaid again, but Cancel refused it as already paid, because the action read the old link instead of asking whether that payment is still active. Fixed, and covered by Journey E.

Runs that don't count: two full e2e runs reported failures that had nothing to do with the app. A `next start` of mine from an earlier check was still holding port 3100, so Playwright reused it, and it kept serving a build that had since been replaced. Killing its `npx` wrapper left the real server alive. Before trusting a run, confirm the port is empty and that `.next/BUILD_ID` changes. One Pixel 7 run also hit a failed lookup with no error code; it passed on the full rerun, and a `fetch failed` from a plain script around the same time suggests the connection to the hosted project, not the app.

## Checks run (Phase 7, 2026-11-01)

| Command / action | Result |
| --- | --- |
| `npm run lint` / `typecheck` / `format:check` | Pass |
| `npm test` | Pass, 19 files / 543 tests (140 new). `tests/unit/insights-reconcile.test.ts` runs 7 periods: headline, each category and subcategory, income, refunds, small purchases, every trend bar at every granularity, frequent rows, cards, unusual changes, both comparison windows, and every leak group in all 4 groupings, each compared with what history shows |
| Mutation check | 6 deliberate breaks all failed tests: week bucket not clipped, no-subcategory filter ignored, refund judged on its own amount, voided rows in spending, leak group ignoring the refund rule, running month against a whole month. Restored |
| `npm run build` | Pass (through Playwright's web server) |
| `npm run test:e2e` (hosted project, desktop + Pixel 7) | **178 passed, 9 skipped, 0 failed.** The 9 skips are the same as Phase 6a |
| Ledger projects, after adding the chart-bar test | 29 passed, 1 skipped. A bar click opens its entry, with no console errors, on both viewports. The full suite wasn't repeated for this one added test |
| Live bug found by e2e | A server component passed a function to a client component, so any page with entries crashed. Types didn't catch it. Fixed |
| Visual check (1280 px and 412 px, dark and light, seeded entries) | No sideways overflow. Fixed: the trend shared a row with the long category list and left an empty card. The test entries were deleted; the account ends with no active entries |
| `npm audit` after adding Recharts | 0 vulnerabilities |
| `npm run test:db` | Not run: no SQL or mutation code changed |

Not covered: no test asserts that chart animation stops under reduced motion, and the phone visual check used a resized desktop browser (the e2e runs use the Pixel 7 profile).

## Checks run (Phase 6a, 2026-11-01)

The final run is the first block; the second records what was checked before the migration was pushed.

| Command / action | Result |
| --- | --- |
| `npx supabase@2.120.0 migration list` | 0100–0800 applied remotely (you ran `db push`; 0800 confirmed) |
| `npm run lint` / `typecheck` / `format:check` | Pass |
| `npm test` | Pass, 17 files / 403 tests (65 new: a parser table covering multi-item, currency, dates, ambiguity and garbage; Asia/Kolkata midnight pins; `unclear_item`) |
| Parser tests under `TZ=` UTC, America/New_York, Asia/Tokyo | Pass, 92/92 each |
| `npm run test:db` (local PostgreSQL 18) | Pass, 8 files / 73 tests, plus 8 "URL not set" placeholders |
| `npm run build` | Pass (through Playwright's web server) |
| `npm run test:e2e` (hosted project, desktop + Pixel 7) | **168 passed, 9 skipped, 0 failed.** An earlier run stopped at 1 failure: the test's locator also matched the "Unassigned" option in the picker. Fixed the locator; the app was right. The account ends with no active entries |
| The 9 skips, read from that run's results | 6 on `mobile`, which write the shared profile or categories and run on desktop only (onboarding, wallet, threshold, custom category, theme sync, reduced-motion sync). 1 on `ledger-mobile`: the long form journey runs once. 2 on both ledger projects: the cross-user 404 test needs a second account |
| Date check | "kal" on the live app with the real clock (1 Nov 2026 IST): "read as yesterday, 31 Oct 2026". E2E with a faked clock on a device set to New York: 23:59:59 IST on 31 Oct and 00:00:00 IST on 1 Nov give the right aaj/kal/parso on both viewports. Reading the day in UTC instead makes the pin tests fail with wrong dates. The live app had no date bug. "3 Nov" in the last report was the unit tests' fixed date (`TODAY = 2026-11-04`) quoted as if it were an example |
| Visual check (Pixel 7) | Quick-add sheet with the new links (321 of 839 px tall, no sideways overflow), Home, draft note. `innerWidth` = device width |

Before the migration was pushed:

| Command / action | Result |
| --- | --- |
| `npm run lint` / `typecheck` / `format:check` | Pass |
| `npm test` | Pass, 17 files / 338 tests (6 new: Hindi day words and the date note; the batch undo mapping is rewritten) |
| `npm run test:db` (local PostgreSQL 18, throwaway UTF-8 cluster) | Pass, 8 files / 73 tests, plus 8 "URL not set" placeholders. 12 new in `tests/db/phase6a.test.ts`, including a failure forced mid-batch on committed data: a test trigger's notices show two rows soft-deleted before the third raised, then every row is back and no operation is recorded |
| Mutation check | Swallowing per-row errors: 3 tests fail. Ignoring the recorded op: 6 fail. Removing the row locks: 1 fails. The first concurrency test let the lock removal through because its two calls never overlapped, so it was rewritten to hold a lock until both are provably blocked. Migration restored byte for byte |
| `npx supabase@2.120.0 db push --dry-run` | Would push only `20261026000800_undo_batch.sql` |
| `npm run build` | Pass (through Playwright's web server). The real key value is in 0 of 1,398 files under `.next`, and `sb_secret_` is in 0 files under `.next/static`. The prefix does appear in server-only chunks, as help text inside the Supabase library, so the earlier "0 times in the build output" was too broad |
| Real HTTP status (production build, signed in, desktop + Pixel 7) | `/transactions/does-not-exist`, a random UUID and its `/edit` → **404** with the in-app screen |
| E2E, `kal` draft (hosted, desktop + Pixel 7) | 2 passed: date is yesterday in IST, note shown, save enabled, note clears when the date is set. Nothing saved |
| Unplanned e2e run (`ledger-desktop`, hosted) | `-g` doesn't filter dependency projects, so the whole ledger project ran. Journey A, double tap and full form passed with the stricter default-wallet checks. Journey B saved Tea ₹106 + Bus ₹102 and its Undo failed because 0800 isn't pushed, showing the new "Nothing was removed" toast. Those two entries were soft-deleted by id, and the account ends with no active entries |

## Checks run (Phase 6, 2026-11-01)

| Command / action | Result |
| --- | --- |
| `npm run lint` / `typecheck` / `format:check` | Pass |
| `npm test` | Pass, 17 files / 332 tests (21 new: parser examples, amounts, dates, doubts; drafts; batch command) |
| `npm run test:db` (local PostgreSQL 18, throwaway cluster) | Pass, 7 files / 61 tests, plus 7 "URL not set" placeholders. 5 new in `tests/db/phase6.test.ts`, from text through parser, drafts and the real executor: Journey B saves three categorised entries in one batch; replay adds nothing; undo removes all and can repeat; one bad entry rolls back everything and says "Nothing was saved"; an unknown item lands in the queue; another user's wallet is refused |
| Mutation check | Dropping the past-date handling and the "Nothing was saved" message each made DB tests fail. Restored |
| `npm run build` | Pass. The secret key and `sb_secret_` occur 0 times in the build output |
| `npm run test:e2e` (hosted project) | **156 passed, 9 skipped, 0 failed** on the final build. The earlier run on that build had 1 failure: `/welcome` logged one 404 resource error. It didn't recur in 2 auth-spec repeats, 40 page loads or the final full run, and its cause is unknown. A third repeat had 4 failures from the computer sleeping (`browserType.launch` timeout, `ERR_NETWORK_IO_SUSPENDED`). The 9 skips are the same as Phase 5 (cross-user test needs a second account; the rest are one-viewport by design) |
| Visual check (screenshots, 1280 px + Pixel 7) | Typed entry, review, voice. `innerWidth` = device width. Fixed: the sticky save bar stacked too tall on phones and each draft was a long column; amount and date now share a row |
| Test data | A failed run left one Tea ₹75.27 test entry; it was soft-deleted through the app. The account ends with no active entries |

Fixed along the way: ledger specs ran in parallel with each other because `serial` only applies inside one file, so the ledger projects now use `workers: 1`.

## Checks run (Phase 5, 2026-10-26)

| Command / action | Result |
| --- | --- |
| `npx supabase@2.120.0 migration list` (agent) | 0100–0700 applied remotely (0700 confirmed). Phase 5 adds no migration |
| `npm run lint` / `typecheck` / `format:check` | Pass |
| `npm test` | Pass, 15 files / 311 tests. 21 are new in `tests/unit/phase5.test.ts`: command validation, RPC mapping and undo; the full-form schema (IST time, no future dates); history filters, search and day grouping across IST midnight; entry signs; repeat/frequent; tiles; the opening-date wording; DST-safe local time |
| `npm run test:db` (local PostgreSQL 18, throwaway cluster) | Pass, 6 files / 56 tests, plus 6 "URL not set" placeholders that run only when no DB is configured. 7 new tests in `tests/db/phase5.test.ts` go through the real executor: income/expense direction; a double submit or retry → `duplicate`, one row; a reused id/opId with other content → `conflict`; an edit recalculates balance and category totals, a stale edit → `conflict`, undo restores and replays harmlessly; delete, restore and undo-of-create recalculate; a transfer keeps the consolidated balance; refund limits; another user can't edit, delete, restore or use foreign categories |
| Mutation check | Dropping `idempotency_key` from the create mapping, and building undo from the *new* values, each made DB tests fail. Restored |
| `npm run build` | Pass (32 routes; `/transactions/[id]` and `/edit` are dynamic) |
| HTTP status check (production build, signed in) | `/transactions/does-not-exist`, a random UUID and its `/edit` → **404** with the in-app not-found screen. `/home`, `/transactions`, `/add`, `/transactions/new` → 200 |
| `npm run test:e2e` (hosted project) | **142 passed, 9 skipped, 0 failed**, twice in a row. See below |
| Visual check (screenshots, 1440 px + Pixel 7) | Home, quick-add sheet, history (cards and table), full form, detail. See below |
| Test data | Every e2e and screenshot entry was undone or soft-deleted. The test account ends with no active entries, as it started |

New e2e coverage:

- Journey A at desktop and Pixel 7: tea tile → amount → save → toast → Home balance, today's spending and recent list update exactly → Undo restores them.
- A double tap saves once; delete asks for confirmation, and Undo restores the entry.
- Full form → suggestion → history search and filters → detail → edit → undo edit → delete → 404 while deleted → undo → cleanup.
- 404 status for unknown ids.

The 9 skips:

- 4 Phase 4 tests that write the shared profile or categories, and 2 synced-appearance tests, skip on mobile by design, so the two viewports never write the shared profile at once.
- The long full-form journey runs once, on desktop.
- The cross-user 404 test skips on both ledger projects: there's no second test account in `.env.e2e.local`.

Fixed after the visual check:

- On phones the Recent and budget cards overflowed the screen: the grid items lacked `min-w-0`. The overflow widened the layout viewport, so the old overflow check read 0. The route test now also asserts `innerWidth` equals the device width.
- "Spent today · Today" now shows the date.

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

- ✅ Migration 0700 is applied (confirmed by `migration list`); Phase 4 e2e passes live.
- ⏳ **`npm audit` reports a moderate `minimatch` advisory.** See Phase 8 checks. Re-check when `eslint` or `typescript-eslint` ship a fix. Don't run `npm audit fix --force`: it would install eslint 4.
- ✅ Voice and "never upload audio" is settled: voice stays as it is (see Phase 6a decisions).
- ⏳ **What Chrome writes for "kal", "aaj" and "parso" is still unknown.** The Phase 10 message left the three results blank. Likely spellings are handled; any other is a one-line addition to `HEARD_DAY_WORDS` plus a test.
- ⏳ **Not deployed.** Real-phone install, offline on a phone, Safari/iOS and speech on a phone are all unverified until it is.
- ✅ Cross-user 404 e2e runs and passes with your second account.
- ✅ `npm run test:live` uses the two current accounts (`E2E_EMAIL`, `E2E_USER_B_EMAIL`).
- ✅ "Confirm email" is back on, 0600 is applied, and the e2e user is on an address you control (your report; 0600 and the user's defaults verified by the agent).
- ✅ Forgot password confirmed working on the live project (your report, Phase 9).
- Supabase's built-in email service only delivers to team-member addresses and allows a few emails per hour. Configure custom SMTP (Authentication → Emails → SMTP) before real users sign up.
- The Supabase CLI's `login`, `link` and `db push` need an interactive terminal (or `SUPABASE_ACCESS_TOKEN` + `SUPABASE_DB_PASSWORD`), so they run in your terminal, not the agent's.
- Docker isn't installed, so `supabase start` isn't available. DB tests run on local PostgreSQL 18 with `tests/db/supabase-shim.sql`; hosted-project behaviour is covered by the live checks above.
- The e2e "invalid email link" test sends one bogus `verifyOtp` request to the configured project (it fails by design and creates nothing).
- npm's allow-scripts warns that `unrs-resolver`'s postinstall hasn't run; lint works without it (it ships prebuilt binaries).
- Git: `main` tracks `origin` (https://github.com/KIRITHIKJI/PocketPulse.git). Work is committed and pushed at the end of every phase; Phase 1 = `93ff182`, Phase 2 = `08288e7`.

## Next concrete tasks

**Watch:** if an e2e run sends a signed-in test to sign-in again, read the `[e2e-diagnose]` lines in the run's output (Design 4 final check).

**The redesign is done (Design 1–4).** Open design items: the Leaks side panel, Categories two-pane view and Recurring segmented control on phones.

All 10 build phases are done. What's left is yours, because it needs accounts or a phone:

1. Deploy, then set `NEXT_PUBLIC_SITE_URL` and the Supabase URL settings (README › Using it on a phone).
2. Install on your phone and try Journey G for real: airplane mode, add, reopen, reconnect.
3. Tell me what Chrome writes for "kal", "aaj" and "parso".
4. Set up custom SMTP in Supabase before anyone else signs up.

### Test fixes

- Insights e2e must not depend on existing account data.
- Find the cause of ~1,000 ms sidebar clicks.
