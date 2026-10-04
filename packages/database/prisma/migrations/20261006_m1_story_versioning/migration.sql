-- CreateEnum
CREATE TYPE "RevisionOrigin" AS ENUM ('MANUAL', 'AUTO', 'PRE_MUTATION', 'PRE_GENERATION', 'PRE_IMPORT', 'PRE_MIGRATION', 'MILESTONE', 'BASELINE', 'RESTORE');

-- CreateEnum
CREATE TYPE "SnapshotStorage" AS ENUM ('INLINE', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "RestoreStatus" AS ENUM ('PREVIEWED', 'APPLIED', 'REFUSED', 'FAILED');

-- CreateEnum
CREATE TYPE "RestoreScope" AS ENUM ('FULL', 'DOMAIN', 'ENTITY', 'SELECTIVE');

-- CreateEnum
CREATE TYPE "RebuildStatus" AS ENUM ('PENDING', 'RUNNING', 'FRESH', 'FAILED', 'STALE');

-- AlterTable
ALTER TABLE "characters" ADD COLUMN     "story_entity_id" UUID;

-- AlterTable
ALTER TABLE "timeline_events" ADD COLUMN     "story_event_id" UUID;

-- CreateTable
CREATE TABLE "novel_branches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "novel_id" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'main',
    "parent_branch_id" UUID,
    "head_revision_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "novel_branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "novel_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "parent_revision_id" UUID,
    "number" INTEGER NOT NULL,
    "origin" "RevisionOrigin" NOT NULL,
    "message" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_sets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "revision_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "novel_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "change_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_set_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "change_set_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "operation" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "change_set_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "novel_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "format_version" INTEGER NOT NULL,
    "storage" "SnapshotStorage" NOT NULL DEFAULT 'INLINE',
    "payload" JSONB NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkpoints" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "novel_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "kind" "RevisionOrigin" NOT NULL,
    "label" TEXT NOT NULL,
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restore_operations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "novel_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "source_checkpoint_id" UUID NOT NULL,
    "target_revision_id" UUID,
    "status" "RestoreStatus" NOT NULL,
    "scope" "RestoreScope" NOT NULL,
    "preview" JSONB NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_at" TIMESTAMP(3),

    CONSTRAINT "restore_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "derived_rebuild_intents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "novel_id" UUID NOT NULL,
    "projection" TEXT NOT NULL,
    "source_revision_id" UUID NOT NULL,
    "status" "RebuildStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "derived_rebuild_intents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "novel_branches_novel_id_name_key" ON "novel_branches"("novel_id", "name");

-- CreateIndex
CREATE INDEX "revisions_novel_id_created_at_idx" ON "revisions"("novel_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "revisions_branch_id_number_key" ON "revisions"("branch_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "change_sets_revision_id_key" ON "change_sets"("revision_id");

-- CreateIndex
CREATE INDEX "change_set_items_change_set_id_idx" ON "change_set_items"("change_set_id");

-- CreateIndex
CREATE INDEX "change_set_items_entity_type_entity_id_idx" ON "change_set_items"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "snapshots_revision_id_key" ON "snapshots"("revision_id");

-- CreateIndex
CREATE INDEX "checkpoints_novel_id_created_at_idx" ON "checkpoints"("novel_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "derived_rebuild_intents_projection_source_revision_id_key" ON "derived_rebuild_intents"("projection", "source_revision_id");

-- AddForeignKey
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_story_event_id_fkey" FOREIGN KEY ("story_event_id") REFERENCES "story_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_story_entity_id_fkey" FOREIGN KEY ("story_entity_id") REFERENCES "story_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "novel_branches" ADD CONSTRAINT "novel_branches_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "novel_branches" ADD CONSTRAINT "novel_branches_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "novel_branches" ADD CONSTRAINT "novel_branches_parent_branch_id_fkey" FOREIGN KEY ("parent_branch_id") REFERENCES "novel_branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "novel_branches" ADD CONSTRAINT "novel_branches_head_revision_id_fkey" FOREIGN KEY ("head_revision_id") REFERENCES "revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "novel_branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_parent_revision_id_fkey" FOREIGN KEY ("parent_revision_id") REFERENCES "revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_sets" ADD CONSTRAINT "change_sets_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_sets" ADD CONSTRAINT "change_sets_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_sets" ADD CONSTRAINT "change_sets_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_set_items" ADD CONSTRAINT "change_set_items_change_set_id_fkey" FOREIGN KEY ("change_set_id") REFERENCES "change_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "novel_branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "novel_branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restore_operations" ADD CONSTRAINT "restore_operations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restore_operations" ADD CONSTRAINT "restore_operations_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restore_operations" ADD CONSTRAINT "restore_operations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "novel_branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restore_operations" ADD CONSTRAINT "restore_operations_source_checkpoint_id_fkey" FOREIGN KEY ("source_checkpoint_id") REFERENCES "checkpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restore_operations" ADD CONSTRAINT "restore_operations_target_revision_id_fkey" FOREIGN KEY ("target_revision_id") REFERENCES "revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restore_operations" ADD CONSTRAINT "restore_operations_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "derived_rebuild_intents" ADD CONSTRAINT "derived_rebuild_intents_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "derived_rebuild_intents" ADD CONSTRAINT "derived_rebuild_intents_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "derived_rebuild_intents" ADD CONSTRAINT "derived_rebuild_intents_source_revision_id_fkey" FOREIGN KEY ("source_revision_id") REFERENCES "revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===========================================================================
-- Hand-written constraints and backfills (not expressible in schema.prisma).
--
-- STORY-VERSIONING.md C8, C9. Each constraint below is load-bearing and is
-- probed the Phase 6/8/9 way in
-- packages/database/test/revision-constraints.integration.test.ts: the
-- refused statement is retried with the constraint dropped, and the probe
-- fails if it is then accepted.
-- ===========================================================================

-- C9.1: `characters.story_entity_id` -> `story_entities(id)`, nullable, with a
-- PARTIAL unique index on the column where it is non-null. Prisma cannot
-- declare `UNIQUE ... WHERE story_entity_id IS NOT NULL`, which is why the
-- index is here. Without it two characters could claim one story entity, and
-- a restore would re-insert both against a canon entity that is one row.
CREATE UNIQUE INDEX "characters_story_entity_id_key"
  ON "characters" ("story_entity_id")
  WHERE "story_entity_id" IS NOT NULL;

-- C9.1 backfill: ONLY where a `story_entities` row of kind CHARACTER has the
-- same `(novel_id, key)` — an exact machine-key match. Never a name match:
-- `characters.key` and `story_entities.key` already share one contract
-- ("stable machine key, unique within the novel, lowercase kebab"), and a
-- name match would join two rows that merely happen to be spelled alike.
-- Every other character stays NULL, and NULL is the honest answer.
UPDATE "characters" c
   SET "story_entity_id" = e."id"
  FROM "story_entities" e
 WHERE e."novel_id" = c."novel_id"
   AND e."key" = c."key"
   AND e."kind" = 'CHARACTER'
   AND c."story_entity_id" IS NULL;

-- C9.2: `timeline_events.story_event_id` is added by the generated DDL above.
-- It gets NO backfill. Nothing in the schema ties a timeline row to a story
-- event, so any automatic link would be fabricated provenance. The column is
-- authored, not derived.

-- C2: `change_set_items.operation` is a String with a CHECK rather than a
-- Postgres enum. The CREATE/UPDATE/DELETE vocabulary is internal to the
-- change log and is expected to grow (a SUPERSEDE or RESTORE item kind is
-- plausible); extending a Postgres enum rewrites the type, while this CHECK
-- can be dropped and the refused statement retried to prove it load-bearing.
ALTER TABLE "change_set_items"
  ADD CONSTRAINT "ChangeSetItem_operation_valid"
  CHECK ("operation" IN ('CREATE', 'UPDATE', 'DELETE'));

-- C8: one BASELINE revision per existing novel, so the head CAS has a value
-- to compare against and no pre-baseline history is invented. The revision
-- carries an EMPTY change set and NO snapshot: the labeled baseline
-- *checkpoint* (with a real snapshot) is created by an explicit authorized
-- operation, because a migration that snapshotted every novel would hold one
-- transaction over the whole database.
--
-- The head pointer is a non-deferrable FK to revisions(id) and revisions
-- .branch_id is an FK back to novel_branches, so the branch is inserted with
-- a NULL head, the revision follows, and the head is set last.
--
-- On an empty database every statement below is a no-op.

INSERT INTO "novel_branches" ("workspace_id", "novel_id", "name", "created_at", "updated_at")
SELECT n."workspace_id", n."id", 'main', now(), now()
  FROM "novels" n;

INSERT INTO "revisions"
  ("workspace_id", "novel_id", "branch_id", "parent_revision_id", "number", "origin", "message", "created_by_id", "created_at")
SELECT b."workspace_id", b."novel_id", b."id", NULL, 1, 'BASELINE', 'baseline created by the M1 story-versioning migration', NULL, now()
  FROM "novel_branches" b
 WHERE b."name" = 'main'
   AND b."head_revision_id" IS NULL;

UPDATE "novel_branches" b
   SET "head_revision_id" = r."id", "updated_at" = now()
  FROM "revisions" r
 WHERE r."branch_id" = b."id"
   AND r."origin" = 'BASELINE'
   AND b."head_revision_id" IS NULL;

INSERT INTO "change_sets" ("revision_id", "workspace_id", "novel_id", "created_at")
SELECT r."id", r."workspace_id", r."novel_id", now()
  FROM "revisions" r
 WHERE r."origin" = 'BASELINE'
   AND NOT EXISTS (SELECT 1 FROM "change_sets" cs WHERE cs."revision_id" = r."id");
