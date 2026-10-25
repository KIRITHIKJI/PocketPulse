# PocketPulse — Persistent Claude Code Instructions

## Read first
Before making changes, read `PROJECT_SPEC.md` completely. It is the product source of truth. If an instruction in the chat conflicts with the project spec, call out the conflict and follow the latest explicit user instruction.

## Product mandate
Build PocketPulse as one complete, integrated application. There are **no V1/V2 releases or deferred feature phases**. Internal implementation may be organized into small tasks for reliability, but all requirements in `PROJECT_SPEC.md` are in scope for this delivery. Do not stop at a dashboard, design prototype, placeholder pages, or a partial MVP.

PocketPulse is primarily for the student to understand spending, control it, and save money. Parent-ready reports are important but secondary. The app must make recording tiny expenses extremely fast, keep money calculations trustworthy, and work on both laptop and mobile with synchronized data.

## How to work in this repository
1. Start by inspecting the current working directory, git status, package manager, existing files, and available scripts. Do not overwrite or delete existing work blindly.
2. If the repository is empty, bootstrap a clean, maintainable implementation that follows `PROJECT_SPEC.md`. If a project already exists, adapt the current stack when reasonable instead of rewriting it for personal preference.
3. Before substantial implementation, create a concise implementation plan and a checklist of acceptance criteria. Then continue implementation; do not stop at merely presenting the plan.
4. Build end-to-end features: database/schema, authorization, validation, business logic, UI, empty/loading/error states, and tests. A visible button must perform its advertised action.
5. Inspect the relevant source files before discussing or changing them. Never claim a feature, test, migration, integration, or build works unless you actually verified it.
6. Run the available lint, typecheck, unit/integration tests, and production build. Fix failures caused by your changes. If a check cannot run due to missing credentials or environment constraints, state exactly what was blocked and provide the exact next command/action.
7. Do not hardcode dashboard numbers, fake successful saves, fake authentication, or use demo records as a real user's data. Demo data must be clearly separated and opt-in.
8. Do not leave `TODO`, `FIXME`, “coming soon”, disabled placeholder actions, or static mock screens for any required feature. If a genuine external dependency is needed, implement its integration boundary and document the real setup rather than pretending it is connected.
9. Do not ask the user to make decisions that can be safely resolved using the defaults in `PROJECT_SPEC.md`. Ask only when there is a genuine blocker or a destructive/irreversible choice. Use sensible defaults and explain them.
10. Keep code focused and maintainable. Avoid needless abstractions, giant components, duplicate calculation logic, and unnecessary dependencies. Reuse a single financial domain layer for every screen and report.
11. Never use floating-point arithmetic for currency. Use integer paise for INR (or another exact decimal representation), and test rounding/formatting boundaries.
12. Never expose Supabase service-role keys or other secrets in browser code. Enforce data ownership in the database, not only in UI filters.
13. Offline support must not silently lose or duplicate money entries. Use stable client-generated transaction IDs/idempotency keys, visible sync state, and conflict handling.
14. Maintain `PROGRESS.md` as durable project state: completed work, decisions, checks run, known blockers, and the next concrete tasks. Update it before a context reset or when finishing a substantial work session.
15. Do not use `--dangerously-skip-permissions` or bypass safety/permission prompts as a shortcut.

## Product/design standards
- Premium, playful, polished finance product; not a generic admin template and not a childish arcade game.
- Midnight/charcoal foundation with violet and restrained lime/green accents; light and dark themes.
- Responsive, accessible laptop and mobile layouts. Use desktop sidebar/navigation where appropriate and mobile bottom navigation for primary areas.
- Fast entry takes priority over decorative motion. Animations must be brief, meaningful, accessible, and respect reduced-motion preferences.
- INR (₹), Indian number formatting, and Asia/Kolkata timezone by default, configurable where appropriate.
- Treat financial data as private. No automatic sharing with parents, no automatic external AI transmission, and no bank integration requirement.

## Definition of done
Do not call the app complete until the required features and screens in `PROJECT_SPEC.md` are implemented and connected, critical financial/security tests pass, responsive UI is checked, setup instructions are accurate, and no known broken required journeys are hidden. Finish with a truthful delivery summary: what works, commands/tests actually run, required environment setup, and any unresolved limitation.
