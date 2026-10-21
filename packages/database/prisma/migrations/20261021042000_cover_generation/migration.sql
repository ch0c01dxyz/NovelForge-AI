-- Additive display configuration and operational history; no story backfill.
SET lock_timeout = '5s';
SET statement_timeout = '30s';
ALTER TYPE "ModelProfile" ADD VALUE IF NOT EXISTS 'IMAGE_GENERATOR';
BEGIN;

CREATE TABLE "cover_generation_batches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "novel_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "dispatch_actor_user_id" UUID NOT NULL,
  "idempotency_key" UUID NOT NULL,
  "input_hash" TEXT NOT NULL,
  "count" INTEGER NOT NULL CHECK ("count" BETWEEN 1 AND 9),
  "style" TEXT NOT NULL,
  "notes" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "preferred_model_ref" UUID,
  "source_snapshot" JSONB NOT NULL,
  "expected_cover_hash" TEXT,
  "cancel_requested" BOOLEAN NOT NULL DEFAULT false,
  "queue_revision" INTEGER NOT NULL DEFAULT 0,
  "enqueue_error" BOOLEAN NOT NULL DEFAULT false,
  "execution_epoch" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cover_generation_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cover_generation_batches_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "cover_batch_request_key" ON "cover_generation_batches"("novel_id", "actor_user_id", "idempotency_key");
CREATE INDEX "cover_generation_batches_novel_id_created_at_idx" ON "cover_generation_batches"("novel_id", "created_at");

CREATE TABLE "cover_generation_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "batch_id" UUID NOT NULL,
  "slot" INTEGER NOT NULL CHECK ("slot" BETWEEN 1 AND 9),
  "state" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("state" IN ('PENDING','RUNNING','SUCCEEDED','FAILED','UNCERTAIN','CANCELLED')),
  "active_generation_id" UUID,
  "image" JSONB,
  "original_sha256" TEXT,
  "original_bytes" INTEGER,
  "error_category" TEXT,
  "applied_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cover_generation_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cover_generation_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "cover_generation_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "cover_generation_items_batch_id_slot_key" ON "cover_generation_items"("batch_id", "slot");
CREATE INDEX "cover_generation_items_state_idx" ON "cover_generation_items"("state");

CREATE TABLE "novel_cover_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "novel_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "number" INTEGER NOT NULL CHECK ("number" >= 0),
  "cover" JSONB,
  "sha256" TEXT,
  "source_item_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "novel_cover_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "novel_cover_versions_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "novel_cover_versions_novel_id_created_at_idx" ON "novel_cover_versions"("novel_id", "created_at");
CREATE UNIQUE INDEX "novel_cover_versions_novel_id_number_key" ON "novel_cover_versions"("novel_id", "number");
COMMIT;
RESET lock_timeout;
RESET statement_timeout;
