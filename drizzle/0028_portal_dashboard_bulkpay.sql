CREATE TABLE "client_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid,
	"name" text NOT NULL,
	"storage_path" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"mime_type" text,
	"category" text DEFAULT 'other' NOT NULL,
	"uploaded_by" uuid,
	"uploaded_by_client" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "project_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"client_visible" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_dashboard_prefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"layout" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_requests" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "client_requests" ADD COLUMN "client_update" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "waiting_on_party" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "client_visible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "client_summary" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "client_visible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "client_files" ADD CONSTRAINT "client_files_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_files" ADD CONSTRAINT "client_files_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_files" ADD CONSTRAINT "client_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_files" ADD CONSTRAINT "client_files_uploaded_by_profiles_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_updates" ADD CONSTRAINT "project_updates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_updates" ADD CONSTRAINT "project_updates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_updates" ADD CONSTRAINT "project_updates_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_dashboard_prefs" ADD CONSTRAINT "user_dashboard_prefs_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_dashboard_prefs" ADD CONSTRAINT "user_dashboard_prefs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_files_storage_path_unique" ON "client_files" USING btree ("storage_path");--> statement-breakpoint
CREATE INDEX "client_files_workspace_client_idx" ON "client_files" USING btree ("workspace_id","client_id");--> statement-breakpoint
CREATE INDEX "project_updates_project_idx" ON "project_updates" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_dashboard_prefs_profile_workspace_unique" ON "user_dashboard_prefs" USING btree ("profile_id","workspace_id");--> statement-breakpoint
ALTER TABLE "client_requests" ADD CONSTRAINT "client_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;