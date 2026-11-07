# PocketPulse — Design Plan

The design source of truth for the redesign (Design phases 1–4). `PROJECT_SPEC.md` still owns the product; `doc/REDESIGN_BRIEF.md` is the original brief, with these standing overrides from you:

- Brief §9 (speed) is done. No page may get slower.
- No "show me the layout first" step before each screen: this plan is that layout.
- The label stays **"Safe to Spend"**. Every existing route stays where it is.
- Inspiration only. No Solo Leveling names, words, symbols or assets, and no letter ranks (E…S). The tone is mature and restrained.
- Free fonts and libraries only. Geist stays.

Phases: **Design 1** = audit, this plan, foundation (tokens, type, spacing, Surface, Button, Progress, empty state, notifications). **Design 2** = navigation, Home, Quick Add. **Design 3** = Player Status, Missions, Achievements, Rewards, XP feedback. **Design 4** = every remaining screen.

---

## 0. Audit (Design 1, step 1)

Heuristic review of the signed-in app on 2026-11-06. Dark mode, 375 × 812 and 1440 × 900, 18 screens, the shared test account (little spending, many goal moves). The numbers come from a script that read computed styles in `#main` on every screen at 375 px.

### Top inconsistencies, worst first

| # | Area | What was found | Severity |
| --- | --- | --- | --- |
| 1 | Tap targets | **No tappable control on any screen reaches 44 px at 375 px.** Buttons are 36 or 40 px tall, switches 24 px, section tabs and period chips 40 px. Reminders had 44 under-size targets, Categories 256 (mostly 36 px icon buttons per row). | High |
| 2 | Empty states | Three styles: a dashed `StatePanel` (Insights, Budgets, Safe to Spend), a plain card with a sentence and an outline button (Home budget/goal), and bare sentences in lists. Budgets' empty panel has **no action in it**: "Add budget" sits at the top right, away from where the eye lands. | High |
| 3 | Buttons | Seven variants (two unused). The primary button glows, and on desktop there are two glowing "Add expense" buttons on screen at once (sidebar + header). `outline` is used 64 times and the primary 4, so "the one thing to do here" rarely stands out. Heights in use: 24, 36, 40 px. | High |
| 4 | Surfaces and radii | Four radii on bordered boxes (10, 14, 18, 24 px), plus pills. Cards are 24 px, which looks soft for finance next to 10 px controls. 20 places hand-roll `rounded-2xl border` instead of using `Card`, so borders and shadows drift. | Moderate |
| 5 | Colour meaning | Lime green means money (income, under budget) **and** XP (the Rewards level bar). Violet means primary action, active nav, focus, the new-entry wash and progression all at once. There's no colour for "estimate" or "set aside", so forecasts and earmarks look like real money. | Moderate |
| 6 | Type sizes | Mostly 12/14/16/24/36, with strays: 18 px (Safe to Spend, Reports) and 30 px (Wallets, Goals). Page descriptions are 16 px and run 2–3 lines on phones on every screen. Home's three figures (balance, today, month) get equal cards, so the balance doesn't lead. | Moderate |
| 7 | Money numerals | Not tabular in Wallets ("Opening balance ₹…" ×8), Goals ("₹500 to go" ×8) and Reports' sentences. A zero earmark is shown as "−₹0". | Low |
| 8 | Spacing | Section gaps vary between 24 and 32 px with no rule. Card padding is 20 px everywhere, including tiny tiles. | Low |

### Top friction points, worst first

| # | Friction | Evidence | Severity |
| --- | --- | --- | --- |
| 1 | **Logging is below the fold on phones.** | Home at 375 px stacks three full-width figure cards (~600 px) before Quick add. The first tile row starts at ~670 px, and the bottom bar plus the floating + button cover it. The main job needs a scroll first. | Critical |
| 2 | Every tile opens a sheet. | All 12 seeded tiles read "Any amount", so a ₹10 tea is tile → type → save, every time. (Design 2 fixes this with the usual-amount flow from the brief.) | High |
| 3 | Progression is invisible. | XP, level and streak exist only on `/rewards`, which is the third-last item in a sidebar that scrolls at 900 px tall. Home shows nothing about progress. | High |
| 4 | Clipped horizontal rows. | On phones the Record tabs cut off at "Fu…" and the period chips at "Last week", with no visible way to scroll. | Moderate |
| 5 | Noisy lists. | Goal moves ("Set aside for a goal", "Released from a goal") fill Home's Recent with one generic tag icon each. Transactions renders all 95 rows at once on a phone (6,300 px page). | Moderate |
| 6 | "Are you sure?" for reversible actions. | Deleting an entry asks in a dialog, although delete is soft and Undo already exists. | Moderate |
| 7 | Repeated disclaimers. | "Not a bank balance", "a target, not reserved money" and similar sentences appear in full on every card. They're true and needed once per view, not per card. | Low |
| 8 | Reports take a mobile tab. | Reports is the secondary job (CLAUDE.md), yet holds one of five tabs, while Player Status has none. | Low |
| — | Not a design issue, logged | In `next dev`, a hydration mismatch is reported on some signed-in screens ("3 issues" on `/rewards`). Production builds don't show the overlay. It's recorded in PROGRESS.md as a separate bug to investigate. | — |

What works and must stay: honest labels on every figure, real empty states with real actions, Undo toasts, `data-paise` on figures, reduced-motion handling, the sidebar concept, and the single navigation config.

---

## 1. Strategy

### The job

> **When** I've just paid for something small, **I want to** log it in a couple of seconds, **so that** at the end of the week I know where my money went and can choose what to change.

- **Functional:** log small spends fast and accurately; see what's left; see where it went.
- **Emotional:** feel in control, not judged.
- **Social (secondary):** share an honest report with a parent when they choose to.

Every screen is ranked by how much it serves this job. Logging and "where did it go" lead; plans support them; progression rewards the habit; reports come last.

### North Star

**Logged days per week:** the number of distinct local days in the last 7 on which the user logged at least one entry, counted by when it was logged (the same rule as the `logged_day` reward key, so backdating can't inflate it).

- Why this measure: it tracks the habit that makes every other figure trustworthy. It's a leading indicator of the user understanding their money, and it doesn't reward spending less or saving more, which could push unhealthy behaviour.
- It is never shown as a score to beat. The user sees it as a plain count ("Logged 5 of the last 7 days"), with no red and no loss wording.
- Input measures for us (no tracking is added for these; they guide design decisions and manual checks): time from tap to saved for a tile with a usual amount (target under 2 s, one tap); share of entries via one-tap tiles; share of expenses left Uncategorized; weekly reviews completed.

### How each game element serves the job

| Element | What it rewards | How it serves the job | Guard rail |
| --- | --- | --- | --- |
| XP | Logging, categorising, reviewing, setting aside on purpose | Makes the boring habit feel noticed | Never for spending less or saving more. Server-awarded only. Daily XP and mission progress follow the entries that exist: undoing or deleting the entry behind an award revokes it, and earning it again restores the same row (Design 2). Achievements are unique and can't be farmed, so they stay unlocked with their XP (Design 3) |
| Level and rank | Total XP over time | A long-term sense of consistency | Rank names are plain words, no letter grades, no fantasy titles |
| Streak (days, weeks) | Days and weeks with something logged | Shows the habit, the North Star in disguise | Only a count. No "lost", "broken" or "at risk" wording, no reminders about it |
| Missions | Daily: log today, look at today. Weekly: clear Uncategorized, weekly review, move money to a goal | Each mission is a step of the job: record, then understand | Optional, skippable, no penalty. Never "buy" or "save X" |
| Achievements | Milestones of the habit | Marks real progress at long intervals | Rare by design. No random rewards |
| Player Status | Reflection on all of the above | A calm place to see the habit | Never on top of money figures |

### Ethics check

- **No guilt:** spending is shown in neutral text colour, not red. Red means only "over a limit you set" or an error. No "you failed", "only", "again", or a sad face.
- **No pressure to spend:** nothing rewards a purchase. Safe to Spend is labelled as an estimate and never phrased as an allowance to use up.
- **No pressure to over-save:** no mission sets a savings amount. Goals can be paused without loss.
- **No dark patterns:** no countdowns, no streak-loss alerts, no confirmshaming, no variable rewards, no hidden opt-outs, no automatic sharing. Notifications are opt-in.
- **An off switch:** Design 3 adds "Show progress features" in Settings. When it's off, Home and navigation show no XP, level or missions, and nothing else changes.
- **Pre-mortem:** "A year from now this hurt someone." Most likely: a student logs fake entries for XP. Mitigation: XP per day is capped by the existing rules (one `logged_day` award per day), so extra entries earn nothing.

---

## 2. Tokens

Three layers in `src/app/globals.css`. Components only use layer 2 or 3, never raw colours. All colours are oklch.

### Layer 1: base palette (`--pp-*`)

Raw values, theme-independent. Nothing outside `globals.css` may use them.

| Family | Steps | Purpose |
| --- | --- | --- |
| `--pp-ink-50 … 950` | 12 steps, hue 275, chroma ≤ 0.025 | Midnight/charcoal neutrals (dark) and cool greys (light) |
| `--pp-violet-200 … 700` | 300 pale, 400 electric, 600 deep | Identity and progression |
| `--pp-blue-300 … 600` | Muted electric blue | Estimates, information |
| `--pp-green-300 … 600` | Restrained green, hue 150 | Money in, success |
| `--pp-amber-300 … 600` | Restrained amber | Warnings |
| `--pp-red-300 … 600` | Muted red | Over limit, destructive, errors |
| `--pp-silver-300 … 500` | Near-neutral cool silver | Earmarked (set aside) money, rank accent |

### Layer 2: meaning

Redefined per theme (dark is the default; `.light` overrides). The existing shadcn names (`--background`, `--card`, `--primary`, …) stay as layer-2 aliases so every screen keeps working while it waits for its redesign.

| Group | Tokens |
| --- | --- |
| Surfaces | `--surface-page`, `--surface-1` (cards), `--surface-2` (raised: hero, popovers), `--surface-inset` (wells inside a card), `--surface-overlay` (sheets, dialogs, toasts) |
| Text | `--text-primary`, `--text-secondary`, `--text-tertiary` (meta only, still ≥ 4.5:1 at 12 px) |
| Lines | `--border-subtle`, `--border-strong`, `--focus-ring` |
| Action | `--action-primary`, `--action-primary-hover`, `--action-primary-text` |
| Money | `--color-money-positive` (income, refunds, under a limit), `--color-money-neutral` (spending: plain text, never red), `--color-money-negative` (over a limit, below zero), `--color-money-estimate` (forecasts, Safe to Spend), `--color-money-earmark` (set aside for goals) |
| Progress | `--color-progress-xp`, `--color-progress-money`, `--color-progress-track`, `--color-rank` |
| Feedback | `--color-feedback-{success,info,warning,error,offline}` plus `-soft` backgrounds |
| Gradients | `--gradient-xp`, `--gradient-status-edge`, `--gradient-page` (the only three gradients allowed) |

Meaning rules: green = money in or done; violet = action and progression; blue = estimate or information; silver = set aside; amber = attention; red = over a limit you set, or an error. Spending itself has no colour.

### Layer 3: component

`--button-*`, `--surface-card-*`, `--surface-hero-*`, `--progress-*`, `--notice-*`, `--toast-*`, `--empty-*`. Each references layer 2 only. A component's look changes by editing its tokens, not its class list.

### Scales

| Scale | Values |
| --- | --- |
| Radius | `--radius-sm` 6 px (marks, small chips) · `--radius-md` 10 px (buttons, inputs, list rows) · `--radius-lg` 14 px (tiles, wells) · `--radius-xl` 18 px (cards) · `--radius-2xl` 24 px (sheets, dialogs) · full (pills, avatars, progress). Tailwind's `rounded-lg` and `rounded-md` both resolve to 10 px, `rounded-xl` to 14 px, `rounded-2xl` to 18 px and `rounded-3xl` to 24 px, so existing classes land on the scale |
| Type (Geist Sans) | `caption` 12/16 · `body` 14/20 · `heading` 16/24, semibold · `title` 24/30 (22/28 on phones), semibold, tight · `display` 36/40 (32/38 on phones), semibold, tight, tabular. Utilities: `.type-caption`, `.type-body`, `.type-heading`, `.type-title`, `.type-display`, and `.money` (tabular, slashed zero) |
| Spacing (4 px base) | `--space-gutter` 16 / 24 / 32 px (phone / tablet / desktop) · `--space-surface` 16 / 20 px · `--space-stack` 12 px · `--space-section` 32 / 40 px. Tailwind: `p-gutter`, `gap-section`, `p-surface`, `gap-stack` |
| Elevation | 0 inset (no shadow) · 1 card (hairline + top inner highlight) · 2 raised (soft shadow) · 3 overlay (deep shadow). Shadows are tinted with ink, never pure black |
| Motion | `--duration-instant` 100 ms · `--duration-quick` 160 ms · `--duration-standard` 220 ms · `--duration-emphasis` 280 ms. `--ease-out` cubic-bezier(0.2, 0.8, 0.2, 1). Nothing longer than 280 ms per element |
| Tap target | `--tap-min` 44 px on coarse pointers; 40 px allowed on mouse-only desktop |

---

## 3. Component specs

Every component has: default, hover, focus-visible (2 px ring in `--focus-ring`, 2 px offset), pressed, disabled, loading, empty, error, success, offline. Where a state doesn't apply, the table says what happens instead. Built in Design 1: Surface, Button, Progress, StatePanel (empty state), Notice, Toast. Specified now, built in the phase that first needs them: MoneyFigure, ListRow, QuickTile, PlayerChip, MissionRow, AchievementBadge.

### Surface (`src/components/ui/surface.tsx`; `Card` is the same component)

- **Anatomy:** container · optional header (title, meta, trailing action) · body · optional footer.
- **Variants (5):** `card` (default; content group) · `hero` (the one main figure on a screen; `--surface-2`, a 1 px top edge from `--gradient-status-edge`) · `inset` (a well inside a card: notes, breakdowns; no border, no shadow) · `interactive` (the whole surface is a link or button) · `status` (progression panels only; violet hairline edge; never wraps money).
- **States:** hover (interactive only: border to `--border-strong`, surface lightens one step) · focus-visible (ring) · pressed (interactive: scale 0.99, 100 ms) · disabled (interactive: 60 % opacity, `aria-disabled`, no hover) · loading (`aria-busy`, children replaced by skeleton lines in the same box size, so nothing jumps) · empty (contains a `StatePanel size="section"`) · error and offline (contains a `Notice`) · success (no special look; feedback goes to toasts).
- **Rules:** one card style. No card inside a card; use `inset` instead. Padding is `--space-surface`.

### Button (`src/components/ui/button.tsx`)

- **Anatomy:** optional leading icon · label · optional trailing icon or count. Icon-only buttons need `aria-label`.
- **Variants (5):** `default` (primary: one per view region) · `outline` (secondary) · `ghost` (tertiary, toolbars) · `positive` (confirming a money-in or completion step) · `destructive` (only for irreversible actions; reversible ones use Undo). The unused `secondary` and `link` variants are removed.
- **Sizes:** `sm` 36 px, `default` 40 px, `lg` 48 px, `icon` 40 px, `icon-sm` 36 px. **On coarse pointers every size is at least 44 px.**
- **States:** hover (one step lighter, 160 ms) · focus-visible (3 px ring) · pressed (scale 0.98, 100 ms) · disabled (50 % opacity, no pointer events) · loading (`loading` prop: spinner replaces the leading icon, label stays so the width doesn't jump, `aria-busy`, disabled) · offline (actions that queue stay enabled; actions that need the server are disabled and the view shows an offline `Notice` saying why; the button never silently fails) · error and success (shown by the Toast or Notice, not the button).
- **Rules:** no glow. One primary per region. Labels are verbs ("Save entry", not "OK").

### Progress (`src/components/ui/progress.tsx`)

- **Anatomy:** optional label row (label left, value right, tabular) · track · fill · optional over-limit marker · optional step separators.
- **Variants via `tone` (5):** `money` (green; budgets used, goal saved) · `xp` (`--gradient-xp`) · `warning` (amber; past an alert threshold) · `over` (red; past 100 %) · `neutral` (ink; counts like 4 of 7 days).
- **Input:** basis points (integers, as the domain gives them), or `steps` + `value` for segmented counts. Clamped to 0–100 % for drawing; values over 100 % draw full with an over marker and keep the real value in `aria-valuetext`.
- **States:** empty (0: track only, value text says "0 %" or "Not started") · loading (`indeterminate`: a calm 1.2 s sweep, static under reduced motion) · complete (full, check icon in the label row) · over (full + marker) · disabled (ink tone, 60 % opacity) · error and offline (n/a: the parent shows a Notice). Width changes animate over `--duration-emphasis`, never under reduced motion.
- **Accessibility:** `role="progressbar"`, `aria-valuemin/max/now` and `aria-valuetext`; `aria-label` or `aria-labelledby` required.

### StatePanel = the empty state (`src/components/states/state-panel.tsx`)

- **Anatomy:** icon in a soft square · title (heading) · one or two lines of body · primary action · optional secondary action.
- **Variants (4):** `empty` · `error` (`role="alert"`) · `offline` (`role="status"`) · `denied` (`role="alert"`).
- **Sizes:** `page` (the whole view is empty; centred, 48 px vertical padding) · `section` (inside a card; left-aligned, compact).
- **States:** default only; loading is a skeleton, not a StatePanel.
- **Rules:** a new user's empty state always says what will appear here and gives the one action that makes it appear (the action is inside the panel). No dashed borders. No illustrations; one icon.

### Notice (`src/components/feedback/notice.tsx`)

The persistent, in-page message (a budget alert, offline, a data note).

- **Anatomy:** icon · optional title · body · optional action · optional dismiss.
- **Variants (5):** `info` · `success` · `warning` · `error` (`role="alert"`) · `offline`. All others are `role="status"`.
- **States:** default · dismissible (close button, 44 px tap area) · with action (link or button, ghost style) · loading (n/a). Hover and focus apply to its action only.

### Toast (`src/components/feedback/toast.tsx`)

The transient confirmation after an action. One at a time, above the bottom bar on phones, bottom right on desktop. `role="status"`, 8 s, pauses on hover or focus, survives navigation.

- **Tones (5), the feedback ladder from the brief:** `success` (entry saved: small) · `error` · `info` · `progress` (XP earned, mission progress: violet edge, still small) · `milestone` (mission completed, achievement, level up: violet edge and title line, 10 s). Level-up's moment is `feedback/level-up.tsx` (Design 3). All of them go through one queue, `lib/feedback-queue.ts`: one visible at a time, rewards in ladder order, Undo cancels what its save earned.
- **Quieter when routine:** a toast marked `routine` (saving a tile, repeating an entry) drops its slide-in and shrinks to the compact layout after the third routine toast within two minutes. Undo is always kept.
- **States:** default · hover/focus (paused) · action running (spinner in the action button, buttons disabled) · error (destructive edge).

### Specified now, built later

| Component | Anatomy | Variants | Notes |
| --- | --- | --- | --- |
| MoneyFigure | label · amount (`.money`) · scope line | `display`, `stat`, `inline` | Always shows scope ("all wallets · now"). Estimates get the estimate colour and the word "estimate". Never animated under reduced motion. Keeps `data-paise` |
| ListRow | leading icon · title · meta · trailing amount · chevron | `entry`, `setting`, `nav` | 56 px min height on phones. Amount right-aligned, tabular. Goal moves get a silver icon, not the generic tag |
| QuickTile | icon · label · usual amount | `ready` (has amount), `setup` (no amount), `custom` | Ready = one tap saves; long-press and a visible ⋯ button both open edit. Pressed 100 ms; saved = 600 ms check, then back |
| PlayerChip | level ring · rank word · XP to next | `compact` (Home, sidebar), `header` (avatar ring on phones) | Opens Player Status. Never larger than the balance |
| MissionRow | status mark · title · progress · XP · reset period · Skip | `daily`, `weekly`, `long-term` | Done = check and muted; skipped = "Skipped · Bring back" |
| AchievementBadge | glyph · name · rule · progress or date | `locked`, `in-progress`, `unlocked` | Line glyphs, no cartoons. Unlocked gets a silver ring |

---

## 4. Screens

Rules for every screen: one `title` per view; at most one `display` figure; content uses at most three type sizes; the first viewport on a phone shows the screen's main answer **and** its main action. Desktop layouts are designed for 1280–1440 px with a 1120 px max content width; they are not stretched phones.

Empty state = what a brand-new user (no entries, no budgets, no goals) sees.

### Home (`/home`)

- **Hierarchy:** 1 balance · 2 log · 3 today and this month · 4 progress · 5 plan · 6 recent.
- **Desktop:** two columns, 8 : 4. Left: a `hero` surface with the tracked balance (`display`), and under it two `stat` figures, Spent today and Spent this month, side by side; then Quick Add, a full-width tile grid of 6 per row (no horizontal scroll), with Type it and Say it as small buttons in its header. Then Recent (5 rows). Right rail: PlayerChip (level, rank, XP bar, streak), the monthly budget with Progress, the top goals with Progress, and a Safe to Spend link labelled as an estimate. (Design 3: Safe to Spend shows its daily figure, labelled an estimate, streamed in its own Suspense after the money like the PlayerChip, so the money never waits for it. Measured in PROGRESS.md, Design 3.)
- **Mobile:** a compact hero (balance, then today and month on one line, about 160 px tall) → Quick Add tiles, 3 per row, the first two rows visible without scrolling → the PlayerChip → budget and goals → the Safe to Spend link → Recent. The Add button is docked in the bottom bar, so nothing floats over the tiles.
- **Empty:** the hero says "₹0 · Add your starting balance" with that action. Tiles show "Set amount". The right rail (or lower cards) shows one section StatePanel: "Set a monthly budget" and "Add a goal" as two actions in one card, not two empty cards. The PlayerChip shows Level 1 and "Log your first expense to start".

### Quick Add (`/add`)

- **Hierarchy:** tiles → the amount review sheet → other ways to log.
- **Desktop:** the tile grid on the left (4 per row, large tiles), and on the right a sticky panel: the selected tile's amount, category and wallet with Save, or, with none selected, "Last 5 logged" with Repeat. The tile editor is a separate tab ("Edit tiles"), not appended below.
- **Mobile:** tiles 3 per row fill the screen. Tapping a ready tile saves and shows a routine toast with Undo; tapping a setup tile opens the bottom sheet with the amount field focused and "Save as usual amount" checked. The record tabs become a 4-segment control that fits 375 px without clipping.
- **Empty:** every seeded tile shows "Set amount". A one-line Notice at the top: "Tap a tile, enter what it usually costs, and next time one tap logs it."

### Player Status (`/rewards/status`, new in Design 3)

- **Hierarchy:** level and rank → XP to next level → streaks → lifetime totals → milestones.
- **Desktop:** a `status` surface across the top: level number large, rank word, an XP Progress bar with "120 XP to level 4" under it. Below, a three-column row: current streak, longest streak, lifetime XP. Then completed milestones as a timeline list.
- **Mobile:** the same order in one column; the status surface is the first viewport.
- **Empty:** Level 1, 0 XP, and "Your first logged day earns 10 XP" with a Quick Add button. No locked-badge wall.

### Missions (`/rewards/missions`, new in Design 3)

- **Desktop:** three columns (Daily, Weekly, Long-term), each a list of MissionRows with its reset time in the header ("Resets at midnight").
- **Mobile:** a segmented control (Daily / Weekly / Long-term) over one list.
- **Empty:** missions always exist. If all are skipped: "All missions skipped. That's fine." with Bring back.

### Achievements (`/rewards/achievements`, new in Design 3)

- **Desktop:** a 3-column grid of AchievementBadges, unlocked first, then in progress, then locked; a filter for each group.
- **Mobile:** one column, same order (two columns were too narrow at 375 px for the rule text).
- **Empty:** all locked, each with its rule and progress; the header says "0 of 7. Each one shows how to earn it."

### Rewards (`/rewards`, the progression hub)

- **Hierarchy:** the player overview → this week's consistency → active missions → recent achievements → history.
- **Desktop:** the PlayerChip in its large form at the top left with "See status"; at the top right, a 7-day strip of logged days (the North Star, neutral colours). Below, today's and this week's missions (max 4, "All missions" link), then the three newest achievements ("All achievements"), then an XP history list.
- **Mobile:** one column, same order; the history is collapsed behind "Show history".
- **Empty:** the player overview at Level 1; the strip is all empty days with no red; the missions show; the achievements section says "None yet" with the closest one's rule.

### Insights (`/insights`)

- **Hierarchy:** total spent in the period, with the comparison → where it went (categories) → trend → notable findings.
- **Desktop:** the period control in the header row. A two-column top: the total (`display`) with the comparison sentence, and the category share bars (clickable rows). Under them, the trend chart full width, then insight cards in a 2-column grid (frequent, unusual, recurring).
- **Mobile:** the total → the category list → trend → findings, one column. The period control becomes a select-like button with a sheet, so nothing clips.
- **Empty:** a page StatePanel: "Insights appear after a few purchases. Log 3 to see your first breakdown." with Quick Add; the period control stays visible.

### Money Leaks (`/insights/leaks`)

- **Desktop:** a short intro line, the grouping control, then a table-like list: group · times · each · total · what-if. The selected group opens a side panel with its entries.
- **Mobile:** cards per group with total and times; tapping opens the entries in a sheet.
- **Empty:** "No repeated small purchases this period. A leak needs 3 similar purchases under ₹{threshold}." with a link to change the threshold in Settings.

### Budgets (`/budgets`)

- **Desktop:** the monthly total at the top as a `hero`: spent of limit, Progress, pace sentence. Below, category budgets in a 2-column grid, each with Progress and remaining (the remaining is labelled a target). "Add budget" in the header.
- **Mobile:** the total, then a list of category rows, each with an inline Progress.
- **Empty:** a page StatePanel with the action inside: "Set a monthly budget", and a secondary "Suggest one from last month" when a full month exists.

### Goals (`/goals`)

- **Desktop:** a 3-column grid of goal surfaces: name, ring or Progress, saved of target, "set aside, still yours" in the earmark colour. Paused, completed and archived goals as compact rows below (Design 4: not collapsed, so every goal stays one tap away; rows keep them from crowding the active ones).
- **Mobile:** a single column of goal rows with Progress.
- **Empty:** "Save toward something specific. Money you set aside stays in your balance." with Add goal.

### Safe to Spend (`/safe-to-spend`)

- **Hierarchy:** the daily figure (estimate) → how it was worked out → the inputs to change.
- **Desktop:** two columns: the left `hero` with "About ₹X a day until {date}" in the estimate colour and the word estimate; the right a breakdown list (balance − set aside − bills = flexible). The planning form below, full width.
- **Mobile:** the hero, the breakdown as a collapsible list, then the form.
- **Empty (no income date):** the hero becomes a section StatePanel inside it, "Add your next income date to get a daily amount", with the date field directly in the panel, not further down.

### Survival Mode (`/survival`)

- **Desktop:** the status sentence (at risk, watch, on track, too early) as the hero with a 30-day strip of the cycle; the daily amount and today's spending beside it; then tips that are actual actions (pause a goal, skip a recurring item).
- **Mobile:** the same, one column.
- **Empty:** the same as Safe to Spend: one panel asking for the income date.

### Transactions (`/transactions`)

- **Desktop:** search and filters as a toolbar row; a table (date, description, category, wallet, amount) with sticky day headers and the day's net on the right; the selected row opens detail in a side panel. Paged at 50 rows with "Show more".
- **Mobile:** search, then a "Filters" button with an active-filter count; ListRows grouped by day; 30 rows, then "Show more". Goal moves are collapsed into one row per day ("2 goal moves · ₹160") that expands.
- **Empty:** "No entries yet. Your first tea or bus ride starts the list." with Quick Add and Full form.

### Wallets (`/accounts`)

- **Desktop:** the total at the top, then wallet surfaces in a 3-column grid (name, type, balance now, opening date); archived ones collapsed.
- **Mobile:** a list of wallet rows with balances; Add wallet in the header.
- **Empty:** the Cash wallet always exists; the hint says "Add a wallet for each place you keep money: UPI, bank, cash."

### Categories (`/categories`)

- **Desktop:** two panes: the category tree on the left, the selected category's subcategories, rules and usage on the right. The Uncategorized queue is a tab with a count.
- **Mobile:** the tree as a list; a category opens its own view; edit actions move into one ⋯ menu per row (fixes the 256 small targets).
- **Empty:** defaults always exist. The Uncategorized tab, when empty: "Nothing to sort. Every expense has a category."

### Recurring (`/recurring`)

- **Desktop:** two columns: "Due and upcoming" (a timeline) on the left, "Recurring items" on the right.
- **Mobile:** a segmented control between Upcoming and Items.
- **Empty:** "Add income or a regular bill so Safe to Spend can plan around it." with both actions.

### Reports (`/reports`)

- **Desktop:** options in a left column (period, what to include), the live preview on the right at paper width, with the export buttons above it.
- **Mobile:** the preview first, an "Options" sheet, exports in a sticky bottom row.
- **Empty:** the preview still renders with zeros and says "Nothing recorded in this period".

### Reminders (`/reminders`)

- **Desktop:** the notification list on the left, the reminder switches on the right.
- **Mobile:** tabs: Notifications, Settings. Each notification row has one ⋯ menu instead of two small buttons.
- **Empty:** "You're up to date." The note that reminders arrive only while the app is open stays visible as a Notice.

### Settings (`/settings`)

- **Desktop:** a left list of sections (Profile, Appearance, Money, Reminders, Progress, Privacy, Sync, Data) and the selected section on the right; each section saves on its own.
- **Mobile:** the section list, each opening its own view.
- **Empty:** n/a (always has defaults).

### Privacy and Sync (`/settings/privacy`, `/settings/sync`)

- **Desktop and mobile:** a single readable column (max 640 px). Privacy: plain statements with switches beside each one. Sync: a status Surface at the top (Synced · N waiting · conflicts), then the queue list with its actions.
- **Empty (sync):** "Everything on this device is on the server."

---

## 5. Navigation

### Desktop sidebar (lg and up)

1. **Header:** the logo, then the **PlayerChip** (compact: level ring, rank, XP bar), which opens Player Status. Hidden when progress features are off.
2. **Add expense** (the one primary button). The header's duplicate Add button is removed on desktop.
3. Groups (labels in `caption`, 8 px above each group):

| Group | Items |
| --- | --- |
| Overview | Home |
| Record | Quick Add · Type it · Say it · Full form, as a 2 × 2 grid of compact buttons |
| Activity | Transactions · Wallets · Categories · Income & recurring |
| Insights | Insights · Money leaks |
| Plan | Budgets · Savings goals · Safe to Spend · Survival mode |
| Progress | Player status · Missions · Achievements · Rewards |
| You | Parent report · Reminders · Settings |

Items are 40 px tall (44 px on touch laptops). The 2 × 2 Record grid and tighter group spacing shorten the list, but with progress features on it doesn't fit 900 px: the groups scroll under a fixed logo, chip and Add button (Design 4, measured).

### Mobile

- **Bottom bar, six slots:** Home · Activity · **Add** (centre, raised, 56 px, violet) · Insights · Plan · You. Each tab is about 62 px wide at 375 px, with labels of 8 characters or fewer.
- **You** opens the hub of secondary screens: the PlayerChip at the top (one tap to Player Status), then Missions, Achievements, Rewards, Parent report, Reminders, Settings.
- The header keeps the bell and theme switch; the floating + button is removed, so nothing covers content.
- Section tabs never clip: they fit, or become a segmented control or a sheet.

---

## 6. Rules for all later phases

1. **One card style:** `Surface`/`Card`. No hand-rolled `rounded-* border bg-card` boxes; no card inside a card (use `inset`).
2. **One radius scale:** 6 / 10 / 14 / 18 / 24 px and full. No arbitrary radii.
3. **One type scale:** caption 12, body 14, heading 16, title 24 (22 on phones), display 36 (32 on phones). No other sizes; no `text-[…]`.
4. **2–3 text sizes per view** in its content (navigation chrome excluded). At most one `display` figure per view.
5. **Gradients only from tokens:** `--gradient-xp`, `--gradient-status-edge`, `--gradient-page`.
6. **Colours only from layer 2 or 3 tokens.** Spending is neutral text, never red.
7. **Every money figure uses `.money`** (tabular numerals), including inside sentences.
8. **Real data only.** No hardcoded numbers, no sample values in real views, no fake progress. Empty means a StatePanel.
9. **Undo instead of "Are you sure?"** for every reversible action (soft delete, archive, skip, hide). A confirmation is only for irreversible actions (account deletion) or when Undo is impossible (an expense with refunds explains why it can't be deleted).
10. **Motion:** under 300 ms per element; never blocks a tap (no awaiting an animation before acting; decorative layers have `pointer-events: none`); reduced motion respected through `MotionConfig` and the CSS overrides.
11. **Feedback gets quieter for routine actions:** routine toasts compact after repetition; celebrations only for milestones.
12. **Every gesture has a visible button** (long-press, swipe, drag).
13. **Touch targets at least 44 px** on coarse pointers.
14. **Finance is always clearer than game elements:** progression never sits above, inside or larger than a money figure, and never uses money colours.
15. **No page gets slower:** no new client libraries for decoration; progression data rides on reads a screen already makes or loads after the money.
16. **Accessibility:** WCAG 2.2 AA in both themes; focus always visible; every progress bar and icon button labelled.
