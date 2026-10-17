# Implementation and operations — retained evidence

## AI memory and routing

NF053 arc summaries were implemented and separately reviewed with additive
migration, source-revision pins, strict output validation, claim/result
fencing, forced-intent accounting and API provenance. Actual gateway requests
on existing story sources produced persisted valid summaries on isolated
acceptance clones; genuine worker cache-hit evidence showed no extra model
call. Failure/recovery receipts are retained privately with the raw state.

Observed JSON compatibility is stored as audited model metadata, filtered
only for JSON-mode requests. The seven working markers were read back after
real audited updates. MiniMax/mimo/Claude were marked incompatible for that
mode; DeepSeek/Agnes/Laguna/Muse had clean observed samples. Ordinary routing
order is preserved, UNKNOWN remains eligible, and strict validation remains
the authority. Samples do not guarantee future quality or semantic truth.
Code commits do not transport these database markers or gateway credentials.

## Recovery and local runtime

Current-state backup/restore evidence included the new migration, table/data
comparison and restored API read-back on disposable owned resources. Original
backup bytes, hashes and detailed receipts remain private and recoverable.
They were not deleted merely because application code is committed.

API and worker were refreshed to the working source/configuration; recorded
queue and database preservation checks passed. Empty-queue observations did
not prove absence of in-flight HTTP requests; no graceful-drain claim follows.
Windows frontend startup and same-origin proxy were checked: sign-in200 and
unauthenticated models401. No new author login or story mutation was used
for these HTTP checks. Nuxt error/type export collisions were later removed
and directly verified by generated import owners and focused checks.

## Boundaries

The author selected Windows local use. Remote server/domain work is deferred
until a server exists. Windows automatic startup is optional and not installed.
Human screen-reader GAP051 stays DEFERRED_BY_AUTHOR_DECISION, never PASS.
Live provider outage/429 and later-hop JSON failover remain live-dependent
limits. ADR0017 remains PROPOSED/non-gate. No author release sign-off, remote
deployment or story publication is inferred from these records.
