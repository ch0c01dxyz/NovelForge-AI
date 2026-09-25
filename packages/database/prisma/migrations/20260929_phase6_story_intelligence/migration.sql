-- Phase 6 — Story Intelligence Core: canon, candidate canon, evidence.
--
-- Three things are hand-written here that Prisma cannot express, and each is
-- load-bearing (see docs/adr/ADR-0008-canon-authority.md):
--
--   1. canon_facts_live — the ONE-LIVE-VALUE-PER-SUBJECT+PREDICATE
--      constraint. Prisma cannot declare a partial index without a preview
--      flag. It is keyed on (novel_id, entity_id, predicate) and NOT on the
--      object value: including the object would let two contradictory live
--      facts coexist, which is the exact conflict this constraint exists to
--      catch. Anchored on status = 'ACTIVE' rather than
--      superseded_by_id IS NULL so that RETRACTED frees the slot (a row
--      withdrawn by retraction does not set superseded_by_id, and a
--      supersede-anchored index would trap the slot forever).
--
--   2. CanonFact_object_exactly_one — exactly one object form is present.
--      Without it a row with both object columns NULL escapes the unique
--      index entirely (PostgreSQL treats NULLs as distinct), so a caller
--      that simply omits the object could insert unbounded duplicate
--      (subject, predicate) rows that no query sees as conflicting.
--
--   3. CanonFactSource_span_matches_kind — a CHAPTER source carries a
--      chapter version and no reference version, and vice versa, with a
--      reversed char span. This is what makes a citation resolvable.
--
-- All three were verified against PostgreSQL before this migration was
-- written: both naive supersede orders fail (23503 / 23505), the shipped
-- four-statement order commits with correct final rows, a duplicate ACTIVE
-- insert is refused, and retraction frees the slot.

-- CreateEnum
CREATE TYPE "StoryEntityKind" AS ENUM ('CHARACTER', 'LOCATION', 'ORGANIZATION', 'FACTION', 'ITEM', 'RESOURCE', 'CONCEPT');

-- CreateEnum
CREATE TYPE "CanonFactStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'RETRACTED');

-- CreateEnum
CREATE TYPE "CanonProposalStatus" AS ENUM ('PROPOSED', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ConflictKind" AS ENUM ('FUNCTIONAL_CONFLICT');

-- CreateEnum
CREATE TYPE "SourceKind" AS ENUM ('CHAPTER', 'REFERENCE');

-- CreateTable
CREATE TABLE "story_entities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "novel_id" UUID NOT NULL,
    "kind" "StoryEntityKind" NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canon_facts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "novel_id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "predicate" TEXT NOT NULL,
    "object_entity_id" UUID,
    "object_text" TEXT,
    "statement" TEXT NOT NULL,
    "status" "CanonFactStatus" NOT NULL DEFAULT 'ACTIVE',
    "valid_from_chapter" INTEGER,
    "valid_until_chapter" INTEGER,
    "available_from_chapter" INTEGER,
    "superseded_by_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canon_facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canon_fact_sources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "canon_fact_id" UUID NOT NULL,
    "source_kind" "SourceKind" NOT NULL,
    "chapter_version_id" UUID,
    "reference_version_id" UUID,
    "quote" TEXT NOT NULL,
    "start" INTEGER NOT NULL,
    "end" INTEGER NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canon_fact_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canon_proposals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "novel_id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "predicate" TEXT NOT NULL,
    "object_entity_id" UUID,
    "object_text" TEXT,
    "statement" TEXT NOT NULL,
    "valid_from_chapter" INTEGER,
    "status" "CanonProposalStatus" NOT NULL DEFAULT 'PROPOSED',
    "conflict_kind" "ConflictKind",
    "conflicts_with_fact_id" UUID,
    "canon_fact_id" UUID,
    "proposed_by_id" UUID,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canon_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "story_entities_novel_id_kind_idx" ON "story_entities"("novel_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "story_entities_novel_id_key_key" ON "story_entities"("novel_id", "key");

-- CreateIndex
CREATE INDEX "canon_facts_novel_id_entity_id_predicate_idx" ON "canon_facts"("novel_id", "entity_id", "predicate");

-- CreateIndex
CREATE INDEX "canon_facts_novel_id_status_idx" ON "canon_facts"("novel_id", "status");

-- CreateIndex
CREATE INDEX "canon_facts_novel_id_valid_from_chapter_idx" ON "canon_facts"("novel_id", "valid_from_chapter");

-- CreateIndex
CREATE INDEX "canon_facts_available_from_chapter_idx" ON "canon_facts"("available_from_chapter");

-- CreateIndex
CREATE INDEX "canon_facts_superseded_by_id_idx" ON "canon_facts"("superseded_by_id");

-- CreateIndex
CREATE INDEX "canon_facts_object_entity_id_idx" ON "canon_facts"("object_entity_id");

-- CreateIndex
CREATE INDEX "canon_fact_sources_canon_fact_id_idx" ON "canon_fact_sources"("canon_fact_id");

-- CreateIndex
CREATE INDEX "canon_fact_sources_chapter_version_id_idx" ON "canon_fact_sources"("chapter_version_id");

-- CreateIndex
CREATE INDEX "canon_fact_sources_reference_version_id_idx" ON "canon_fact_sources"("reference_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "canon_proposals_canon_fact_id_key" ON "canon_proposals"("canon_fact_id");

-- CreateIndex
CREATE INDEX "canon_proposals_workspace_id_status_idx" ON "canon_proposals"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "canon_proposals_novel_id_status_idx" ON "canon_proposals"("novel_id", "status");

-- CreateIndex
CREATE INDEX "canon_proposals_entity_id_idx" ON "canon_proposals"("entity_id");

-- CreateIndex
-- The referencing side of the object FK below; without it deleting a
-- story entity seq-scans canon_proposals to resolve the cascade.
CREATE INDEX "canon_proposals_object_entity_id_idx" ON "canon_proposals"("object_entity_id");

-- CreateIndex
CREATE INDEX "canon_proposals_conflicts_with_fact_id_idx" ON "canon_proposals"("conflicts_with_fact_id");

-- CreateIndex
CREATE INDEX "canon_proposals_proposed_by_id_idx" ON "canon_proposals"("proposed_by_id");

-- CreateIndex
CREATE INDEX "canon_proposals_decided_by_id_idx" ON "canon_proposals"("decided_by_id");

-- AddForeignKey
ALTER TABLE "story_entities" ADD CONSTRAINT "story_entities_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_entities" ADD CONSTRAINT "story_entities_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canon_facts" ADD CONSTRAINT "canon_facts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canon_facts" ADD CONSTRAINT "canon_facts_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canon_facts" ADD CONSTRAINT "canon_facts_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "story_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canon_facts" ADD CONSTRAINT "canon_facts_object_entity_id_fkey" FOREIGN KEY ("object_entity_id") REFERENCES "story_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canon_facts" ADD CONSTRAINT "canon_facts_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "canon_facts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canon_facts" ADD CONSTRAINT "canon_facts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canon_fact_sources" ADD CONSTRAINT "canon_fact_sources_canon_fact_id_fkey" FOREIGN KEY ("canon_fact_id") REFERENCES "canon_facts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- RESTRICT, not CASCADE. A citation is the only place a fact's span is
-- stored, so cascading one away leaves the fact claiming support it can no
-- longer show. chapter_versions already cascades from chapters, and
-- deleteChapter (services/manuscript.ts) hard-deletes any non-PUBLISHED
-- chapter — so CASCADE let a routine draft deletion silently strip canon
-- evidence with nothing canon-side recording why. Deleting a cited chapter is
-- now refused; the author unlinks the evidence explicitly first.
ALTER TABLE "canon_fact_sources" ADD CONSTRAINT "canon_fact_sources_chapter_version_id_fkey" FOREIGN KEY ("chapter_version_id") REFERENCES "chapter_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- RESTRICT for the same reason: a reference revision is a pinned citation,
-- not a disposable child of the fact.
ALTER TABLE "canon_fact_sources" ADD CONSTRAINT "canon_fact_sources_reference_version_id_fkey" FOREIGN KEY ("reference_version_id") REFERENCES "reference_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canon_fact_sources" ADD CONSTRAINT "canon_fact_sources_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canon_proposals" ADD CONSTRAINT "canon_proposals_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canon_proposals" ADD CONSTRAINT "canon_proposals_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canon_proposals" ADD CONSTRAINT "canon_proposals_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "story_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- The object-side twin of the subject FK above, and it was missing: the
-- column was a bare uuid, so a proposal could name an entity that does not
-- exist (or belongs to another novel) and approveProposal copies it verbatim
-- into canon_facts.object_entity_id, which IS constrained. Cascade matches
-- its sibling column on this table.
ALTER TABLE "canon_proposals" ADD CONSTRAINT "canon_proposals_object_entity_id_fkey" FOREIGN KEY ("object_entity_id") REFERENCES "story_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canon_proposals" ADD CONSTRAINT "canon_proposals_conflicts_with_fact_id_fkey" FOREIGN KEY ("conflicts_with_fact_id") REFERENCES "canon_facts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canon_proposals" ADD CONSTRAINT "canon_proposals_canon_fact_id_fkey" FOREIGN KEY ("canon_fact_id") REFERENCES "canon_facts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canon_proposals" ADD CONSTRAINT "canon_proposals_proposed_by_id_fkey" FOREIGN KEY ("proposed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canon_proposals" ADD CONSTRAINT "canon_proposals_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ==================== Hand-written constraints ====================

-- Guard: on a database that already holds a live duplicate this CREATE would
-- fail with an opaque error. Name the offending rows instead, since only a
-- human can decide which claim to keep. On a clean database (the normal
-- path, and always on a fresh one) this is a no-op.
DO $$
DECLARE
  dupes text;
BEGIN
  SELECT string_agg(novel_id || ' ' || entity_id || ' "' || predicate || '" x' || n, ', ')
    INTO dupes
  FROM (
    SELECT novel_id, entity_id, predicate, count(*) AS n
      FROM canon_facts
     WHERE status = 'ACTIVE'
     GROUP BY novel_id, entity_id, predicate
    HAVING count(*) > 1
  ) d;

  IF dupes IS NOT NULL THEN
    RAISE EXCEPTION
      'cannot add canon live-uniqueness — more than one ACTIVE fact exists for: %', dupes;
  END IF;
END $$;

CREATE UNIQUE INDEX "canon_facts_live"
  ON "canon_facts" ("novel_id", "entity_id", "predicate")
  WHERE "status" = 'ACTIVE';

ALTER TABLE "canon_facts"
  ADD CONSTRAINT "CanonFact_object_exactly_one"
  CHECK (("object_entity_id" IS NULL) <> ("object_text" IS NULL));

-- An in-story validity window, when both ends are given, must not end before
-- it starts. Cheap, and it is the kind of row that is otherwise only found
-- by a continuity bug months later.
ALTER TABLE "canon_facts"
  ADD CONSTRAINT "CanonFact_valid_window_ordered"
  CHECK ("valid_until_chapter" IS NULL OR "valid_from_chapter" IS NULL
         OR "valid_until_chapter" >= "valid_from_chapter");

ALTER TABLE "canon_fact_sources"
  ADD CONSTRAINT "CanonFactSource_span_matches_kind"
  CHECK (
    ("source_kind" = 'CHAPTER'
       AND "chapter_version_id" IS NOT NULL
       AND "reference_version_id" IS NULL)
    OR
    ("source_kind" = 'REFERENCE'
       AND "reference_version_id" IS NOT NULL
       AND "chapter_version_id" IS NULL)
  );

-- A span must be a real, non-empty range. `end` is exclusive, matching
-- Chunk.start/end and the chunker that verifies quote === content.slice().
ALTER TABLE "canon_fact_sources"
  ADD CONSTRAINT "CanonFactSource_span_ordered"
  CHECK ("end" > "start" AND "start" >= 0);

-- A proposal carries exactly one object form, for the same reason.
ALTER TABLE "canon_proposals"
  ADD CONSTRAINT "CanonProposal_object_exactly_one"
  CHECK (("object_entity_id" IS NULL) <> ("object_text" IS NULL));
