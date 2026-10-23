-- Operational suggestions retain their source and decisions across story restore.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE "character_discovery_batches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "novel_id" UUID NOT NULL,
  "run_id" UUID NOT NULL,
  "chapter_id" UUID NOT NULL,
  "source_branch_id" UUID NOT NULL,
  "source_revision_id" UUID,
  "artifact_hash" TEXT NOT NULL,
  "generation_id" UUID,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "epoch" INTEGER NOT NULL DEFAULT 0,
  "candidates" JSONB NOT NULL DEFAULT '[]',
  "error_category" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "character_discovery_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "character_discovery_candidates_array" CHECK (jsonb_typeof("candidates") = 'array' AND jsonb_array_length("candidates") <= 20),
  CONSTRAINT "character_discovery_epoch_nonnegative" CHECK ("epoch" >= 0),
  CONSTRAINT "character_discovery_status" CHECK ("status" IN ('RUNNING','SUCCEEDED','FAILED','UNCERTAIN'))
);
CREATE UNIQUE INDEX "character_discovery_batches_run_id_key" ON "character_discovery_batches"("run_id");
CREATE INDEX "character_discovery_batches_novel_id_created_at_idx" ON "character_discovery_batches"("novel_id", "created_at");
ALTER TABLE "character_discovery_batches" ADD CONSTRAINT "character_discovery_batches_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "character_discovery_batches" ADD CONSTRAINT "character_discovery_batches_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "workflow_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;
