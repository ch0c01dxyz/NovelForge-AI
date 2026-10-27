CREATE TABLE "novel_decode_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "novel_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "request_id" UUID NOT NULL,
  "archive_hash" TEXT NOT NULL,
  "root" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "areas" JSONB NOT NULL,
  "source_manifest" JSONB NOT NULL,
  "source_branch_id" UUID NOT NULL,
  "epoch" INTEGER NOT NULL DEFAULT 0,
  "lease_token" UUID,
  "lease_until" TIMESTAMP(3),
  "completed_chunks" INTEGER NOT NULL DEFAULT 0,
  "total_chunks" INTEGER NOT NULL,
  "error_code" TEXT,
  "unknowns" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "novel_decode_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "novel_decode_jobs_status_check" CHECK ("status" IN ('QUEUED','RUNNING','REVIEW','FAILED','UNCERTAIN','CANCELLED')),
  CONSTRAINT "novel_decode_jobs_progress_check" CHECK ("completed_chunks" >= 0 AND "completed_chunks" <= "total_chunks" AND "total_chunks" > 0),
  CONSTRAINT "novel_decode_jobs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "novel_decode_jobs_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "novel_decode_jobs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "novel_decode_jobs_workspace_id_request_id_key" ON "novel_decode_jobs"("workspace_id", "request_id");
CREATE INDEX "novel_decode_jobs_status_created_at_idx" ON "novel_decode_jobs"("status", "created_at");

CREATE TABLE "novel_decode_chunks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "job_id" UUID NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "phase" TEXT NOT NULL DEFAULT 'SOURCE',
  "chapter_number" INTEGER NOT NULL,
  "chapter_version_id" UUID NOT NULL,
  "text" TEXT NOT NULL,
  "processed" BOOLEAN NOT NULL DEFAULT false,
  "unknowns" JSONB NOT NULL DEFAULT '[]',
  "generation_id" UUID,
  CONSTRAINT "novel_decode_chunks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "novel_decode_chunks_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "novel_decode_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "novel_decode_chunks_job_id_ordinal_key" ON "novel_decode_chunks"("job_id", "ordinal");

CREATE TABLE "novel_decode_candidates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "job_id" UUID NOT NULL,
  "chunk_id" UUID NOT NULL,
  "area" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "subject" TEXT,
  "target" TEXT,
  "chapter_number" INTEGER NOT NULL,
  "citations" JSONB NOT NULL,
  "details" JSONB NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "internal" BOOLEAN NOT NULL DEFAULT false,
  "consumed" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "result" JSONB,
  "decided_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "novel_decode_candidates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "novel_decode_candidates_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "novel_decode_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "novel_decode_candidates_status_check" CHECK ("status" IN ('PENDING','APPROVED','REJECTED')),
  CONSTRAINT "novel_decode_candidates_area_check" CHECK ("area" IN ('SYNOPSIS','OUTLINE','STYLE','CHARACTER','CHARACTER_STATE','CHARACTER_ARC','RELATIONSHIP','WORLD','TIMELINE','RESEARCH','NARRATIVE','ENDGAME','CANON'))
);
CREATE INDEX "novel_decode_candidates_job_id_area_status_idx" ON "novel_decode_candidates"("job_id", "area", "status");
