# PocketPulse — Codebase Report (quick version)

_Written from reading the code on 2026-11-05 (commit `12e33ff`). No build, tests or speed measurements were run for this report, so the performance notes below are reasoned from the code, not measured._

_Update 2026-11-06 (Code tidy): fixes #13, #14 and #15 are done; see §8 and PROGRESS.md › Code tidy. §1–§3 describe the code before that tidy: the long files in §2 have since been split (no `src` file is over 319 lines), and the test files are named by feature._

## 1. Folder tree with line counts

Tracked files only, excluding `package-lock.json`. Repository total: about 50,000 lines.

```
PocketPulse/
├── src/                                29,761 lines (222 files)
│   ├── app/                             6,395
│   │   ├── (app)/                       5,271  signed-in screens, layouts, export routes
│   │   ├── (public)/                      480  welcome, auth, onboarding
│   │   ├── api/sync/                       70  offline replay endpoint
│   │   └── root files                     574  layout, globals.css, manifest, errors, offline
│   ├── components/                     10,103
│   │   ├── transactions/                2,401
│   │   ├── plan/                        1,730
│   │   ├── categories/                  1,065
│   │   ├── offline/                       750
│   │   ├── insights/                      683
│   │   ├── ui/                            577
│   │   ├── layout/                        556
│   │   ├── settings/                      407
│   │   ├── forms/                         403
│   │   ├── onboarding/                    316
│   │   ├── reminders/                     214
│   │   ├── auth/                          197
│   │   ├── providers/                     169
│   │   ├── preferences/                   122
│   │   ├── feedback/                      121
│   │   ├── accounts/                      141
│   │   ├── rewards/                        88
│   │   ├── states/                         82
│   │   ├── reports/                        41
│   │   └── brand/                          40
│   ├── domain/                          6,195  pure money/time/ledger/insight logic
│   ├── lib/                             6,967
│   │   ├── actions/                     1,501  server actions
│   │   ├── data/                          868  queries, entry kit, plan loader
│   │   ├── validation/                    622
│   │   ├── ledger/                        582  mutation commands + executor
│   │   ├── offline/                       577  IndexedDB queue, transport, PWA
│   │   ├── reports/                       451  PDF + params
│   │   ├── auth/                          283
│   │   ├── rewards/                       275
│   │   ├── supabase/                      100
│   │   └── single files                 1,708  history, drafts, views, navigation, format…
│   ├── hooks/                              31
│   └── proxy.ts                            70
├── tests/
│   ├── unit/                            7,700
│   ├── db/                              3,989  local PostgreSQL suite
│   └── live/                              236  hosted-project RLS checks
├── e2e/                                 3,006  Playwright
├── supabase/migrations/                 2,180  10 migrations
├── public/sw.js                           163  hand-written service worker
└── scripts/                               164
```

## 2. The 25 longest source files

App code and migrations (tests excluded; the longest test file is `tests/db/phase8.test.ts` at 715 lines).

| # | Lines | File | What it does |
|---|---|---|---|
| 1 | 696 | `src/domain/parse-entries.ts` | Typed/voice text → entry drafts (amounts, dates, Hindi day words, misheard words) |
| 2 | 548 | `src/domain/insights.ts` | Builds every Insights figure and sentence for a period |
| 3 | 495 | `supabase/migrations/…0100_schema.sql` | All tables, constraints, indexes |
| 4 | 472 | `src/domain/categorize.ts` | Category tree helpers + deterministic category suggestions |
| 5 | 467 | `src/domain/report.ts` | Parent report model shared by preview, PDF, CSV, text |
| 6 | 465 | `src/components/transactions/transaction-form.tsx` | Full entry form (expense/income/refund/transfer) |
| 7 | 448 | `src/components/plan/goal-actions.tsx` | Set aside / release / "I bought it" / status dialogs + celebration |
| 8 | 430 | `src/domain/purchases.ts` | Repeated-purchase grouping for Money Leaks |
| 9 | 429 | `src/domain/aggregation.ts` | Net spending by category/period |
| 10 | 411 | `src/lib/ledger/commands.ts` | The single financial mutation layer (Zod commands) |
| 11 | 403 | `src/app/(app)/(main)/insights/page.tsx` | Insights screen |
| 12 | 390 | `src/app/(app)/(main)/reports/page.tsx` | Parent report screen |
| 13 | 389 | `src/lib/data/queries.ts` | All server reads (React `cache`d) |
| 14 | 388 | `src/components/offline/sync-center.tsx` | Queue list, conflict choices |
| 15 | 383 | `src/components/transactions/quick-add.tsx` | Tiles, repeat/log again, amount sheet |
| 16 | 379 | `src/components/transactions/draft-review.tsx` | Review + batch confirm for typed/voice drafts |
| 17 | 371 | `src/domain/time.ts` | Timezone-safe dates and periods |
| 18 | 359 | `supabase/migrations/…0400_rpc.sql` | Idempotent write RPCs |
| 19 | 357 | `src/app/(app)/(main)/home/page.tsx` | Home dashboard |
| 20 | 356 | `supabase/migrations/…0700_onboarding_accounts_categories.sql` | Onboarding, wallet and category RPCs (merge, reorder) |
| 21 | 352 | `src/components/settings/settings-forms.tsx` | Settings forms, shared with onboarding |
| 22 | 351 | `src/lib/reports/pdf.ts` | PDF drawing with pdf-lib + embedded Geist |
| 23 | 350 | `src/components/plan/due-forms.tsx` | Bill and recurring-item dialogs |
| 24 | 349 | `src/domain/schemas.ts` | Zod schemas for all domain records |
| 25 | 326 | `src/app/(app)/(main)/recurring/page.tsx` (tied with `…0200_integrity.sql`) | Income & recurring screen |

## 3. Messy spots

**Long components and pages**

- `transaction-form.tsx` (465), `goal-actions.tsx` (448, four dialogs plus a celebration in one file), `sync-center.tsx` (388), `quick-add.tsx` (383) and `draft-review.tsx` (379) each mix state, validation messages and layout.
- Server pages carry a lot of view logic inline: `insights/page.tsx` (403), `reports/page.tsx` (390), `home/page.tsx` (357), `recurring/page.tsx` (326). The math is in `@/domain`, but the shaping and markup aren't split out.

**Duplicated logic or the same thing done twice**

- `getReminderSettings` reads `notification_preferences` and then calls `getReminderPreferences`, which reads the same row again: 2 queries for 1 row (`src/lib/data/queries.ts`).
- `getCurrentUser()` in `src/lib/supabase/server.ts` does the same job as `optionalSession()` in `src/lib/data/session.ts`, but isn't cached. It's used only by `/reset-password`.
- `const money = (paise) => formatMoney(paise, { currency })` is redefined in 20 files. The same goes for `toLocalDate(requestNow(), profile.timeZone)` (5 places).
- `revalidatePath("/", "layout")` is repeated 14 times across 11 files.
- The full ledger is read by many separate code paths in one user action: the page render, `ReminderSync` (on every app open), and `syncRewards` (after every write, and on `/rewards`). Each one re-reads it and redoes the calculations from scratch.
- The proxy and the server client each build a Supabase client with their own cookie adapters. Next needs both, but the setup code is repeated.

**Unused or test-only code**

- Exported from `src/` but used only by tests: `newlyReachedThresholds`, `applyMutations`, `formatINRCompact`, `isScheduledOn`, `AUX_ROUTES`, and the types `TransactionInput` and `LedgerCommandInput`.
- Exported types with no other user: `timeZoneSchema`, `IncomeTransaction`, `TransferTransaction`, `BudgetInput`, `EntryDraftInput`, `AccountForm`, `BalancesStep`, `PresetForm`. They're harmless, but they could be made local.
- How this was found: an export counts as used if any other `src` file mentions its name. The `domain/index.ts` barrel re-exports everything, so a few domain functions used only through it may be hidden from this check.

**Confusing names**

- `accounts` in code means "Wallets" in the UI. `presets` means quick-add tiles. `allocation` and `allocation_release` mean "set aside" and "release". `commitments` holds both bills and skipped recurring occurrences.
- `src/lib/actions/account.ts` (account deletion) sits next to `accounts.ts` (wallets). _(Renamed `account-deletion.ts` in Code tidy.)_
- `getLedger`, `getLedgerRows`, `getLedgerRecord` and `LedgerRecord` are easy to mix up.
- Tests are named by build phase (`phase4.test.ts`, `phase8.test.ts`, `phase10.test.ts`), not by feature. _(Renamed by feature in Code tidy.)_

## 4. Likely reasons pages are slow (from the code)

1. **Every screen downloads the whole ledger.** `getLedger()` runs `select *` on every non-deleted transaction, 1,000 rows per request. The pages run one after another (`fetchAll` loop), and all figures are computed in JS on each request. It's used by Home, Add, Transactions, entry detail and edit, Wallets, Categories, Insights (3 screens), Budgets, Goals, Safe to spend, Survival, Recurring, Reports, Rewards and the reminder check. The cost grows with every entry. Past 1,000 entries, each extra 1,000 adds one more round trip in sequence.
2. **Database calls per page.** These counts come from the loaders each page calls. The proxy's `getClaims` uses ES256 keys and is verified locally unless the token needs refreshing. Layout `getProfile` and the header's unread count are added to every page.

   | Page | Supabase calls | Waves (calls one after another) |
   |---|---|---|
   | Home | ~11 (RPC, profile, wallets, categories, rules, ledger, budgets, goals, tiles, reminder prefs, unread) | 2: `ensure_default_account` RPC first, then the rest in parallel |
   | Add, Type it, Say it, Full form | 7–8 | 2 (same RPC first) |
   | Transactions | ~8 | 1 |
   | Entry detail / edit | ~8 | 1–2 |
   | Insights / Category / Leaks | 4–6 | 1 |
   | Budgets | ~7 | 1 |
   | Goals, Safe to spend, Survival | ~7 (`loadPlan`) | 1 |
   | Goal detail | ~12 (plan + entry kit + goals) | 2 |
   | Recurring | ~11 (plan + entry kit) | 2 |
   | Reports | ~6 | 1 |
   | Rewards | ~16, including writes | 5–7: 7 reads → 3 reward reads → up to 4 upserts one by one → 3 reads again |
   | Reminders | 5 (preferences read twice) | 1–2 |
   | Settings | ~4 | 1 |

3. **Extra work on every app open.** `ReminderSync` (in the app layout) calls the `syncReminders` server action on mount. It makes 7 more reads, including the full ledger. If it created a reminder, it also calls `revalidatePath("/", "layout")` and `router.refresh()`, so the screen renders twice.
4. **Every write re-renders the current screen from the root.** 14 calls in 11 write files use `revalidatePath("/", "layout")`. Narrower paths wouldn't help: Next 16.4 clears the whole client cache and re-renders the page from the root on any revalidation (see fix #3). `after()` then runs `syncRewards`, which reads the full ledger again and makes up to 6 calls one after another. This doesn't block the save, but it uses server time and database capacity.
5. **Writes during a GET.** `/rewards` writes reward rows while it renders, and every entry screen calls the `ensure_default_account` RPC before its other reads.
6. **Region.** The Supabase database is in AWS ap-south-1 (Mumbai), found from the database host's address. No Vercel region is set in the repo. Vercel's default function region is in the US (`iad1`), so without `bom1` every one of the calls above would make a round trip to India and back.
7. **Client JavaScript on every page.** There are 66 `"use client"` files. `template.tsx` wraps every page in `motion` (Framer Motion), and the layout's `OfflineProvider` imports Dexie, so both load on every screen. Recharts is already lazy-loaded (good). The PDF libraries are server-only (good).

## 5. Indexes versus real queries

- **Main ledger read** (`deleted_at is null order by occurred_at desc, id`, RLS `owner_id = (select auth.uid())`): matches the partial index `transactions_owner_time (owner_id, occurred_at desc) where deleted_at is null`. `id` isn't in the index, so ties need a sort step. Paging with `range()` (OFFSET) also gets slower as the offset grows. Suggest `(owner_id, occurred_at desc, id) where deleted_at is null`, with keyset paging.
- **Missing:** no index on `transactions (owner_id, subcategory_id)`. `merge_category` updates `where owner_id = … and subcategory_id = …` on transactions, rules, tiles and recurring templates. It runs rarely, so the impact is low.
- **Partial indexes that can't serve the actual read:** `commitments_due` (`where cancelled_at is null`), but `getCommitments` reads all rows ordered by `due_date`. `budgets_one_active_per_scope` excludes custom budgets, but `getBudgets` reads every active budget. Both tables are small per user, so the impact is low.
- **Unread count** (`read_at is null and dismissed_at is null`): `notifications_inbox` covers the owner and `dismissed_at`, and `read_at` is filtered afterwards. That's fine at 50 to a few hundred rows.
- **Probably unused** (no query in `src` or the SQL filters or sorts on them): `transactions_owner_updated (owner_id, updated_at)`, `transactions_category (owner_id, category_id, occurred_at)` (all category filtering happens in JS), and likely `transactions_account`, `transactions_from_account` and `transactions_to_account` (wallets are archived, never deleted). Confirm with `pg_stat_user_indexes` in the Supabase SQL editor before dropping anything. Each one slows every transaction insert a little.
- **Good:** RLS policies use `(select auth.uid())`, so it's evaluated once per query, not per row. Owner-scoped unique keys cover the idempotency and foreign-key lookups.
- **N+1:** no per-row query loops were found. Batch writes go through single RPCs or array upserts. The real problem is the reverse: every screen reads everything.
- **Connection pooling:** the app talks to Postgres only through Supabase's HTTP API (PostgREST), which pools connections on Supabase's side. There's no direct `pg` connection in app code (`pg` is only used by the DB tests), so serverless functions can't run out of connections. Nothing to change.

## 6. Server writes and rate limiting

**No app-level rate limiting exists anywhere.** The only limits are Supabase Auth's own, on sign-in, sign-up and reset emails.

Write paths:

- **Ledger:** `runLedgerCommand`, `saveQuickAdd`, `saveEntryForm`, and `POST /api/sync` (offline replay). Each one also runs `syncRewards` afterwards.
- **Wallets:** `createAccount`, `updateAccount`, `makeDefaultAccount`, `setAccountArchived`.
- **Categories:** `createCategory`, `updateCategory`, `moveCategory`, `setCategoryArchived`, `mergeCategory`, `saveRule`, `deleteRule`, `assignCategory`.
- **Plan:** `saveBudget`, `archiveBudget`, `saveGoal`, `setGoalStatus`, `saveBill`, `cancelBill`, `saveRecurring`, `setRecurringPaused`, `archiveRecurring`, `skipOccurrence`, `unskipOccurrence`, `savePlanning`, `setNextIncomeDate`.
- **Tiles:** `savePreset`, `setPresetArchived`.
- **Reminders:** `syncReminders` (runs on every app open), `markNotificationRead`, `dismissNotification`, `markAllNotificationsRead`, `saveReminderSchedule`, `saveBrowserNotifications`.
- **Rewards:** `completeWeeklyReview`, `changeQuest`, `noteInsightExplored`, plus the `/rewards` page render itself. These use the admin key.
- **Settings and onboarding:** 7 settings actions and 5 onboarding actions.
- **Account and auth:** `deleteAccount`, `signIn`, `signUp`, `requestPasswordReset`, `updatePassword`, `signOut`.
- **Heavy reads with no limit:** `/reports/export` (builds a PDF) and `/settings/data/export` (all data).

From the code, the likely slow ones are:

- any ledger write, because of the full-ledger reward sync afterwards
- `syncReminders`, which reads the full ledger
- the PDF export
- `/rewards`

RLS limits the damage to the user's own data, but a script with a valid session can hammer the server and drive up database load.

## 7. Can it run on Vercel's many servers?

Yes. Nothing blocks it:

- No in-memory state that matters. The only module-level server state is an `Intl.DateTimeFormat` cache.
- No local file writes.
- Sessions live in cookies. `after()` is supported on Vercel.

Points to watch:

- **PDF fonts:** `pdf.ts` reads them from `process.cwd()/node_modules/geist/...`. It works only because `outputFileTracingIncludes` lists them, so keep that in sync if the route moves.
- **Region:** set the function region to `bom1` (Mumbai) to sit next to the database (see §4.6).
- **Reminders:** they still need the app open. There's no cron job.

## 8. Ranked fixes (free options only)

| # | Fix | Impact | Effort |
|---|---|---|---|
| 1 | Set the Vercel function region to `bom1`, next to Supabase ap-south-1 (`vercel.json` `"regions": ["bom1"]`, free on Hobby) | High | Small |
| 2 | ~~Stop reading the whole ledger per screen~~ **Done (Speed fixes 2):** balances come from the `wallet_balances` RPC, and screens read their periods' rows plus small all-time reads. Transactions without a date filter and Categories still read every row, because their figures are all-time. See PROGRESS.md | High | Large |
| 3 | ~~Replace `revalidatePath("/", "layout")` with narrower paths or tags~~ **Corrected (Speed fixes 1): no gain.** In Next 16.4 any `revalidatePath` from a server action clears the whole client cache and refreshes the current page from the root (Next's source: "TODO: Evict only segments with matching tags and/or paths"), and this app has no server data cache. The real cost is the full re-render in each save's response | — | — |
| 4 | Make reward sync cheaper: compute from the entries just written, or run it at most once per N minutes per user. Do the 4 upserts in parallel or in one RPC, and drop the second `store.read()` | High | Medium |
| 5 | Run `ReminderSync` at most once per session or hour (it already has a 30-minute timer; skip the on-mount call if one ran recently), and have it read only what it needs | Medium | Small |
| 6 | Move the `ensure_default_account` RPC out of the render path (create the wallet at sign-up or onboarding), or run it in parallel with the other reads | Medium | Small |
| 7 | Don't write during the `/rewards` GET. Rely on the post-write sync, or move the sync to a server action the page calls | Medium | Small |
| 8 | Add a simple per-user rate limit in Postgres (a counter table + one RPC, inside the existing Supabase) for `/api/sync`, ledger writes, exports and `syncReminders` | Medium | Medium |
| 9 | Keyset pagination and the index `(owner_id, occurred_at desc, id) where deleted_at is null` for the ledger read | Medium | Small |
| 10 | Check `pg_stat_user_indexes`, then drop the indexes that are never used (`transactions_owner_updated`, `transactions_category`, the wallet ones if unused) | Low | Small |
| 11 | Fix the double `notification_preferences` read. Delete `getCurrentUser` in favour of `optionalSession` | Low | Small |
| 12 | Load Dexie only when the queue is needed (dynamic import), and drop `motion` from `template.tsx` in favour of a CSS fade | Low | Small |
| 13 | ~~Share one `moneyFormatter(profile)` and one `today(profile)` helper instead of 20 and 5 copies~~ **Done (Code tidy):** `moneyFormatter(currency)` in `@/domain` and `requestToday(timeZone)` in `src/lib/data/session.ts` | Low | Small |
| 14 | ~~Split the 400+ line components (`transaction-form`, `goal-actions`, `sync-center`) and the long pages into smaller parts~~ **Done (Code tidy):** every `src` file over ~315 lines was split, domain modules included; `@/domain` and `@/lib/data/queries` keep their names | Low | Medium |
| 15 | ~~Rename the phase-named test files by feature. Make test-only exports local or move them to test helpers~~ **Done (Code tidy):** tests are named by feature; `applyMutations`, `TransactionInput`, `LedgerCommandInput` and `AUX_ROUTES` moved into the tests. `newlyReachedThresholds`, `isScheduledOn` and `formatINRCompact` stay in the domain: they are domain rules with their own tests | Low | Small |
| 16 | Add an index on `(owner_id, subcategory_id)` for transactions if category merges become common | Low | Small |
