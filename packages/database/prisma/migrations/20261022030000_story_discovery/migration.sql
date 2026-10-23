BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE story_discovery_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  novel_id UUID NOT NULL REFERENCES novels(id) ON DELETE CASCADE ON UPDATE CASCADE,
  run_id UUID NOT NULL UNIQUE REFERENCES workflow_runs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  chapter_id UUID NOT NULL,
  source_branch_id UUID NOT NULL,
  source_revision_id UUID NOT NULL,
  artifact_hash TEXT NOT NULL,
  generation_id UUID,
  status TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING','SUCCEEDED','FAILED','UNCERTAIN')),
  epoch INTEGER NOT NULL DEFAULT 0 CHECK (epoch >= 0),
  candidates JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(candidates) = 'array' AND jsonb_array_length(candidates) <= 20),
  error_category TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL
);
CREATE INDEX story_discovery_batches_novel_id_created_at_idx ON story_discovery_batches(novel_id, created_at);
COMMIT;
