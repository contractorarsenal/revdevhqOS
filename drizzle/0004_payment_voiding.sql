ALTER TYPE "public"."payment_status" ADD VALUE 'voided';--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "voided_by" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_voided_by_profiles_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;