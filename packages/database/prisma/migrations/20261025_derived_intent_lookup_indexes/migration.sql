-- ADR-0017/ADR-0022: the read-only status surface and canon freshness queries
-- filter intents by (novel, projection, status); the sweeper scans by
-- (projection, status). The table is append-only, so both reads must not scan.
CREATE INDEX "derived_rebuild_intents_novel_id_projection_status_idx"
  ON "derived_rebuild_intents"("novel_id", "projection", "status");

CREATE INDEX "derived_rebuild_intents_projection_status_updated_at_idx"
  ON "derived_rebuild_intents"("projection", "status", "updated_at");
