# PocketPulse — Progress

Durable project state. Update before a context reset or at the end of each work session.
Source of truth for requirements: `PROJECT_SPEC.md`. Working rules: `CLAUDE.md`.

_Last updated: 2026-11-01 — end of Phase 8. Migrations 0100–0900 are applied on the hosted project. Phase 9 is not started and needs its prompt._

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
| 9 | Parent report (preview, PDF, CSV, text; reconciled totals), gamification (XP, levels, streaks, quests, achievements; idempotent), reminders, data export + account deletion | ⬜ |
| 10 | PWA + IndexedDB offline queue, sync states, conflict handling; full e2e at mobile/desktop; a11y/perf pass; docs; final verification | ⬜ |

## Spec §23 acceptance checklist

Status key: ⬜ not started · 🟨 partial (detail given) · ✅ done and verified.

- 🟨 Registration, login and recovery work with real configured auth. — **Live:** registration through `/register` (2 new accounts, signed in straight to `/onboarding`), login, the signed-in redirect away from `/login`, and logout via the account menu (signed-in e2e, 129 passed). **Recovery:** the forgot/reset forms, `/auth/confirm` (PKCE `code` + `token_hash`), invalid-link handling and the no-session reset page are built and e2e-tested, but the **live reset email is not yet tested** (see blockers). Live sign-up ran with "Confirm email" temporarily off, so the confirmation-email path is built and tested locally only.
- ✅ All user data is private and protected by tested access rules. — RLS on all 20 tables, owner-only. Proven locally (`tests/db`, 34 tests on PostgreSQL 18) **and live** (`npm run test:live`, publishable key only, 6/6): user B can't read, update, re-own, delete, soft-delete, link to or reuse the ids of user A's rows, and anonymous callers get `42501` on tables and RPCs.
- ✅ Adding income and expense updates correct balance immediately. — DB tests (income/expense direction, consolidated and per wallet) and live e2e Journey A (Home balance and today's spending change by exactly the amount, and return on Undo), desktop + Pixel 7.
- ✅ Quick-add presets/custom amounts work. — 12 seeded tiles (no invented amounts); editable label, usual amount, category and icon; add/hide/restore; custom tile with a description and a suggested category; opt-in "remember as usual amount"; repeat-last and frequent shortcuts.
- 🟨 Text and voice routes create reviewable drafts and confirm before save. — Typed entry is proven end to end (`/add/text`, live e2e). Voice shares the same review and save, and its transcript, error and unsupported paths are tested with a stand-in; real speech on a real device is still to be checked.
- ✅ History, search, filters, editing, deletion and undo work. — Day-grouped history (cards on phones, table from 1024 px), search, type/category/wallet/date/amount filters in the URL, detail, edit (version-checked), delete with confirmation, Undo for create/edit/delete. Missing, malformed, deleted and other-user ids return HTTP 404. The live cross-user check needs a second account (see blockers); cross-user denial is proven in the DB tests.
- ✅ Category/subcategory totals reconcile with transactions. — Every category and subcategory figure on Insights is compared id for id with history for 7 periods (`tests/unit/insights-reconcile.test.ts`), refunds in later periods included, and live in Journey C.
- ✅ Insights point to real supporting records and handle sparse data honestly. — Every figure carries the history filters behind it; a new account, one entry, income only and refund only are tested for honest states and no NaN. Bars, cards and rows open real entries live.
- ✅ Money Leak Detector groups and totals correctly. — By description, merchant, tile and category; each group matches history entry for entry, its previous-period figure too. What-ifs use exact integers.
- ✅ Budgets/alerts recalculate on changes. — Alerts are worked out from the ledger on every read, so editing or deleting an entry takes one away. Unit tested and live e2e on both viewports. The Phase 9 notification centre will deliver them outside the app.
- ✅ Savings allocations do not count as purchases or reduce consolidated total balance. — Domain tests (invariant 4), the real mutation layer on PostgreSQL (`tests/db/phase8.test.ts`), and live Journey D on both viewports.
- ✅ Transfers between owned accounts do not inflate consolidated income/expense. — Domain invariants 2–3, plus a DB test through the app's mutation layer: a transfer (and an edit of it) moves money between wallets and leaves the consolidated balance unchanged. Transfers are entered from the full form.
- 🟨 Safe-to-spend and allowance predictions avoid double counting. — `calculatePlan` is the one calculation behind both screens. On PostgreSQL the safe-to-spend figure is compared before and after every save and every retry: paying a bill, confirming a recurring item and buying from a goal each subtract once. Live Journey E passes on both viewports.
- 🟨 Parent report balances and totals reconcile for the selected historical period. — Domain `summarizePeriod` rebuilds opening/closing from the ledger and is tested to reconcile (invariant 10); report UI/exports in Phase 9.
- ⬜ PDF/CSV exports are real and contain correct data.
- ⬜ XP, streaks, quests and achievements work consistently.
- 🟨 PWA works on supported devices; responsive app works on laptop/mobile. — Responsive shell done (sidebar ≥1024px; header + 5-tab bottom nav + "All sections" sheet + add FAB on mobile), Playwright runs at desktop and Pixel 7 sizes. No PWA manifest/service worker yet (Phase 10).
- ⬜ Offline entries persist and sync without loss or duplication. — Only an online/offline banner exists; it truthfully says changes can't be saved offline.
- 🟨 Loading, empty, error, permission-denied and offline states are handled. — Shared `StatePanel` (empty/error/offline/denied), `PageSkeleton`, route `loading.tsx`, `error.tsx`, in-shell and global `not-found.tsx`, `global-error.tsx`, offline banner. Each feature must still wire these to its real data states.
- 🟨 No required action is a placeholder or fake success. — Every Phase 1–8 action is real: saves go through RPCs or RLS-checked writes, and success shows only after the database answers. Screens for Phases 9–10 are still honest empty states.
- 🟨 Lint/typecheck/tests/production build are run and failures are addressed. — All pass for Phase 3 (see Checks).
- 🟨 Setup documentation accurately describes what needs a real Supabase project/credentials. — README › Setup was followed for the hosted project: init/login/link/db push (login/link/db push must run in an interactive terminal), URL configuration, token-hash email templates, `.env.e2e.local`. Re-check at final delivery.

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
- **"Never upload audio" vs the Web Speech API (open):** the Phase 6 prompt asks for both. PocketPulse never receives or uploads audio, but Chrome's implementation sends it to Google to recognise it. The page says so before listening starts, which meets the spec's "do not silently upload". Meeting the prompt's wording strictly would need on-device recognition only, or dropping voice in browsers that lack it. Your call; nothing is changed yet.

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
- ⏳ **Decide on voice and "never upload audio"** (see Phase 6a decisions).
- ⏳ **Try voice on a real phone and laptop.** The e2e tests use a stand-in for the browser's speech recognition, so no real microphone or speech service has been exercised. Check Chrome on Android and desktop: permission prompt, an Indian-English phrase such as "tea fifteen, bus twenty", a denied microphone, and whether `en-IN` recognition keeps "kal", "aaj" and "parso" as those words (it may write "call" or similar, which the parser won't read as a date).
- ⏳ **Cross-user 404 e2e** needs a second test account: add `E2E_USER_B_EMAIL` / `E2E_USER_B_PASSWORD` to `.env.e2e.local`. Until then that test is skipped. Cross-user denial is proven in the DB tests and by the RLS-scoped lookup.
- ✅ "Confirm email" is back on, 0600 is applied, and the e2e user is on an address you control (your report; 0600 and the user's defaults verified by the agent).
- ⏳ **Remind at the start of Phase 9: verify the live password-reset email.** Status: built and tested locally; live email test pending. Needs a test user whose address you can open and that Supabase's built-in email will deliver to (a team member's address, or custom SMTP), plus available hourly email quota.
- Supabase's built-in email service only delivers to team-member addresses and allows a few emails per hour. Configure custom SMTP (Authentication → Emails → SMTP) before real users sign up.
- The Supabase CLI's `login`, `link` and `db push` need an interactive terminal (or `SUPABASE_ACCESS_TOKEN` + `SUPABASE_DB_PASSWORD`), so they run in your terminal, not the agent's.
- Docker isn't installed, so `supabase start` isn't available. DB tests run on local PostgreSQL 18 with `tests/db/supabase-shim.sql`; hosted-project behaviour is covered by the live checks above.
- The e2e "invalid email link" test sends one bogus `verifyOtp` request to the configured project (it fails by design and creates nothing).
- npm's allow-scripts warns that `unrs-resolver`'s postinstall hasn't run; lint works without it (it ships prebuilt binaries).
- Git: `main` tracks `origin` (https://github.com/KIRITHIKJI/PocketPulse.git). Work is committed and pushed at the end of every phase; Phase 1 = `93ff182`, Phase 2 = `08288e7`.

## Next concrete tasks

Phase 9 needs its prompt. Carry over: write budget alerts to `notifications` for the notification centre; Phase 10 queues `LedgerCommand`s, including the new goal and bill commands, and replays them through `runLedgerCommandWith`.
