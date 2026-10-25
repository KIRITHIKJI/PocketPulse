# PocketPulse — Full Product, UX, Engineering, and Acceptance Specification

## 1. Product summary

**Name:** PocketPulse  
**Tagline:** Track. Understand. Save.  
**Product type:** Responsive, installable personal-finance web app/PWA for a college student.  
**Primary user:** A student who frequently makes small purchases (₹10 tea, ₹20 coffee, snacks, transport, small UPI payments), forgets to log them, loses track of where money goes, and wants to save intentionally.  
**Secondary use:** Make clear weekly/monthly expense summaries that the student can review or choose to share with parents.

PocketPulse must not be just an expense ledger or a pretty dashboard. It should make these jobs easy:
1. Record each purchase in seconds.
2. Trust the balance and transaction history.
3. Understand spending by category, subcategory, merchant, amount, frequency, and period.
4. Identify repeated small purchases and spending changes without shaming the user.
5. Plan realistic budgets and save toward personal goals.
6. Know how much money is reasonably available until the next allowance/income.
7. Generate a professional, accurate parent-ready report when requested.
8. Be enjoyable enough that the user keeps recording expenses.

## 2. One complete product — no version deferrals

All features in this specification are part of the required product. You may implement in a technically sensible order, but do not declare a partial stage to be the finished deliverable, defer feature groups to a later version, or leave a UI placeholder. Each feature must work end-to-end and be integrated into the same navigation, database, calculation layer, and design system.

## 3. Defaults and decisions

- **Cross-device:** One responsive Next.js web app, installable as a PWA on supported devices; same user account and cloud records on phone and laptop.
- **Initial stack:** Next.js App Router, React, TypeScript, Tailwind CSS, reusable accessible components (shadcn/ui is acceptable), Supabase Auth + PostgreSQL, Framer Motion or a compatible animation library, Recharts or similar for data visualization, Zod for validation. Use a reliable PWA/offline strategy and IndexedDB (Dexie or equivalent) for offline transactions.
- **Money:** INR (₹), paise stored as integer amounts. Format with Indian grouping, e.g. ₹1,25,000. Use Asia/Kolkata as the default timezone.
- **Data sync:** Cloud-first with a durable offline queue; visible pending/synced/failed states.
- **AI:** Core features must not require a paid LLM API. Natural-language entry should have a deterministic parser and confirmation screen. Voice entry should use supported browser/device capabilities where available, with a text fallback.
- **No bank dependency:** Manual income/expense tracking must work fully without bank connection.
- **No sharing without consent:** Reports are generated for user review. Never automatically send spending data to parents or third parties.
- **Build quality:** Production-minded, no hardcoded financial totals, no fake saves, no decorative controls pretending to work.

If the existing repository has a sound stack already, inspect it first and preserve it unless there is a concrete reason to migrate. Verify current dependency compatibility rather than blindly installing latest packages.

## 4. User journeys

### Journey A — Add an ordinary small purchase
Open app on mobile → tap Tea quick-add → accept/edit amount → save → show success/undo → update balance, transaction feed, category totals, budgets, insights, and sync status.

### Journey B — Log multiple expenses
Enter `tea 15, bus 20, snacks 35` → parse into separate drafts → show each amount/category/date → user confirms or edits → save all atomically where possible, with an idempotency strategy → update all views.

### Journey C — Understand a category
Open Insights → select Food & Drinks → see total, transaction count, average purchase, trend vs previous period, subcategories (tea/coffee/snacks/meals), and underlying transactions. Every chart/insight should be drillable into the records behind it.

### Journey D — Save intentionally
Set laptop savings target → allocate an amount to the goal → allocation reduces flexible/safe-to-spend money but is not recorded as spending → progress and forecast update → withdraw/reallocate if needed without false expenses.

### Journey E — Check safe-to-spend
Review tracked balance, earmarked savings, unpaid committed expenses, and days until next income → app transparently calculates flexible funds and a suggested daily allowance with assumptions shown.

### Journey F — Parent report
Choose period → inspect totals and category breakdown → optionally include detailed transactions/notes → preview report → export PDF/CSV or copy text summary. Totals must reconcile with the ledger and selected period.

### Journey G — Switch devices/offline
Add a transaction with poor/no network → transaction is stored locally with a stable ID and visible pending status → reconnect → sync once → app on another device reflects the same transaction and accurate totals. Errors must be visible and recoverable.

## 5. Navigation and screens

Implement all needed screens, with coherent routes and functional navigation:
- Welcome/onboarding.
- Registration, login, logout, password recovery.
- Dashboard/Home.
- Quick-add interface.
- Full transaction form.
- Natural-language entry and preview.
- Voice entry and preview.
- Transaction history, detail, edit, delete, undo where feasible.
- Categories and subcategories management.
- Spending Insights and charts.
- Money Leak Detector.
- Budgets.
- Savings goals and pockets.
- Safe-to-Spend calculator.
- Pocket-Money Survival Mode / allowance planning.
- Income and recurring templates.
- Parent Report Mode / PDF preview / CSV export.
- Gamification: XP, level, streaks, quests, achievements.
- Reminders/notifications.
- Profile, preferences, theme, data export, privacy, sync and account deletion.

Core mobile navigation should make Home, Transactions, Insights, Budgets/Goals, and Reports reachable quickly. Desktop can use a sidebar plus header. Do not force a desktop table layout onto phones.

## 6. Onboarding and account

Support authentication and password recovery. During onboarding allow the user to configure:
- Opening tracked balance and its effective date.
- Optional tracked accounts/wallets (cash, bank, UPI/wallet, etc.).
- Currency and timezone (default INR / Asia/Kolkata).
- Pocket-money/allowance or income frequency and next expected date.
- Initial budget amounts.
- Savings goals.
- Theme, reminders, and privacy preferences.

Allow optional steps to be skipped and edited later. Clearly explain that the app can only report entered/connected information. Never imply that a tracked balance is an automatically verified bank balance.

## 7. Transaction types and money model

Support at least:
- `income`: money received.
- `expense`: real money spent on goods/services.
- `transfer`: money moved between the user's own tracked accounts; not new income or expense in the consolidated balance.
- `allocation`: internal earmarking of money to a savings goal/pocket; not a purchase and not an expense.
- `allocation_release`: un-earmarking money back to flexible funds; not income or expense.

A refund should be represented explicitly and linked to the original expense where appropriate, so it does not get misclassified as ordinary income. The interface may display the refund as a negative expense or as a distinct refund line, but all totals must follow one documented convention.

Every transaction should have a stable ID, owner, type, integer amount in paise, currency, date/time, category/subcategory where applicable, optional account, description/merchant, optional note/tags, creation/update timestamps, and source (manual, quick-add, parsed text, voice, recurring, import). Include deleted/voided state or a suitable audit method so history and sync stay correct.

### Financial invariants — non-negotiable
1. Amounts are positive integer paise in storage; transaction type determines direction. Validate amounts greater than zero unless a clearly documented special-case schema says otherwise.
2. For a selected account, its current balance is opening balance + income + incoming transfers + refunds − expenses − outgoing transfers, adjusted for any explicitly supported opening-balance corrections. Transfers must net to zero across all owned accounts.
3. Consolidated balance across the user's tracked accounts is opening total + genuine income + refunds − genuine expenses. Internal transfers must not change consolidated balance.
4. Savings allocations do **not** change total tracked money. They change earmarked savings and flexible/safe-to-spend calculations only.
5. Safe-to-spend = current consolidated tracked balance − active savings allocations − unpaid committed expenses due within the chosen planning horizon, subject to the documented planning model. Never subtract a paid expense a second time. Never count the same bill both as an actual expense and an unpaid commitment.
6. Period income, spending, refunds, opening/closing balances, budgets, reports and charts must use consistent date/time boundaries and the same domain functions.
7. An edited or deleted transaction must recalculate all affected derived totals; no duplicate expense may be created on retries or sync replay.
8. Never use binary floating-point to store/calculate amounts. Use integer paise for arithmetic and convert only for display.
9. Label the scope/time of every balance figure. A monthly expense total is not the same thing as current total balance or money remaining from one allowance.
10. Historical period closing balance must be reconstructable from opening balance and dated ledger activity; don't label today's balance as a historical month-end balance.

Put financial logic in a central, unit-tested domain/service layer instead of reimplementing it in components or report generators. Use database transactions or carefully designed atomic operations for multi-record financial mutations.

## 8. Quick expense entry

### Quick-add tiles
Provide customizable presets for tea, coffee, snacks, breakfast, lunch, dinner, bus, train, auto/cab, recharge, groceries, and custom item. Let user save typical amounts and set preferred category/subcategory. Support custom amount instantly. Common tasks should take as few taps as possible.

### Full form
Amount, category, subcategory, date/time, account/payment method, merchant/description, optional note, tags, recurring settings if applicable. Only amount and category (or a clear category suggestion) should be essential for normal use. Record in the present timezone by default but allow historical dates.

### Repeat
Repeat last expense, use frequent transactions, and edit defaults without requiring a full form.

### Natural-language parser
Examples:
- `tea 15, bus 20, snacks 35`
- `₹40 lunch and ₹15 tea yesterday`

Parse to drafts, not auto-commit silently. Support multiple transactions, amount/currency recognition, dates when possible, and category suggestions. If ambiguous, visibly ask for correction or use a marked unassigned category. Show the final list before saving. No API key should be required for basic parsing.

### Voice
Use browser/device speech recognition where supported. Clearly request microphone permission, explain capability is browser-dependent, show editable transcripts, then parse to drafts and require confirmation. Provide text fallback when unsupported or denied. Do not silently upload voice recordings to external services.

### Editing/deleting/undo
Allow safe edit and delete with confirmation for destructive actions. Undo should reverse the operation safely. All mutations must be idempotent and immediately reflect across balance, categories, budgets, goals, insights and reports.

## 9. Smart categories

Default hierarchy:
- Food & Drinks: tea, coffee, snacks, breakfast, lunch, dinner, groceries, cafe, delivery.
- College: fees, books, stationery, printing, assignments, project components, events.
- Transport: bus, train, auto, cab, fuel, parking.
- Personal: clothes, grooming, personal care, shopping.
- Entertainment: movies, games, outings, hobbies.
- Bills & Subscriptions: mobile recharge, mobile data, subscriptions.
- Health & Fitness: medicines, appointments, gym, fitness expenses.
- Other: general/miscellaneous.

Savings allocation and transfers are transaction types, not purchase categories. Do not count them as expenses.

Allow user-created categories/subcategories, custom icons/colors, ordering, merge/rename where safe, and category rules. Suggest categories from prior user choices and descriptions, but user can always override them. Keep the category field quick; don't make classification a chore. Provide an uncategorized queue and clear handling for deleted/merged categories so historical transactions stay meaningful.

## 10. Spending insights and analytics

Support selectable periods: today, week, month, previous week/month, custom range, and all-time where meaningful.

Show:
- Category and subcategory totals and shares.
- Number of transactions per category.
- Average and median transaction amount where useful.
- Most frequent purchases/merchants.
- Small-purchase totals (e.g., under ₹50; threshold configurable).
- Trends vs previous comparable period.
- Daily/weekly/monthly trends.
- Biggest categories and changes.
- Recurring expense signals.
- Unusual changes, with plain-language explanation of how detected.
- Click-through to exact transactions supporting every insight.

Example: “You bought coffee 16 times for ₹25 each: ₹400 this month.”
Example: “Food & Drinks increased by ₹450 compared with the previous week, mainly due to snacks.”

Never invent insights or present weak inferences as facts. Explain when data is too sparse for a comparison. Use actual transaction values, not demo constants.

## 11. Money Leak Detector

Dedicated view that aggregates repetitive small purchases by category, merchant, preset, or similar description. Show frequency, total, average, period comparison, and their share of spending. Allow user to inspect exact transactions. Provide optional what-if scenarios, e.g. “If you made four fewer ₹25 coffee purchases next month, you would spend ₹100 less.” Do not assume every purchase is unnecessary; no shaming or manipulative language.

## 12. Budgets

Support total budget and per-category budgets, monthly by default, plus customizable periods where practical. Support user-defined limits and suggested limits based on historical spending. Show spent, remaining, percentage used, pace, and alerts when configurable thresholds are reached. Do not block a purchase for exceeding a budget. Changing historical records should correctly update budget performance. Make clear if a budget is a target rather than cash physically reserved.

## 13. Savings goals and pockets

Allow multiple goals with title, icon/image, target amount, current allocation, target date, contribution/allocation history, percentage, remaining amount, suggested periodic allocation, and completion state.

Allow allocations and releases. These are internal earmarks only and must not be recorded as expenses/income or change consolidated balance. If the user records a real purchase using money saved for a goal, record the real purchase as an expense and separately update/release the earmarked amount consistently. Explain this in the interface to prevent double counting.

Support goal editing, pause/archive, and a meaningful completion animation. Preserve transaction/allocation history when goals are archived or deleted; don't cascade-delete financial history silently.

## 14. Safe-to-spend and Pocket-Money Survival Mode

Let user set expected next allowance/income date, planned unpaid expenses, optional minimum reserve, and chosen savings targets. Display:
- Days until next expected income.
- Current tracked balance.
- Active savings allocation.
- Upcoming unpaid commitments.
- Flexible amount available.
- Suggested daily/weekly spending limit.
- Expected end-of-period balance based on a stated assumption.
- Warnings if recorded spending pace risks exhausting flexible funds early.

Show inputs and a short explanation for every calculation. Predictions are estimates, not guarantees. Handle a missing next-income date without fabricating a daily limit. Avoid subtracting expenses twice or presenting an allocated budget as if it were a bank account.

## 15. Parent Report Mode

Secondary but complete feature. User chooses a date range, reviews the report and explicitly chooses what to export/share. Include:
- Period and currency.
- Opening and closing tracked balances for that period (not today's balance mislabeled as historical).
- Income, actual expenses, refunds and net movement with transparent definitions.
- Category/subcategory totals, counts, percentages and useful charts.
- Detailed transactions if selected.
- Optional notes (e.g., college project components).
- Comparison with previous period when useful.

Export an actual PDF, CSV and copyable plain-text summary. PDF must be readable, professional and print-friendly. CSV must contain correct rows and amounts suitable for spreadsheet use. Provide a report preview and filters to include/exclude detailed transactions, notes, and categories. Validate that all report totals reconcile with the same domain calculations used by the app. Never automatically send reports to parents or third parties.

## 16. Gamification

Include XP, levels, daily/weekly streaks, optional quests, achievements, progress displays, and celebration effects. Example achievements: First 10 Transactions, 7-Day Logging Streak, No Mystery Money, First Savings Goal, Monthly Budget Achieved, Spending Detective, Weekly Review Complete.

Reward logging consistency, correct categorization, review, and user-chosen saving goals—not spending money, deprivation, or simply having a high balance. Do not punish legitimate expenses. Rewards must be stable and idempotent if a transaction is edited/deleted. Prevent repeated farming of the same achievement. Include optional reduced-motion setting and avoid manipulative streak pressure.

## 17. Reminders and recurring templates

Support configurable optional reminders for missed logging, weekly review, upcoming allowance, approaching budgets, upcoming commitments, and savings reviews. Let user choose frequency and disable all reminders. No noisy notifications by default.

Allow recurring income/expense templates and future reminders. Make it clear whether an item is only a reminder/forecast or has actually occurred. Do not book a future transaction as actual spending/income until due/confirmed, unless the product explicitly supports a clearly labeled scheduled transaction state. Prevent duplicate recurring entries.

## 18. Visual design and motion

Target aesthetic: premium modern fintech with personality; polished, not generic admin template and not childish. Midnight/charcoal default theme, violet as primary accent and restrained lime/green for positive progress, plus a coherent light theme. Clean typography, excellent spacing, attractive surfaces, clear data hierarchy, subtle gradients, high-quality icons, responsive charts, and custom empty/loading/error states.

Use smooth balance number transitions, progress rings/bars, chart transitions, new-transaction feedback, category-card interaction and achievement celebration. Animation should be quick and never block user actions. Respect `prefers-reduced-motion`, accessible contrast, keyboard navigation, focus states, screen readers, form labels and touch target sizes. No full-screen animation every time a user records ₹10.

Design the complete product consistently, not just the dashboard. Use real responsive components and actual app data. The user can select theme and motion preferences.

## 19. Database/data architecture guidance

Design a normalized schema. At minimum consider:
- profiles/preferences.
- financial accounts/tracked sources and opening balance/effective date.
- transactions/ledger entries.
- categories/subcategories.
- budgets.
- savings goals and allocation ledger.
- recurring templates/schedules.
- planned/committed future expenses.
- notification preferences/notification records.
- achievements, XP events, quests and streak state.
- sync/idempotency metadata as necessary.

Use foreign keys, indexes, constraints, timestamps and migrations. Every user-owned row must have an owner relationship. Configure Supabase Row Level Security (RLS) for every private table; test cross-user access denial. Use server-side authority for sensitive operations and never ship the service-role key to the browser. Be deliberate about atomic multi-row changes (e.g., transfers, allocation, batch logging) and rollback behavior.

Avoid duplicating derived totals across the database unless there is a tested reconciliation strategy. Prefer authoritative ledger records and centralized domain logic; use safe caches/materialized views only when warranted and verifiably consistent.

## 20. Offline and synchronization

Use a durable local queue (IndexedDB or equivalent) and a stable client-generated UUID/idempotency key for each pending operation. Show pending, synced, and failed status. Retry safely. Do not retry a failed mutation in a way that duplicates a transaction. Handle edit/delete races and sync conflicts explicitly; preserve data and let the user resolve an actual conflict if it cannot be safely merged. Do not imply reliable offline capability until tested.

## 21. Security, privacy and data ownership

- Secure authentication and session handling.
- RLS policies on all private financial data.
- No secrets in client code, repository, screenshots or sample `.env` values.
- `.env.example` contains placeholders only.
- Validate all inputs at boundaries; never trust client-supplied `user_id` or totals.
- Do not transmit expense details to an external AI service by default.
- Do not auto-share reports.
- Let users export their data and request account deletion, with clear consequences and confirmation.
- Handle logs and error reports without leaking transaction contents or secrets.

## 22. Testing requirements

Write meaningful tests for:
- Paise arithmetic and INR formatting.
- Initial/opening balance and effective date.
- Income, expense, refunds, transfers, allocations and releases.
- Edit/delete/undo and duplicate submission prevention.
- Period boundaries and historical opening/closing balances.
- Category/subcategory aggregation and period comparison.
- Budgets, thresholds, pace and budget edits.
- Savings goals and safe-to-spend calculations.
- No double subtraction of paid expenses/commitments.
- Text parsing, ambiguity and batch confirmation.
- PDF/CSV totals vs ledger totals.
- Offline queue retries and idempotent sync.
- RLS ownership and cross-account access denial.
- Rewards/achievements idempotency.

Use unit, integration and where practical browser-level tests. Do not alter/delete tests just to obtain a passing result; fix the underlying implementation. If browser automation is available, verify primary journeys at mobile and desktop viewport widths.

## 23. Required acceptance checklist

The product is not done unless all are true:
- [ ] Registration, login and recovery work with real configured auth.
- [ ] All user data is private and protected by tested access rules.
- [ ] Adding income and expense updates correct balance immediately.
- [ ] Quick-add presets/custom amounts work.
- [ ] Text and voice routes create reviewable drafts and confirm before save.
- [ ] History, search, filters, editing, deletion and undo work.
- [ ] Category/subcategory totals reconcile with transactions.
- [ ] Insights point to real supporting records and handle sparse data honestly.
- [ ] Money Leak Detector groups and totals correctly.
- [ ] Budgets/alerts recalculate on changes.
- [ ] Savings allocations do not count as purchases or reduce consolidated total balance.
- [ ] Transfers between owned accounts do not inflate consolidated income/expense.
- [ ] Safe-to-spend and allowance predictions avoid double counting.
- [ ] Parent report balances and totals reconcile for the selected historical period.
- [ ] PDF/CSV exports are real and contain correct data.
- [ ] XP, streaks, quests and achievements work consistently.
- [ ] PWA works on supported devices; responsive app works on laptop/mobile.
- [ ] Offline entries persist and sync without loss or duplication, or any unsupported edge case is clearly identified.
- [ ] Loading, empty, error, permission-denied and offline states are handled.
- [ ] No required action is a placeholder or fake success.
- [ ] Lint/typecheck/tests/production build are run and failures are addressed.
- [ ] Setup documentation accurately describes what needs a real Supabase project/credentials.

## 24. Definition of delivery

Deliver the real integrated app, not merely source snippets, design mockups or a plan. Include:
- Working source code and organized components.
- Database migrations/schema and RLS policies.
- `.env.example` with safe placeholders.
- Clear local run/setup instructions, including required Supabase setup.
- Tests and the commands needed to run them.
- A concise `PROGRESS.md` recording implementation state and known limitations.
- Final report of what was implemented, commands actually run, tests/build results, and any remaining blocker that genuinely depends on user-provided credentials or unavailable infrastructure.

Do not claim production readiness or successful external setup without verification.
