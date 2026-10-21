-- ADR-0018: additive preferences on immutable definition versions.
-- NULL preserves Automatic for every existing version. No historical backfill.
-- Scalar identities deliberately survive model catalog deletion: execution must
-- refuse a stale preference rather than silently replace it with Automatic.
ALTER TABLE "agent_versions" ADD COLUMN "preferred_model_ref" UUID;
ALTER TABLE "skill_versions" ADD COLUMN "preferred_model_ref" UUID;
ALTER TABLE "workflow_versions" ADD COLUMN "default_model_ref" UUID;
