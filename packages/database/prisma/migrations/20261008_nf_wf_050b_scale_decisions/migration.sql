-- NF-WF-050B: Deterministic SCALE review receipts and author decisions (S2).
-- Additive only: nullable receipt column, two enums, two new OPERATIONAL
-- tables with constraints, FKs and indexes. No backfill: existing
-- FinalTextReview rows keep scale_review NULL (legacy receipt, never proof).
-- Both decision tables are OPERATIONAL (never rewound by restore).

-- Decision-kind enum: STANDING_CHANGE alters the approved SCALE policy;
-- CHAPTER_EXCEPTION grants a bounded per-claim exception.
CREATE TYPE "ScaleDecisionKind" AS ENUM ('STANDING_CHANGE', 'CHAPTER_EXCEPTION');

-- Decision-action enum: APPROVE/REJECT/ALTERNATIVE.
CREATE TYPE "ScaleDecisionAction" AS ENUM ('APPROVE', 'REJECT', 'ALTERNATIVE');

-- Nullable deterministic review receipt on the final-text review.
ALTER TABLE "final_text_reviews"
  ADD COLUMN "scale_review" JSONB;

CREATE TABLE "scale_decision_proposals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "novel_id" UUID NOT NULL,
  "chapter_version_id" UUID NOT NULL,
  "source_branch_id" UUID NOT NULL,
  "source_revision_id" UUID,
  "evidence_set_id" UUID,
  "policy_snapshot" JSONB NOT NULL,
  "policy_fingerprint" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "kind" "ScaleDecisionKind" NOT NULL,
  "payload" JSONB NOT NULL,
  "proposer_user_id" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "predecessor_proposal_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "scale_decision_proposals_pkey" PRIMARY KEY ("id")
);

-- Positive sequence, monotonic within (branch, version).
ALTER TABLE "scale_decision_proposals"
  ADD CONSTRAINT "scale_decision_proposals_sequence_check"
  CHECK ("sequence" > 0);

-- Reason nonempty (trimmed length enforced by service; DB guards empty).
ALTER TABLE "scale_decision_proposals"
  ADD CONSTRAINT "scale_decision_proposals_reason_check"
  CHECK (length("reason") > 0 AND length("reason") <= 4000);

-- Policy fingerprint is a SHA-256 hex digest.
ALTER TABLE "scale_decision_proposals"
  ADD CONSTRAINT "scale_decision_proposals_policy_fingerprint_check"
  CHECK ("policy_fingerprint" ~ '^[0-9a-f]{64}$');

-- Foreign keys. Tenant/workspace/novel follow the existing Cascade
-- convention; chapter versions, actors, sources and chains Restrict
-- (cleanup is explicit and ordered; never cascades across Restrict).
ALTER TABLE "scale_decision_proposals"
  ADD CONSTRAINT "scale_decision_proposals_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scale_decision_proposals"
  ADD CONSTRAINT "scale_decision_proposals_novel_id_fkey"
  FOREIGN KEY ("novel_id") REFERENCES "novels"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scale_decision_proposals"
  ADD CONSTRAINT "scale_decision_proposals_chapter_version_id_fkey"
  FOREIGN KEY ("chapter_version_id") REFERENCES "chapter_versions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "scale_decision_proposals"
  ADD CONSTRAINT "scale_decision_proposals_source_branch_id_fkey"
  FOREIGN KEY ("source_branch_id") REFERENCES "novel_branches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "scale_decision_proposals"
  ADD CONSTRAINT "scale_decision_proposals_source_revision_id_fkey"
  FOREIGN KEY ("source_revision_id") REFERENCES "revisions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "scale_decision_proposals"
  ADD CONSTRAINT "scale_decision_proposals_evidence_set_id_fkey"
  FOREIGN KEY ("evidence_set_id") REFERENCES "scale_evidence_sets"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "scale_decision_proposals"
  ADD CONSTRAINT "scale_decision_proposals_proposer_user_id_fkey"
  FOREIGN KEY ("proposer_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "scale_decision_proposals"
  ADD CONSTRAINT "scale_decision_proposals_predecessor_proposal_id_fkey"
  FOREIGN KEY ("predecessor_proposal_id") REFERENCES "scale_decision_proposals"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Unique proposal sequence within (branch, version): CAS allocation.
CREATE UNIQUE INDEX "scale_decision_proposals_branch_version_sequence_key"
  ON "scale_decision_proposals"("source_branch_id", "chapter_version_id", "sequence");

-- Bounded novel/branch/version proposal lists.
CREATE INDEX "scale_decision_proposals_novel_branch_version_idx"
  ON "scale_decision_proposals"("novel_id", "source_branch_id", "chapter_version_id");

CREATE TABLE "scale_decision_outcomes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "proposal_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "novel_id" UUID NOT NULL,
  "chapter_version_id" UUID NOT NULL,
  "source_branch_id" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "action" "ScaleDecisionAction" NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "alternative_proposal_id" UUID,
  "result_revision_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "scale_decision_outcomes_pkey" PRIMARY KEY ("id")
);

-- Positive sequence, monotonic within (branch, version).
ALTER TABLE "scale_decision_outcomes"
  ADD CONSTRAINT "scale_decision_outcomes_sequence_check"
  CHECK ("sequence" > 0);

-- Reason nonempty (trimmed length enforced by service; DB guards empty).
ALTER TABLE "scale_decision_outcomes"
  ADD CONSTRAINT "scale_decision_outcomes_reason_check"
  CHECK (length("reason") > 0 AND length("reason") <= 4000);

-- One outcome per proposal (duplicate decisions are 409, zero writes).
CREATE UNIQUE INDEX "scale_decision_outcomes_proposal_id_key"
  ON "scale_decision_outcomes"("proposal_id");

ALTER TABLE "scale_decision_outcomes"
  ADD CONSTRAINT "scale_decision_outcomes_proposal_id_fkey"
  FOREIGN KEY ("proposal_id") REFERENCES "scale_decision_proposals"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "scale_decision_outcomes"
  ADD CONSTRAINT "scale_decision_outcomes_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scale_decision_outcomes"
  ADD CONSTRAINT "scale_decision_outcomes_novel_id_fkey"
  FOREIGN KEY ("novel_id") REFERENCES "novels"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scale_decision_outcomes"
  ADD CONSTRAINT "scale_decision_outcomes_chapter_version_id_fkey"
  FOREIGN KEY ("chapter_version_id") REFERENCES "chapter_versions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "scale_decision_outcomes"
  ADD CONSTRAINT "scale_decision_outcomes_source_branch_id_fkey"
  FOREIGN KEY ("source_branch_id") REFERENCES "novel_branches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "scale_decision_outcomes"
  ADD CONSTRAINT "scale_decision_outcomes_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "scale_decision_outcomes"
  ADD CONSTRAINT "scale_decision_outcomes_alternative_proposal_id_fkey"
  FOREIGN KEY ("alternative_proposal_id") REFERENCES "scale_decision_proposals"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "scale_decision_outcomes"
  ADD CONSTRAINT "scale_decision_outcomes_result_revision_id_fkey"
  FOREIGN KEY ("result_revision_id") REFERENCES "revisions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Unique decision sequence within (branch, version): latest outcome ID is
-- the decision-head token; no mutable status row.
CREATE UNIQUE INDEX "scale_decision_outcomes_branch_version_sequence_key"
  ON "scale_decision_outcomes"("source_branch_id", "chapter_version_id", "sequence");

-- Bounded novel/branch/version outcome lists.
CREATE INDEX "scale_decision_outcomes_novel_branch_version_idx"
  ON "scale_decision_outcomes"("novel_id", "source_branch_id", "chapter_version_id");
