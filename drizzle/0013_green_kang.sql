CREATE TYPE "public"."client_portal_role" AS ENUM('client_owner', 'client_member', 'client_read_only');--> statement-breakpoint
CREATE TYPE "public"."client_portal_status" AS ENUM('invited', 'active', 'suspended', 'revoked');--> statement-breakpoint
CREATE TABLE "client_portal_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "client_portal_role" DEFAULT 'client_owner' NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"invited_by" uuid,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_portal_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"role" "client_portal_role" DEFAULT 'client_owner' NOT NULL,
	"status" "client_portal_status" DEFAULT 'active' NOT NULL,
	"invited_by" uuid,
	"invited_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "portal_accent_color" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "client_portal_invites" ADD CONSTRAINT "client_portal_invites_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_portal_invites" ADD CONSTRAINT "client_portal_invites_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_portal_invites" ADD CONSTRAINT "client_portal_invites_invited_by_profiles_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_portal_memberships" ADD CONSTRAINT "client_portal_memberships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_portal_memberships" ADD CONSTRAINT "client_portal_memberships_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_portal_memberships" ADD CONSTRAINT "client_portal_memberships_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_portal_memberships" ADD CONSTRAINT "client_portal_memberships_invited_by_profiles_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_portal_invites_token_hash_unique" ON "client_portal_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "client_portal_invites_workspace_client_idx" ON "client_portal_invites" USING btree ("workspace_id","client_id");--> statement-breakpoint
CREATE INDEX "client_portal_invites_workspace_created_idx" ON "client_portal_invites" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "client_portal_memberships_client_profile_unique" ON "client_portal_memberships" USING btree ("client_id","profile_id");--> statement-breakpoint
CREATE INDEX "client_portal_memberships_profile_idx" ON "client_portal_memberships" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "client_portal_memberships_workspace_client_idx" ON "client_portal_memberships" USING btree ("workspace_id","client_id");--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_one_primary_per_client" ON "contacts" USING btree ("client_id") WHERE "contacts"."is_primary" = true;--> statement-breakpoint
CREATE INDEX "leads_workspace_client_idx" ON "leads" USING btree ("workspace_id","client_id");