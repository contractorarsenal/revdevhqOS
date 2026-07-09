# revdevhqOS — engineering rules

## Architecture
- Next.js App Router. Reads live in `src/server/queries/`, mutations in `src/server/actions/` ("use server").
- Pages are server components that fetch via queries and pass data to `src/features/*` client views.
- Never query the database from client components or expose connection strings to the browser.

## Workspace isolation (non-negotiable)
- Every business table carries `workspace_id`.
- Every action/query starts with `authorize(minRole)` (`src/server/authorize.ts`), which validates the
  session, workspace membership, and role — never rely on hidden navigation.
- Every UPDATE/DELETE must filter by `workspace_id` in addition to the record id (see `ownedClient`-style helpers).
- Cross-record references (serviceId, invoiceId, …) must be re-verified to belong to the caller's workspace.

## Database
- Schema lives in `src/lib/db/schema.ts` only. Change it → `npm run db:generate` → review SQL → `npm run db:migrate`.
- UUID PKs, `timestamptz`, `numeric(12,2)` for money (strings in JS — convert with `toAmount`).
- Statuses are pg enums; add values via migration, never free text.
- Archive (set `archived_at` / status) instead of deleting clients and services.

## Authentication
- Better Auth (email/password) with the Drizzle adapter; tables: users/sessions/accounts/verifications.
- `src/proxy.ts` is a fast cookie check only; real enforcement is `requireUser`/`requireWorkspace` server-side.

## Financial rules
- Subscriptions = expected billing → MRR/ARR. Invoices = requested. Payments = collected.
- All money math goes through `src/lib/finance/metrics.ts` (unit-tested). MRR counts `active` + `past_due`
  subscriptions, normalized: weekly ×52÷12, quarterly ÷3, yearly ÷12, one-time = 0.
- Never hardcode dashboard numbers; metrics come from `src/server/queries/metrics.ts`.

## Server actions
- Signature: `(input: unknown) => Promise<ActionResult>`; parse with Zod schemas from `src/lib/validation`.
- Wrap multi-table writes in `db.transaction`. Call `logActivity` for significant events. `revalidatePath` after writes.
- Return `{ ok: false, error }` — never throw raw errors to the client.

## UI conventions
- Visual direction: `design-reference/original-prototype.html` (light, dense, indigo primary, status colors:
  green=good, amber=attention, red=overdue, indigo=in-progress, slate=inactive).
- Reuse `src/components/shared/*` (DataTable, MetricCard, StatusBadge, DetailDrawer, EmptyState, …).
- Forms: react-hook-form + zodResolver; show server errors inline; toast on success; `router.refresh()` after mutations.
- Empty selects submit `""` — optional uuid fields must use the `uuidOrNull` pattern in validation.

## Git & testing
- Work on feature branches (current: `build/functional-mvp`); never commit directly to main.
- `npm run lint && npm run typecheck && npm run test && npm run build` must pass before pushing.
- Unit tests cover finance math, permissions, and validation; `scripts/e2e-check.mjs` drives real flows.

## Production safety
- Never commit `.env*`. PGlite (`pglite://`) is dev-only and refuses to run in production.
- `scripts/seed.ts` is dev-only (exits under NODE_ENV=production) and all demo data is labeled "(demo)".
- Review generated SQL before migrating; migrations run against `DATABASE_URL_UNPOOLED`.
