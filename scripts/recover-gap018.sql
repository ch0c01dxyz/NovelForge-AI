-- GAP-018: complete the failed migration's end state before ledger reconciliation.
-- Run with psql -X -v ON_ERROR_STOP=1 -v expected_database=<reviewed scratch DB>.
-- This is a scratch-drill procedure, not authorization to repair a live database.
BEGIN;
SELECT set_config('novelforge.recovery_database', :'expected_database', true);
DO $$
BEGIN
  IF current_database() <> current_setting('novelforge.recovery_database')
     OR current_database() !~ '^nf048_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'Refusing an unapproved recovery target';
  END IF;
END $$;

LOCK TABLE canon_fact_sources, chapter_versions, reference_versions,
           canon_proposals, story_entities IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  spec record;
  existing record;
BEGIN
  IF EXISTS (SELECT 1 FROM canon_fact_sources s LEFT JOIN chapter_versions v
             ON v.id = s.chapter_version_id
             WHERE s.chapter_version_id IS NOT NULL AND v.id IS NULL)
     OR EXISTS (SELECT 1 FROM canon_fact_sources s LEFT JOIN reference_versions v
                ON v.id = s.reference_version_id
                WHERE s.reference_version_id IS NOT NULL AND v.id IS NULL)
     OR EXISTS (SELECT 1 FROM canon_proposals p LEFT JOIN story_entities e
                ON e.id = p.object_entity_id
                WHERE p.object_entity_id IS NOT NULL AND e.id IS NULL) THEN
    RAISE EXCEPTION 'Orphan evidence/proposal references: repair refused';
  END IF;

  IF to_regclass('public.canon_proposals_object_entity_id_idx') IS NULL THEN
    CREATE INDEX canon_proposals_object_entity_id_idx ON canon_proposals(object_entity_id);
  END IF;
  IF pg_get_indexdef('public.canon_proposals_object_entity_id_idx'::regclass)
     <> 'CREATE INDEX canon_proposals_object_entity_id_idx ON public.canon_proposals USING btree (object_entity_id)'
     OR NOT (SELECT indisvalid AND indisready FROM pg_index
             WHERE indexrelid = 'public.canon_proposals_object_entity_id_idx'::regclass) THEN
    RAISE EXCEPTION 'Unexpected evidence index definition/state: repair refused';
  END IF;

  FOR spec IN SELECT * FROM (VALUES
    ('canon_fact_sources', 'canon_fact_sources_chapter_version_id_fkey',
     'FOREIGN KEY (chapter_version_id) REFERENCES chapter_versions(id) ON UPDATE CASCADE ON DELETE RESTRICT'),
    ('canon_fact_sources', 'canon_fact_sources_reference_version_id_fkey',
     'FOREIGN KEY (reference_version_id) REFERENCES reference_versions(id) ON UPDATE CASCADE ON DELETE RESTRICT'),
    ('canon_proposals', 'canon_proposals_object_entity_id_fkey',
     'FOREIGN KEY (object_entity_id) REFERENCES story_entities(id) ON UPDATE CASCADE ON DELETE CASCADE')
  ) AS expected(table_name, constraint_name, definition)
  LOOP
    SELECT pg_get_constraintdef(oid) AS definition, convalidated INTO existing
      FROM pg_constraint WHERE conrelid = spec.table_name::regclass
      AND conname = spec.constraint_name;
    IF FOUND THEN
      IF existing.definition <> spec.definition OR NOT existing.convalidated THEN
        RAISE EXCEPTION 'Unexpected constraint definition/state: %', spec.constraint_name;
      END IF;
    ELSE
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I %s',
                     spec.table_name, spec.constraint_name, spec.definition);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conrelid = spec.table_name::regclass
                   AND conname = spec.constraint_name AND convalidated
                   AND pg_get_constraintdef(oid) = spec.definition) THEN
      RAISE EXCEPTION 'Incomplete migration end state: %', spec.constraint_name;
    END IF;
  END LOOP;
END $$;
COMMIT;
-- Independently verify metadata before prisma migrate resolve --applied
-- 20260930_phase6_evidence_fk_hardening, then deploy remaining migrations.
