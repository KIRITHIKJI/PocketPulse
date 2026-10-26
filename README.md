# PocketPulse

**Track. Understand. Save.** A responsive, installable personal-finance web app for a college
student: record ₹10 purchases in seconds, see honest spending insights, and save on purpose.

Product requirements live in [`PROJECT_SPEC.md`](PROJECT_SPEC.md). Build status, decisions and
next steps live in [`PROGRESS.md`](PROGRESS.md).

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript 6 (strict) · Tailwind CSS 4 ·
shadcn-style components on Radix UI · lucide icons · Motion (Framer Motion) · next-themes ·
Vitest + Testing Library · Playwright · Supabase (Auth + Postgres + RLS).

## Requirements

- Node.js ≥ 20.9 (developed on Node 24) and npm.
- A Supabase project for accounts and cloud data (see Setup).
- Optional: a local PostgreSQL 15+ for `npm run test:db`.

## Setup

### 1. Install and configure

```bash
npm install
cp .env.example .env.local   # then fill in real values (see the table)
```

| Variable | Where it's used | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + server | `sb_publishable_…`. Legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` is accepted as a fallback. Safe in the browser: every private row is protected by RLS. |
| `SUPABASE_SECRET_KEY` | server only | `sb_secret_…`. Bypasses RLS. Never prefix with `NEXT_PUBLIC_`. Only `src/lib/supabase/admin.ts` (marked `server-only`) reads it. |
| `NEXT_PUBLIC_SITE_URL` | auth email links | `http://localhost:3000` locally, your production URL when deployed. |

Find the keys in Supabase Dashboard → Project Settings → API Keys. `.env.local` is gitignored;
`.env.example` contains placeholders only.

### 2. Create the Supabase project

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard) (a region close
   to your users, e.g. Mumbai). Copy the URL and keys into `.env.local`.
2. **Authentication → Sign In / Providers → Email:** keep Email enabled. Leaving "Confirm email"
   on is recommended (new users get a link that signs them in and opens setup). With it off,
   sign-up signs in immediately.
3. **Authentication → URL Configuration:**
   - Site URL: your production URL (or `http://localhost:3000` while developing).
   - Redirect URLs: add `http://localhost:3000/**` and `https://<your-domain>/**`. Email links
     land on `/auth/confirm`, which must be allowed here.
4. **Authentication → Emails (templates), recommended:** the default templates work, but they use
   the PKCE flow, which only completes in the browser that started it. To let someone open the
   link on another device, change the links to the token-hash form:
   - Confirm signup:
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding`
   - Reset password:
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`

### 3. Apply the database migrations

Migrations live in `supabase/migrations/`: schema, integrity triggers, RLS policies, RPCs and
per-user defaults, the defaults backfill, and the onboarding/wallet/category RPCs. Apply them with the Supabase CLI (no global install needed):

```bash
npx supabase@2.120.0 init          # once: creates supabase/config.toml, keeps the migrations
npx supabase@2.120.0 login         # opens the browser to authorise the CLI
npx supabase@2.120.0 link --project-ref <project-ref>
npx supabase@2.120.0 db push       # applies every migration not yet applied
```

Or paste each file, in filename order, into Dashboard → SQL Editor. New sign-ups get their
profile, default categories (spec §9) and quick-add tiles from the `on_auth_user_created`
trigger. Users created before the migrations can call the `ensure_my_defaults()` RPC.

### 4. Run

```bash
npm run dev                  # http://localhost:3000
```

Without the Supabase variables the app still builds and runs: public pages work, app routes
redirect to sign-in, and the auth pages say which variables are missing.

### Database tests

`npm run test:db` runs the schema, RLS, idempotency and atomicity tests against a **real
PostgreSQL** (15+). It creates a temporary database, applies `tests/db/supabase-shim.sql` (a
minimal stand-in for Supabase's `auth` schema and API roles) plus every migration, runs the
tests as the `authenticated` and `anon` roles, and drops the database. Point it at an admin
connection, **never at your hosted Supabase project**:

```bash
# Any local Postgres, e.g. a throwaway cluster (no Docker needed):
initdb -D ./.pgtest -U postgres --auth=trust
pg_ctl -D ./.pgtest -o "-p 54329" -l ./.pgtest.log start
POCKETPULSE_TEST_DB_URL=postgres://postgres@127.0.0.1:54329/postgres npm run test:db

# Or the Postgres inside a local Supabase stack (needs Docker):
npx supabase@2.120.0 start
POCKETPULSE_TEST_DB_URL=postgres://postgres:postgres@127.0.0.1:54322/postgres npm run test:db
```

Without `POCKETPULSE_TEST_DB_URL` the database tests are reported as skipped, not passed.

### Live project checks

`npm run test:live` checks the configured project with the **publishable key only**: that each
of two real accounts got its defaults at sign-up, and that RLS stops one from reading or changing
the other's rows. It needs `E2E_USER_A_EMAIL`, `E2E_USER_A_PASSWORD`, `E2E_USER_B_EMAIL` and
`E2E_USER_B_PASSWORD` in the gitignored `.env.e2e.local`. It writes a test wallet and one
soft-deleted expense to user A per run, so use throwaway accounts. Without them it is skipped.

### Signed-in browser tests

`npm run test:e2e` always runs the signed-out suite (redirects, auth forms, validation). The
signed-in shell suite needs a real test account in a project with the migrations applied. Put
`E2E_EMAIL=…` and `E2E_PASSWORD=…` (plain values, no quotes or brackets) in `.env.e2e.local`;
the Playwright config loads it. The suite signs in once and reuses the session
(`e2e/.auth/`, gitignored) to stay under Supabase's sign-in rate limits, and runs at most 4
workers for the same reason. Tests that change the test profile (theme, motion, onboarding,
wallets) run on the desktop project only and restore defaults; runs leave archived "E2E …"
wallets/categories in the test account. Without the credentials it is skipped.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve it |
| `npm run lint` | ESLint (Next core-web-vitals + TypeScript rules, Prettier-compatible) |
| `npm run typecheck` | Generates Next route types, then `tsc --noEmit` |
| `npm test` | Vitest unit/integration tests (jsdom) |
| `npm run test:db` | Schema/RLS/RPC tests on a real Postgres (needs `POCKETPULSE_TEST_DB_URL`) |
| `npm run test:live` | Defaults + cross-user RLS against the configured Supabase project (needs two test accounts) |
| `npm run test:e2e` | Playwright on desktop Chrome + Pixel 7 viewports (builds and serves on port 3100) |
| `npm run format` | Prettier (with Tailwind class sorting) |
| `npm run check` | lint + typecheck + test + build |

First Playwright run needs a browser: `npx playwright install chromium`.

## Project layout

```
src/
  app/
    (public)/     welcome, login, register, forgot/reset password, onboarding
    (app)/        signed-in shell: home, add, transactions, insights, budgets, goals, …
  components/
    ui/           accessible primitives (button, card, sheet, dropdown, segmented control…)
    layout/       sidebar, header, bottom nav, section tabs, offline banner
    states/       shared empty / error / offline / permission-denied / loading states
    preferences/  theme + motion controls
    providers/    theme and motion providers
  lib/            navigation config, env detection, preferences, utilities
    supabase/     server, browser and server-only admin clients
    auth/         route rules, form schemas, server actions, error copy
    data/         database row → domain record mappers
  proxy.ts        session refresh + route protection (Next 16 "proxy", formerly middleware)
  domain/         pure financial domain layer: paise money, IST periods, ledger, balances,
                  aggregation, budgets, savings, safe-to-spend (used by every screen/report)
supabase/
  migrations/     schema, integrity triggers, RLS, RPCs, per-user defaults
tests/            Vitest tests (tests/unit/domain: financial invariants)
  db/             PostgreSQL tests: RLS, idempotency, atomicity, domain rules
e2e/              Playwright tests
```

## Design system

Tokens are defined once in `src/app/globals.css` as CSS variables and exposed to Tailwind via
`@theme inline`. Midnight/charcoal dark is the default; `.light` provides the light theme.
Violet (`primary`) is the accent; lime/green (`positive`) is reserved for positive progress.
Motion follows the OS `prefers-reduced-motion` setting, with an in-app override in Settings
(applied before first paint, and to both CSS and Motion animations).
