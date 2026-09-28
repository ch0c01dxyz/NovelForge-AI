-- Phase 7 — novel-delete canon protection (follow-up to
-- 20261002_phase7_delete_route_fk_hardening).
--
-- The entity-level RESTRICTs on canon_facts.entity_id and
-- canon_facts.object_entity_id do not hold at novel-delete scope:
-- canon_facts.novel_id was ON DELETE CASCADE, and the novel's own cascade
-- removed the facts BEFORE the entity cascade could hit their RESTRICT
-- (verified empirically against Postgres FK-trigger firing order). Deleting
-- a novel therefore silently destroyed the canon record — facts and their
-- evidence rows (canon_fact_sources CASCADE) — with no error and no audit.
-- The constitution says canon history is never destructively overwritten
-- (CLAUDE.md §9), so the novel parent must refuse too.
--
-- canon_facts.novel_id — CASCADE became RESTRICT. deleteNovel
-- (apps/api/src/services/platform.ts) maps the refusal to a 409 naming
-- canon facts. Workflow runs were already protected the other way:
-- workflows.novel_id is CASCADE, and the run rows (no novel cascade of
-- their own) make workflow_runs.workflow_id RESTRICT fire, which
-- deleteNovel catches.
--
-- Non-idempotent: re-running this file fails on the DROP/ADD constraint
-- pair. See 20260930_phase6_evidence_fk_hardening for the fuller warning.

-- AlterForeignKey
ALTER TABLE "canon_facts" DROP CONSTRAINT "canon_facts_novel_id_fkey";

-- AddForeignKey
ALTER TABLE "canon_facts" ADD CONSTRAINT "canon_facts_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
