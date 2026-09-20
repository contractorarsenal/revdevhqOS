CREATE TYPE "public"."client_request_status" AS ENUM('new', 'triaged', 'in_progress', 'waiting', 'complete', 'client_notified');--> statement-breakpoint
CREATE TYPE "public"."client_request_type" AS ENUM('photo_change', 'phone_update', 'content_revision', 'new_page', 'new_service', 'bug', 'form_issue', 'tracking_issue', 'technical_problem', 'support_request', 'other');--> statement-breakpoint
CREATE TABLE "client_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"type" "client_request_type" DEFAULT 'other' NOT NULL,
	"status" "client_request_status" DEFAULT 'new' NOT NULL,
	"description" text NOT NULL,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"submitted_by" uuid,
	"task_id" uuid,
	"resolution_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_requests" ADD CONSTRAINT "client_requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_requests" ADD CONSTRAINT "client_requests_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_requests" ADD CONSTRAINT "client_requests_submitted_by_profiles_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_requests" ADD CONSTRAINT "client_requests_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_requests_workspace_status_idx" ON "client_requests" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "client_requests_workspace_client_idx" ON "client_requests" USING btree ("workspace_id","client_id");