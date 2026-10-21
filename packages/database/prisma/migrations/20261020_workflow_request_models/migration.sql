BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE "workflow_runs" ADD COLUMN "requested_model_preferences" JSONB;
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_requested_model_preferences_object_check"
  CHECK ("requested_model_preferences" IS NULL OR jsonb_typeof("requested_model_preferences") = 'object');
COMMIT;
