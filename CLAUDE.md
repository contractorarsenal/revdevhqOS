# revdevhqOS — engineering rules

## Architecture
- Next.js App Router. Reads live in `src/server/queries/`, mutations in `src/server/actions/` ("use server").
- Pages are server components that fetch via queries and pass data to `src/features/*` client views.
- Never query the database from client components or expose connection strings / service keys to the browser.

## Supabase Auth (the only auth system)
- Identities, credentials, and sessions belong to Supabase Auth (`@supabase/ssr`).
- Clients: `src/lib/supabase/client.ts` (browser, anon key), `server.ts` (cookie-bound server client),
  `admin.ts` (service role — server-only, never imported into client components).
- `src/proxy.ts` refreshes the session per request and redirects; it is not authorization.
- `requireUser()` (validates via `auth.getUser()`, upserts the `profiles` row) and `requireWorkspace()`
  are the server-side gates. Do not add a second auth system or Better Auth remnants.

## Workspace isolation (non-negotiable)
- Every business table carries `workspace_id`.
- Every action/query starts with `authorize(minRole)` (`src/server/authorize.ts`).
- Every UPDATE/DELETE filters by `workspace_id` in addition to the record id (see `ownedClient`-style helpers).
- Cross-record references (serviceId, invoiceId, …) must be re-verified to belong to the caller's workspace.

## Database
- Supabase Postgres. Schema lives in `src/lib/db/schema.ts` only.
  Change it → `npm run db:generate` → review SQL → `npm run db:migrate` (runs against `DATABASE_URL_DIRECT`).
- UUID PKs, `timestamptz`, `numeric(12,2)` for money (strings in JS — convert with `toAmount`).
- `profiles.id` mirrors `auth.users.id` (FK added in migration 0001). No app table stores credentials.
- RLS is enabled on all app tables with no anon/authenticated policies — the app connects server-side as the
  table owner. If you ever add PostgREST access, write explicit policies first.
- Archive (set `archived_at` / status) instead of deleting clients and services. No destructive migrations
  without explicit approval.

## Financial rules
- Subscriptions = expected billing → MRR/ARR. Invoices = requested. Payments = collected.
- All money math goes through `src/lib/finance/metrics.ts` (unit-tested). MRR counts `active` + `past_due`
  subscriptions, normalized: weekly ×52÷12, quarterly ÷3, yearly ÷12, one-time = 0.
- Never hardcode dashboard numbers; metrics come from `src/server/queries/metrics.ts`.

## Server actions
- Signature: `(input: unknown) => Promise<ActionResult>`; parse with Zod schemas from `src/lib/validation`.
- Wrap multi-table writes in `db.transaction`. Call `logActivity` for significant events. `revalidatePath` after writes.
- Return `{ ok: false, error }` — never throw raw errors to the client.

## Environment & security
- Server env is lazily validated in `src/lib/env/server.ts` — never import it into client components; never
  make the build depend on runtime secrets. Public config only via `NEXT_PUBLIC_*` (`src/lib/env/public.ts`).
- Required vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
  DATABASE_URL, DATABASE_URL_DIRECT, NEXT_PUBLIC_APP_URL. Never commit `.env*` files with values.

## UI conventions
- Visual direction: `design-reference/original-prototype.html` (light, dense, indigo primary; status colors:
  green=good, amber=attention, red=overdue, indigo=in-progress, slate=inactive).
- Reuse `src/components/shared/*` (DataTable, MetricCard, StatusBadge, DetailDrawer, EmptyState, …).
- Forms: react-hook-form + zodResolver; show server errors inline; toast on success; `router.refresh()` after mutations.
- Empty selects submit `""` — optional uuid fields must use the `uuidOrNull` pattern in validation.

## Git & testing
- Feature branches only (current: `switch/supabase-vercel`); never commit directly to main.
- `npm run lint && npm run typecheck && npm run test && npm run build` must pass before pushing.
- Unit tests cover finance math, permissions, validation; `scripts/e2e-check.mjs` drives real flows in Chrome.

## Production safety
- Deployment: Vercel from GitHub. Migrations run from a trusted machine, never during Vercel builds.
- PGlite (`pglite://`) is dev-only and refuses to run in production.
- `scripts/seed.ts` is dev-only (exits under NODE_ENV=production); all demo data is labeled "(demo)".
