-- NF-WF-008: contracted extraction applications and their items.
--
-- Adds the `CanonApplicationStatus` and `CanonApplicationItemVerdict`
-- enums plus the `canon_applications` / `canon_application_items` tables.
-- The application tables are batch bookkeeping for the contracted canon
-- pipeline — the facts themselves land in the existing `canon_facts`
-- table; this is not a second canon store. Rows are audit history and
-- are never deleted (the rollback refuses when APPLIED rows exist).
--
-- Re-runnability (GAP-030): a failed `migrate deploy` is partially
-- applied, so EVERY statement carries IF NOT EXISTS (or the idempotent
-- DO-block form for CREATE TYPE, which has no IF NOT EXISTS clause) —
-- a retry converges instead of dying half-applied. Purely additive: no
-- existing row is rewritten, and old code (unaware of the tables) runs
-- fine against the migrated schema.

-- The application status. CREATE TYPE has no IF NOT EXISTS clause, so
-- the idempotent DO block is the re-runnable form (GAP-030).
DO $$ BEGIN
  CREATE TYPE "CanonApplicationStatus" AS ENUM ('VALIDATED', 'STALE', 'APPLIED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "CanonApplicationItemVerdict" AS ENUM ('APPLICABLE', 'CONFLICT', 'DUPLICATE', 'UNSUPPORTED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- A batch of contracted claims from one extraction. No DRAFT state:
-- creation validates synchronously and inserts VALIDATED directly.
CREATE TABLE IF NOT EXISTS "canon_applications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "novel_id" UUID NOT NULL,
  "run_id" UUID NOT NULL,
  "extract_step_key" TEXT NOT NULL,
  "status" "CanonApplicationStatus" NOT NULL DEFAULT 'VALIDATED',
  "head_revision_id" UUID,
  "text_decision" TEXT,
  "created_by_id" UUID NOT NULL,
  "decided_by_id" UUID,
  "decided_at" TIMESTAMP(3),
  "decision_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "canon_applications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "canon_applications_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "canon_applications_novel_id_fkey"
    FOREIGN KEY ("novel_id") REFERENCES "novels"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "canon_applications_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "canon_applications_decided_by_id_fkey"
    FOREIGN KEY ("decided_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

-- One contracted claim inside an application.
CREATE TABLE IF NOT EXISTS "canon_application_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "application_id" UUID NOT NULL,
  "claim_index" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "entity_id" UUID,
  "inline_entity_kind" TEXT,
  "inline_entity_name" TEXT,
  "predicate" TEXT NOT NULL,
  "object_entity_id" UUID,
  "object_text" TEXT,
  "valid_from_chapter" INTEGER,
  "evidence" JSONB NOT NULL DEFAULT '[]',
  "verdict" "CanonApplicationItemVerdict" NOT NULL,
  "verdict_reasons" TEXT[] NOT NULL DEFAULT '{}',
  "conflicts_with_fact_id" UUID,
  "canon_fact_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "canon_application_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "canon_application_items_application_id_fkey"
    FOREIGN KEY ("application_id") REFERENCES "canon_applications"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "canon_application_items_entity_id_fkey"
    FOREIGN KEY ("entity_id") REFERENCES "story_entities"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "canon_application_items_object_entity_id_fkey"
    FOREIGN KEY ("object_entity_id") REFERENCES "story_entities"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "canon_application_items_conflicts_with_fact_id_fkey"
    FOREIGN KEY ("conflicts_with_fact_id") REFERENCES "canon_facts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "canon_application_items_canon_fact_id_fkey"
    FOREIGN KEY ("canon_fact_id") REFERENCES "canon_facts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "canon_application_items_application_id_claim_index_key"
    UNIQUE ("application_id", "claim_index"),
  CONSTRAINT "canon_application_items_canon_fact_id_key"
    UNIQUE ("canon_fact_id")
);

-- Indexes (IF NOT EXISTS: re-runnable per GAP-030).
CREATE INDEX IF NOT EXISTS "canon_applications_novel_id_status_idx"
  ON "canon_applications" ("novel_id", "status");
CREATE INDEX IF NOT EXISTS "canon_applications_workspace_id_status_idx"
  ON "canon_applications" ("workspace_id", "status");
CREATE INDEX IF NOT EXISTS "canon_applications_run_id_idx"
  ON "canon_applications" ("run_id");
CREATE INDEX IF NOT EXISTS "canon_applications_created_by_id_idx"
  ON "canon_applications" ("created_by_id");
CREATE INDEX IF NOT EXISTS "canon_application_items_application_id_idx"
  ON "canon_application_items" ("application_id");
CREATE INDEX IF NOT EXISTS "canon_application_items_entity_id_idx"
  ON "canon_application_items" ("entity_id");
CREATE INDEX IF NOT EXISTS "canon_application_items_verdict_idx"
  ON "canon_application_items" ("verdict");
