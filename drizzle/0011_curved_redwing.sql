CREATE TYPE "public"."goal_metric_type" AS ENUM('revenue_collected', 'new_clients', 'new_leads', 'calls_completed', 'emails_sent', 'projects_completed', 'tasks_completed', 'custom');--> statement-breakpoint
CREATE TYPE "public"."goal_period_type" AS ENUM('weekly', 'monthly', 'quarterly', 'annual', 'custom');--> statement-breakpoint
CREATE TYPE "public"."goal_status" AS ENUM('active', 'completed', 'archived');--> statement-breakpoint
CREATE TABLE "business_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"metric_type" "goal_metric_type" NOT NULL,
	"period_type" "goal_period_type" NOT NULL,
	"target_value" numeric(12, 2) NOT NULL,
	"manual_current_value" numeric(12, 2),
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"status" "goal_status" DEFAULT 'active' NOT NULL,
	"color" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "business_goals_target_positive" CHECK ("business_goals"."target_value" > 0),
	CONSTRAINT "business_goals_manual_non_negative" CHECK ("business_goals"."manual_current_value" IS NULL OR "business_goals"."manual_current_value" >= 0),
	CONSTRAINT "business_goals_period_valid" CHECK ("business_goals"."period_end" >= "business_goals"."period_start")
);
--> statement-breakpoint
CREATE TABLE "goal_progress_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"previous_value" numeric(12, 2) NOT NULL,
	"new_value" numeric(12, 2) NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "business_goals" ADD CONSTRAINT "business_goals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_goals" ADD CONSTRAINT "business_goals_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_progress_updates" ADD CONSTRAINT "goal_progress_updates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_progress_updates" ADD CONSTRAINT "goal_progress_updates_goal_id_business_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."business_goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_progress_updates" ADD CONSTRAINT "goal_progress_updates_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "business_goals_workspace_status_idx" ON "business_goals" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "business_goals_workspace_period_idx" ON "business_goals" USING btree ("workspace_id","period_start","period_end");--> statement-breakpoint
CREATE INDEX "business_goals_workspace_created_idx" ON "business_goals" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "business_goals_workspace_archived_idx" ON "business_goals" USING btree ("workspace_id","archived_at");--> statement-breakpoint
CREATE UNIQUE INDEX "business_goals_one_primary_per_workspace" ON "business_goals" USING btree ("workspace_id") WHERE "business_goals"."is_primary" = true;--> statement-breakpoint
CREATE INDEX "goal_progress_updates_goal_created_idx" ON "goal_progress_updates" USING btree ("goal_id","created_at");