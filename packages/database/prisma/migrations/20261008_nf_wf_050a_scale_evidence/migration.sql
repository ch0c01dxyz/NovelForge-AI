-- NF-WF-050A: Version-bound SCALE evidence foundation (S1).
-- Additive only: new enum, new table, constraints, indexes.
-- Existing chapters have no sets and remain UNASSESSED; no backfill.

-- Declaration enum: CONFLICTS requires 1..100 claims;
-- NO_OPERATIVE_CONFLICT requires empty array.
CREATE TYPE "ScaleEvidenceDeclaration" AS ENUM ('CONFLICTS', 'NO_OPERATIVE_CONFLICT');

CREATE TABLE "scale_evidence_sets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "novel_id" UUID NOT NULL,
  "chapter_version_id" UUID NOT NULL,
  "source_branch_id" UUID NOT NULL,
  "source_revision_id" UUID,
  "sequence" INTEGER NOT NULL,
  "declaration" "ScaleEvidenceDeclaration" NOT NULL,
  "explanation" TEXT NOT NULL,
  "conflicts_json" JSONB NOT NULL,
  "previous_set_id" UUID,
  "actor_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "scale_evidence_sets_pkey" PRIMARY KEY ("id")
);

-- Positive sequence.
ALTER TABLE "scale_evidence_sets"
  ADD CONSTRAINT "scale_evidence_sets_sequence_check"
  CHECK ("sequence" > 0);

-- conflicts_json must be a JSON array.
ALTER TABLE "scale_evidence_sets"
  ADD CONSTRAINT "scale_evidence_sets_conflicts_json_check"
  CHECK (jsonb_typeof("conflicts_json") = 'array');

-- Declaration/array cardinality coherence:
-- CONFLICTS requires 1..100 claims; NO_OPERATIVE_CONFLICT requires empty.
ALTER TABLE "scale_evidence_sets"
  ADD CONSTRAINT "scale_evidence_sets_declaration_check"
  CHECK (
    ("declaration" = 'CONFLICTS' AND
     jsonb_array_length("conflicts_json") BETWEEN 1 AND 100)
    OR
    ("declaration" = 'NO_OPERATIVE_CONFLICT' AND
     jsonb_array_length("conflicts_json") = 0)
  );

-- Explanation nonempty (trimmed length enforced by service; DB guards empty).
ALTER TABLE "scale_evidence_sets"
  ADD CONSTRAINT "scale_evidence_sets_explanation_check"
  CHECK (length("explanation") > 0 AND length("explanation") <= 4000);

-- Foreign keys.
ALTER TABLE "scale_evidence_sets"
  ADD CONSTRAINT "scale_evidence_sets_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scale_evidence_sets"
  ADD CONSTRAINT "scale_evidence_sets_novel_id_fkey"
  FOREIGN KEY ("novel_id") REFERENCES "novels"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scale_evidence_sets"
  ADD CONSTRAINT "scale_evidence_sets_chapter_version_id_fkey"
  FOREIGN KEY ("chapter_version_id") REFERENCES "chapter_versions"("id")
  ON DELETE Restrict ON UPDATE CASCADE;

ALTER TABLE "scale_evidence_sets"
  ADD CONSTRAINT "scale_evidence_sets_source_branch_id_fkey"
  FOREIGN KEY ("source_branch_id") REFERENCES "novel_branches"("id")
  ON DELETE Restrict ON UPDATE CASCADE;

ALTER TABLE "scale_evidence_sets"
  ADD CONSTRAINT "scale_evidence_sets_source_revision_id_fkey"
  FOREIGN KEY ("source_revision_id") REFERENCES "revisions"("id")
  ON DELETE Restrict ON UPDATE CASCADE;

ALTER TABLE "scale_evidence_sets"
  ADD CONSTRAINT "scale_evidence_sets_previous_set_id_fkey"
  FOREIGN KEY ("previous_set_id") REFERENCES "scale_evidence_sets"("id")
  ON DELETE Restrict ON UPDATE CASCADE;

ALTER TABLE "scale_evidence_sets"
  ADD CONSTRAINT "scale_evidence_sets_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
  ON DELETE Restrict ON UPDATE CASCADE;

-- Unique sequence within (branch, version).
CREATE UNIQUE INDEX "scale_evidence_sets_branch_version_sequence_key"
  ON "scale_evidence_sets"("source_branch_id", "chapter_version_id", "sequence");

-- Tenant-scoped branch/version history by sequence.
CREATE INDEX "scale_evidence_sets_history_idx"
  ON "scale_evidence_sets"("workspace_id", "novel_id", "source_branch_id", "chapter_version_id", "sequence" DESC);
