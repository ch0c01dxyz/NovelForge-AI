-- CreateEnum
CREATE TYPE "SynopsisStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PlanningKind" AS ENUM ('SAGA', 'ARC', 'CHAPTER_GROUP');

-- CreateEnum
CREATE TYPE "OutlineNodeKind" AS ENUM ('CHAPTER_GROUP', 'CHAPTER', 'SCENE');

-- CreateEnum
CREATE TYPE "OutlineVersionStatus" AS ENUM ('DRAFT', 'APPROVED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "synopses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "novel_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "status" "SynopsisStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "synopses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sagas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "novel_id" UUID NOT NULL,
    "parent_id" UUID,
    "kind" "PlanningKind" NOT NULL,
    "title" TEXT NOT NULL,
    "intent" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sagas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outline_nodes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "novel_id" UUID NOT NULL,
    "saga_id" UUID NOT NULL,
    "kind" "OutlineNodeKind" NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "order" INTEGER NOT NULL,
    "chapter_id" UUID,
    "scene_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outline_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outline_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "novel_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "OutlineVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "content" JSONB NOT NULL,
    "note" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outline_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_horizons" (
    "novel_id" UUID NOT NULL,
    "policy" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planning_horizons_pkey" PRIMARY KEY ("novel_id")
);

-- CreateIndex
CREATE INDEX "synopses_novel_id_status_idx" ON "synopses"("novel_id", "status");

-- CreateIndex
CREATE INDEX "sagas_novel_id_kind_idx" ON "sagas"("novel_id", "kind");

-- CreateIndex
CREATE INDEX "sagas_parent_id_idx" ON "sagas"("parent_id");

-- CreateIndex
CREATE INDEX "outline_nodes_novel_id_idx" ON "outline_nodes"("novel_id");

-- CreateIndex
CREATE INDEX "outline_nodes_chapter_id_idx" ON "outline_nodes"("chapter_id");

-- CreateIndex
CREATE INDEX "outline_nodes_scene_id_idx" ON "outline_nodes"("scene_id");

-- CreateIndex
CREATE UNIQUE INDEX "outline_nodes_saga_id_order_key" ON "outline_nodes"("saga_id", "order");

-- CreateIndex
CREATE INDEX "outline_versions_novel_id_status_idx" ON "outline_versions"("novel_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "outline_versions_novel_id_number_key" ON "outline_versions"("novel_id", "number");

-- AddForeignKey
ALTER TABLE "synopses" ADD CONSTRAINT "synopses_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "synopses" ADD CONSTRAINT "synopses_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sagas" ADD CONSTRAINT "sagas_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sagas" ADD CONSTRAINT "sagas_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "sagas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sagas" ADD CONSTRAINT "sagas_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outline_nodes" ADD CONSTRAINT "outline_nodes_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outline_nodes" ADD CONSTRAINT "outline_nodes_saga_id_fkey" FOREIGN KEY ("saga_id") REFERENCES "sagas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outline_nodes" ADD CONSTRAINT "outline_nodes_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outline_nodes" ADD CONSTRAINT "outline_nodes_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outline_versions" ADD CONSTRAINT "outline_versions_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outline_versions" ADD CONSTRAINT "outline_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_horizons" ADD CONSTRAINT "planning_horizons_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Phase 7 planning invariants that prisma migrate diff cannot express:

-- 1. outline_versions_live — at most ONE APPROVED outline version per
--    novel. Partial unique index on the canon_facts_live pattern
--    (ADR-0008 §1): Prisma cannot declare a partial index, and the
--    constraint must be anchored on status so a SUPERSEDED version frees
--    the slot for its successor. This index IS the "approved outline is
--    the primary planning source" rule (CLAUDE.md §4) at the storage
--    layer.
CREATE UNIQUE INDEX "outline_versions_live"
  ON "outline_versions" ("novel_id")
  WHERE "status" = 'APPROVED';

-- 2. A leaf outline node points at exactly one manuscript row; a
--    CHAPTER_GROUP node points at neither. Without this, a CHAPTER node
--    with no chapter row would silently plan nothing.
ALTER TABLE "outline_nodes"
  ADD CONSTRAINT "OutlineNode_leaf_links_exactly_one"
  CHECK (
    ("kind" = 'CHAPTER_GROUP' AND "chapter_id" IS NULL AND "scene_id" IS NULL)
    OR
    ("kind" = 'CHAPTER' AND "chapter_id" IS NOT NULL AND "scene_id" IS NULL)
    OR
    ("kind" = 'SCENE' AND "chapter_id" IS NULL AND "scene_id" IS NOT NULL)
  );

-- 3. An outline version's number is positive; a synopsis with no content
--    is meaningless. Cheap CHECKs, same discipline as Phase 6.
ALTER TABLE "outline_versions"
  ADD CONSTRAINT "OutlineVersion_number_positive" CHECK ("number" >= 1);
