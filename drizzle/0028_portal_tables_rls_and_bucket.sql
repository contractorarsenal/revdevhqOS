ALTER TABLE "project_updates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "client_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_dashboard_prefs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Private bucket for client files. No storage.objects policies are created:
-- anon/authenticated roles get no direct access; bytes are only reachable
-- through server-issued, short-lived signed URLs after an app-level
-- authorization check against client_files. Guarded so the migration also
-- runs on plain Postgres (tests), where the Supabase storage schema is absent.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit)
    VALUES ('client-files', 'client-files', false, 26214400)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
