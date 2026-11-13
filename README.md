# PocketPulse

**Track. Understand. Save.**

PocketPulse is a personal-finance web app for college students. It makes recording small, everyday
expenses (a ₹20 chai, a ₹15 bus ride) take a couple of seconds, shows clearly where the money goes,
and helps students plan, stay within budget and save on purpose. When a student wants to, it can
also produce a clean spending report to share with parents.

It runs in the browser on laptops and phones, installs to the home screen as a PWA, keeps working
offline for entries, and syncs everything to the student's private account.

**Live demo:** [pocket-pulse-delta.vercel.app](https://pocket-pulse-delta.vercel.app)

## Key features

**Fast recording**

- **Quick add:** a grid of customisable tiles with usual amounts, "repeat last" and frequent
  shortcuts. Every save shows an Undo toast.
- **Type it:** write several entries in plain words ("chai 20, bus 15 yesterday"). PocketPulse
  turns them into drafts for you to review, then saves them all together or none at all. It
  understands Hindi day words ("aaj", "kal", "parso") and Devanagari.
- **Say it:** dictate entries with the browser's speech recognition. They go through the same
  review step.
- **Full form:** expense, income, refund or transfer, with wallet, category, subcategory, date,
  note and merchant. Category suggestions come from your own rules and history, computed on the
  device.

**Understanding spending**

- **Transactions:** history with search and filters by type, wallet, category, period and amount.
- **Insights:** totals, a trend chart, category breakdown, comparison with the previous period,
  and frequent, unusual and recurring spending. Every figure links to the entries behind it.
- **Money leaks:** finds repeated small purchases ("Bus 4 times for ₹20 each") and shows what
  cutting back would save.
- **Wallets and categories:** several wallets with opening balances, plus a category hierarchy
  with icons, colours, merge, archive and auto-categorisation rules.

**Planning and saving**

- **Budgets:** total and per-category; monthly, weekly or custom. Includes suggested limits, alert
  thresholds and a pace projection.
- **Savings goals:** progress, a suggested amount and a forecast. You can set money aside, release
  it, or record "I bought it".
- **Safe to spend:** how much you can spend per day and per week until your next income, with
  every input explained.
- **Survival mode:** a tighter day-by-day view for the end of the month.
- **Income and recurring:** recurring templates and one-off bills, which you confirm, skip, pay
  or cancel.

**Staying on track**

- **Rewards:** levels, XP, daily and weekly streaks, optional missions and achievements. XP never
  depends on how much you spend, and awards are calculated on the server.
- **Reminders:** a notification centre with a schedule and optional browser notifications. They
  are checked while the app is open.

**Parent report**

- Choose a period and what to include, preview it, then download a PDF or CSV or copy it as text.
  Nothing is shared automatically.

**Trust and privacy**

- Money is stored as integer paise, never as floating-point numbers. Amounts use INR and Indian
  digit grouping, and dates use Asia/Kolkata by default (all configurable).
- Each user's data is private and protected by Postgres row-level security.
- Offline entries are queued on the device with stable IDs, so a retry can't create a duplicate.
  The sync centre shows what is still pending and lets you resolve conflicts.
- You can export your data as JSON or CSV and permanently delete your account.
- Light and dark themes, a responsive layout (sidebar on laptops, bottom navigation on phones)
  and a reduced-motion setting.

## Screenshots

<!--
Add images to docs/screenshots/ and uncomment:

| Home | Quick add | Insights |
| --- | --- | --- |
| ![Home](docs/screenshots/home.png) | ![Quick add](docs/screenshots/quick-add.png) | ![Insights](docs/screenshots/insights.png) |
-->

You can see the app running at the [live demo](https://pocket-pulse-delta.vercel.app).

## Tech stack

| Area | Tools |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript (strict) |
| Styling and UI | Tailwind CSS 4, Radix UI primitives, lucide-react icons, Motion, next-themes, Geist font |
| Backend | Supabase: Auth, Postgres, row-level security and SQL RPCs |
| Validation | Zod |
| Charts and exports | Recharts, pdf-lib |
| Offline | Service worker and IndexedDB (Dexie) |
| Testing | Vitest and Testing Library, Playwright with axe-core, PostgreSQL integration tests |
| Hosting | Vercel |

## Getting started

### Prerequisites

- Node.js 20.9 or newer, and npm
- A [Supabase](https://supabase.com) project
- Optional: a local PostgreSQL 15+ for the database test suite

### 1. Install

```bash
git clone https://github.com/KIRITHIKJI/PocketPulse.git
cd PocketPulse
npm install
```

### 2. Configure environment variables

Copy the example file and fill in your own values:

```bash
cp .env.example .env.local
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Supabase publishable key. It is safe in the browser because row-level security protects the data. `NEXT_PUBLIC_SUPABASE_ANON_KEY` is accepted as a fallback. |
| `SUPABASE_SECRET_KEY` | Recommended | Server-only key used to award rewards and delete accounts. Never give it a `NEXT_PUBLIC_` prefix. |
| `NEXT_PUBLIC_SITE_URL` | Yes | The app's base URL, used in auth email links (`http://localhost:3000` locally) |

These variables are only needed for testing. Put them in `.env.e2e.local`:

| Variable | Purpose |
| --- | --- |
| `E2E_EMAIL`, `E2E_PASSWORD` | Test account for the signed-in Playwright suite |
| `E2E_USER_B_EMAIL`, `E2E_USER_B_PASSWORD` | Second test account for the cross-user checks |
| `POCKETPULSE_TEST_DB_URL` | Admin connection to a local PostgreSQL for `npm run test:db` |

`.env.local` and `.env.e2e.local` are gitignored. Never commit real keys.

### 3. Set up Supabase

1. Create a project in the [Supabase dashboard](https://supabase.com/dashboard) and copy its URL
   and keys into `.env.local`.
2. Under **Authentication → URL Configuration**, set the Site URL to your app URL and add
   `http://localhost:3000/**` (and your production URL followed by `/**`) to the Redirect URLs.
   Email links land on `/auth/confirm`.
3. Apply the database migrations in `supabase/migrations/`:

   ```bash
   npx supabase@2.120.0 login
   npx supabase@2.120.0 link --project-ref <your-project-ref>
   npx supabase@2.120.0 db push
   ```

   You can also run each file, in filename order, in the dashboard's SQL Editor. New sign-ups get
   their profile, default categories and quick-add tiles from a database trigger.

4. Optional: to let users open email links on a different device, change the auth email templates
   to the token-hash form:
   - Confirm signup:
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding`
   - Reset password:
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). If the Supabase variables are missing, the app
still builds and runs: public pages work, and the sign-in pages say which variables are missing.

### Deploying

The app deploys to Vercel (or any Next.js host) with the same environment variables. Set
`NEXT_PUBLIC_SITE_URL` to the deployed `https://` address and add it to the Supabase Redirect
URLs. `vercel.json` runs server code in Mumbai (`bom1`); change it if your Supabase project is in
another region. Installing the app on a phone, using offline mode and using voice entry all need
HTTPS.

## Available scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Generate Next.js route types and run `tsc --noEmit` |
| `npm test` | Run the Vitest unit and integration tests |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run test:db` | Run the schema, RLS, idempotency and atomicity tests on a real PostgreSQL (needs `POCKETPULSE_TEST_DB_URL`) |
| `npm run test:live` | Check per-user defaults and cross-user isolation against the configured Supabase project (needs two test accounts) |
| `npm run test:e2e` | Run the Playwright tests at desktop and mobile viewport sizes |
| `npm run clean:e2e` | List the data that test runs left in the test accounts; add `-- --apply` to remove it |
| `npm run format` / `format:check` | Format with Prettier, or check the formatting |
| `npm run check` | Run lint, typecheck, tests and build in one go |

The first Playwright run needs a browser: `npx playwright install chromium`.

## Project structure

```
src/
  app/
    (public)/       welcome, sign-in, registration, password reset, onboarding
    (app)/          signed-in app: home, add, transactions, insights, budgets, goals,
                    safe to spend, survival, recurring, reports, rewards, reminders, settings
    api/sync/       endpoint that receives entries queued offline
    auth/confirm/   email confirmation and password-recovery callback
  components/       UI grouped by feature, plus shared primitives (ui/), layout and states
  domain/           pure financial logic: paise money, periods, ledger, balances, budgets,
                    savings, safe to spend, insights, money leaks, rewards, report model,
                    text-entry parser
  lib/
    supabase/       browser, server and server-only admin clients
    ledger/         the single mutation layer for money entries
    offline/        IndexedDB queue, sync transport, conflict handling
    actions/        server actions
    reports/        report loading and PDF rendering
  proxy.ts          session refresh and route protection
supabase/
  migrations/       schema, integrity triggers, RLS policies, RPCs, per-user defaults
tests/
  unit/             Vitest tests, including financial invariants
  db/               PostgreSQL tests for RLS, idempotency and atomicity
  live/             checks against a real Supabase project
e2e/                Playwright end-to-end and accessibility tests
public/             service worker and app icons
scripts/            icon generator, test-data cleanup
doc/                product, feature and design notes
PROJECT_SPEC.md     product requirements
```
