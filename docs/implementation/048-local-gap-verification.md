# NF-WF-048 local verification receipt

Status: VERIFIED / REVIEWED, 2026-10-08. Source baseline `c0830c7`;
product code is unchanged. This is local Windows evidence, not an Ubuntu
rerun, production repair, deployment approval or full release acceptance.
Owner: local coordinator; separate reviewers: `review_recovery_034` (A)
and `review_mutations_034` (B). Runtime Engram attribution is unavailable;
the task and CURRENT are the fallback checkpoint, not an MCP save.

## Environment and ownership

Node24.14.1, pnpm12.5.1; existing Docker services `nf-pg-5433` (PostgreSQL16,
host5433) and `novelforge-ai-redis-1` (Redis7, host6379) were reused.
No service/container was created, restarted or reset. Scratch databases:
`nf048_20261008_raw`, `nf048_20261008_empty`, `nf048_20261008_original`,
`nf048_20261008_replay`. Shared Redis DB0/15 were not selected by the worker.
All raw logs, private fingerprints and temporary dumps remain host-local.
No private row contents, credentials or dumps are committed or uploaded.

## A — GAP-018 recovery

The Git-ignored author backup `.local-backup-novelforge-dev-20261002.sql`
was restored into a fresh scratch DB. Its SHA256 before and after the drill:
`B77B5859E660CDAD38D134832208A75213AF05A0676780B7C8955B7BA5009FC6`.
The original ledger contains ten applied migrations. Current repository:
forty migrations. These are different historical boundaries, not missing
files to invent or ledger entries to rewrite.

Raw `pnpm --filter @novelforge/database db:deploy` exited1 with P3018/42P07
at `20260930_phase6_evidence_fk_hardening`. The existing object-entity index
collided after both evidence-version FKs were dropped. The original backup
contained both RESTRICT FKs and the expected proposal FK/index; the failure
removed the two evidence FKs. This independently reproduces the historical
partial-application mechanism.

The exact recovery SQL received separate pre-execution APPROVE:
`scripts/recover-gap018.sql`, SHA256
`B5C363BDCBC842A07427687E74EA3E5E4BC14D694B27957BC2F5D884122E97EC`.
It locks affected tables inside one transaction, checks orphan absence and
the full expected index/FK definitions, adds only missing objects, and
refuses unexpected existing objects. It changes no migration ledger.

Execution order, with DATABASE_URL supplied privately to the owned target:

```text
psql -X -v ON_ERROR_STOP=1 -v expected_database=nf048_20261008_raw
     -d nf048_20261008_raw -f scripts/recover-gap018.sql
# Separate read-only review verifies all three validated FKs and ready/valid index.
pnpm --filter @novelforge/database exec prisma migrate resolve --applied
     20260930_phase6_evidence_fk_hardening
pnpm --filter @novelforge/database db:deploy
```

Commands are shown without connection credentials; psql runs inside the
existing PostgreSQL container with the copied scratch-only SQL. A wrong
expected database exited3 without committing. The correct transaction exited0.
Independent read-only metadata review approved the complete committed end
state before resolve. Resolve and remaining migration deployment exited0.

| Check | Observed result |
| --- | --- |
| Empty control deployment | All40 migrations applied, exit0 |
| Recovered populated deployment / subsequent deployment | Exit0 / exit0; no pending migrations |
| Matched recovered custom-format dump restored into a new DB | Restore0; deploy0, no pending migrations |
| Full schema-only dumps: recovered, empty and replay | Equal; only random psql restrict tokens excluded; ownership/ACL omitted by pg_dump flags |
| Independent catalog comparison | 1,805 column/constraint/index/enum records equal |
| Original data preservation | All32 original non-ledger tables: row counts and original-column fingerprints equal to a fresh original restore |
| Original ledger preservation | All10 original full-row fingerprints unchanged, including checksums |
| Intermediate pre-upgrade data preservation | All38 pre-remaining-migration tables unchanged on original columns |
| Chapter/reference cited-version DELETE, recovered and empty | Four refusals total: SQLSTATE23503 and the exact expected FK names |
| Recovery negative tests, recovered and empty | Chapter orphan, reference orphan and wrong-index refusals; savepoints/full transaction rolled back |
| Final orphan counts | Chapter0, reference0, proposal0 |
| Historical migration SQL | Unchanged |

The backup had no canon evidence rows. DELETE checks therefore used explicit
synthetic English fixtures in BEGIN/ROLLBACK on both databases; they are
constraint behavior evidence, not a claim about historical citation content.
The first fixture-driver attempt failed42P08 on a UUID/text parameter and
rolled back; explicit UUID casts corrected the driver before the passing run.

Three original ledger checksums differ from today's migration files:
`20260923160119_init_platform`, `20260925_phase3_ai_infrastructure`,
`20260929_phase6_story_intelligence`. They remain untouched. Schema equality
and the clean matched replay do not establish historical checksum equality
or approve migrate-dev/reset on a working database. This closes the bounded
partial-FK-loss/recovered-upgrade gate, not an unreviewed live repair.

Rollback for this drill is a fresh restore of the untouched original backup.
Do not run the scratch-only recovery script against a working database or
change its guard casually. A live repair needs target-specific backup,
orphan/definition diagnosis and separately reviewed operational authorization.

## B — GAP-117 worker isolation

The checked-in `scripts/verify-gap117-local.mjs` starts the actual worker
entrypoint, not a mock or heartbeat-only factory. It requires a privately
supplied localhost5433 `nf048_*` DB, verifies Redis DB14 empty/unused,
leases it, and explicitly passes REDIS_URL to all five factories.
Separate pre-execution APPROVE on final driver SHA256:
`5EAC1D190BF208504E7FA2F14BE0A316B69879C20A516C0C6CBC60ECF54AB105`.

```text
# Set NF048_DATABASE_URL privately to the owned, empty migrated scratch DB.
node scripts/verify-gap117-local.mjs
```

Successful run: `nf048_e4df9bd3-d039-4385-b330-b64961cda973`; worker PID10048.
Actual entrypoint: Node `--experimental-transform-types src/index.ts`, cwd
`apps/worker`. Startup reported all four business workers started and
heartbeat connectivity proven. Source inspection confirms factory connection
inputs: heartbeat2, workflow2, memory1, publication1, notification1.

Redis CLIENT LIST attributed twelve new clients to the isolated worker:
IDs31993–31998 and32000–32005, all `db=14`. Seven connections bore the
unique run name; five bore the exact BullMQ base64 queue names, including
padding, for heartbeat/workflow/memory/publication/notifications.
Windows Get-NetTCPConnection independently found twelve PID10048 sockets
to127.0.0.1:6379, local ports61819,61820,61821,61823,61824,61826,61829,
61832,61833,61835,61836,61837. All attributed Redis client IDs disappeared
after owned-process termination. Docker NAT prevents a port-for-port Redis
address match; source configuration, names, PID socket counts and disconnect
correlation jointly establish this receipt's attribution.

Unique heartbeat job ID equals the run ID. BullMQ waitUntilFinished used a
30-second bound; result.ok=true and getState=completed. Exit0. Windows
child.kill terminated the owned process; no graceful POSIX drain is claimed.
Cleanup checked lease ownership, no remaining/foreign DB14 clients and only
known queue/lease keys; sixteen attributed keys removed, DB14 empty again.
No FLUSHDB/FLUSHALL. Logical DB isolation assumes exclusive use during the
drill; it is not an ACL security boundary against concurrent foreign writers.

Failed verifier attempts are retained: own monitor name was overridden by
ioredis URL options (refused before lease/start); two client-name assertions
then failed because the diagnostic parser truncated base64 padding. Owned
workers stopped and DB14 cleanup succeeded on those attempts. Parsing at the
first separator corrected the verifier; strict database/name/PID checks were
retained. A pre-execution review also required bounded teardown so an error
cannot skip later stop/finalization attempts. No failed attempt counts as PASS.

Heartbeat proves isolated connectivity, not business processor end-to-end
completion, live gateway/storage behavior, SCALE/quota or production readiness.

## Cleanup and independent acceptance

Separate source/evidence reviews APPROVE: A by `review_recovery_034`, B by
`review_mutations_034`, on receipt SHA256
`07CBB159FED6782D1A5910058C18EA5CB1946F6F4BBAFDC398B9EC85FDDC5636`
before this acceptance annotation. B's raw receipt JSON SHA256:
`989227712542A4CB65E512ACF4522D71E6FFAE2D5E5242F1BE176F84DFAFA306`;
worker log SHA256:
`3AC7EE46E78BB6DE2346B7B219027BCD87FEFC67835782D1F884EA6E402DC0BC`.
Cleanup exited0: all four owned scratch databases had zero active connections
before drop, then their absence was verified. The two container-local dump
copies and SQL copy were removed; the private original backup is preserved.
DB14 was independently rechecked empty. Private host logs remain under
TEMP/novelforge-nf048 and TEMP/<run-id>. No working data was reset.
Human GAP-051, product GAP-039/063 and live release approvals remain separate.
