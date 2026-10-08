# NF-WF-047E GAP-117 Isolated Worker Smoke — Receipt

**Task:** NF-WF-047E scope amendment (2026-10-08, GAP-117 isolated worker smoke).
**Implementer:** separate actor (backends MODEL_UNVERIFIED per GAP-013).
**Branch:** `work/nf-wf047-isolated-smoke` at `87fea3c`.
**Date:** 2026-10-08.
**Status:** READY FOR DIFF REVIEW.

## Goal

Repeat the 047E worker smoke against owned isolated resources and observe a
uniquely attributed test job completing, with proof that no shared queue was
consumed (GAP-117). The earlier non-isolated receipt
(`047E-native-release-receipt.md` §6b) is retained unchanged as historical
evidence; this receipt does not rewrite it.

## Environment (OBSERVED)

- Ubuntu 24.04.5 LTS, x86_64; Node v24.20.0; PostgreSQL 16.15 + pgvector;
  Redis 7.0.15 (native, no Docker).
- Shared Redis `:6379` — READ-ONLY for this task. Never flushed, never
  written by the worker under test.
- Dedicated Redis `:6380` — owned by this task; loopback only; persistence
  disabled (`--save "" --dbfilename ""`); stopped after the run.
- Disposable PostgreSQL database `novelforge_test_047g117_smoke` — owned;
  all migrations deployed via `pnpm --filter @novelforge/database db:deploy`;
  dropped after the run.

## Worker configuration (sanitized)

- `REDIS_URL=redis://localhost:6380` (dedicated instance)
- `DATABASE_URL=<redacted: disposable database novelforge_test_047g117_smoke;
  supplied externally, never printed>`
- `NODE_ENV=test`; dummy S3/OMNIROUTE/encryption values per
  `apps/api/src/e2e/setup.ts` pattern (test-only, no live credentials).
- All five workers started: heartbeat, workflow-runs, memory-rebuild,
  publication, notifications.

## Uniquely attributed test job (OBSERVED)

- Job ID: `gap117-isolated-smoke-94b39a06-09d0-428c-b14c-7b6aa14dd1ae`
  (uuid generated per run).
- Enqueued via a BullMQ `Queue` client against `:6380` to the
  `worker-heartbeat` queue.
- Completion observed via `QueueEvents` `completed` event for that exact job
  ID; `job.getState()` returned `completed`.
- The completed job key `bull:worker-heartbeat:gap117-isolated-smoke-<uuid>`
  was present on `:6380` (dedicated instance only).

## Isolation evidence (OBSERVED — with limits)

| Resource | Before | After | Delta |
|---|---|---|---|
| Shared `:6379` db0 keys (`INFO keyspace`) | 604 | 604 | 0 |
| Shared `:6379` db15 keys | 5 | 5 | 0 |
| Shared `:6379` `bull:*` keys (via `SCAN`) | 604 | 604 | 0 |
| Dedicated `:6380` keys at worker start | 0 | — | — |
| Dedicated `:6380` client connections (`CLIENT LIST`) | — | 13 (worker) | — |

**What these counts establish (OBSERVED):** the shared Redis key counts were
unchanged before and after the run. No keys were added to or removed from
shared Redis during the observation window.

**What these counts do NOT establish (INFERRED, not proven):** unchanged key
counts alone do not prove the worker never connected to shared Redis, nor
that no shared job was consumed. A connection without key mutation, or a
consume-and-recreate sequence within the window, would also show zero delta.

**Attributable connection evidence (OBSERVED):** the worker was started with
`REDIS_URL=redis://localhost:6380` in its environment; `CLIENT LIST` on the
dedicated `:6380` showed 13 client connections during the run. The worker
configuration is the attributable evidence that workers targeted the
dedicated instance. No worker-attributed connections to `:6379` were
observed, but absence of observed connections is not proof of absence.

**GAP-117 status:** remains OPEN. Closure requires the reproducible
procedure (Finding 3) with connection-level evidence that all workers used
the dedicated resources.

## Cleanup (OBSERVED)

- Worker stopped via SIGTERM (drain); process confirmed gone.
- Dedicated Redis `:6380` stopped via `redis-cli -p 6380 shutdown`;
  connection refused afterwards (confirmed down).
- Disposable database `novelforge_test_047g117_smoke` dropped; confirmed
  absent from `pg_database`.
- Owned resources only. Shared Redis `:6379` untouched (key counts above).

## Failed first attempt (retained per evidence policy)

The first run started `:6380` from the operator's home directory, where a
stale `/home/hatch/dump.rdb` (shared-Redis snapshot, 2026-10-07) was loaded
by the fresh instance — 609 keys appeared on the "dedicated" Redis and the
worker drained copied-over notification jobs. The shared `:6379` was NOT
modified (604 keys before/after), but the dedicated instance was
contaminated, invalidating the isolation claim for that run. The run was
discarded: worker stopped, `:6380` restarted with persistence disabled from
an empty directory (0 keys verified), and the procedure repeated cleanly.
Lesson recorded: a "dedicated" Redis must be verified empty at startup, not
assumed empty.

## Skipped worker test identity (from 047E review P3-1)

`apps/worker/src/worker.test.ts:257` —
`describe.skipIf(!itUrl)("integration — real redis", ...)`. Skipped because
the integration-test Redis URL is not set on this host. Pre-existing
conditional skip, not a regression. Not run in this task.

## Remaining evidence limits

- This rerun proves worker-queue isolation for the smoke configuration
  only. It does not prove production worker behavior, live-provider
  connectivity, or mission-scale throughput.
- The disposable database used an empty-schema migration deploy; this is
  NOT a populated-upgrade claim (047D/GAP-018 remain BLOCKED).
- The uniquely attributed job exercised the heartbeat queue processor; other
  queue processors were started but received no test jobs in this run.
- Secret hygiene: this receipt contains no passwords and no
  credential-bearing connection strings.

## Commands (exact, for the reviewer)

```bash
# baseline (read-only)
redis-cli -p 6379 INFO keyspace
redis-cli -p 6379 --scan --pattern 'bull:*' | wc -l
# dedicated redis
redis-server --port 6380 --daemonize yes --save "" --dbfilename ""
redis-cli -p 6380 ping
# disposable db (DATABASE_URL supplied externally; never printed)
createdb -U novelforge_test -h localhost novelforge_test_047g117_smoke
pnpm --filter @novelforge/database db:deploy
# worker (background; env per section above)
pnpm --filter @novelforge/worker start
# test job (BullMQ Queue client against :6380; see /tmp/gap117-enqueue.mjs pattern)
# isolation check
redis-cli -p 6380 CLIENT LIST | wc -l
redis-cli -p 6379 INFO keyspace
redis-cli -p 6379 --scan --pattern 'bull:*' | wc -l
# cleanup
kill -TERM <worker-pids>   # SIGTERM, drain
redis-cli -p 6380 shutdown
dropdb -U novelforge_test -h localhost novelforge_test_047g117_smoke
```

**READY FOR DIFF REVIEW.**

---

## Rerun (2026-10-08, revised procedure)

**Procedure:** `tasks/NF-WF-047E-native-release-preparation.md`, "Revised
procedure (2026-10-08, Finding 3 — reproducible isolated smoke)".
**Review history (DOCUMENTED):** the revised procedure was independently
reviewed 2026-10-08 (separate reviewer actor, backends MODEL_UNVERIFIED per
GAP-013) with verdict CHANGES_REQUESTED (1 P1: enqueue script import
failure; 2 P2: completion not scripted, missing DB/worker steps; 3 P3
non-blocking). All findings were fixed by the coordinator; the P1 fix
(createRequire import) was verified by execution before rerun dispatch.
Per the reviewer's note, no second full re-review was required as fixes
were limited to the findings. All claims classified per
MODEL-EVIDENCE-POLICY: OBSERVED / DOCUMENTED / INFERRED / UNKNOWN.

### Owned working directory (OBSERVED)

- `SMOKE_UUID=1385b6dc-3e6c-472d-b35c-c034380165da` (generated via
  `python3 -c "import uuid; print(uuid.uuid4())"`; `uuidgen` not installed
  on this host)
- `SMOKE_DIR=/tmp/gap117-smoke-1385b6dc-3e6c-472d-b35c-c034380165da`
  (created, owned, removed after run)

### Dedicated Redis (OBSERVED)

- Port 6380 verified free before start (`ss -tlnp | grep :6380` printed
  nothing).
- Started with all flags: `redis-server --port 6380 --bind 127.0.0.1
  --daemonize yes --save "" --dbfilename "" --dir "${SMOKE_DIR}"`.
- `redis-cli -p 6380 ping` → `PONG`.
- `redis-cli -p 6380 DBSIZE` → `0` (verified empty after start).

### Shared Redis baseline (OBSERVED, read-only)

- `INFO keyspace` on `:6379`: `db0:keys=604,expires=0,avg_ttl=0`;
  `db15:keys=5,expires=0,avg_ttl=0`.
- `bull:*` key count via `SCAN`: `604`.
- Never flushed; no writes performed.

### Disposable PostgreSQL (OBSERVED)

- `createdb -U novelforge_test -h localhost novelforge_test_047g117_smoke`
  → exit 0; confirmed present in `pg_database`.
- `pnpm --filter @novelforge/database db:deploy` with disposable
  `DATABASE_URL` exported → "All migrations have been successfully
  applied." (exit 0). `DATABASE_URL` supplied externally via environment;
  never printed in commands, logs, or this receipt.

### Worker start (OBSERVED)

- Started in background: `pnpm --filter @novelforge/worker start` with
  `REDIS_URL=redis://localhost:6380`, `NODE_ENV=test`, disposable
  `DATABASE_URL`, dummy S3/OMNIROUTE/encryption (per
  `apps/api/src/e2e/setup.ts`: `S3_ACCESS_KEY_ID=test`,
  `OMNIROUTE_API_KEY=test`, `APP_ENCRYPTION_KEY=unit-test-encryption-key`).
- Log shows all five workers started:
  - `{"msg":"redis connectivity proven via heartbeat job"}`
  - `workflow-runs`, `memory-rebuild`, `publication`, `notifications`
    workers started
  - `{"msg":"worker started",...,"proven":true,...}`

### Uniquely attributed test job (OBSERVED)

Enqueue script (`enqueue-gap117.mjs`, from the revised procedure, using
`createRequire` anchored at the worker package) run with
`WORKER_PKG_DIR=<repo>/apps/worker`. JSON output (verbatim):

```json
{"jobId":"gap117-isolated-smoke-e68c8fba-604d-48b4-a2eb-fb6dfd1f8f55","bullmqJobId":"gap117-isolated-smoke-e68c8fba-604d-48b4-a2eb-fb6dfd1f8f55","completedAt":"2026-10-08T01:24:03.123Z","finalState":"completed"}
```

- `completed` event observed via `QueueEvents` for the exact job ID.
- `job.getState()` → `completed`.
- Job key present on `:6380`:
  `bull:worker-heartbeat:gap117-isolated-smoke-e68c8fba-604d-48b4-a2eb-fb6dfd1f8f55`.
- Job key absent on `:6379` (SCAN returned nothing for the job ID).

### Worker-target evidence (OBSERVED)

- `CLIENT LIST` on `:6380` during the run: 13 client connections, all
  from `127.0.0.1` (loopback), including BullMQ clients
  (`name=bull:...`).
- `CLIENT LIST` on `:6379` before: 1 (operator's own `redis-cli`).
  After: 1 (operator's own `redis-cli`). No new worker-attributed
  connections appeared.
- **Limitation (DOCUMENTED):** the worker's startup log does NOT contain
  an explicit `REDIS_URL` line (the worker does not log its Redis URL).
  The attributable evidence is the launch environment
  (`REDIS_URL=redis://localhost:6380` in the start command) plus the
  `CLIENT LIST` connection evidence above.
- **Limit (INFERRED):** brief connections to `:6379` might not be
  captured by point-in-time `CLIENT LIST`; stated as a limit, not as
  proof.

### Shared Redis after (OBSERVED, read-only)

- `INFO keyspace` on `:6379`: `db0:keys=604,expires=0,avg_ttl=0`;
  `db15:keys=5,expires=0,avg_ttl=0`.
- `bull:*` key count via `SCAN`: `604`.
- **Report (exact):** key counts unchanged (604 db0 / 5 db15 / 604 bull:*
  before; 604 db0 / 5 db15 / 604 bull:* after).
- **Not claimed:** unchanged counts do not prove no shared jobs were
  consumed (a consume-and-replace cycle would also show zero delta).
  Isolation rests on the worker-target evidence above, not on counts.

### Cleanup (OBSERVED, owned only)

- Worker: SIGTERM sent to node process; ineffective (process persisted).
  SIGTERM to pnpm parent stopped pnpm; node required SIGKILL. All worker
  processes confirmed gone via `ps`.
- Dedicated Redis: `redis-cli -p 6380 shutdown`; subsequent `ping` →
  "Connection refused" (down).
- Disposable DB: `dropdb -U novelforge_test -h localhost
  novelforge_test_047g117_smoke` → exit 0; confirmed absent from
  `pg_database`.
- Owned directory: `rm -rf "${SMOKE_DIR}"`; confirmed removed.
- Shared `:6379` touched only via read-only baseline (INFO, SCAN,
  CLIENT LIST).

### Secret hygiene (OBSERVED)

- This receipt contains no passwords and no credential-bearing connection
  strings. `DATABASE_URL` appears only as "supplied externally via
  environment; never printed".

### Evidence limits

- Heartbeat-queue isolation only; not production behavior, live-provider,
  or mission-scale proof.
- Empty-schema deploy — not a populated-upgrade claim (047D/GAP-018
  BLOCKED unaffected).
- GAP-117 remains OPEN pending independent diff review of this rerun.

**READY FOR DIFF REVIEW.**
