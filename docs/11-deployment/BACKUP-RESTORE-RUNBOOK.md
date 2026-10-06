# Backup / Restore Runbook — NovelForge-AI (PostgreSQL)

Status: verified by drill (NF-WF-023A, 2026-10-07). All commands below
were executed against scratch databases on the dev host; adapt
host/user/database names for production.

## Principles

- Backups are `pg_dump` custom-format (`-Fc`) — compressed, restorable
  selectively with `pg_restore`, and verifiable with `pg_restore -l`.
- Restores ALWAYS target a **fresh, empty database**. Never restore over
  a live database (023 Invariant 5; DEPLOYMENT.md rollback policy).
- Verify after every restore: row counts per table, `/ready` 200, and
  the pinned key-query set below.

## 1. Backup

```bash
# As the DB owner role (production: the app role with CONNECT on the DB)
pg_dump -Fc -f /backups/novelforge-$(date +%F).dump \
  -h <db-host> -U <db-user> <database>
```

- `-Fc` = custom format (compressed; allows parallel restore and
  selective table restore).
- Record the dump size and the source DB's `_prisma_migrations`
  count alongside the file:
  ```bash
  ls -lh /backups/novelforge-$(date +%F).dump
  psql -h <db-host> -U <db-user> -d <database> \
    -tc "SELECT count(*) FROM _prisma_migrations;"
  # expected: 36 (as of 2026-10-07; update when migrations are added)
  ```

## 2. Restore (drill / disaster recovery)

```bash
# 1. Create a FRESH empty database (never reuse the live one)
psql -h <db-host> -U postgres \
  -c 'CREATE DATABASE novelforge_restore OWNER <db-user>;'

# 2. Restore (parallel jobs speed up large DBs; --no-owner avoids
#    role-name coupling when restoring as a different role)
pg_restore -h <db-host> -U <db-user> -d novelforge_restore \
  --no-owner -j 4 /backups/novelforge-<date>.dump
```

## 3. Verify the restore

### 3a. Row counts per table

```bash
# counts on source (record at backup time) vs restore — must match exactly
psql -h <db-host> -U <db-user> -d <database> \
  -tc "SELECT table_name FROM information_schema.tables
       WHERE table_schema='public' AND table_type='BASE TABLE'
       ORDER BY 1;" > /tmp/tables.txt
for t in $(cat /tmp/tables.txt); do
  s=$(psql -h <db-host> -U <db-user> -d <database> -tc "SELECT count(*) FROM \"$t\";")
  r=$(psql -h <db-host> -U <db-user> -d novelforge_restore -tc "SELECT count(*) FROM \"$t\";")
  [ "$s" = "$r" ] || echo "MISMATCH $t: source=$s restore=$r"
done
echo "row-count check done"
```

### 3b. Application boot + readiness

Point the API at the restored database and check the probes:

```bash
DATABASE_URL="postgresql://<db-user>@<db-host>:5432/novelforge_restore" \
  pnpm --filter @novelforge/api start
curl -fsS http://localhost:3000/ready   # expect HTTP 200
curl -fsS http://localhost:3000/health  # expect HTTP 200
```

### 3c. Key-query parity (pinned set)

Run these against source and restore; results must be identical:

1. Novel read: `SELECT id, title, status FROM novels WHERE id = '<id>';`
2. Chapter read: `SELECT number, title FROM chapters WHERE novel_id = '<id>' ORDER BY number;`
3. Revision history: `SELECT number, origin FROM revisions WHERE novel_id = '<id>' ORDER BY number;`
4. Branch list: `SELECT name FROM novel_branches WHERE novel_id = '<id>';`
5. Simulation state: `SELECT status FROM simulation_runs WHERE novel_id = '<id>';`
6. Endgame ledger: `SELECT status FROM endgame_ledger WHERE novel_id = '<id>';`

## 4. Drill evidence (2026-10-07, NF-WF-023A)

- Scratch DB `novelforge_test_023a_drill` seeded with representative
  rows across all 014–022 tables (29 tables incl. core; 1 row per
  014–022 table, 2 users).
- `pg_dump -Fc` → `/tmp/023a_drill.dump` (**332,035 bytes**).
- Restored into fresh `novelforge_test_023a_restore` via
  `pg_restore --no-owner` (1.06s).
- Result: **29/29 tables row-count match**; `/ready` → 200 on the
  restored DB (app booted in 611ms); all 6 pinned key queries
  byte-identical (novel, chapter, revisions, branches, sim run,
  endgame ledger).
- Drill test: 5/5 PASS (`zz-023a-drill.test.ts`, temporary
  verification file, removed after the run; evidence retained in the
  023A handoff report).

## 5. Retention

Keep at least 7 daily dumps + 4 weekly dumps (tune per DEPLOYMENT.md
retention policy). Test-restore one dump per week (automated drill
recommended). Alert on backup-job failure (DEPLOYMENT.md alerting).

## 6. What this runbook does NOT cover

- Point-in-time recovery (WAL archiving) — not configured; add if RPO
  demands it (follow-up).
- Secrets/rotation — see DEPLOYMENT.md environment principles.
- Production deployment execution — owned by the release engineer.
