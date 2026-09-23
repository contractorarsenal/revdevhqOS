ALTER TABLE "client_leads" ADD COLUMN "external_message_id" text;--> statement-breakpoint
ALTER TABLE "client_leads" ADD COLUMN "ingestion_source" text;--> statement-breakpoint
ALTER TABLE "client_leads" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
ALTER TABLE "client_leads" ADD COLUMN "received_on" date;--> statement-breakpoint
CREATE UNIQUE INDEX "client_leads_workspace_external_message_unique" ON "client_leads" USING btree ("workspace_id","external_message_id") WHERE "client_leads"."external_message_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "client_leads_workspace_client_dedupe_key_unique" ON "client_leads" USING btree ("workspace_id","client_id","dedupe_key") WHERE "client_leads"."dedupe_key" is not null;