# Whop Integration Plan (planning only — not implemented)

No Whop API credentials or docs exist in this repo/env, so per instructions
this is a plan only. Nothing below is wired up.

## Where it hooks in

- **Webhook endpoint**: `src/app/api/integrations/whop/webhook/route.ts` (new).
  Verifies `WHOP_WEBHOOK_SECRET` signature, then handles
  `payment.succeeded` / `membership.went_valid` / `membership.went_invalid` /
  `payment.refunded` events.
- **Customer matching**: match incoming Whop customer by email against
  `clients.email` / `contacts.email` within the workspace that owns the
  integration. No match → create the client as `onboarding` status, tagged
  as Whop-sourced (via `external_customers`, see below), for manual review.
- **Membership/subscription mapping**: a Whop membership maps to one
  `subscriptions` row (amount/frequency from the Whop plan), linked through
  `external_customers` → `clients.id`.
- **Payment creation**: a Whop `payment.succeeded` event creates a `payments`
  row the same way `markSubscriptionCollected` does today (status
  `succeeded`, `paymentType: "monthly"`, `billingMonth` from the event),
  tagged with the Whop payment id for idempotency.
- **Duplicate prevention**: unique constraint on
  `external_payments(provider, external_id)` — a retried webhook cannot
  create a second payment. Mirrors the existing
  `payments.subscriptionId + billingMonth` duplicate guard already built for
  manual collection.
- **Void/refund handling**: a `payment.refunded` event calls the existing
  `voidPayment()` action against the mapped internal payment — reuses all
  current invoice-recalculation logic, no new refund path needed.

## Proposed env vars

- `WHOP_API_KEY` — server-only, for any outbound calls (e.g. verifying a
  membership on demand).
- `WHOP_WEBHOOK_SECRET` — verifies inbound webhook signatures.

## Proposed tables (additive, not created yet)

- `integrations` — one row per connected provider per workspace
  (`workspace_id`, `provider`, `status`, `connected_at`, `config jsonb`).
- `external_customers` — maps a provider's customer id to a `clients.id`
  (`workspace_id`, `provider`, `external_customer_id`, `client_id`, unique on
  provider+external id).
- `external_payments` — maps a provider's payment/charge id to an internal
  `payments.id` for idempotency (`workspace_id`, `provider`, `external_id`
  unique, `payment_id`).

## Why not build it now

No API credentials, webhook secret, or Whop API docs are present to
implement or test against safely. Building against guesses risks a broken
integration and fabricated data — building the tables without the
integration would leave unused schema. Both are explicitly out of scope
until credentials/docs are provided.
