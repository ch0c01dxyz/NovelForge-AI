-- Phase 4 follow-up: index the nullable FKs on workflow_step_runs.
--
-- Each of these columns has `onDelete: SetNull`, so deleting the parent
-- row issues `UPDATE workflow_step_runs SET col = NULL WHERE col = $1`.
-- PostgreSQL does not create an index for a referencing column, so those
-- updates were sequential scans over every step row ever recorded. The
-- `agentId` column already had one; this brings its four siblings in line.
--
-- A workspace delete cascades into agents and skills and hits exactly this
-- path, so the cost grows with total run history, not with the size of the
-- thing being deleted.

CREATE INDEX "workflow_step_runs_agent_version_id_idx"
  ON "workflow_step_runs" ("agent_version_id");

CREATE INDEX "workflow_step_runs_skill_id_idx"
  ON "workflow_step_runs" ("skill_id");

CREATE INDEX "workflow_step_runs_skill_version_id_idx"
  ON "workflow_step_runs" ("skill_version_id");

CREATE INDEX "workflow_step_runs_generation_id_idx"
  ON "workflow_step_runs" ("generation_id");

-- The trigger column of the same SetNull rule: workflow_step_runs.agentId
-- was covered, the nulling side is what these four complete.
CREATE INDEX "workflow_runs_triggered_by_id_idx"
  ON "workflow_runs" ("triggered_by_id");
