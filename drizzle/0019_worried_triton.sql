ALTER TYPE "public"."project_status" ADD VALUE 'onboarding';--> statement-breakpoint
ALTER TYPE "public"."project_status" ADD VALUE 'waiting_on_client';--> statement-breakpoint
ALTER TYPE "public"."project_status" ADD VALUE 'ready_to_build';--> statement-breakpoint
ALTER TYPE "public"."project_status" ADD VALUE 'building';--> statement-breakpoint
ALTER TYPE "public"."project_status" ADD VALUE 'client_review';--> statement-breakpoint
ALTER TYPE "public"."project_status" ADD VALUE 'revisions';--> statement-breakpoint
ALTER TYPE "public"."project_status" ADD VALUE 'ready_to_launch';--> statement-breakpoint
ALTER TYPE "public"."project_status" ADD VALUE 'live';--> statement-breakpoint
ALTER TYPE "public"."project_status" ADD VALUE 'paused';--> statement-breakpoint
ALTER TYPE "public"."project_status" ADD VALUE 'at_risk';--> statement-breakpoint
ALTER TYPE "public"."project_status" ADD VALUE 'closed';--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "waiting_on" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "next_action" text;