# PocketPulse — Feature Report (for design review)

_Written from the code on 2026-11-05 (commit `12e33ff`). Nothing was run for this report._

## What it is

- A personal-finance web app (installable PWA) for students: record tiny expenses fast, see where money goes, and save.
- Money is exact (integer paise), INR and Indian number grouping by default, Asia/Kolkata timezone by default.
- Data is private per user (Supabase with row-level security). A report for parents can be exported, but only by the student, by hand.

## Screens

**Public**

- **Welcome `/welcome`**: landing page for signed-out visitors. Links to register and sign in.
- **Register / Login / Forgot / Reset `/register` `/login` `/forgot-password` `/reset-password`**: real email-and-password auth. Rate-limit errors are shown in plain words. Signed-in visitors are sent to Home.
- **Onboarding `/onboarding?step=…`**: a 6-step wizard: region (currency, timezone, week start), starting balance and its date, income, budgets, a goal, preferences. Every step can be skipped, and "Skip setup" ends it. A default "Cash" wallet is always created. Currency locks once any entry exists.
- **Offline `/offline`**: shown by the service worker for a screen that isn't saved on the device. It checks the server before reopening the real page.

**Home and recording**

- **Home `/home`**: "Tracked balance · all wallets · now" (animated count), spent today, spent this month, a scrolling quick-add row with "repeat last" and "log again", the 5 most recent entries, a monthly budget snapshot and goal snapshots. Shows a "Finish setting up" card when onboarding was skipped. Entries queued offline are listed and labelled as not yet in the figures.
- **Quick add `/add`**: a grid of tiles (12 defaults, no amounts preset), repeat last, frequent shortcuts, and a tile editor (rename, icon, amount, category, hide, reorder). Tapping a tile opens a sheet to confirm the amount. If you change the amount you're offered "Make ₹X the usual amount".
- **Type it `/add/text`**: write one or more entries in plain words ("chai 20, bus 15 yesterday"). The parser makes drafts. You review and edit them, then confirm, and all are saved together or none are.
- **Say it `/add/voice`**: tap to dictate (browser speech recognition, one phrase per tap). The transcript goes into the same text box and the same review step. The page says the browser's speech service may process the audio. Typing stays available.
- **Full form `/transactions/new`**: expense, income, refund or transfer, with wallet, category/subcategory, date, note and merchant. Category suggestions come from your rules and past entries (on the device, no AI).

**Activity**

- **Transactions `/transactions`**: history with search and filters (type, wallet, category, period, amount). Filtered views opened from an insight are tagged for the Spending Detective achievement.
- **Entry detail / edit `/transactions/[id]` `/transactions/[id]/edit`**: full detail, linked refunds, a "before opening date" note, repeat, record a refund, edit, delete with Undo. Missing or other users' ids give a real 404.
- **Wallets `/accounts`**: create and edit wallets (name, type, opening balance and date), set the default, archive and restore. Shows the balance of each now.
- **Categories `/categories?tab=…`**: hierarchy with icon and colour, reorder, archive, merge. Rules with a live tester. An "Uncategorized" queue to clear.
- **Income & recurring `/recurring`**: what's due and upcoming (labelled forecast, reminder or planned), recurring templates (pause, skip, confirm), one-off bills (pay, cancel), skipped items, and what actually happened.

**Insights**

- **Insights `/insights`**: period picker, totals, insight cards, a trend chart, category breakdown, comparison with the previous period, frequent, unusual and recurring spending. Every figure links to the exact entries behind it in History.
- **Category `/insights/category/[id]`**: one category's spending, its subcategories, trend and entries.
- **Money leaks `/insights/leaks`**: groups of repeated small purchases ("You logged Bus 4 times for ₹20 each: ₹80 this month"), each with what-if sliders ("If you logged 2 fewer…").

**Plan**

- **Budgets `/budgets`**: total and per-category budgets, monthly, weekly or custom. Suggested limits (median of up to 3 full months), alert thresholds, pace projection, last period. "A target, not reserved money" is always shown.
- **Savings goals `/goals` and `/goals/[id]`**: progress ring, remaining, suggested amount, forecast, set aside or release money, "I bought it", pause, complete, archive, history. Marking complete plays a short celebration.
- **Safe to spend `/safe-to-spend`**: how much is free to spend per day and week until the next income date, with every input and its explanation. Without a next income date it shows no limit and asks for one.
- **Survival mode `/survival`**: a tighter view of the same numbers. It shows a status (fine, watch, at risk, too early), "day 12 of 30", today against the daily amount, and the bills ahead.

**Other**

- **Parent report `/reports`**: choose the period and what to include (categories, notes, wallets). Shows a preview, a comparison, and PDF, CSV and copyable text. The choices live in the URL. If the totals don't reconcile, the preview warns you not to share it. Hidden categories are folded into "Other categories".
- **Rewards `/rewards`**: level, XP bar, daily and weekly streaks, optional quests, achievements.
- **Reminders `/reminders`**: notification centre (read, dismiss, mark all), switches per reminder type, schedule, and opt-in browser notifications. A bell in the header shows when something is unread.
- **Settings `/settings`**: name, theme and motion (synced), currency, timezone, week start, income, small-purchase threshold, reminders, privacy.
- **Privacy, Sync, Data `/settings/privacy` `/settings/sync` `/settings/data`**: privacy explanation and the report default. Sync centre (everything on this device not yet on the server, conflict choices, install app). JSON and CSV export. Account deletion, which needs a typed phrase and your password.

## Main flows

- **Quick add:** tap a tile → a sheet opens with the amount (empty, or the usual one) → Save → toast with Undo. The id is fixed when the sheet opens, so a double tap or retry can't save twice. The rewards update in the background afterwards.
- **Typed or voice entry:** type or dictate → the parser splits it into entries, amounts, dates (including "kal", "aaj", "parso" and Devanagari) and category suggestions → a review list with editable drafts → Confirm saves all at once. A misheard "call" in voice is read as "kal", and the draft says so.
- **Insights:** pick a period → the figures come from one domain model → tap any figure → History opens with the matching filters.
- **Money leaks:** entries are grouped by tile, description, merchant or category under the small-purchase threshold → each group shows count, unit price and total → the what-if shows the saving.
- **Budgets:** create (or accept a suggestion) → spent equals expenses minus refunds → thresholds raise alerts in the notification centre → the pace projection starts after 10% of the period.
- **Goals:** create → set money aside (an earmark: it moves no money and isn't spending) → release, or "I bought it" (a real expense plus a release, saved together and undone together).
- **Safe to spend:** balance now − money set aside for goals − unpaid bills due before the next income − an optional reserve → divided by the days left. It needs a next income date in the future, and doesn't roll a passed date forward without you.
- **Survival mode:** reads the same calculation and adds a status, the day count and today's spending against the daily amount.
- **Bills and recurring:** a template forecasts dates → confirm creates the real entry, skip marks that occurrence skipped → deleting the entry makes it due again. One-off bills are paid by linking an entry.
- **Parent report:** choose options → preview → download PDF or CSV, or copy text. The same report model feeds all four. Nothing is sent anywhere.
- **Rewards:** see the next section.
- **Reminders:** checked when the app opens and every 30 minutes while it stays open (missed logging, weekly review, upcoming income, bills, savings review, budget alerts). Nothing arrives while the app is closed, and the screens say so.
- **Offline:** an entry made offline (or whose send fails or takes over 15 seconds) is stored on the device and shown as "Saved on this device". It syncs when you're back online, using the same id, so a replay is detected as a duplicate. Conflicts wait in the sync centre for your choice. Budgets, goals, wallets, categories and settings can't be changed offline, and those forms say so.
- **Settings:** each section saves on its own. Theme and motion sync across devices.

## Current design

- **Colours:** a midnight/charcoal base (oklch, blue-violet hue 278), a violet primary (oklch 0.70 0.19 293 in dark, 0.50 0.23 292 in light), a lime/green "positive" colour kept for progress and success, amber for warnings, red for destructive actions. The celebration confetti uses violet, lime, pink, sky blue, yellow and lavender.
- **Theme:** dark (midnight) by default, plus light and "match device". Uses next-themes with CSS variable tokens, and the choice syncs to the profile. The font is Geist, self-hosted.
- **Phone:** a top bar (logo, bell, theme, account, a "More" sheet for every section), a bottom navigation with 5 tabs (Home, Activity, Insights, Plan, Reports) plus an Add button, and section tabs at the top of related screens. Layout respects the safe areas.
- **Laptop (≥1024 px):** a sticky left sidebar with grouped sections (Home, Record, Activity, Insights, Plan, Report, You) and an "Add expense" button. The top bar has "Add expense", the bell, theme and account. Content is at most 6xl wide.
- **Components:** shadcn-style cards, sheets, dialogs, segmented controls, badges and meters. Toasts with Undo. Every page shares skeleton, empty, error and offline states.
- **Animation:** a 180 ms fade and rise on page change, an animated balance count, a highlight on a new entry, and a celebration pop and burst on goal completion and new achievements. Users can choose system, reduce or full motion. Reduced motion turns off CSS animations and Motion movement.

## Gamification as it works now

- **XP sources (fixed):** 10 per day you logged something, 15 per "clean week" (every expense categorised, at least 3 expenses), 10 per week you set money aside, 25 per month within your total budget (budget created before the month ended, at least 5 purchases), 10 per weekly review. Achievements and quests add their own XP.
- **Levels:** level n starts at 50·n·(n−1) XP, so each level needs 100 XP more than the one before (0, 100, 300, 600…).
- **Streaks:** daily and weekly, current and longest. A day counts by when the entry was logged, not the date on it, so backdating can't fill a streak. A streak stays current until a whole day or week passes, and the copy never says "lost" or "broken".
- **Quests (optional, can be hidden and brought back):** Log today (daily, 5 XP), Clear the uncategorised queue (weekly, 20), Weekly review (weekly, 15), Save on purpose (once, 20).
- **Achievements:** First 10 Transactions (50), 7-Day Logging Streak (70), No Mystery Money (60), First Savings Goal (40), Monthly Budget Achieved (100), Spending Detective, from opening entries behind 5 insights (40), Weekly Review Complete (30).
- **Rules:** XP never depends on how much you spend, and spending is never penalised. Each award has a unique key, so nothing is earned twice and nothing is taken back after an edit. Awards are calculated on the server and written with the admin key, so a browser can't grant itself XP.
- **When it updates:** in the background after each saved entry, and when `/rewards` opens.
- **Where it shows:** only on `/rewards` (in the sidebar under "You", and in the "More" sheet on phones). It shows level and XP bar, two streak cards, quest cards with a "Done" badge or their XP, and the achievement list. A celebration greets new achievements once per device, and only on that page. Home, quick add and the entry toast show no XP, streak or level.

## Known problems and confusing parts (user's view)

- **Rewards are invisible during use.** Logging gives no XP or streak feedback, and achievements are only celebrated when you visit `/rewards`, which is hidden under "More" on phones.
- **Quick add isn't one tap by default.** The default tiles have no amount, so every tap opens a sheet. It only becomes fast after you set "usual amounts" one by one.
- **Too many ways to add:** Home row, Quick add, Type it, Say it, Full form, and Repeat or Log again. A new user may not know which to use.
- **Several "how much do I have" numbers:** tracked balance, safe to spend, survival daily amount, budget remaining (a target, not money) and goal earmarks. The difference between them takes reading.
- **Safe to spend and Survival mode overlap,** and both show no limit until a next income date is set. A student with irregular income gets less from them.
- **Opening-balance date rule:** an entry dated before a wallet's opening date doesn't change the balance. It's explained with a note, but it surprises people.
- **Navigation grouping:** on phones, Wallets, Categories and Recurring sit under "Activity", and Goals, Safe to spend and Survival under "Plan". Rewards, Reminders and Settings are only in "More".
- **Offline limits:** only entries work offline. Queued entries aren't in the figures until they sync, and syncing happens only while the app is open.
- **Reminders only while the app is open.** There are no push notifications, so "missed logging" can't reach a closed app.
- **Goal purchase edge case:** deleting a goal's purchase from History doesn't put the money back. A note offers "Set ₹X aside again" or "Keep it flexible".
- **Voice:** the guesses for misheard day words ("call" → "kal") can misread a real call ("call mom 50"). The draft shows the note, but users must check it.
- **Not yet tried on a real phone** (the app isn't deployed): install, offline, Safari/iOS and speech on a phone are unverified.
