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
- A Supabase project for accounts and cloud data (see below).

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in real values
npm run dev                  # http://localhost:3000
```

### Environment variables

| Variable | Where it's used | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + server | `sb_publishable_…`. Legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` is accepted as a fallback. |
| `SUPABASE_SECRET_KEY` | server only | `sb_secret_…`. Never prefix with `NEXT_PUBLIC_`, never import in client code. |
| `NEXT_PUBLIC_SITE_URL` | auth redirects | e.g. `http://localhost:3000` |

Find the keys in Supabase Dashboard → Project Settings → API Keys. `.env.local` is gitignored.

> **Current state:** the app shell, design system and every route exist. Registration, sign-in,
> recovery, the database schema and RLS are built in the next stages — see `PROGRESS.md`.
> Until then, auth screens report whether Supabase credentials are present rather than showing
> forms that cannot submit.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve it |
| `npm run lint` | ESLint (Next core-web-vitals + TypeScript rules, Prettier-compatible) |
| `npm run typecheck` | Generates Next route types, then `tsc --noEmit` |
| `npm test` | Vitest unit/integration tests (jsdom) |
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
  domain/         pure financial domain layer: paise money, IST periods, ledger, balances,
                  aggregation, budgets, savings, safe-to-spend (used by every screen/report)
tests/            Vitest tests (tests/unit/domain: financial invariants)
e2e/              Playwright tests
```

## Design system

Tokens are defined once in `src/app/globals.css` as CSS variables and exposed to Tailwind via
`@theme inline`. Midnight/charcoal dark is the default; `.light` provides the light theme.
Violet (`primary`) is the accent; lime/green (`positive`) is reserved for positive progress.
Motion follows the OS `prefers-reduced-motion` setting, with an in-app override in Settings
(applied before first paint, and to both CSS and Motion animations).
