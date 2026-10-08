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
- `DATABASE_URL=postgresql://novelforge_test:novelforge_test@localhost:5432/novelforge_test_047g117_smoke`
  (disposable database; password redacted in this receipt)
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

## Isolation proof (OBSERVED)

| Resource | Before | After | Delta |
|---|---|---|---|
| Shared `:6379` db0 keys (`INFO keyspace`) | 604 | 604 | 0 |
| Shared `:6379` db15 keys | 5 | 5 | 0 |
| Shared `:6379` `bull:*` keys (via `SCAN`) | 604 | 604 | 0 |
| Dedicated `:6380` keys at worker start | 0 | — | — |
| Dedicated `:6380` client connections (`CLIENT LIST`) | — | 13 (worker) | — |

Zero delta on shared Redis: no shared queue was consumed, no shared key
was written. All worker connections targeted the dedicated instance.

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
# disposable db
createdb -U novelforge_test -h localhost novelforge_test_047g117_smoke
DATABASE_URL="postgresql://novelforge_test:novelforge_test@localhost:5432/novelforge_test_047g117_smoke" \
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
