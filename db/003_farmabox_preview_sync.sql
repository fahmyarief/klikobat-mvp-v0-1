-- STAGING ONLY: additive synchronization metadata, never run on Production.
BEGIN;
DO $$ BEGIN
  IF current_setting('neon.project_id', true) IS DISTINCT FROM 'late-union-10460085'
    OR current_setting('neon.branch_id', true) IS DISTINCT FROM 'br-small-boat-b335j2hx'
  THEN RAISE EXCEPTION 'WRONG_NEON_TARGET';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.farmabox_preview_sync_state (
  outlet_id VARCHAR(64) PRIMARY KEY REFERENCES public.outlets(id),
  source_branch_id INTEGER NOT NULL CHECK (source_branch_id = 1),
  last_scheduled_at TIMESTAMPTZ,
  last_completed_at TIMESTAMPTZ,
  source_count INTEGER,
  updated_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMIT;
