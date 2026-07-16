ALTER TYPE "public"."lead_status" ADD VALUE 'estimate_scheduled';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE 'won';--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "closed_value" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "received_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "estimate_scheduled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "won_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "lost_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "internal_notes" text;