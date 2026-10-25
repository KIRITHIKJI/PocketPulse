# PocketPulse — Progress

Durable project state. Update before a context reset or at the end of each work session.
Source of truth for requirements: `PROJECT_SPEC.md`. Working rules: `CLAUDE.md`.

_Last updated: 2026-10-26 — end of Phase 2._

## Build stages

One integrated product. Stages are an internal build order only; nothing is deferred past Phase 10.

| # | Stage | Status |
| --- | --- | --- |
| 1 | Foundation: tooling, design system, app shell, every route, shared states | ✅ Done |
| 2 | Financial domain core: paise math, INR formatting, Asia/Kolkata period boundaries, ledger/balance invariants (income, expense, refund, transfer, allocation, release), opening/closing balances, aggregation, budgets, savings, safe-to-spend — pure + unit-tested (`src/domain/`) | ✅ Done |
| 3 | Supabase: schema + migrations, RLS on every private table, cross-user denial tests, server data access, auth (register, login, logout, recovery) and route protection | ⬜ Next |
| 4 | Onboarding (balance + effective date, wallets, currency/timezone, allowance, budgets, goals, prefs), accounts, categories/subcategories management, profile/preferences sync | ⬜ |
| 5 | Transactions: quick-add tiles, full form, repeat/frequent, history with search/filters, detail/edit/delete/undo (real `notFound()` + re-check 404 status, see Checks note), idempotency keys | ⬜ |
| 6 | Natural-language parser + voice entry with draft review and atomic batch confirm | ⬜ |
| 7 | Insights + charts with drill-down, sparse-data honesty, Money Leak Detector with what-ifs | ⬜ |
| 8 | Budgets (alerts, pace, suggestions), savings goals + allocation ledger, safe-to-spend, survival mode, recurring templates + commitments | ⬜ |
| 9 | Parent report (preview, PDF, CSV, text; reconciled totals), gamification (XP, levels, streaks, quests, achievements; idempotent), reminders, data export + account deletion | ⬜ |
| 10 | PWA + IndexedDB offline queue, sync states, conflict handling; full e2e at mobile/desktop; a11y/perf pass; docs; final verification | ⬜ |

## Spec §23 acceptance checklist

Status key: ⬜ not started · 🟨 partial (detail given) · ✅ done and verified.

- ⬜ Registration, login and recovery work with real configured auth. — Routes exist (`/register`, `/login`, `/forgot-password`, `/reset-password`); they currently report Supabase configuration state, no forms. A real `.env.local` with a Supabase project is present. Logout will be an account-menu action (Phase 3).
- ⬜ All user data is private and protected by tested access rules.
- ⬜ Adding income and expense updates correct balance immediately.
- ⬜ Quick-add presets/custom amounts work.
- ⬜ Text and voice routes create reviewable drafts and confirm before save. — Routes `/add/text`, `/add/voice` exist.
- ⬜ History, search, filters, editing, deletion and undo work. — Routes exist; `/transactions/[id]` and `/edit` return a genuine 404 until the ledger exists.
- 🟨 Category/subcategory totals reconcile with transactions. — Domain `categoryBreakdown` is tested to reconcile category → subcategory → period total (refunds included); screens wire it in Phases 5/7.
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
- 🟨 Lint/typecheck/tests/production build are run and failures are addressed. — All pass for Phase 1 (see Checks).
- 🟨 Setup documentation accurately describes what needs a real Supabase project/credentials. — README covers env vars and current state; Supabase schema/migration steps added in Phase 3.

## Routes (spec §5)

Every screen has a route; feature screens show a real empty state until their stage lands.

| Screen | Route(s) | State |
| --- | --- | --- |
| Welcome / onboarding | `/welcome`, `/onboarding` | Welcome complete; onboarding lists steps, requires sign-in |
| Register, login, recovery | `/register`, `/login`, `/forgot-password`, `/reset-password` | Config-status panel (Phase 3) |
| Home | `/home` | Empty state + links to add flows (Phase 5/7) |
| Quick add / type / voice / full form | `/add`, `/add/text`, `/add/voice`, `/transactions/new` | Empty state (Phases 5–6) |
| History, detail, edit | `/transactions`, `/transactions/[id]`, `/transactions/[id]/edit` | Empty / 404 (Phase 5) |
| Categories | `/categories` | Empty state (Phase 4) |
| Insights, Money leaks | `/insights`, `/insights/leaks` | Empty state (Phase 7) |
| Budgets, goals, safe-to-spend, survival | `/budgets`, `/goals`, `/safe-to-spend`, `/survival` | Empty state (Phase 8) |
| Income & recurring | `/recurring` | Empty state (Phase 8) |
| Parent report | `/reports` | Empty state (Phase 9) |
| Rewards, reminders | `/rewards`, `/reminders` | Empty state (Phase 9) |
| Settings: preferences/theme | `/settings` | Theme + motion controls work (device-local); profile prefs Phase 4 |
| Privacy, sync, data export/deletion | `/settings/privacy`, `/settings/sync`, `/settings/data` | Empty state (Phases 9–10) |

`/` redirects to `/welcome`. Phase 3 adds middleware: signed-in → `/home`, signed-out app routes → `/login`.

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

- `.env.local` exists with what look like real Supabase credentials (format checked only; values never printed). It is gitignored. No connection to the project has been tested yet (Phase 3).
- npm's allow-scripts warns that `unrs-resolver`'s postinstall hasn't run; lint works without it (it ships prebuilt binaries).
- Git: `main` tracks `origin` (https://github.com/KIRITHIKJI/PocketPulse.git). Work is committed and pushed at the end of every phase; Phase 1 = `93ff182`, Phase 2 = `08288e7`.

## Next concrete tasks (Phase 3)

1. Add `@supabase/supabase-js` + `@supabase/ssr` (pinned, compatibility-checked), with server and browser clients. `SUPABASE_SECRET_KEY` is only ever imported from server-only modules.
2. SQL migrations mirroring `src/domain/schemas.ts`: profiles/preferences, accounts (opening balance + date), categories/subcategories, transactions (`amount_paise int8 check > 0`, type enum, per-type check constraints for account/transfer/goal/refund links, `deleted_at`, `voided_at`, client UUID primary key for idempotency), budgets, savings goals, commitments, recurring templates, notification prefs, gamification tables. FKs, indexes, and `owner_id` on every row.
3. RLS on every private table (`owner_id = auth.uid()`), plus tests proving cross-user reads and writes are denied.
4. Auth: real register, login, logout (account menu) and forgot/reset password forms; middleware route protection (signed-in → `/home`, signed-out app routes → `/login`).
5. A server data-access layer that parses rows with the domain Zod schemas and feeds the domain functions. No money math in queries or components.
