# NF-WF-048: Local GAP-018 recovery and GAP-117 isolation verification

Status: VERIFIED / REVIEWED (2026-10-08); contract review APPROVE by review_recovery_034.
Baseline: `c0830c7`; author instruction: handle GAP-018 and GAP-117 locally.
Owner/implementer: local coordinator actor. Reviewer: separate
`review_recovery_034` actor; no serving-model identity is asserted.
Milestone/capabilities: M8, CAP-03/19. Parent acceptance: local author.
Engram: runtime attribution unavailable (GAP-021); this task is the fallback.

Recovery amendment reviewed before execution (2026-10-08):
`review_recovery_034` APPROVE on `scripts/recover-gap018.sql` SHA256
`B5C363BDCBC842A07427687E74EA3E5E4BC14D694B27957BC2F5D884122E97EC`.
The script is scratch-only and changes no ledger. Independent committed
metadata verification must precede the failed migration's ledger resolution.

Pointer-only scope amendment APPROVE by `review_recovery_034`: allow
`docs/implementation/EXTERNAL-FOLLOW-UP-WORKFLOW.md` current resume-boundary
annotation, preserving all historical D/E receipts and instructions. Do not
apply changes beyond that annotation without a new scope review.

## Inputs, authority and environment

Read START-HERE, AGENTS, MODEL-EVIDENCE-POLICY, ENVIRONMENT-PREFLIGHT,
ISSUES-AND-GAPS GAP-018/117, 047D/E and the backup/restore runbook.
Windows Node24.14.1/pnpm12.5.1; reuse existing `nf-pg-5433` PostgreSQL16
and `novelforge-ai-redis-1` Redis. No replacement stack, credential changes,
container restarts, volume removal or shared database/queue resets.

The author-owned local backup `.local-backup-novelforge-dev-20261002.sql`
exists, is Git-ignored, and has SHA256
`B77B5859E660CDAD38D134832208A75213AF05A0676780B7C8955B7BA5009FC6`.
Local diagnosis is authorized by the author's request; do not upload the
dump, reveal its row contents or share credentials. Preserve the original
file and ledger; use uniquely named disposable database copies only.
The external host's missing-input receipt remains historical, not a claim
that this host lacks the backup. Any sanitized export is a separate artifact;
no claim is made that this private original is already sanitized.

## Bounded outputs and ownership

Allowed: this task; `docs/implementation/048-local-gap-verification.md`;
`scripts/verify-gap117-local.mjs`; `scripts/recover-gap018.sql` if a reviewed
recovery amendment establishes exact SQL; coordinator-owned CURRENT,
ISSUES-AND-GAPS, START-HERE and DELIVERY-PLAN acceptance updates.
Forbidden: historical migration edits, product code, production deployment,
original backup edits, arbitrary database targets and shared Redis writes.
Private diagnostic drivers/logs may live in the host TEMP directory;
record commands/results without secret values or private manuscript text.
Freeze any additional implementation path in a separately reviewed amendment.
Review identities use submitted commits/artifact hashes, never a self-hash.

## A — GAP-018

1. Restore the private local backup into a verified `nf048_*` disposable
   database. Record ledger and constraint metadata without exposing row data.
2. Reproduce historical migration failure and partial FK application there;
   retain the failed receipt. Build a separate empty-schema control.
3. Inspect orphan checks, expected FK/index definitions and migration states.
   Freeze/review a transactional recovery procedure before applying it.
4. Preserve deployed migration checksums. Do not mark a migration applied
   until its entire expected end state is present and independently checked.
   A forward migration cannot bypass an earlier failed historical migration.
5. Verify recovered populated and empty upgrades, both cited-version DELETE
   refusals, no new orphan evidence, unchanged original data/backup, and
   schema comparison with explained environment-only differences.

No repair runs against a working database. Rollback is restoration of the
untouched backup into a new scratch copy; never destructive production reset.
Existing command: `pnpm --filter @novelforge/database db:deploy` with the
owned scratch DATABASE_URL supplied privately. Raw failure output stays local.
Unresolved architecture or unexpected migration drift blocks only A;
record it in GAP-018 and continue B.

## B — GAP-117

Windows policy requires the existing Redis container, so isolate with an
exclusively reserved logical database rather than create a replacement server.
Candidate DB14 was observed empty and absent from active clients at preflight.
Recheck emptiness/client ownership immediately before execution; refuse if busy.
Use an owned scratch PostgreSQL database and a unique run/job identifier.

1. Start the actual worker entrypoint with explicit REDIS_URL selecting DB14,
   private scratch DATABASE_URL and test-only gateway/storage configuration.
2. Inspect all five worker factories: each must use the supplied REDIS_URL.
   Attribute live Redis clients to the owned worker PID using socket endpoints
   and CLIENT LIST, verifying every attributed connection selects DB14.
   Shared DB0/15 counters alone are not proof of isolation.
3. Observe a unique heartbeat job completing using BullMQ's bounded completion
   API; record job ID/state and database routing, not payload secrets.
4. Stop only owned processes. On Windows record the actual termination method;
   do not call process termination a graceful SIGTERM drain.
5. Remove only keys owned by this initially empty leased database/run and drop
   only verified `nf048_*` scratch targets. Never FLUSHALL or shared DB cleanup.
6. Record failed attempts and limits. Heartbeat smoke does not validate every
   business processor, live providers, mission scale or deployment readiness.

## Acceptance and handoff

- Separate contract/recovery-script review before execution; exact-diff/evidence
  review after implementation. Changed artifacts invalidate affected review.
- Scoped checks: lint the new JS driver, SQL transactional refusals, actual
  migration/drill outcomes and worker-routing assertions. Do not rerun an
  unrelated full battery for documentation-only handoff changes.
- Close each gap only with its own verified receipt and separate review.
- Save source revision, resource ownership, actual commands/exits, limitations,
  unfinished step and next action here and in CURRENT; no Engram save claimed.

## Submission boundary — 2026-10-08

Implementation/drills complete; REVIEW_PENDING. A's committed migration end
state was independently read back and approved before resolve. B's final
driver pre-execution review APPROVE: SHA256
`5EAC1D190BF208504E7FA2F14BE0A316B69879C20A516C0C6CBC60ECF54AB105`.
Passing outcomes and failed attempts are recorded in
`docs/implementation/048-local-gap-verification.md`. Scratch resources remain
available for separate read-only review; cleanup and gap-status/pointer updates
are the next steps. No product code or historical migration was changed.

Acceptance update: separate A and B source/evidence reviews APPROVE on receipt
SHA256 `07CBB159FED6782D1A5910058C18EA5CB1946F6F4BBAFDC398B9EC85FDDC5636`.
A closes the bounded partial-FK-loss/recovered-upgrade gate; three original
checksum differences remain preserved and live repair is not approved. B
closes isolated worker-smoke attribution, not business E2E or release approval.
All four owned scratch DBs and container-local copies were removed with
verified target ownership/inactivity; DB14 empty. Final receipt and shared
status pointers carry the outcome. Engram binding remains unavailable.
