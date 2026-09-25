-- Phase 5: references, chunks, embeddings, retrieval provenance.
--
-- One index required by hybrid retrieval cannot be declared in the Prisma
-- schema, so it is written by hand here. It is paired with a schema
-- declaration so `migrate diff` reports no drift:
--
--   * `chunks_content_ts_idx` is declared as @@index([contentTs], type: Gin)
--     and emitted by the generated DDL below. It is a plain (non-expression)
--     index because Prisma cannot express `to_tsvector(...)`; the ingest path
--     therefore writes `content_ts` itself, in the same INSERT as `text`, so
--     the column and the tsvector cannot disagree.
--
-- There is deliberately NO vector index. `embeddings.vector` is a fixed-width
-- `vector(1536)` column searched exactly (a sequential scan per workspace).
-- This Prisma version rejects every spelling of HNSW and IVFFlat as an
-- unknown index type, so an ANN index would need a raw-SQL `CREATE INDEX`
-- that `migrate diff` reports as permanent drift forever, or a dimensionless
-- `vector` column that accepts mixed widths and silently corrupts cosine
-- distance. Search is exact at present scale; ADR-0007 §2 records the
-- trade and the upgrade path. The commented block at the end of this file
-- shows the statement that would be run when that happens.
--
-- The GIN build is instantaneous on an empty table set, which is what this
-- migration sees. On a populated corpus it would be a write outage and would
-- belong in a separate concurrent-index migration.

-- CreateEnum
CREATE TYPE "SpoilerMode" AS ENUM ('AUTHOR', 'EDITOR', 'READER');

-- CreateEnum
CREATE TYPE "ReferenceKind" AS ENUM ('NOTE', 'GUIDE', 'RESEARCH', 'STYLE', 'GLOSSARY', 'IMPORTED');

-- CreateEnum
CREATE TYPE "ReferenceStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "references" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "novel_id" UUID,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "ReferenceKind" NOT NULL DEFAULT 'NOTE',
    "source" TEXT,
    "status" "ReferenceStatus" NOT NULL DEFAULT 'DRAFT',
    "current_version_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reference_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "char_count" INTEGER NOT NULL,
    "note" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reference_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chunks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reference_version_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "index" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "start" INTEGER NOT NULL,
    "end" INTEGER NOT NULL,
    "available_from_chapter" INTEGER,
    "content_ts" tsvector,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "embeddings" (
    "chunk_id" UUID NOT NULL,
    "model" TEXT NOT NULL,
    "dimensions" INTEGER NOT NULL,
    -- Fixed at 1536: pgvector refuses an HNSW index on a dimensionless column
    -- (verified against 0.8.6), and a dimensionless column silently accepts
    -- mixed lengths. A fixed column rejects a wrong-length vector at insert.
    "vector" vector(1536) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "embeddings_pkey" PRIMARY KEY ("chunk_id")
);

-- CreateTable
CREATE TABLE "retrieval_audits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "novel_id" UUID,
    "query" TEXT NOT NULL,
    "mode" "SpoilerMode" NOT NULL,
    "reader_chapter" INTEGER,
    "returned_count" INTEGER NOT NULL,
    "withheld_count" INTEGER NOT NULL,
    "results" JSONB NOT NULL DEFAULT '[]',
    "retrievers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "latency_ms" INTEGER,
    "step_run_id" UUID,
    "generation_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retrieval_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "references_current_version_id_key" ON "references"("current_version_id");

-- CreateIndex
CREATE INDEX "references_workspace_id_status_idx" ON "references"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "references_novel_id_idx" ON "references"("novel_id");

-- CreateIndex
CREATE UNIQUE INDEX "references_workspace_id_key_key" ON "references"("workspace_id", "key");

-- CreateIndex
CREATE INDEX "reference_versions_reference_id_created_at_idx" ON "reference_versions"("reference_id", "created_at");

-- CreateIndex
CREATE INDEX "reference_versions_content_hash_idx" ON "reference_versions"("content_hash");

-- CreateIndex
CREATE UNIQUE INDEX "reference_versions_reference_id_number_key" ON "reference_versions"("reference_id", "number");

-- CreateIndex
CREATE INDEX "chunks_workspace_id_idx" ON "chunks"("workspace_id");

-- CreateIndex
CREATE INDEX "chunks_available_from_chapter_idx" ON "chunks"("available_from_chapter");

-- CreateIndex
CREATE INDEX "chunks_content_ts_idx" ON "chunks" USING GIN ("content_ts");

-- CreateIndex
CREATE UNIQUE INDEX "chunks_reference_version_id_index_key" ON "chunks"("reference_version_id", "index");

-- CreateIndex
CREATE INDEX "embeddings_model_idx" ON "embeddings"("model");

-- CreateIndex
CREATE INDEX "retrieval_audits_workspace_id_created_at_idx" ON "retrieval_audits"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "retrieval_audits_novel_id_created_at_idx" ON "retrieval_audits"("novel_id", "created_at");

-- CreateIndex
CREATE INDEX "retrieval_audits_step_run_id_idx" ON "retrieval_audits"("step_run_id");

-- CreateIndex
CREATE INDEX "retrieval_audits_generation_id_idx" ON "retrieval_audits"("generation_id");

-- AddForeignKey
ALTER TABLE "references" ADD CONSTRAINT "references_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "references" ADD CONSTRAINT "references_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "references" ADD CONSTRAINT "references_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "reference_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "references" ADD CONSTRAINT "references_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference_versions" ADD CONSTRAINT "reference_versions_reference_id_fkey" FOREIGN KEY ("reference_id") REFERENCES "references"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference_versions" ADD CONSTRAINT "reference_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_reference_version_id_fkey" FOREIGN KEY ("reference_version_id") REFERENCES "reference_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_chunk_id_fkey" FOREIGN KEY ("chunk_id") REFERENCES "chunks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retrieval_audits" ADD CONSTRAINT "retrieval_audits_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retrieval_audits" ADD CONSTRAINT "retrieval_audits_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retrieval_audits" ADD CONSTRAINT "retrieval_audits_step_run_id_fkey" FOREIGN KEY ("step_run_id") REFERENCES "workflow_step_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retrieval_audits" ADD CONSTRAINT "retrieval_audits_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "generations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- NO VECTOR INDEX IS CREATED, on purpose.
--
-- pgvector's two index types cannot be declared in this Prisma version:
-- every HNSW spelling and IVFFlat alike are rejected as "Unknown index
-- type" (verified by substitution + `validate`). Hand-writing an index here
-- would work until the next `migrate dev`, because Prisma would report it
-- as "Removed index on columns (vector)" drift and the generated migration
-- would drop it.
--
-- Phase 5 therefore uses exact nearest-neighbour search: a sequential scan
-- with the `<=>` cosine operator. No recall loss, no `lists`/`probes`
-- tuning, no reindex after ingest. Only the references corpus is scanned
-- (guides, research notes), not the manuscript.
--
-- UPGRADE PATH, when the corpus outgrows a scan (measure first — at 10^4
-- chunks a scan is already sub-100ms):
--
--   CREATE INDEX CONCURRENTLY "embeddings_vector_hnsw_idx"
--     ON "embeddings" USING hnsw ("vector" vector_cosine_ops);
--
-- HNSW over IVFFlat: it needs no training pass, so there is no window where
-- recall is degraded while lists populate. Run it CONCURRENTLY outside a
-- migration so building it does not lock writes, then add a schema comment
-- and accept that `migrate diff` will warn about it — a trade to make
-- deliberately, once it is actually needed, not pre-emptively.
--
-- Whichever index is added, the operator class MUST be `vector_cosine_ops`:
-- embeddings are compared by direction. L2 or inner product would order
-- results differently, silently degrading ranking rather than erroring.
-- ---------------------------------------------------------------------------
