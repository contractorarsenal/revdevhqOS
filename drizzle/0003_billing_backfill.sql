-- Backfill billing metadata on existing rows (additive, no destructive changes).
-- Existing payments/invoices default to one_time via the column defaults;
-- billing_month is inferred from the payment/issue date.
UPDATE "payments" SET "billing_month" = date_trunc('month', "paid_at")::date WHERE "billing_month" IS NULL;--> statement-breakpoint
UPDATE "invoices" SET "billing_month" = date_trunc('month', COALESCE("issue_date"::timestamp, "created_at"))::date WHERE "billing_month" IS NULL;
