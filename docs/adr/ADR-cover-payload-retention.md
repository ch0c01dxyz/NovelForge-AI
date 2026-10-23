# Cover payload retention with durable history

Status: Implemented for review; deployment and destructive acceptance cleanup have not run.
Scope: approved shared AI/reader design amendment, phase D (2026-10-22).

## Decision

Cover display configuration is separate from story canon and the story checkpoint
coverage set. Preserve every existing cover version, batch, item and generation
record. Remove only private image JSON payloads and record `payloadExpiredAt`.
The empty-cover baseline remains distinguishable from an expired image: the latter
still has its SHA-256 and returns `COVER_VERSION_EXPIRED` rather than restoring null.

After a cover upload, candidate application or history restoration, use the same
authorized novel write lock and transaction to retain the current image plus the
two most recently used distinct previous image hashes. Duplicate versions do not
consume distinct-image slots. An empty current cover retains two previous images.
Unfinished jobs (pending, running or uncertain) protect their pinned cover version
and expected cover hash. These explicit recovery references may temporarily retain
more than three images. Never purge payloads from an unfinished candidate batch.

Old applied candidate copies can expire only when no retained cover version or
unfinished job needs their hash, and they are not current. Unused generated
candidates are never automatically swept: authors can delete each explicitly in
Cover Studio after confirmation. Reject deletion of active, previously applied,
current or history-referenced images. Authorization, tenant scope and the same
novel write lock apply to deletion; concurrent Apply either wins and protects the
image or loses with an explicit expired-image response. A repeated deletion is
idempotent. Keep audit metadata and image hashes, never image bytes in audit logs.

## Migration and recovery

Two additive nullable timestamp columns; no backfill or cleanup in migration.
Retention runs only during an authorized cover change. No background sweeper,
dependency, provider request or model definition change is introduced.

Before deploying against a populated environment, create and verify a recoverable
database backup. Deleted/expired payloads are not recoverable by reverting code;
restore from that external backup when needed. UI explicitly disables expired
versions, and the API checks expiration before attempting any cover mutation.
Keep the columns on code rollback. Existing story checkpoints are neither altered
nor falsely advertised as backups of cover payloads.

## Verification scope

Use a dedicated disposable database for retention/deletion mutations; never run
cleanup against the author's acceptance database for proof. Verify retention of
distinct hashes, empty-cover restore, protected references, authorization, stale
apply/restore and concurrent operations; verify confirmation and expired UI states.
Unit/integration fixtures do not constitute actual model-provider acceptance.
