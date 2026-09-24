-- Phase 4 follow-up: enforce PLATFORM-scoped key uniqueness.
--
-- `@@unique([scope, workspaceId, key])` does not constrain PLATFORM rows:
-- PostgreSQL treats NULL as distinct in a unique index, so every
-- workspace_id IS NULL row compares unequal and any number of duplicate
-- platform keys can be inserted. Partial unique indexes close that hole.
--
-- The workspace half is already covered by the Prisma-declared index, so
-- only the platform half is added here.

-- Guard: on a database that already holds duplicate platform keys the
-- CREATE below would fail with an opaque error. Fail with a message that
-- names the offending keys instead, since only a human can decide which
-- row to keep. On a clean database (the normal path) this is a no-op.
DO $$
DECLARE
  dupes text;
BEGIN
  SELECT string_agg(kind || ' "' || key || '" x' || n, ', ' ORDER BY kind, key)
    INTO dupes
  FROM (
    SELECT 'agent' AS kind, key, count(*) AS n
      FROM agents WHERE workspace_id IS NULL GROUP BY key HAVING count(*) > 1
    UNION ALL
    SELECT 'skill', key, count(*)
      FROM skills WHERE workspace_id IS NULL GROUP BY key HAVING count(*) > 1
    UNION ALL
    SELECT 'workflow', key, count(*)
      FROM workflows WHERE workspace_id IS NULL GROUP BY key HAVING count(*) > 1
  ) d;

  IF dupes IS NOT NULL THEN
    RAISE EXCEPTION
      'cannot add platform key uniqueness — duplicate PLATFORM keys exist: %', dupes;
  END IF;
END $$;

CREATE UNIQUE INDEX "agents_platform_key_key"
  ON "agents" ("key")
  WHERE "workspace_id" IS NULL;

CREATE UNIQUE INDEX "skills_platform_key_key"
  ON "skills" ("key")
  WHERE "workspace_id" IS NULL;

CREATE UNIQUE INDEX "workflows_platform_key_key"
  ON "workflows" ("key")
  WHERE "workspace_id" IS NULL;
