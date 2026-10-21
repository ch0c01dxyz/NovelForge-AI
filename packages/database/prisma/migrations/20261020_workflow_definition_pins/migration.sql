-- ADR-0018: expand only. Historical runs retain NULL; never invent past pins.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE "workflow_runs" ADD COLUMN "definitions_pinned_at" TIMESTAMP(3);
CREATE TABLE "workflow_run_definition_pins" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "run_id" UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "agent_version_id" UUID,
  "skill_version_id" UUID,
  CONSTRAINT "workflow_run_definition_pins_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workflow_run_definition_pins_kind_version_check" CHECK (
    ("kind" = 'AGENT' AND "agent_version_id" IS NOT NULL AND "skill_version_id" IS NULL) OR
    ("kind" = 'SKILL' AND "skill_version_id" IS NOT NULL AND "agent_version_id" IS NULL)
  ),
  CONSTRAINT "workflow_run_definition_pins_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "workflow_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "workflow_run_definition_pins_agent_version_id_fkey" FOREIGN KEY ("agent_version_id") REFERENCES "agent_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "workflow_run_definition_pins_skill_version_id_fkey" FOREIGN KEY ("skill_version_id") REFERENCES "skill_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "workflow_run_definition_pins_run_id_kind_key_key" ON "workflow_run_definition_pins"("run_id", "kind", "key");
CREATE INDEX "workflow_run_definition_pins_agent_version_id_idx" ON "workflow_run_definition_pins"("agent_version_id");
CREATE INDEX "workflow_run_definition_pins_skill_version_id_idx" ON "workflow_run_definition_pins"("skill_version_id");
COMMIT;
