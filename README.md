# revdevhqOS

Internal operating system for a marketing agency: clients, leads, pipeline,
billing, tasks, onboarding, and financial reporting in one workspace.

## Stack

- **Next.js 16** (App Router, React 19, TypeScript, Turbopack)
- **Neon PostgreSQL** via **Drizzle ORM** (`drizzle-kit` migrations)
- **Better Auth** — email/password sessions stored in Postgres
- **Tailwind CSS 4 + shadcn/ui** — design system ported from `design-reference/original-prototype.html`
- **dnd-kit** (pipeline board), **TanStack Table**, **Recharts**, **react-hook-form + Zod**
- **Vitest** for unit tests, **Railway** for hosting

## Architecture

```
src/
  app/            routes: (auth)/sign-in|sign-up, setup, (dashboard)/<feature>, api/auth
  components/     ui/ (shadcn), layout/ (sidebar, topbar), shared/ (DataTable, MetricCard, …)
  features/       feature UIs: clients, leads, pipeline, billing, tasks, onboarding, reports, settings
  lib/            auth/ (Better Auth + session helpers), db/ (drizzle client + schema),
                  env/ (Zod-validated server env), finance/ (money math), permissions/, validation/
  server/         actions/ (all mutations, "use server"), queries/ (all reads), authorize.ts, activity.ts
drizzle/          generated SQL migrations
scripts/          migrate.ts, seed.ts (dev-only demo data), e2e-check.mjs
design-reference/ original static prototype (visual reference only — not the app)
```

**Data path for every feature:** form (react-hook-form + Zod) → server action
(`authorize()` validates session + workspace membership + role, Zod re-validates)
→ Drizzle → Neon → `revalidatePath` → updated UI. Nothing is stored client-side.

**Financial rules:** subscriptions = expected billing (drive MRR/ARR);
invoices = amounts requested; payments = money actually collected. Dashboard
metrics are computed from these records in `src/server/queries/metrics.ts` and
`src/lib/finance/metrics.ts` (unit-tested).

## Local setup

```bash
npm install
cp .env.example .env         # then fill values (see below)
npm run db:migrate           # applies drizzle/ migrations to DATABASE_URL
npm run db:seed              # optional, dev-only demo data
npm run dev
```

Zero-install local database: set `DATABASE_URL=pglite://.pglite/data` (embedded
Postgres, dev-only). For Neon, paste the pooled connection string instead.

### Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon **pooled** connection string (app runtime) |
| `DATABASE_URL_UNPOOLED` | Neon **direct** connection string (migrations) |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | Base URL of the app (http://localhost:3000 locally) |
| `NEXT_PUBLIC_APP_URL` | Same as above for a single deployment |

Never commit `.env*` files — they are gitignored.

## Neon

1. Create a Neon project; create a `development` branch off `main` for development.
2. Put the branch's pooled URL in `DATABASE_URL` and direct URL in `DATABASE_URL_UNPOOLED`.
3. `npm run db:migrate` applies `drizzle/0000_*.sql` (all tables, enums, indexes).
4. Schema changes: edit `src/lib/db/schema.ts` → `npm run db:generate` → review SQL → `npm run db:migrate`.

## Railway deployment

Project **revdevhqOS** / environment **staging** / service **web** already exist
(domain `web-staging-42c4.up.railway.app`; `BETTER_AUTH_SECRET`,
`BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL` are set). To go live:

1. In the Railway dashboard, connect service **web** to
   `contractorarsenal/revdevhqOS`, branch `build/functional-mvp` (or `main` after merge).
   Requires granting the Railway GitHub App access to the repo.
2. Set `DATABASE_URL` and `DATABASE_URL_UNPOOLED` to the Neon staging branch.
3. Run `npm run db:migrate` against that branch once (locally or a one-off job).
4. Deploy. Build: `npm run build` · Start: `npm run start` (see `railway.json`).

Do **not** add a Railway Postgres — Neon is the database.

## Commands

`dev` · `build` · `start` · `lint` · `typecheck` · `test` ·
`db:generate` · `db:migrate` · `db:studio` · `db:seed`

`node scripts/e2e-check.mjs` drives the running app in Chrome through the core
flows (sign-in, client CRUD + persistence, subscription → MRR, invoice + payment,
lead → opportunity conversion, pipeline drag-and-drop persistence, tasks, sign-out).

## Current MVP functionality

Working end-to-end (verified): email/password auth with protected routes;
workspace creation with owner role and per-workspace data isolation; client
directory/detail with contacts, notes, onboarding checklist, archive; leads with
convert-to-opportunity and mark-lost; pipeline board with DB-backed stages,
drag-and-drop persistence, and a transactional closed-won → client + subscriptions
+ onboarding-task conversion; billing (services, subscriptions with pause/resume/
cancel, multi-line invoices with open/paid/void, payments that update invoice
balances); tasks with linking, complete/reopen, delete; activity logging; dashboard
and reports computed from live records.

## Known limitations

- Single member per workspace in practice (no invitation flow yet; membership/roles are enforced server-side).
- No card processing — payments are recorded, not charged.
- No file uploads, email sending, or automations.
- MRR history is derived from subscription start/cancel dates rather than snapshots.
- Reports cover revenue/MRR basics only.
