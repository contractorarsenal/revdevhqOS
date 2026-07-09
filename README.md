# revdevhqOS

Internal operating system for a marketing agency: clients, leads, pipeline,
billing, tasks, onboarding, and financial reporting in one workspace.

## Stack

- **Next.js 16** (App Router, React 19, TypeScript)
- **Supabase** — Postgres database + **Supabase Auth** (email/password, `@supabase/ssr`)
- **Drizzle ORM** for schema, migrations, and all server-side queries
- **Tailwind CSS 4 + shadcn/ui** — design system ported from `design-reference/original-prototype.html`
- **dnd-kit** (pipeline board), **TanStack Table**, **Recharts**, **react-hook-form + Zod**
- **Vitest** for unit tests, **Vercel** for hosting, GitHub for source control

## Architecture

```
src/
  app/            routes: (auth)/sign-in|sign-up, auth/confirm, setup, (dashboard)/<feature>
  components/     ui/ (shadcn), layout/ (sidebar, topbar), shared/ (DataTable, MetricCard, …)
  features/       feature UIs: clients, leads, pipeline, billing, tasks, onboarding, reports, settings
  lib/            supabase/ (browser/server/admin clients), auth/ (session + workspace helpers),
                  db/ (drizzle client + schema), env/ (lazy Zod-validated env), finance/, permissions/, validation/
  server/         actions/ (all mutations, "use server"), queries/ (all reads), authorize.ts, activity.ts
drizzle/          SQL migrations (0000 schema, 0001 auth-FK + RLS hardening)
scripts/          migrate.ts, seed.ts (dev-only demo data), e2e-check.mjs
design-reference/ original static prototype (visual reference only — not the app)
```

**Auth model:** Supabase Auth owns identities, credentials, and sessions.
`src/proxy.ts` refreshes the session and redirects unauthenticated requests;
`requireUser()` validates the session server-side and maintains a `profiles`
row; `requireWorkspace()` enforces workspace membership + role on every query
and mutation. There is exactly one auth system.

**Data path for every feature:** form (react-hook-form + Zod) → server action
(`authorize()`) → Drizzle → Supabase Postgres → `revalidatePath` → updated UI.
The app talks to Postgres server-side only; **RLS is enabled on every table
with no anon/authenticated policies**, so the public PostgREST API cannot
touch app data.

**Financial rules:** subscriptions = expected billing (drive MRR/ARR);
invoices = amounts requested; payments = money actually collected. Metrics are
computed in `src/server/queries/metrics.ts` + `src/lib/finance/metrics.ts` (unit-tested).

## Local setup

```bash
npm install
cp .env.example .env.local   # then fill values (see below)
npm run db:migrate           # applies drizzle/ migrations to DATABASE_URL_DIRECT
npm run dev
```

Zero-install local data layer: `DATABASE_URL=pglite://.pglite/data` runs an
embedded Postgres (dev-only). Auth always uses your real Supabase project.

### Environment variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (Settings → API) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable/anon key — safe for the browser (RLS enforced) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only; admin operations (demo seed). Never expose. |
| `DATABASE_URL` | Supabase **pooled** connection string (app runtime) |
| `DATABASE_URL_DIRECT` | Supabase **direct** connection string (migrations; falls back to `DATABASE_URL`) |
| `NEXT_PUBLIC_APP_URL` | Base URL of the deployment |

Never commit `.env*` files with values — they are gitignored.

## Supabase setup

1. Project: `fclephvgzdrlxpzdnbgy` (or your own). Copy API URL + keys into `.env.local`.
2. Copy the connection strings (Settings → Database): pooler URI → `DATABASE_URL`,
   direct URI → `DATABASE_URL_DIRECT`.
3. `npm run db:migrate` — creates all 19 app tables, links `profiles` to
   `auth.users`, and enables RLS everywhere.
4. Auth → Providers: Email enabled. If "Confirm email" is on, sign-up shows a
   check-your-email notice and `/auth/confirm` completes the flow; disable it
   for instant sign-in in development.
5. Optional demo data: `npm run db:seed` (dev-only; needs the service-role key;
   creates `demo@revdevhqos.dev` / `demo-password-123` with clearly-labeled records).

Schema changes: edit `src/lib/db/schema.ts` → `npm run db:generate` → review SQL → `npm run db:migrate`.

## Production bootstrap (first admin)

After migrations have been applied to the Supabase project:

```bash
# password read from local env only — never committed or printed
ADMIN_PASSWORD='choose-a-strong-password' npm run admin:create
# …or run `npm run admin:create` with no variable to be prompted (hidden input)
```

Creates (idempotently): a **confirmed** auth user `jay@revdevhq.com`, its
`profiles` row, a **RevDevHQ** workspace with `owner` membership, and the
default pipeline stages + onboarding template. Running it again changes
nothing and never resets the password. Override with `ADMIN_EMAIL`,
`ADMIN_NAME`, `WORKSPACE_NAME` if needed.

### Supabase Auth URL configuration

In **Supabase → Authentication → URL Configuration** set:

- **Site URL**: your Vercel production URL
- **Redirect URLs**:
  - `http://localhost:3000/**`
  - `https://YOUR-VERCEL-DOMAIN.vercel.app/**`

If **Confirm email** (Authentication → Providers → Email) is enabled,
self-serve sign-ups must confirm via email before signing in (`/auth/confirm`
handles the link). The bootstrap admin is created pre-confirmed and can sign
in immediately either way.

## Vercel deployment

1. Import the GitHub repo `contractorarsenal/revdevhqOS` in Vercel (framework: Next.js — zero config).
2. Set the six environment variables above (Production + Preview).
3. Set `NEXT_PUBLIC_APP_URL` to the Vercel URL; add the same URL to Supabase
   Auth → URL Configuration (Site URL + redirect URLs, including `/auth/confirm`).
4. Deploy. Node 22 is pinned via `package.json` engines and `.nvmrc`.

Run migrations from your machine (`npm run db:migrate` against
`DATABASE_URL_DIRECT`) — Vercel builds never run DDL.

## Commands

`dev` · `build` · `start` · `lint` · `typecheck` · `test` ·
`db:generate` · `db:migrate` · `db:studio` · `db:seed`

`node scripts/e2e-check.mjs` drives the running app in Chrome end-to-end:
Supabase sign-in, workspace setup, client/lead/pipeline/billing/task CRUD with
persistence-after-refresh checks, and sign-out.

## Current MVP functionality

Email/password auth (Supabase) with protected routes and server-side session
validation; workspace creation with owner role and per-workspace isolation;
clients (directory, detail, contacts, notes, onboarding checklist, archive);
leads (CRUD, convert → opportunity, mark lost); pipeline (DB-backed stages,
drag-and-drop persistence, transactional closed-won conversion); billing
(services, subscriptions, invoices, payments with balance updates); tasks
(CRUD, linking, complete/reopen); activity logging; dashboard and reports
computed from live records.

## Known limitations

- No team invitation flow yet (roles/membership are enforced server-side).
- No card processing — payments are recorded, not charged.
- No file uploads, email sending, or automations.
- MRR history is derived from subscription start/cancel dates rather than snapshots.
