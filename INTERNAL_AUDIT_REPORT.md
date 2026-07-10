# revdevhqOS Internal Audit Report

Date: 2026-07-09
Branch audited: `fix/payment-removal`
Production URL: `https://revdevhq-os.vercel.app`
Scope: read-only engineering audit of the Next.js/Supabase/Drizzle/Vercel codebase.

## 1. Executive Summary

Overall health: the application is organized, builds successfully, uses one auth system, has additive migrations, keeps secrets out of tracked files, and has a coherent feature structure. The biggest production concern is not framework quality; it is authorization depth around related record IDs.

The main P1 issue is that several server actions authorize the current workspace, then trust client-provided related IDs such as `ownerId`, `assigneeId`, `clientId`, `leadId`, `opportunityId`, and `invoiceId` without consistently verifying those related rows belong to the same workspace or match each other. Because server reads later join related tables by bare ID, a forged cross-workspace reference can corrupt tenant data and, if an attacker knows another workspace UUID, expose names from another workspace in list views.

No P0 emergency was found. Production is usable for trusted/internal users, but it should not be considered fully hardened for broader multi-tenant use until the P1 relationship-authorization gaps are fixed.

## 2. Overall Health Score

Score: 6.5 / 10

Rationale: core architecture is solid and verification commands pass, but the P1 server-side relationship authorization bug materially lowers production readiness for a multi-workspace SaaS.

## 3. What Is Working Well

- Single auth system: Supabase Auth only. No runtime Better Auth route or code was found.
- Protected dashboard routes go through `requireWorkspace()` in `src/app/(dashboard)/layout.tsx:5`.
- `requireUser()` is cached per request and read-first; it no longer writes profiles on every request (`src/lib/auth/session.ts:39`, `src/lib/auth/session.ts:52`).
- `requireWorkspace()` verifies DB membership before selecting the active workspace (`src/lib/auth/session.ts:85`).
- Server actions consistently call `authorize()` for role checks (`src/server/authorize.ts:9`).
- Migrations are ordered and additive. RLS is enabled on all app tables in `drizzle/0001_supabase_hardening.sql:19`.
- Billing has explicit payment voiding with audit columns and invoice recalculation (`src/server/actions/billing.ts:333`).
- `.env*` files are ignored, and `.env.example` contains names only.
- `npm run typecheck`, `npm run test`, and `npm run build` pass.

## 4. Critical Issues

- P0: none found.

## 5. High Priority Issues

- P1: Server actions trust related IDs without workspace/member validation.
  - `addNote()` inserts `clientId`, `leadId`, `opportunityId`, and `taskId` directly after only validating UUID shape (`src/server/actions/notes.ts:10`, `src/lib/validation/index.ts:154`).
  - `createTask()` and `updateTask()` write `assigneeId`, `clientId`, `leadId`, and `opportunityId` without ownership checks (`src/server/actions/tasks.ts:27`, `src/server/actions/tasks.ts:41`, `src/server/actions/tasks.ts:57`).
  - `createOpportunity()` and `updateOpportunity()` validate `stageId`, but not optional `leadId`, `clientId`, or `ownerId` (`src/server/actions/pipeline.ts:112`, `src/server/actions/pipeline.ts:133`).
  - `createClient()`, `updateClient()`, `createLead()`, and `updateLead()` accept `ownerId` without verifying workspace membership (`src/server/actions/clients.ts:21`, `src/server/actions/leads.ts:38`).
  - Read queries join related tables by ID without reasserting related workspace, which can surface cross-workspace names if bad references exist (`src/server/queries/tasks.ts:28`, `src/server/queries/pipeline.ts:34`, `src/server/queries/clients.ts:25`, `src/server/queries/leads.ts:29`).
  - Fix: add shared helpers such as `assertWorkspaceClient`, `assertWorkspaceLead`, `assertWorkspaceOpportunity`, `assertWorkspaceTask`, and `assertWorkspaceMember`; use them before every write. Also add composite DB constraints or triggers where feasible.

- P1: Payment recording allows invoice/client mismatch.
  - `recordPayment()` validates the invoice is in the workspace and validates the provided client is in the workspace, but does not require `data.clientId === invoice.clientId` when both are present (`src/server/actions/billing.ts:272`, `src/server/actions/billing.ts:282`, `src/server/actions/billing.ts:291`).
  - The payment form can select an invoice, then switch client before submit (`src/features/billing/payment-form-dialog.tsx:38`, `src/features/billing/payment-form-dialog.tsx:60`, `src/features/billing/payment-form-dialog.tsx:65`).
  - Impact: payment revenue can be attributed to Client B while reducing Client A's invoice balance.
  - Fix: server must override `clientId` from invoice when `invoiceId` is present, or reject mismatch.

## 6. Medium Priority Issues

- P2: Auth confirmation has an open redirect.
  - `/auth/confirm` redirects to `new URL(next, request.url)` with unsanitized `next` (`src/app/auth/confirm/route.ts:10`, `src/app/auth/confirm/route.ts:16`).
  - Fix: only allow relative paths beginning with `/`, reject `//`, and default to `/dashboard`.

- P2: Archived clients can still inflate recurring revenue.
  - `archiveClient()` only sets client status/archivedAt (`src/server/actions/clients.ts:99`).
  - MRR calculations include all active/past_due subscriptions regardless of client status (`src/server/queries/metrics.ts:34`, `src/lib/finance/metrics.ts:40`).
  - Fix: either cancel/pause active subscriptions on archive, or exclude archived clients from recurring metrics by joining `clients`.

- P2: `markInvoicePaid()` creates incomplete billing metadata.
  - The inserted payment omits `paymentType` and `billingMonth`, so it falls back to `one_time`/null instead of inheriting invoice billing metadata (`src/server/actions/billing.ts:239`).
  - Impact: billing month filters can miss these payments.
  - Fix: copy `inv.billingFrequency` and `inv.billingMonth` into the generated payment.

- P2: Date/month handling is not consistently workspace-timezone aware.
  - Form defaults use UTC `toISOString().slice(...)` (`src/features/billing/invoice-form-dialog.tsx:46`, `src/features/billing/payment-form-dialog.tsx:52`, `src/features/billing/subscription-form-dialog.tsx:44`).
  - Dashboard metrics use workspace timezone (`src/server/queries/metrics.ts:13`).
  - Fix: centralize date/month helpers that use workspace timezone, especially for billing month and due-date boundaries.

- P2: Mobile navigation is incomplete.
  - Sidebar is hidden on mobile (`src/components/layout/app-sidebar.tsx:59`).
  - Topbar has Quick Add but no mobile route menu (`src/components/layout/app-topbar.tsx:18`).
  - Fix: add a mobile sheet/nav trigger in the topbar.

- P2: Tests do not cover server actions or workspace isolation.
  - Current tests are pure finance/permissions/validation only (`src/lib/finance/metrics.test.ts`, `src/lib/permissions/index.test.ts`, `src/lib/validation/index.test.ts`).
  - Fix: add DB-backed tests for cross-workspace IDs, payment invoice/client mismatch, archive/revenue behavior, and reports.

## 7. Low Priority Cleanup

- P3: Lint warnings only:
  - unused `created` variable in `scripts/e2e-check.mjs:22`.
  - React Compiler compatibility warnings for TanStack Table / React Hook Form (`src/components/shared/data-table.tsx:38`, `src/features/billing/invoice-form-dialog.tsx:35`, `src/features/billing/payment-form-dialog.tsx:38`).
- P3: Default Next/Vercel public SVG assets appear unused (`public/file.svg`, `public/vercel.svg`, `public/next.svg`, `public/globe.svg`, `public/window.svg`).
- P3: `scripts/seed.ts` refuses only when `NODE_ENV=production`; it can still seed a real Supabase project when `NODE_ENV` is unset/development (`scripts/seed.ts:18`). Add an explicit `ALLOW_DEMO_SEED=true` or project allowlist.
- P3: `scripts/migrate.ts` uses the direct URL but does not configure SSL like the runtime DB does (`scripts/migrate.ts:21`). If Supabase direct connections require SSL in some environments, migrations can fail.

## 8. Security Findings

- P1: related-ID authorization gaps can create cross-workspace references and potential name leaks through joins.
- P2: open redirect in `/auth/confirm`.
- No committed `.env` secrets were found. `.env.local` and `.env.production` are ignored.
- `SUPABASE_SERVICE_ROLE_KEY` is only used in server-only/admin script contexts; no browser exposure found.
- RLS is enabled, but app runtime uses a server Postgres connection. The practical isolation boundary is application authorization, not Supabase RLS.
- Secret grep was run with env files excluded/redacted to avoid printing real values. Hits were expected references in docs/scripts/source.

## 9. Database/RLS Findings

- Required core tables exist in schema/migrations: profiles, workspaces, workspace_members, clients, contacts, leads, pipeline_stages, opportunities, services, subscriptions, invoices, invoice_items, payments, tasks, notes, activity_logs, onboarding_templates, onboarding_steps, client_onboarding.
- Migrations are additive: `0000` schema, `0001` hardening/RLS, `0002` billing month/indexes, `0003` backfill, `0004` payment voiding.
- RLS has no anon/authenticated policies, so PostgREST access with anon key should be blocked.
- No composite FK constraints enforce that child rows' `workspace_id` matches related rows' `workspace_id`. This is the DB-level root of the P1 cross-workspace-reference risk.
- Several useful indexes exist on workspace/status/date paths. Missing or weak indexes to consider:
  - `notes(workspace_id, client_id, created_at)`
  - `contacts(workspace_id, client_id)`
  - `client_onboarding(workspace_id, client_id)`
  - `payments(workspace_id, client_id, paid_at)`

## 10. Billing/Revenue Findings

- Voided payments are excluded from metrics by status filters (`src/server/queries/metrics.ts:45`, `src/server/queries/reports.ts:17`).
- `voidPayment()` recalculates linked invoice amount/status in a transaction (`src/server/actions/billing.ts:345`).
- Payment invoice/client mismatch is P1 and can corrupt revenue by client.
- Mark-paid payments do not inherit invoice billing metadata.
- Archived clients can retain active subscriptions and continue counting toward MRR.
- Dashboard recent payments uses all payments from `listPayments()` and does not filter voided rows before rendering the latest five (`src/app/(dashboard)/dashboard/page.tsx:27`, `src/app/(dashboard)/dashboard/page.tsx:161`).

## 11. UX/Performance Findings

Top 5 performance risk areas:

1. Dashboard loads all payments just to render five recent rows (`src/app/(dashboard)/dashboard/page.tsx:27`, `src/server/queries/billing.ts:60`). Add `listRecentPayments(workspaceId, limit)`.
2. Billing page loads services, subscriptions, invoices, payments, clients, and dashboard metrics all at once (`src/app/(dashboard)/billing/page.tsx:14`). Add tab-scoped queries or pagination.
3. Client detail loads all workspace invoices just to support payment form invoice options (`src/app/(dashboard)/clients/[id]/page.tsx:11`). Use client-scoped open invoices or a search endpoint.
4. `listClients()` performs multiple full-workspace follow-up queries with `inArray` over all clients (`src/server/queries/clients.ts:12`). This is acceptable for MVP but needs pagination/aggregates as data grows.
5. Reports aggregate all succeeded payments/subscriptions without date bounds besides view-level defaults (`src/server/queries/reports.ts:7`). Add range filters and indexed report queries.

UX positives:

- Loading and error boundaries exist.
- Empty states exist across major features.
- Mutating dialogs generally show pending states and close on success.
- Confirmation dialogs exist for destructive operations.

UX gaps:

- No mobile navigation.
- Sign-out has no pending/disabled state (`src/components/layout/sign-out-button.tsx:16`).
- Production URL was not live-tested from this environment; the web opener blocked the URL safety check.

## 12. Test/Build Results

- `pwd`: `/Users/revdevhq/Documents/DEV/revdevhqOS`
- `git branch --show-current`: `fix/payment-removal`
- `git remote -v`: `origin https://github.com/contractorarsenal/revdevhqOS.git`
- `git log --oneline -10`: latest commit `b797721 Merge pull request #10 from contractorarsenal/fix/ux-speed-clients-billing`
- `find . -maxdepth 3 -type f | sort`: ran; output includes ignored `node_modules` and `.next`, so it was truncated/noisy.
- `npm run lint`: passed with 4 warnings, 0 errors.
- `npm run typecheck`: passed.
- `npm run test`: passed, 3 files, 35 tests.
- `npm run build`: first failed in sandbox because `next/font/google` could not fetch Inter. Rerun with network approval passed.
- Current tracked source status after audit before report: clean; ignored files include `.env.local`, `.env.production`, `.next`, `.pglite`, `node_modules`, `next-env.d.ts`, `tsconfig.tsbuildinfo`.

## 13. Recommended Next 10 Improvements

1. Fix P1 related-ID authorization in all server actions.
2. Fix P1 payment invoice/client mismatch by enforcing invoice-client consistency server-side.
3. Add DB-backed tests for workspace isolation and relationship ownership.
4. Sanitize `/auth/confirm?next=...` redirects.
5. Decide archived-client billing semantics, then enforce them in archive action or metrics.
6. Copy invoice billing metadata when marking invoices paid.
7. Add composite workspace integrity constraints/triggers for child relationships.
8. Add mobile navigation to the authenticated layout.
9. Replace broad list queries with limited/paginated queries for dashboard, billing, reports, and client detail.
10. Harden seed/migrate scripts for production safety and SSL consistency.

## 14. Exact Files That Need Attention

- `src/server/actions/notes.ts`
- `src/server/actions/tasks.ts`
- `src/server/actions/pipeline.ts`
- `src/server/actions/clients.ts`
- `src/server/actions/leads.ts`
- `src/server/actions/billing.ts`
- `src/server/queries/tasks.ts`
- `src/server/queries/pipeline.ts`
- `src/server/queries/clients.ts`
- `src/server/queries/leads.ts`
- `src/server/queries/reports.ts`
- `src/server/queries/metrics.ts`
- `src/app/auth/confirm/route.ts`
- `src/app/(dashboard)/dashboard/page.tsx`
- `src/app/(dashboard)/billing/page.tsx`
- `src/app/(dashboard)/clients/[id]/page.tsx`
- `src/components/layout/app-sidebar.tsx`
- `src/components/layout/app-topbar.tsx`
- `src/features/billing/payment-form-dialog.tsx`
- `src/features/billing/invoice-form-dialog.tsx`
- `scripts/seed.ts`
- `scripts/migrate.ts`
- `scripts/e2e-check.mjs`
- `drizzle/0000_supabase_schema.sql`
- `src/lib/db/schema.ts`

## 15. Is Production Safe To Keep Using?

Yes, with constraints.

Production is safe to keep using for trusted internal users while the P1 items are fixed. I did not find a P0 data-loss emergency, exposed secret, broken build, missing auth system, or destructive migration. However, the app is not fully production-hardened for broader multi-tenant or untrusted-user usage until server actions validate every related ID against the active workspace and billing enforces invoice/client consistency.
