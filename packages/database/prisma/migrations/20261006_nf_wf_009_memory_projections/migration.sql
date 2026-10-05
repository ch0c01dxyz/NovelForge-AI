-- NF-WF-009: revision-derived memory projections.
--
-- Adds the `MemoryBuildStatus` enum and the `memory_projections` table:
-- durable, revision-pinned structural memory (chapter/arc scopes), one
-- row per build attempt keyed by (novelId, scope, sourceRevisionId) —
-- the dedup key mirroring DerivedRebuildIntent's. Memory is a
-- projection, never truth (constitution §2.2, §8): dropping this table
-- loses no truth (rollback-safe). Structural-only in 009 (no summary
-- columns; the follow-up adds them under Invariant 6's gate).
--
-- Re-runnability (GAP-030): a failed `migrate deploy` is partially
-- applied, so EVERY statement carries IF NOT EXISTS (or the idempotent
-- DO-block form for CREATE TYPE, which has no IF NOT EXISTS clause) —
-- a retry converges instead of dying half-applied. Purely additive: no
-- existing row is rewritten, and old code (unaware of the table) runs
-- fine against the migrated schema.

-- The build outcome. CREATE TYPE has no IF NOT EXISTS clause, so the
-- idempotent DO block is the re-runnable form (GAP-030).
DO $$ BEGIN
  CREATE TYPE "MemoryBuildStatus" AS ENUM ('OK', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "memory_projections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "novel_id" UUID NOT NULL,
  "scope" TEXT NOT NULL,
  "source_revision_id" UUID NOT NULL,
  "build_status" "MemoryBuildStatus" NOT NULL DEFAULT 'OK',
  "last_error" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "structural" JSONB NOT NULL,
  "chapter_coverage" INTEGER[] NOT NULL,
  "built_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "memory_projections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "memory_projections_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "memory_projections_novel_id_fkey"
    FOREIGN KEY ("novel_id") REFERENCES "novels"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "memory_projections_source_revision_id_fkey"
    FOREIGN KEY ("source_revision_id") REFERENCES "revisions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- The dedup key (novelId, scope, sourceRevisionId): a replayed build for
-- the same source revision is a no-op, not a second row.
CREATE UNIQUE INDEX IF NOT EXISTS "memory_projections_novel_scope_revision_key"
  ON "memory_projections"("novel_id", "scope", "source_revision_id");

CREATE INDEX IF NOT EXISTS "memory_projections_novel_scope_idx"
  ON "memory_projections"("novel_id", "scope");
