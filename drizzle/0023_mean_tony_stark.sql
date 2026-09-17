CREATE TYPE "public"."client_lead_status" AS ENUM('new', 'contacted', 'estimate_scheduled', 'won', 'lost');--> statement-breakpoint
CREATE TABLE "client_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"source" text,
	"status" "client_lead_status" DEFAULT 'new' NOT NULL,
	"requested_service" text,
	"estimated_value" numeric(12, 2),
	"closed_value" numeric(12, 2),
	"owner_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_contacted_at" timestamp with time zone,
	"estimate_scheduled_at" timestamp with time zone,
	"won_at" timestamp with time zone,
	"lost_at" timestamp with time zone,
	"notes" text,
	"internal_notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_leads" ADD CONSTRAINT "client_leads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_leads" ADD CONSTRAINT "client_leads_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_leads" ADD CONSTRAINT "client_leads_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_leads_workspace_client_idx" ON "client_leads" USING btree ("workspace_id","client_id");--> statement-breakpoint
CREATE INDEX "client_leads_workspace_status_idx" ON "client_leads" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "client_leads_workspace_received_idx" ON "client_leads" USING btree ("workspace_id","received_at");