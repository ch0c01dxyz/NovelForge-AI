-- NF-WF-012: publication release contract and version-pinned lifecycle.
--
-- Adds the `PublicationStatus` enum and the `publications` table: one
-- version-pinned release record per chapter (UNIQUE on chapter_id),
-- carrying the release lifecycle (SCHEDULED | PUBLISHED | UNPUBLISHED)
-- separately from the author-facing ChapterStatus.
--
-- Pin immutability (Invariant 4): chapter_version_id and revision_id are
-- ON DELETE RESTRICT — the pinned immutable version and the provenance
-- revision can never dangle. ChapterVersion rows are append-only, so the
-- pin always resolves.
--
-- Restore (Invariant 8): `publications` is registered restoreTarget:
-- false in COVERED_TABLES / TABLE_SCOPE — restoring a pre-publish
-- checkpoint does not unpublish, and restoring a post-publish checkpoint
-- does not resurrect a cancelled publication. Rollback is therefore SAFE:
-- dropping this table loses no story truth (chapters keep their status).
--
-- Re-runnability (GAP-030): a failed `migrate deploy` is partially
-- applied, so EVERY statement carries IF NOT EXISTS (or the idempotent
-- DO-block form for CREATE TYPE / ADD CONSTRAINT, which have no IF NOT
-- EXISTS clause) — a retry converges instead of dying half-applied.
-- Purely additive: no existing row is rewritten, and old code (unaware of
-- the table) runs fine against the migrated schema.

-- The release lifecycle. CREATE TYPE has no IF NOT EXISTS clause, so the
-- idempotent DO block is the re-runnable form (GAP-030).
DO $$ BEGIN
  CREATE TYPE "PublicationStatus" AS ENUM ('SCHEDULED', 'PUBLISHED', 'UNPUBLISHED');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "publications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "novel_id" UUID NOT NULL,
  "chapter_id" UUID NOT NULL,
  "chapter_version_id" UUID NOT NULL,
  "revision_id" UUID NOT NULL,
  "status" "PublicationStatus" NOT NULL DEFAULT 'UNPUBLISHED',
  "scheduled_for" TIMESTAMPTZ(3),
  "published_at" TIMESTAMPTZ(3),
  "published_by_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "publications_pkey" PRIMARY KEY ("id")
);

-- One release record per chapter (the state machine needs no partial
-- unique index — a single row plus the transition table is the whole
-- enforcement).
DO $$ BEGIN
  ALTER TABLE "publications"
    ADD CONSTRAINT "publications_chapter_id_key" UNIQUE ("chapter_id");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null;
END $$;

-- Foreign keys. chapter_id/novel_id cascade (deleting the chapter/novel
-- removes its release record — deletion is already a destructive, audited
-- author action); chapter_version_id/revision_id/published_by_id restrict
-- (the pin can never dangle).
DO $$ BEGIN
  ALTER TABLE "publications"
    ADD CONSTRAINT "publications_novel_id_fkey"
    FOREIGN KEY ("novel_id") REFERENCES "novels"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "publications"
    ADD CONSTRAINT "publications_chapter_id_fkey"
    FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "publications"
    ADD CONSTRAINT "publications_chapter_version_id_fkey"
    FOREIGN KEY ("chapter_version_id") REFERENCES "chapter_versions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "publications"
    ADD CONSTRAINT "publications_revision_id_fkey"
    FOREIGN KEY ("revision_id") REFERENCES "revisions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "publications"
    ADD CONSTRAINT "publications_published_by_id_fkey"
    FOREIGN KEY ("published_by_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "publications_novel_id_status_idx"
  ON "publications" ("novel_id", "status");

-- Backfill (idempotent): every chapter with status = 'PUBLISHED' and no
-- publication row gets a PUBLISHED row pinning its current_version_id,
-- published_at = chapters.updated_at, published_by_id =
-- novels.created_by_id, revision_id = the novel's current head revision.
-- Without this, chapters published before this task would vanish from the
-- public surface NF-WF-013 builds. WHERE NOT EXISTS makes a retried
-- deploy converge.
INSERT INTO "publications"
  ("id", "novel_id", "chapter_id", "chapter_version_id", "revision_id",
   "status", "published_at", "published_by_id", "created_at", "updated_at")
SELECT
  gen_random_uuid(),
  c."novel_id",
  c."id",
  c."current_version_id",
  nb."head_revision_id",
  'PUBLISHED'::"PublicationStatus",
  c."updated_at",
  n."created_by_id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "chapters" c
JOIN "novels" n ON n."id" = c."novel_id"
JOIN "novel_branches" nb
  ON nb."novel_id" = c."novel_id" AND nb."name" = 'main'
WHERE c."status" = 'PUBLISHED'
  AND c."current_version_id" IS NOT NULL
  AND nb."head_revision_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "publications" p WHERE p."chapter_id" = c."id"
  );
