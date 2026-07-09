ALTER TABLE "invoices" ADD COLUMN "billing_frequency" "billing_frequency" DEFAULT 'one_time' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "billing_month" date;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "payment_type" "billing_frequency" DEFAULT 'one_time' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "billing_month" date;--> statement-breakpoint
CREATE INDEX "clients_workspace_created_idx" ON "clients" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "invoices_workspace_issue_idx" ON "invoices" USING btree ("workspace_id","issue_date");--> statement-breakpoint
CREATE INDEX "invoices_workspace_billing_month_idx" ON "invoices" USING btree ("workspace_id","billing_month");--> statement-breakpoint
CREATE INDEX "payments_workspace_billing_month_idx" ON "payments" USING btree ("workspace_id","billing_month");--> statement-breakpoint
CREATE INDEX "tasks_workspace_due_idx" ON "tasks" USING btree ("workspace_id","due_date");