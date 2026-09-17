-- CA Command Center sales/client leads split: deterministic, one-time
-- backfill of every existing client-generated lead (leads.client_id IS NOT
-- NULL) into the new dedicated client_leads table.
--
-- IDs are preserved exactly (explicit "id" in the INSERT, not a fresh
-- gen_random_uuid()) so any historical activity_logs row whose entity_id
-- points at one of these leads still resolves to the same identifier in
-- its new home.
--
-- The old "leads" rows are intentionally NOT deleted or modified — no
-- dependent relationship needs to be repaired, because nothing that
-- referenced them (activity_logs.lead_id, notes, tasks, opportunities) is
-- touched here: none of that ever pointed at a client-generated lead in
-- the first place (client leads never used the notes/tasks tables — their
-- "note" was always the plain leads.notes column carried over below, and
-- client leads are never converted to an opportunity). The dormant rows
-- remain in "leads" as harmless, documented legacy data; every
-- sales-facing query going forward filters WHERE client_id IS NULL.
--
-- Status is defensively re-validated against the 5-value client-lead
-- workflow rather than blindly cast, in case a row was ever pushed outside
-- that set through the shared edit form this split retires — falls back
-- to 'new' rather than failing the migration or writing a nonsense value.
-- name falls back to company/'Unknown' for the same reason: client_leads.name
-- is NOT NULL but leads.contact_name has always been nullable.
INSERT INTO "client_leads" (
  "id", "workspace_id", "client_id", "name", "email", "phone", "source", "status",
  "requested_service", "estimated_value", "closed_value", "owner_id",
  "received_at", "last_contacted_at", "estimate_scheduled_at", "won_at", "lost_at",
  "notes", "internal_notes", "archived_at", "created_at", "updated_at"
)
SELECT
  "id", "workspace_id", "client_id", COALESCE("contact_name", "company", 'Unknown'), "email", "phone", "source",
  CASE
    WHEN "status"::text IN ('new', 'contacted', 'estimate_scheduled', 'won', 'lost')
      THEN "status"::text::"client_lead_status"
    ELSE 'new'::"client_lead_status"
  END,
  "service_interest", "estimated_value", "closed_value", "owner_id",
  "received_at", "last_contacted_at", "estimate_scheduled_at", "won_at", "lost_at",
  "notes", "internal_notes", "archived_at", "created_at", "updated_at"
FROM "leads"
WHERE "client_id" IS NOT NULL;
