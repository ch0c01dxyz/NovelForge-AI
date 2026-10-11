-- NF-WF-050C: optional S3 SCALE proposal assistance.
-- Additive only: one new OPERATIONAL table (untrusted AI-extracted SCALE
-- claim proposals). No backfill. Never snapshot-covered; never a story-head
-- participant.
--
-- Unlike the 050B S2 tables (Restrict chains + explicit ordered cleanup),
-- S3 rows are inert suggestions: source anchors (novel/chapter/version/
-- branch) are ON DELETE CASCADE so an untrusted suggestion never blocks
-- chapter or branch deletion; only actor FKs are Restrict. Novel deletion
-- therefore needs NO platform.deleteNovel change — cascades remove S3 rows
-- only after the parent delete succeeds (a canon/workflow refusal rolls the
-- transaction back before any cascade fires, so refused deletions preserve
-- S3 history).
--
-- Timestamp note (050B precedent): created_at/dismissed_at are explicitly
-- @db.Timestamptz(3) in the schema; using plain TIMESTAMP here would create
-- schema-vs-migration drift.

CREATE TABLE "scale_s3_proposals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "novel_id" UUID NOT NULL,
  "chapter_id" UUID NOT NULL,
  "chapter_version_id" UUID NOT NULL,
  "source_branch_id" UUID NOT NULL,
  "source_revision_id" UUID,
  "evidence_set_id" UUID,
  "policy_fingerprint" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'EXTRACT_CLAIM',
  "payload" JSONB NOT NULL,
  "generation_id" UUID,
  "reported_model" TEXT,
  "requested_by_user_id" UUID NOT NULL,
  "dismissed_by_user_id" UUID,
  "dismissed_reason" VARCHAR(4000),
  "dismissed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "scale_s3_proposals_pkey" PRIMARY KEY ("id")
);

-- Single stored kind; advice is transient and never persisted.
ALTER TABLE "scale_s3_proposals"
  ADD CONSTRAINT "scale_s3_proposals_kind_check"
  CHECK ("kind" = 'EXTRACT_CLAIM');

-- Policy fingerprint is a SHA-256 hex digest (explicit absence included).
ALTER TABLE "scale_s3_proposals"
  ADD CONSTRAINT "scale_s3_proposals_policy_fingerprint_check"
  CHECK ("policy_fingerprint" ~ '^[0-9a-f]{64}$');

-- Foreign keys. Tenant/novel/chapter/version/branch cascade with their
-- parents (inert suggestion data); actors Restrict.
ALTER TABLE "scale_s3_proposals"
  ADD CONSTRAINT "scale_s3_proposals_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scale_s3_proposals"
  ADD CONSTRAINT "scale_s3_proposals_novel_id_fkey"
  FOREIGN KEY ("novel_id") REFERENCES "novels"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scale_s3_proposals"
  ADD CONSTRAINT "scale_s3_proposals_chapter_id_fkey"
  FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scale_s3_proposals"
  ADD CONSTRAINT "scale_s3_proposals_chapter_version_id_fkey"
  FOREIGN KEY ("chapter_version_id") REFERENCES "chapter_versions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scale_s3_proposals"
  ADD CONSTRAINT "scale_s3_proposals_source_branch_id_fkey"
  FOREIGN KEY ("source_branch_id") REFERENCES "novel_branches"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scale_s3_proposals"
  ADD CONSTRAINT "scale_s3_proposals_requested_by_user_id_fkey"
  FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "scale_s3_proposals"
  ADD CONSTRAINT "scale_s3_proposals_dismissed_by_user_id_fkey"
  FOREIGN KEY ("dismissed_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Bounded chapter-scoped proposal lists (the list route's query shape).
CREATE INDEX "scale_s3_proposals_novel_chapter_created_idx"
  ON "scale_s3_proposals"("novel_id", "chapter_id", "created_at");
