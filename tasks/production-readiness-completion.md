# Production readiness completion

Status: IN PROGRESS, 2026-10-25. Owner: host-bound integration executor.
Baseline: `6d9e25cb8e372e94ff4163b590ab28ea381dde90`.

## Authorization and goal

The author's "oke lakukan semuanya" authorizes the proposed production-readiness
follow-up: publish the reviewed embedding/operations patch, verify CI, deploy
reversibly, configure permanent embedding, and complete operational recovery and
full canon/memory evidence. This supersedes the previous acceptance task's
no-commit/push/deployment restriction only for this follow-up. Existing story
approval, publication and private-cover credential restrictions remain in force.

Required reading: AGENTS, START-HERE, CURRENT, DELIVERY-PLAN M8,
ENVIRONMENT-PREFLIGHT, BACKUP-RESTORE-RUNBOOK, and
`staging-embedding-scale-operations-acceptance.md` with its evidence report.

## Scope and dependencies

Allowed: reviewed embedding paths, operations scripts/tests, CI if a demonstrated
gap requires it, this contract, progress/issue records, ignored private receipts,
and authorized staging configuration/deployment. No dependency or schema changes,
live manuscript mutation, automatic canon approval, local Docker reset or secret
publication. Preserve the existing stash and all unrelated work.

Measured-load amendment: the first full canon/memory run failed the approved2s
p95 target despite allHTTP200. Allow the shared memory service and focused tests
to batch bounded read scopes and reuse request-local revision lookups, preserving
branch/as-of/source pins and freshness semantics. Correct harness timing to
separate HTTP completion from client-side decoding; preserve the failed receipt
and server-side latency evidence. The second measured run improved memory recall
but still failed canon/global p95; each canon response contained9.67MB. Extend this
repair to bounded canon-list pagination in its service, HTTP route, actual FactList
caller and focused tests. Preserve all facts through navigation, filters, reader
boundaries, provenance and existing design/localization. No broader UI redesign.
The same full-size dataset,20users/five minutes and2s target remain unchanged;
measure the actual paginated UI read path and disclose this workload change.

Reuse the already passed structural 2,500-chapter load, real embedding application
acceptance, cover restore, SQLite recovery and focused tests. They establish their
recorded scope only. The source overlay acceptance is not a live deployment.
The tested 1B embedding model is a configuration value, not a code constant.

Author update: use manual backup files for now; no new automatic offsite or external
alert service is requested. Existing daily backup remains intact. The author approved
the proposed numerical targets: recovery RPO15min/RTO60min,7daily/4weekly retention;
isolated2,500chapters/25,000canon facts/10,000memory records,20virtual users/five
minutes, read p95<=2seconds,error<1%, abort memory>85% or live health failure.
Manual snapshots alone do not satisfy continuous15-minute host-loss RPO.
Author selected release without staging cover generation; private image providers
remain local. Do not reinstall a private cover key. Time without a reply is not approval.
Never publish credentials or persist the previously temporary cover key by inference.

## Execution and acceptance

1. Independently review the exact publication manifest, commit only safe project
   files, push main and verify that commit's CI. Preserve historical receipts.
2. Record deployed preimages and source revision, deploy the reviewed artifact
   without a database reset, and check only changed behavior and service readiness.
   Configure permanent embedding through existing gateway/model/profile boundaries;
   preserve model attribution and reject incompatible vector widths.
3. Reuse the daily PostgreSQL backup. Prepare root-owned monitoring/recovery units
   and bounded native WAL streaming; no unlimited replication slot. Activate only
   with known destinations, recovery-key access and approved operational limits.
   Verify isolated recovery from offsite material and actual external alert delivery.
   Local receipts alone do not prove either.
4. After budget approval, isolate a source clone for full-size canon and hierarchical
   memory measurements. Reference chunks are not memory projections. Report fixture
   provenance, record counts, endpoint scope, response sizes, latency and cleanup.
   Do not generate thousands of provider embedding requests under a read-load budget.

Negative cases include invalid embedding dimensions before HTTP, unavailable gateway,
backup corruption, alert failure and bounded resource aborts. Never stop healthy live
services merely to create a failure. Use existing focused test commands documented
in the predecessor task; CI owns its full suite. Record new failures before workarounds.

## Review, rollback and handoff

The parent is the only writer. Independent read-only reviewers examine exact source,
privileged helpers and submitted evidence. No migration is planned. Preserve source
preimages and configuration backups; roll back only task-owned deployment/configuration.
Never restore a test cluster over production. Retain complete base/WAL dependency
chains rather than pruning WAL by age. Save and read back host-bound Engram checkpoints.
Release readiness remains separate from author story sign-off and deferred human
screen-reader acceptance; unknown gates must remain explicitly unknown.
