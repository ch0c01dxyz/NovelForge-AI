-- NF-WF-053: model-assisted narrative summaries for arc scopes.
-- Additive, forward-only (AUTHOR APPROVED §7.1, 2026-10-16). Existing rows
-- keep their structural state and default to summaryStatus SKIPPED.
-- Idempotent-safe per the GAP-030 DO-block pattern (§16).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MemorySummaryStatus') THEN
    CREATE TYPE "MemorySummaryStatus" AS ENUM ('SKIPPED', 'SUMMARIZING', 'FAILED', 'OK');
  END IF;
END
$$;

ALTER TABLE "memory_projections" ADD COLUMN IF NOT EXISTS "summary" TEXT;
ALTER TABLE "memory_projections" ADD COLUMN IF NOT EXISTS "summary_status" "MemorySummaryStatus" NOT NULL DEFAULT 'SKIPPED';
ALTER TABLE "memory_projections" ADD COLUMN IF NOT EXISTS "summary_error" TEXT;
ALTER TABLE "memory_projections" ADD COLUMN IF NOT EXISTS "summary_covered_fact_ids" TEXT[];
ALTER TABLE "memory_projections" ADD COLUMN IF NOT EXISTS "summarizer_version" TEXT;
ALTER TABLE "memory_projections" ADD COLUMN IF NOT EXISTS "summarizer_model_profile" "ModelProfile";
ALTER TABLE "memory_projections" ADD COLUMN IF NOT EXISTS "summarizer_prompt_version" TEXT;
ALTER TABLE "memory_projections" ADD COLUMN IF NOT EXISTS "summary_claimed_at" TIMESTAMP(3);
ALTER TABLE "memory_projections" ADD COLUMN IF NOT EXISTS "summary_claim_id" TEXT;
ALTER TABLE "memory_projections" ADD COLUMN IF NOT EXISTS "summary_retry_ids" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "memory_projections" ADD COLUMN IF NOT EXISTS "summary_generation_id" UUID;
