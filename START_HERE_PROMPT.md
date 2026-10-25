# First Message to Claude Code

Paste the prompt below into Claude Code from the root of the PocketPulse project folder. Keep `CLAUDE.md` and `PROJECT_SPEC.md` in that root folder so Claude Code can read them.

---

You are the lead product engineer, full-stack architect, financial-domain engineer, UI/UX designer, and test engineer for PocketPulse.

Before coding, read `CLAUDE.md` and `PROJECT_SPEC.md` completely. Then inspect the current repository, including the working directory, git status, package manager, existing routes, dependencies, environment files, scripts, tests, and current implementation. Do not assume the repository is empty or overwrite existing work.

Your mission is to implement **one complete, integrated PocketPulse application** as defined by `PROJECT_SPEC.md`. There are no V1/V2 versions and no feature groups to defer. You may break your work into internal implementation tasks, but you must include and connect every required feature before declaring the project finished. Do not stop after a design preview, dashboard, schema, or implementation plan.

### How to proceed

1. Read and assess the repo and both project instruction files.
2. Create or update `PROGRESS.md` with an implementation checklist covering every acceptance criterion. Record the current state truthfully.
3. Present a concise plan and architecture decisions, including any necessary deviation from the requested stack, with a practical reason for each deviation.
4. Continue directly into implementation. Do not wait for me to approve an ordinary plan or ask questions that can be solved with the spec's defaults.
5. Build end-to-end. Connect the UI to real domain logic, database persistence, authentication, validation, synchronization, exports, and tests. Use demo data only in a clearly separated optional demo mode.
6. Implement the financial domain layer first enough to establish the invariants, then ensure every screen, chart, budget, savings goal, forecast, and report uses those same tested calculations.
7. Complete responsive design and motion throughout the app, not only the home screen.
8. Run available lint, typecheck, tests, migrations/schema checks, and production build. Fix errors caused by your implementation and verify critical user journeys. Do not claim a check passed unless you ran it.
9. Update `PROGRESS.md` as substantial work is completed and before any context reset. If work is interrupted, leave exact next steps and test status so you can resume from files instead of relying on chat memory.
10. At completion, give me a concise summary of implemented features, setup commands, environment variables/credentials I must supply, checks actually run and their results, and any genuine unresolved blockers.

### Non-negotiable product rules

- The app must work on laptop and mobile and synchronize for the same user account.
- Fast daily entry is central: quick-add presets, custom amounts, natural-language entry with review, voice entry with review, repeat transaction, history and editing.
- Categorization and spending insights are more important than parent reporting. Parent reports are still required and functional.
- Include the complete savings/budget system, Money Leak Detector, safe-to-spend, Pocket-Money Survival Mode, gamification, reminders, PWA/offline support, and PDF/CSV reports described in the spec.
- All totals come from real stored data; never hardcode financial values or fake success states.
- Store money as integer paise (INR default). Use one centralized, tested financial calculation layer.
- Transfers and savings allocations must not be miscounted as expenses or change consolidated funds incorrectly. Never double-subtract expenses or planned bills.
- Configure real Supabase Auth, schema/migrations, and Row Level Security; never expose service keys in browser code. If credentials are missing, still build and test what can be tested locally, and give exact setup instructions without pretending the integration is live.
- Offline mutations need stable IDs/idempotency and visible sync state. Never lose or duplicate an expense silently.
- All major navigation, buttons, forms, filters, charts, reports, and settings must work. No required placeholders, “coming soon” sections, fake authentication, or mock-only pages.
- Keep the UI premium, smooth, playful, responsive and accessible. Motion must respect reduced-motion settings and never slow down expense entry.
- Use safe permissions. Do not use dangerous permission-bypass flags.

Be autonomous, make sensible engineering decisions, inspect before changing, test the underlying logic, and keep going until the integrated application is complete or a specific external blocker prevents further progress. If blocked, implement everything that does not depend on the unavailable secret/service and report the exact blocker and next action.

Start by inspecting the repository now.
