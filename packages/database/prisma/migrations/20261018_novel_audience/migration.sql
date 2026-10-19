-- Workspace management slice (2026-10-18): reader-facing novel audience.
-- Additive, forward-only. NULL reads as "not specified" and renders nowhere.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Audience') THEN
    CREATE TYPE "Audience" AS ENUM ('teen', 'mature', 'adult');
  END IF;
END
$$;

ALTER TABLE "novels" ADD COLUMN IF NOT EXISTS "audience" "Audience";
