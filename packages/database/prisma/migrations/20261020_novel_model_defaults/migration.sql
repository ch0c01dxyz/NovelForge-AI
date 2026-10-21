BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE "novel_model_defaults_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "novel_id" UUID NOT NULL,
  "number" INTEGER NOT NULL CHECK ("number" > 0),
  "generation_model_ref" UUID,
  "analysis_model_ref" UUID,
  "actor_user_id" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "novel_model_defaults_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "novel_model_defaults_versions_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "novel_model_defaults_versions_novel_id_number_key" ON "novel_model_defaults_versions"("novel_id", "number");
ALTER TABLE "workflow_runs" ADD COLUMN "model_defaults_pinned_at" TIMESTAMP(3), ADD COLUMN "novel_model_defaults_version_id" UUID;
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_novel_model_defaults_version_id_fkey" FOREIGN KEY ("novel_model_defaults_version_id") REFERENCES "novel_model_defaults_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_model_defaults_marker_check" CHECK ("novel_model_defaults_version_id" IS NULL OR "model_defaults_pinned_at" IS NOT NULL);
CREATE INDEX "workflow_runs_novel_model_defaults_version_id_idx" ON "workflow_runs"("novel_model_defaults_version_id");
COMMIT;
