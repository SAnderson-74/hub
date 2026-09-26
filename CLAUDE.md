# Working on Hub

Hub is a private, self-hosted web app for tasks and goals, courses, resale tracking, budgets, and small-business prep. One TypeScript codebase: a Hono API and a React app, served from one container and reached only through Tailscale.

## Ground rules

1. **This repository is public.** Never put personal information in code, comments, tests, fixtures, docs, commit messages, branch names, or pull request text: no real names, emails, phone numbers, addresses, employers, schools, banks, marketplaces, hostnames, IP addresses, tailnet names, or account details, even when a request mentions them. Use neutral examples (John Smith, john.smith@example.com, +1 (234) 567-8901, "Example Bank", "Local classifieds"). Anything specific to the owner belongs in the database, entered through the app.
2. **Never touch real data.** Cloud sessions have none. Don't read `.env` or `data/`. Tests use in-memory databases or temporary directories.
3. Keep each pull request to one feature or fix. Follow the existing patterns before inventing new ones.
4. Before finishing, run `npm run check` and `npm run build`. Both must pass. For UI changes, list the screens you changed in the pull request.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | API on :3000 and Vite on :5173 (run `cp .env.example .env` first) |
| `npm run check` | Biome lint, TypeScript, migration guard, unit tests |
| `npm run build` | Builds `dist/client` and `dist/server` |
| `npm run test:e2e` | Playwright at iPhone and desktop sizes (needs `npm run build`; runs in CI) |
| `npm run db:generate -- --name <what_changed>` | Creates a migration from schema changes |
| `npm run format` | Formats and fixes lint issues |

## Layout

- `src/server/` app setup, auth, config, database connection, migrations, backups
- `src/client/` React entry, layout, shared components, API client, theme
- `src/shared/` code used by both sides (zod schemas, color helpers)
- `src/modules/<module>/` everything for one feature: `schema.ts`, `*.service.ts`, `*.routes.ts`, `pages/`, tests
- `drizzle/` generated SQL migrations (never edit merged ones)
- `e2e/` Playwright tests, `deploy/` TrueNAS and Tailscale files, `docs/` plan and setup

## Adding a module

1. Tables in `src/modules/<name>/schema.ts`; export them from `src/server/db/schema.ts`.
2. `npm run db:generate -- --name <what_changed>` and commit the new files in `drizzle/`.
3. Logic in `<name>.service.ts`, routes in `<name>.routes.ts` using `zValidator(target, schema, invalid("..."))` (`src/server/validate.ts`). Services throw `notFound`, `badRequest`, or `conflict` from `src/server/errors.ts`. Put zod schemas the browser also needs in `src/shared/<name>.ts`.
4. Mount the routes in `src/server/api.ts` with one `.route()` line. Keep the chain intact; it types the browser client.
5. Pages in `src/modules/<name>/pages/`, registered in `src/client/pages.tsx`. Data hooks in `src/modules/<name>/queries.ts` using `api` from `src/client/lib/api.ts`.
6. Tests next to the code (`*.test.ts`), using `createTestApp()` from `src/server/testing.ts` (in-memory database, typed client), plus one e2e check for the main flow.
7. If its records should be taggable, linkable, or on timelines: add the type to `ENTITY_TYPES` in `src/shared/entities.ts` and a lookup in `src/modules/core/entities.ts`, call `recordActivity` on changes, and call `detachEntities` before deleting rows.

## Database rules

- SQLite through Drizzle. Money is integer cents (`amount_cents`). Instants use `integer(..., { mode: "timestamp_ms" })`; calendar dates are `text` in `YYYY-MM-DD`.
- Generate migrations; don't write them by hand.
- Changes are additive: new tables, or new columns that are nullable or have defaults. Don't drop or rename. An older build must keep working against a newer database, because rollbacks depend on it. If a destructive change is truly needed, add `-- hub:reviewed-destructive: <reason>` to the migration and explain it in the pull request.
- The server backs up the database before applying migrations.

## API rules

- Every route sits behind Tailscale identity auth (`src/server/auth.ts`). Only `/api/health` is public; don't add others.
- `GET` never changes data. Writes use `POST`/`PUT`/`PATCH`/`DELETE` with JSON validated by zod.
- Errors look like `{ "error": "What went wrong and what to do." }` with a fitting status code.
- Never log request bodies, money amounts, or other personal values.
- A machine integration gets its own token check, limited to the routes it needs.

## UI rules

- Design for iPhone first, then desktop. Touch targets at least 44px. Respect safe areas.
- Tailwind v4 with the tokens in `src/client/styles.css` only (the default palette is removed): `bg-base`, `bg-mantle`, `bg-surface-0..2`, `text-fg`, `text-muted`, `text-faint`, `ok`, `warn`, `danger`, `accent`, `text-accent-text` (text in the accent color), `text-on-accent` (text on accent backgrounds).
- Radius by level: `rounded-panel` for `Panel`, `rounded-tile` for tiles inside panels, `rounded-control` for inputs and nav items, `rounded-full` for buttons and chips. No drop shadows.
- Reuse `Panel`, `PageHeader`, `StatusDot`, `LoadingRows`, `ErrorNote`, `ProgressBar`, and `Sheet` (a `<dialog>` that is a bottom sheet on phones) plus the control classes in `src/client/components/ui.ts`. Status colors always come with text.
- The phone tab bar shows five items; with more pages, the first four get tabs and the rest are listed on the More page (`src/client/lib/nav.ts`).
- Copy: sentence case, plain verbs. Buttons say what happens ("Save accent") and confirmations reuse the verb ("Accent saved"). Errors say what happened and how to fix it. No all-caps labels.
- Charts: `recharts`, colors from CSS variables, always with a one-line text summary.
- The Content-Security-Policy only allows scripts, styles, and fonts from the app itself: no inline scripts, CDNs, injected `<style>` tags, or `data:` fonts.
- Icons come from `lucide-react`.
- Server runtime packages go in `dependencies`. Anything bundled into the browser goes in `devDependencies`; the container installs only `dependencies`.

## Cloud sessions

- Node 22 is the default there; the app supports Node 22 and newer (production runs Node 24).
- `npm ci` may compile `better-sqlite3` from source. That's expected.
- Browsers for Playwright usually aren't installed. Rely on unit tests and the CI browser tests, and describe UI changes in the pull request.

## Roadmap

`docs/PLAN.md` has the phases. When asked for "the next step", take the first unchecked item in the current phase, build it, and tick it in the same pull request.
