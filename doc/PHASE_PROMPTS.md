# PocketPulse — 10 Phase Prompts for Claude Code

How to use:
- Open Claude Code in the PocketPulse root folder (with `CLAUDE.md` and `PROJECT_SPEC.md` there).
- Paste **one phase at a time**. Start the next phase only after the current one ends with a passing check summary and an updated `PROGRESS.md`.
- These phases are internal build stages of **one** complete product (allowed by CLAUDE.md), not V1/V2 releases. Nothing is deferred: phase 10 ends with the full acceptance checklist.
- If a session gets cut off or the context resets, paste the **Resume prompt** at the bottom.

---

## Phase 1 — Repo inspection, foundation & app shell

```
Read CLAUDE.md and PROJECT_SPEC.md completely. This is Phase 1 of 10 internal build stages for ONE complete PocketPulse app (no feature is deferred; later phases will add the rest).

1. Inspect the repo first: working directory, git status, package manager, existing files, scripts, dependencies, env files. Do not overwrite existing work. If empty, bootstrap a Next.js App Router + TypeScript + Tailwind project. Check current dependency compatibility instead of blindly installing "latest".
2. Set up tooling: ESLint, strict TypeScript, Prettier, Vitest (unit/integration), Playwright (browser tests), and npm scripts: dev, build, lint, typecheck, test, test:e2e.
3. Set up the design system: theme tokens for a midnight/charcoal dark theme (default) and a coherent light theme, violet primary accent, restrained lime/green for positive progress. Install shadcn/ui (or equivalent accessible components), an icon set, Framer Motion, and a theme switcher. Respect prefers-reduced-motion from day one.
4. Build the app shell: route structure for every screen listed in spec section 5, desktop sidebar + header, mobile bottom navigation (Home, Transactions, Insights, Budgets/Goals, Reports), plus custom loading/empty/error components. Routes that later phases will fill may show a real empty state, but not "coming soon" text — note them in PROGRESS.md instead.
5. Create `.env.example` with placeholders only, and `.gitignore` covering env files.
6. Create PROGRESS.md: a checklist of EVERY item in spec section 23 plus the 10 phases, with truthful status and the architecture decisions you made.

Run lint, typecheck, test, and build. Fix failures. End with: what you built, commands actually run with results, and what Phase 2 should start with. Do not start Phase 2.
```

---

## Phase 2 — Financial domain layer (the heart of the app)

```
Read CLAUDE.md, PROJECT_SPEC.md (especially section 7) and PROGRESS.md. This is Phase 2 of 10.

Build a pure, framework-independent, fully unit-tested financial domain layer (e.g. src/domain/). No UI, no database calls in it. Every screen, chart, budget, goal, forecast and report in later phases MUST use these functions — never reimplement math in components.

Include:
- Money: integer paise type/helpers, safe parsing of user input ("15", "₹40", "12.50") to paise, INR formatting with Indian grouping (₹1,25,000), no floating-point arithmetic anywhere.
- Time: Asia/Kolkata default timezone, period boundaries (today, this/previous week, this/previous month, custom range, all-time) used identically everywhere.
- Transaction model + Zod schemas for types: income, expense, transfer, allocation, allocation_release, and refund linked to an original expense. Document ONE refund convention in code comments and PROGRESS.md.
- Balances: per-account balance, consolidated balance, opening balance with effective date, historical opening/closing balance for any period (reconstructed from the ledger, never today's balance).
- Category/subcategory aggregation, counts, average, median, share %, period-vs-previous comparison.
- Budget math: spent, remaining, % used, pace, threshold alerts.
- Savings: earmarked totals per goal, progress, remaining, suggested periodic allocation.
- Safe-to-spend: balance − active allocations − unpaid commitments within horizon (+ optional reserve), days until next income, suggested daily/weekly limit, expected end balance; return "not enough info" instead of fabricating when next-income date is missing. Return the inputs + explanation text with every result.
- Voided/deleted transactions excluded consistently.

Write thorough tests for all 10 financial invariants in section 7, including: transfers net to zero, allocations don't change consolidated balance, no double subtraction of paid expenses vs commitments, refunds, edits/deletes recalculating, period boundaries at midnight IST, rounding/formatting edge cases.

Run lint, typecheck, test, build. Update PROGRESS.md. Report results. Do not start Phase 3.
```

---

## Phase 3 — Supabase schema, RLS & authentication

```
Read CLAUDE.md, PROJECT_SPEC.md (sections 6, 19, 21) and PROGRESS.md. This is Phase 3 of 10.

1. Design a normalized Postgres schema as SQL migrations (supabase/migrations): profiles/preferences, accounts (with opening balance + effective date), categories/subcategories, transactions (stable client UUID id, owner, type, amount_paise > 0 check, currency, occurred_at, category, account, merchant/description, note, tags, source, refund link, voided/deleted state, created/updated timestamps, idempotency key unique per user), budgets, savings goals + allocation ledger, recurring templates, planned commitments, notification preferences/records, XP events, achievements, quests, streak state, and sync metadata. Use foreign keys, indexes, constraints, no silent cascade-deletes of financial history.
2. Enable Row Level Security on EVERY private table with owner-only policies. Never trust a client-supplied user_id.
3. Write Postgres functions (RPC) or server-side transactions for atomic multi-row operations: transfers, allocations/releases, batch expense logging — all idempotent.
4. Supabase Auth: register, login, logout, password recovery/reset pages, protected routes via middleware, server/browser Supabase clients. Service-role key only on the server, never in client bundles.
5. Seed default category hierarchy (spec section 9) per new user via a trigger or onboarding function.
6. Tests: RLS cross-user access denial (user A cannot read/write user B's rows), idempotent insert retry, atomic transfer rollback. If a local Supabase (supabase CLI + Docker) is available, run them; if not, write them and document exactly how to run them.
7. Write a SETUP section in README: creating the Supabase project, env variables, running migrations, configuring auth redirect URLs.

If Supabase credentials are missing, build and test everything possible locally and clearly tell me which env values I must provide. Do not pretend it's connected. Update PROGRESS.md, report checks run. Do not start Phase 4.
```

---

## Phase 4 — Onboarding, accounts, categories & profile

```
Read CLAUDE.md, PROJECT_SPEC.md (sections 6, 9) and PROGRESS.md. This is Phase 4 of 10.

Build, connected to the real database and domain layer:
1. Welcome + onboarding flow: opening tracked balance and effective date, optional accounts/wallets (cash, bank, UPI/wallet), currency/timezone (INR / Asia/Kolkata default), allowance/income frequency and next expected date, initial budgets, first savings goal, theme/reminder/privacy preferences. Every optional step can be skipped and edited later. Explain clearly that balances are what the user enters, not a verified bank balance.
2. Accounts management: create, rename, archive, set opening balance.
3. Categories screen: default hierarchy, create/edit subcategories, custom icon/color, reordering, safe rename and merge (historical transactions stay meaningful), category rules (e.g. description "chai" → Food & Drinks › tea), and an Uncategorized queue.
4. Category suggestion service (deterministic, based on rules + the user's prior choices) that later entry flows will use; the user can always override.
5. Profile & preferences screen: name, theme, reduced-motion, currency/timezone, small-purchase threshold (default ₹50), privacy notes. Leave data export / account deletion wiring for Phase 9 but build the section structure.

Validation with Zod on every form and server boundary. Accessible labels, keyboard navigation, focus states, mobile + desktop layouts.
Tests: onboarding saves correct opening balance, category merge keeps history, suggestion logic. Run lint, typecheck, test, build. Update PROGRESS.md. Do not start Phase 5.
```

---

## Phase 5 — Transactions: quick-add, full form, history, edit/undo & Home

```
Read CLAUDE.md, PROJECT_SPEC.md (sections 4A, 7, 8) and PROGRESS.md. This is Phase 5 of 10.

1. Create ONE mutation layer for all financial writes (create/edit/delete/undo). Every operation gets a client-generated UUID + idempotency key, so Phase 10's offline queue can plug in without rewrites. Design it with that in mind now.
2. Quick-add tiles: tea, coffee, snacks, breakfast, lunch, dinner, bus, train, auto/cab, recharge, groceries, custom. Customizable typical amounts and default category/subcategory. Tap → accept/edit amount → save in as few taps as possible → success toast with Undo. Quick on mobile.
3. Full transaction form: amount, type (income/expense/transfer/refund), category/subcategory with suggestion, date/time (IST default, historical allowed), account, merchant/description, note, tags. Only amount + category required.
4. Repeat last expense and "frequent transactions" shortcuts.
5. Transactions history: grouped by day, search, filters (type, category, account, date range, amount), detail view, edit, delete with confirmation, undo. Mobile cards, not a cramped desktop table; desktop can use a table.
6. Home/Dashboard: labelled current consolidated balance, today's/this month's spending (clearly labelled scopes), recent transactions, quick-add row, budget/goal snapshot areas (show real empty states until Phase 8 data exists). Smooth balance number transitions, subtle new-transaction feedback (no full-screen animation for ₹10).
7. After any mutation, every affected view updates immediately (balance, history, category totals).

Tests: double-submit doesn't duplicate, edit/delete recalculates balance, undo restores correctly, income/expense change balance correctly, transfer doesn't change consolidated balance. Add a Playwright test for Journey A (quick-add tea) at mobile and desktop widths. Run lint, typecheck, test, build. Update PROGRESS.md. Do not start Phase 6.
```

---

## Phase 6 — Natural-language & voice entry

```
Read CLAUDE.md, PROJECT_SPEC.md (sections 4B, 8) and PROGRESS.md. This is Phase 6 of 10.

1. Deterministic natural-language parser (no paid API, no external AI) in the domain layer: handles "tea 15, bus 20, snacks 35", "₹40 lunch and ₹15 tea yesterday", "rs 20 coffee", "auto 60 on monday", separators (comma, "and", newlines), ₹/rs/inr, decimals, relative dates (today, yesterday, weekday names), category suggestion via the Phase 4 suggestion service. Ambiguous items are flagged and assigned to a visible "Unassigned" state — never silently guessed.
2. Text entry screen → draft preview list: each draft shows amount, category, date, and is editable/removable → "Save all" uses the atomic, idempotent batch operation from Phase 3/5.
3. Voice entry: Web Speech API where supported, clear microphone permission request, explanation that it's browser-dependent, live editable transcript → same parser → same draft preview → confirm. Graceful text fallback if unsupported/denied. Never upload audio to external services.
4. Entry points from quick-add sheet and Home.

Tests: a large table of parser cases (multi-item, currency formats, dates, ambiguous inputs, garbage input), batch save is atomic and doesn't duplicate on retry. Playwright test for Journey B. Run lint, typecheck, test, build. Update PROGRESS.md. Do not start Phase 7.
```

---

## Phase 7 — Spending Insights, charts & Money Leak Detector

```
Read CLAUDE.md, PROJECT_SPEC.md (sections 4C, 10, 11) and PROGRESS.md. This is Phase 7 of 10.

All numbers come from the Phase 2 domain functions over real stored data. No demo constants.

1. Insights screen with period selector (today, week, month, previous week/month, custom, all-time): category + subcategory totals and shares, transaction counts, average/median, most frequent purchases/merchants, small-purchase total (user threshold), daily/weekly/monthly trend charts, biggest categories and changes vs previous period, recurring-expense signals, unusual changes with a plain-language "how we detected this" explanation.
2. Plain-language insight cards like "You bought coffee 16 times for ₹25 each: ₹400 this month." Only generate an insight when data supports it; show "not enough data to compare yet" honestly when sparse.
3. Drill-down: every chart segment, category card and insight opens the exact underlying transactions (Journey C).
4. Money Leak Detector screen: groups repeated small purchases by category, merchant, preset or similar description; shows frequency, total, average, previous-period comparison, share of spending, list of exact transactions; optional what-if calculator ("4 fewer ₹25 coffees = ₹100 less"). Neutral, non-shaming language.
5. Responsive Recharts (or similar) charts with transitions, accessible labels/tooltips, and reduced-motion support; good empty/loading states.

Tests: aggregation reconciles with raw transactions, period comparison, leak grouping, sparse-data handling, insight text generation. Run lint, typecheck, test, build. Update PROGRESS.md. Do not start Phase 8.
```

---

## Phase 8 — Budgets, savings goals, safe-to-spend, survival mode & recurring

```
Read CLAUDE.md, PROJECT_SPEC.md (sections 4D, 4E, 12, 13, 14, 17) and PROGRESS.md. This is Phase 8 of 10.

1. Budgets: total + per-category, monthly default plus custom periods, user limits and suggested limits from history, spent/remaining/%/pace, configurable threshold alerts. Never blocks a purchase. Clearly labelled as a target, not reserved cash. Historical edits update budget performance.
2. Savings goals & pockets: multiple goals (title, icon, target, target date), allocate/release via the atomic allocation operation, allocation history, progress ring, remaining, suggested periodic allocation, pause/archive/complete with a meaningful celebration. Allocations never count as expenses or change consolidated balance. Flow for "I bought the thing I saved for": record real expense + release earmark, with an explanation to avoid double counting. Archiving never deletes history.
3. Income & recurring templates + planned commitments: recurring income/expense templates, upcoming bills, clearly labelled as forecast/reminder vs actually occurred. Confirming a due item creates exactly one real transaction (no duplicates) and clears the commitment so it's never subtracted twice.
4. Safe-to-Spend screen: tracked balance, active allocations, unpaid commitments in horizon, optional minimum reserve, days until next income, flexible amount, suggested daily/weekly limit, expected end-of-period balance with stated assumption, pace warnings. Show inputs and explanation for every number. Handle missing next-income date honestly.
5. Pocket-Money Survival Mode: allowance planning view built on the same calculations (days left, daily allowance, on-track/at-risk status, gentle tone).
6. Feed budget and goal snapshots into Home.

Tests: budget thresholds/pace, budget edits, goal allocate/release/complete, purchase-from-goal flow, safe-to-spend with/without commitments, no double subtraction after a commitment is paid, recurring confirmation idempotency. Playwright tests for Journeys D and E. Run lint, typecheck, test, build. Update PROGRESS.md. Do not start Phase 9.
```

---

## Phase 9 — Parent reports, gamification, reminders & data ownership

```
Read CLAUDE.md, PROJECT_SPEC.md (sections 4F, 15, 16, 17, 21) and PROGRESS.md. This is Phase 9 of 10.

1. Parent Report Mode: choose date range → preview with period, currency, historical opening/closing balances, income, expenses, refunds, net movement (with definitions), category/subcategory totals/counts/%, charts, optional detailed transactions and notes, optional previous-period comparison. Filters to include/exclude details, notes, categories. Export a real professional print-friendly PDF, a correct CSV, and a copyable plain-text summary. Never auto-send anything.
2. Gamification: XP events, levels, daily/weekly streaks, optional quests, achievements (First 10 Transactions, 7-Day Logging Streak, No Mystery Money, First Savings Goal, Monthly Budget Achieved, Spending Detective, Weekly Review Complete). Reward logging, categorizing, reviewing and saving — never spending or deprivation. Idempotent: editing/deleting a transaction can't farm or corrupt rewards. Celebration effects respect reduced motion; no guilt-based streak pressure.
3. Reminders & notifications: optional, configurable (missed logging, weekly review, upcoming allowance, approaching budget, upcoming commitments, savings review), frequency choices, disable-all switch, quiet by default. In-app notification center; browser notifications only with permission.
4. Data ownership: full data export (JSON/CSV), account deletion with clear consequences + confirmation, implemented server-side securely.

Tests: report totals reconcile with domain calculations for a historical period (incl. opening/closing), CSV rows/amounts correct, PDF generates, achievement idempotency, streak logic across IST midnight, reminder preferences respected. Playwright test for Journey F. Run lint, typecheck, test, build. Update PROGRESS.md. Do not start Phase 10.
```

---

## Phase 10 — PWA/offline sync, polish, full QA & delivery

```
Read CLAUDE.md, PROJECT_SPEC.md (sections 18, 20, 22, 23, 24) and PROGRESS.md. This is Phase 10 of 10 — the final phase. Finish the whole product.

1. PWA: manifest, icons, service worker with a reliable caching strategy, installable on supported devices.
2. Offline: plug a durable IndexedDB (Dexie) queue into the Phase 5 mutation layer. Stable UUID/idempotency key per operation, visible pending/synced/failed states, safe retries without duplicates, explicit handling of edit/delete races and conflicts (preserve data, let user resolve real conflicts), offline banner. Test Journey G: add offline → reconnect → syncs once → visible on another session with correct totals.
3. Polish pass over EVERY screen (not just Home): consistent design system in dark and light themes, spacing/typography, custom empty/loading/error/permission-denied/offline states, purposeful motion that never blocks entry, reduced-motion setting, accessibility (contrast, keyboard nav, focus, screen-reader labels, touch targets). Check mobile (~375px) and desktop (~1440px) with Playwright screenshots and fix layout issues.
4. Remove any remaining TODO, FIXME, placeholder, fake success or hardcoded financial value. grep to prove it.
5. Run the full suite: lint, typecheck, all unit/integration tests, RLS tests, Playwright e2e for Journeys A–G at mobile and desktop, production build. Fix real failures; never delete/weaken tests to pass.
6. Go through spec section 23 item by item and mark each in PROGRESS.md as verified (with how), or clearly state the specific blocker.
7. Finalize README (setup, Supabase steps, env vars, commands) and .env.example.

Final report: implemented features, commands actually run and results, env vars/credentials I must supply, known limitations, and genuine remaining blockers. Don't claim production readiness without verification.
```

---

## Resume prompt (use after a context reset or interruption)

```
Read CLAUDE.md, PROJECT_SPEC.md and PROGRESS.md. Inspect git status and the current code. Tell me in 3–5 lines which phase we are in, what is done, what is broken or untested. Then continue the current phase from the exact next step in PROGRESS.md. Run lint, typecheck, test, build before ending, update PROGRESS.md, and do not start the next phase.
```

## Tips
- Commit with git after each finished phase (`git add . && git commit -m "Phase N complete"`), so you can roll back if a later phase breaks something.
- Supabase: create a free project at supabase.com before Phase 3 and keep the URL + anon key + service-role key ready (service-role only goes in `.env.local`, never shared).
- If Claude Code says a check "passed", ask it to show the actual command output when in doubt.
