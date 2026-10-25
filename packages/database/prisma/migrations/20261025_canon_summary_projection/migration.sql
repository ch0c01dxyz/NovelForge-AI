-- ADR-0022: bounded, deterministic canon digest at a source revision.
-- Additive only: no existing table or column is changed.
CREATE TABLE "canon_summaries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "novel_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "source_revision_id" UUID NOT NULL,
    "source_revision_number" INTEGER NOT NULL,
    "entity_count" INTEGER NOT NULL,
    "active_fact_count" INTEGER NOT NULL,
    "superseded_fact_count" INTEGER NOT NULL,
    "retracted_fact_count" INTEGER NOT NULL,
    "digest" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "canon_summaries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "canon_summaries_novel_id_branch_id_source_revision_id_key"
  ON "canon_summaries"("novel_id", "branch_id", "source_revision_id");

CREATE INDEX "canon_summaries_novel_id_branch_id_source_revision_number_idx"
  ON "canon_summaries"("novel_id", "branch_id", "source_revision_number");

ALTER TABLE "canon_summaries"
  ADD CONSTRAINT "canon_summaries_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "canon_summaries"
  ADD CONSTRAINT "canon_summaries_novel_id_fkey"
  FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "canon_summaries"
  ADD CONSTRAINT "canon_summaries_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "novel_branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "canon_summaries"
  ADD CONSTRAINT "canon_summaries_source_revision_id_fkey"
  FOREIGN KEY ("source_revision_id") REFERENCES "revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
