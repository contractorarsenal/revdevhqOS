CREATE TYPE "public"."expense_category" AS ENUM('software', 'office_rent', 'payroll', 'contractors', 'ads', 'tools', 'misc');--> statement-breakpoint
CREATE TYPE "public"."expense_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" "expense_category" DEFAULT 'misc' NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"expense_date" date NOT NULL,
	"frequency" "billing_frequency" DEFAULT 'one_time' NOT NULL,
	"vendor" text,
	"notes" text,
	"status" "expense_status" DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "subscription_id" uuid;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "payment_day" integer;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "business_name" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "primary_color" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "accent_color" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "business_email" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "business_phone" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_workspace_date_idx" ON "expenses" USING btree ("workspace_id","expense_date");--> statement-breakpoint
CREATE INDEX "expenses_workspace_category_idx" ON "expenses" USING btree ("workspace_id","category");--> statement-breakpoint
CREATE INDEX "expenses_workspace_status_idx" ON "expenses" USING btree ("workspace_id","status");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_subscription_month_idx" ON "payments" USING btree ("subscription_id","billing_month");