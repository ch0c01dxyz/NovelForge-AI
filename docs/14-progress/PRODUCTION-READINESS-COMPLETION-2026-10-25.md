# Production-readiness completion — 2026-10-25

Task: [production-readiness-completion](../../tasks/production-readiness-completion.md).
Earlier bounded receipts remain in
[the preceding report](STAGING-EMBEDDING-SCALE-OPERATIONS-2026-10-25.md).

## Author decisions

- Publish the reviewed patch, verify CI, deploy reversibly, configure permanent
  embedding, and complete larger canon/memory evidence.
- Use manual backup files for now; no new automated offsite or external-alert
  service. Preserve the existing daily backup. Manual snapshots do not establish
  continuous15-minute host-loss RPO.
- Private cover providers remain local. Release scope excludes staging cover
  generation; retain the existing cover-display/recovery evidence.
- Approved isolated load:2,500chapters,25,000canonfacts,10,000memoryrecords,
  20virtual users/five minutes, read p95<=2seconds,error<1%, noOOM; abort above85%
  host memory or live service health failure. Recovery targets15minRPO/60minRTO
  and7daily/4weekly retention are targets, not observed continuous protection.

## Publication and deployment boundary

Sixteen safe project files were independently reviewed and published as
`ffd2746dc2ec401eac7ba6420b5390f0bf73ce6f`. The original stash is preserved.
[CI40160422273](https://github.com/ch0c01dxyz/NovelForge-AI/actions/runs/40160422273)
completed SUCCESS, including lint, typecheck, tests and Compose validation.
Focused source tests and earlier isolated embedding acceptance are retained;
they were not rerun merely to restate earlier evidence.

The staging application is a source archive, not a Git checkout. Deployment is
limited to five runtime embedding files with normalized baseline preconditions,
private raw preimages and metadata-preserving rollback. No schema/environment
change or frontend rebuild is needed for this patch. Deployment helper separately
reviewed SHA256`93ae4ecfc3220d5e40e41972b94620eb4f596e412b6a3b0aa9c8694543a04d62`.
Live activation executed after that CI passed: API and worker restarted, readiness
returned200/database+Redis up, and all five installed normalized source hashes
matched the reviewed committed files. Raw preimages remain in a private operator
directory. No frontend, schema or environment changes were deployed.

## Permanent embedding and manual recovery

Exactly one permanent OpenRouter connection was installed, selecting
`openrouter/nvidia/nemotron-3.5-embed-1b:free`; the EMBEDDING mapping is enabled at
priority0 on the existing staging gateway. Separate read-back confirmed identity,
credential presence without disclosure, and equality of all30unrelated mappings.
The setup helper's order-sensitive false failure and bodyless DELETE issue are
recorded in ISSUES; configuration was verified in place rather than duplicated.
Operator session revocation was audited and independently read back.

Through actual public HTTPS APIs, six existing ACTIVE Bab6references were ingested:
five chunks/vectors each,30total. Search returned LEXICAL and VECTOR, including the
expected oxygen/gill reference. This is deployed-flow evidence with the permanent
route, distinct from the earlier isolated overlay proof. It changes derived indexes,
not reference text or canon. No cover provider/key was reinstalled.

A fresh manual encrypted bundle is retained only in the ignored private Windows
artifact directory. AES-256-GCM authenticated decryption and tamper refusal passed;
the recovery key is protected by the current Windows user's DPAPI profile.
Ciphertext2,889,653bytes, SHA256
`d3dbf95a10d5d6ae7c966dd168d0708fbf4fa23f9ea15efd6eaed4f4716099de`.
It contains PostgreSQL, a consistent router SQLite snapshot and both environment
files. Restored router counts:2nodes/3connections/1client key.

The PostgreSQL dump extracted from that decrypted bundle was actually restored to
an isolated database, not merely listed:3users/2workspaces/12total chapters,
6references/30embeddings/31profile mappings. Original novel chapter and reference
versions matched live; the accepted cover hash matched. Remote restore1.64s,
outer decryption/transfer/restore4.23s, below the approved60-minute drill target.
The scratch database was dropped and read back absent. This proves this manual
artifact's bounded recovery, not continuous RPO, host reconstruction, vector-content
equivalence, an unattended offsite schedule or external alert delivery.

## Larger fixture preparation

First preparation failed before timed load because the synthetic factory reused
one ACTIVE fact predicate, violating existing`canon_facts_live` uniqueness. Fact
and memory writes rolled back; no constraint was weakened. The task-owned failed
clone was dropped, with live original chapter hashes unchanged and Redis unowned.
Its private archive/state were retained.

The corrected independently reviewed helper
`a1bf06b4e75af3d25d823451f4eee5cb14fb2ac8b4c443948c6fc7a8cee530d9`
prepared a fresh clone:2,500target chapters,25,000canonfacts,10,000actual
`memory_projections`. The projections comprise7,500synthetic historical chapter
rows,2,480current chapter rows and20Saga-backed arc rows. They reference actual
scratch fact IDs; summaries are SKIPPED. This tests structural read performance,
not the correctness of invented historical rebuilds or model-generated summaries.
No embeddings/provider calls are part of this load. Reference chunks are not
being mislabeled as hierarchical memory.

Preparation also restored the retained327,440-byte cover with its accepted hash
and verified that the original ten chapter rows remained unchanged. Preparation
and endpoint smoke are outside the timed load's resource-monitoring interval.
Timed results:4,034HTTP200requests/301.55s,20clients, no abort/OOM, max host
memory42.98%. The run FAILED latency: client p95canon2467.07ms,
as-of2393.55ms/global2586.52ms versus2000ms. Retained server logs independently
showed memory p95above2s, so client JSON-decoding overhead cannot erase this failure.
Canon core SQL was fast in an idle EXPLAIN; the service still emits the entire
25,000-fact payload, while memory reads repeat per-scope database operations.
Batching bounded memory reads and separating client validation from HTTP timing
are under repair. Final rerun and clone cleanup remain pending; no full-scale
production PASS is claimed.

## Measured performance repair

The first repair batches bounded memory scopes, selects the newest eligible
projection IDs in SQL, fetches projection/summary-actor rows in batches and avoids
repeated chapter lookup. Branch/as-of pins, FAILED/FRESH/STALE, SUMMARIZING suppression
and generation-backed summary actor provenance are preserved. Two query regressions
failed against the baseline (63global/53chapter model operations) and passed with
bounds8/12. All74affected memory semantic tests passed; affected typechecks/lint
passed after a test-only required-argument correction.

Memory batching alone did not close acceptance:4,180HTTP200requests/301.38s,
max memory39.64%, noOOM; HTTP-body p95canon2230.73ms/chapter1981.07ms/global2176.42ms.
Canon body9,670,282bytes, with client JSON validation measured separately. Preserve
this FAIL and the original all-facts workload rather than revising their outcomes.

The repair now also changes the actual fact-list contract: default100/max200 per
page, ordered by(createdAt,id), optional UUID`cursor`, response`nextCursor`UUID/null.
Clients must follow that cursor to reach further facts. The author FactList has
localized Previous/Next controls, resets navigation on scope/filter changes and
rejects stale request results. Source editing/retraction remains unchanged; the
generation compiler uses its distinct bounded fact-reading path.

All71canon HTTP/database tests passed, including235same-timestamp facts traversed
without loss/duplicates, filtered/status-changed anchors, tenant/spoiler boundaries,
malformed paging and reader provenance redaction. The19affected component/axe cases
and19locale cases passed, covering both locales and missing-key English fallback.
API/services/web typechecks and scoped lint passed. Separate exact source/UI/helper
reviews approved; isolated-worktree dependency-link errors were not counted as a
valid typecheck. These183tests are focused checks, not a full CI claim for this patch.

The new load explicitly exercises this paginated UI contract against the same
2,500chapter/25,000fact/10,000projection dataset. Before timing, it traverses250pages
and requires25,000unique IDs; timed reads sample20page positions including first/last.
The memory workload,20clients/five minutes and2s budget remain unchanged. Three
reviewed source files are loaded through a verified read-only overlay, with the live
application's memory/canon source still unchanged. Results/cleanup are pending.
