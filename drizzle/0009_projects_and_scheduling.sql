CREATE TYPE "public"."calendar_event_type" AS ENUM('work', 'meeting', 'focus_time', 'deadline', 'reminder', 'personal', 'out_of_office', 'task');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('planning', 'active', 'on_hold', 'completed', 'archived');--> statement-breakpoint
ALTER TYPE "public"."task_status" ADD VALUE 'waiting' BEFORE 'completed';--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "project_status" DEFAULT 'planning' NOT NULL,
	"owner_id" uuid,
	"client_id" uuid,
	"start_date" date,
	"due_date" date,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "event_type" "calendar_event_type" DEFAULT 'work' NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "all_day" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "scheduled_date" date;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "scheduled_start_time" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "scheduled_end_time" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "all_day" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "calendar_visible" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_workspace_status_idx" ON "projects" USING btree ("workspace_id","status");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_workspace_project_idx" ON "tasks" USING btree ("workspace_id","project_id");--> statement-breakpoint
CREATE INDEX "tasks_workspace_scheduled_idx" ON "tasks" USING btree ("workspace_id","scheduled_date");