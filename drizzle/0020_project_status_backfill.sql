-- CA Command Center project-stage migration: deterministic mapping from the
-- original 5 project statuses onto the new 11-value operational lifecycle.
-- completed_at / archived_at / project ids / relationships are untouched —
-- this migration only ever writes the "status" column.
--
-- planning + linked client currently onboarding -> onboarding
-- planning + everything else (no client, or client past onboarding) -> ready_to_build
-- active     -> building
-- on_hold    -> paused
-- completed  -> live      (completed_at is preserved; the projects_completed
--                          goal metric keys off completed_at, not this label)
-- archived   -> closed    (archived_at is preserved)
--
-- Deliberately NOT auto-assigned to any project: client_review, revisions,
-- ready_to_launch, at_risk, waiting_on_client. The old data contains no
-- signal that would justify inferring any of those states.

UPDATE "projects" p
SET "status" = 'onboarding'
FROM "clients" c
WHERE p."client_id" = c."id" AND p."status" = 'planning' AND c."status" = 'onboarding';
--> statement-breakpoint

UPDATE "projects"
SET "status" = 'ready_to_build'
WHERE "status" = 'planning';
--> statement-breakpoint

UPDATE "projects" SET "status" = 'building' WHERE "status" = 'active';
--> statement-breakpoint

UPDATE "projects" SET "status" = 'paused' WHERE "status" = 'on_hold';
--> statement-breakpoint

UPDATE "projects" SET "status" = 'live' WHERE "status" = 'completed';
--> statement-breakpoint

UPDATE "projects" SET "status" = 'closed' WHERE "status" = 'archived';
--> statement-breakpoint

-- New projects going forward default to "ready to build", not the retired
-- "planning" label. Deferred to this migration (not 0019) because a fresh
-- enum value cannot be used — including as a column default — in the same
-- transaction that adds it.
ALTER TABLE "projects" ALTER COLUMN "status" SET DEFAULT 'ready_to_build';
