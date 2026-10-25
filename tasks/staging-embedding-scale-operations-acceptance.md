# Staging embedding, scale and gateway operations acceptance

Status: VERIFIED in bounded isolated staging runtime; full release gates separate
(2026-10-25). Baseline: `6d9e25c`; initially clean checkout and
`nf050b-acceptance-wip` stash preserved. Executor: current host-bound Codex;
independent actors provide read-only research/review, parent owns all writes.

## Goal and required reading

Automatically test remaining embedding, large-scale and gateway operations
evidence, as requested by the author. Read AGENTS, START-HERE, CURRENT,
DELIVERY-PLAN M8 budgets, ENVIRONMENT-PREFLIGHT, BACKUP-RESTORE-RUNBOOK,
staging receipts, retrieval services/routes and existing operations scripts.
Retain passed generation, reader, PostgreSQL archive and 300-chapter harness
evidence; do not repeat these as new acceptance or infer human approval.

## Scope and environment

Allowed: this task, CURRENT/ISSUES, a new staging acceptance report,
`scripts/ops` diagnostic helpers/tests, ignored `.nf-artifacts` private receipts,
authorized staging operational installation and isolated scratch resources.
No dependency/migration changes, live story rewrite, publication, secret logging,
database reset, local Docker replacement, commit or push. Use the existing
Ubuntu staging services; no new provider credentials without author permission.
Root operations use only reviewed separately installed root-owned code/config.

## Acceptance and negative cases

- Real embedding catalog, finite1536-dimensional vectors, actual application
  ingestion/hybrid search with provenance. Empty catalog blocks this leg;
  existing projections cannot be silently replaced by a different model.
- Isolated structural2500-chapter dataset, no fake gateway passed off as real.
  Numeric budgets explicitly approved by the author on2026-10-25:
  20users/five minutes, readAPIp95<=2s, servererrors<1%, noOOM; abort above85%
  memory or live readinessfailure. LLM latency excluded. Time is not approval.
- Consistent SQLite online backup (not copying a live main file without WAL),
  integrity/schema/table checks and isolated recovery, encrypted off-host copy.
  Verify cover payloads in PostgreSQL recovery rather than regenerate images.
- Real services/readiness/authenticatedcatalog/archiveage/resource monitoring;
  isolated bad input causes failure, without stopping live services. Local
  failure receipts do not establish external alert delivery.
- Review exact helpers before privileged installation; focused tests and actual
  read-back afterward. Commands and results belong in the evidence report;
  no invented thresholds or successful unexecuted checks.

## Recovery and handoff

Use uniquely owned scratch DBs/directories and retain live preimages. Cleanup
only verified task-owned resources. No live schema migration. Report observed,
retained, inferred and unknown separately. Record problems in the existing issue
register before workarounds. Save/read-back host-bound Engram checkpoint and
summary; author story sign-off and deferred human accessibility remain separate.

## Actual outcomes

- Author explicitly approved the stated numerical read-load budget.
- Real API structural load: 6,000 requests, 20 virtual clients, 302.10 seconds,
  all HTTP200; worst endpoint p95 104.64ms, memory maximum29.76%, OOM delta0.
  No full canon/memory or LLM concurrency acceptance is inferred.
- SQLite online backup/integrity/isolated restore passed, all12tables retained;
  2provider nodes/2connections/1resident key preserved. Cover327,440bytes restored
  from PostgreSQL with the previously accepted hash; no image regenerated.
- Encrypted off-host recovery passed with persisted DPAPI-key read-back,
  SQLite recovery and GCM tamper refusal. This is not a scheduled offsite service.
- Five new focused operations tests passed; only the affected redirect test was
  rerun after closing HTTP error handles. Actual unavailable-port negative probe
  returned nonzero; seven live queues had zero waiting/active/delayed/failed work.
- Independent exact source/helper/evidence reviews APPROVE. Scale helper
  `b2a6ca41b3a3b7d808c3bf1a472b7efca6ca7e39e6af1d721b6ea7e68c222200`;
  recovery helper `a1f0cd90959f2856579a9e3c03197718695bc47a8bb07cfac962ccf457fd63d1`.
- Cleanup executed: live original chapter-row hash unchanged, scratch database
  dropped and task-owned Redis15 empty. Private recovery archives retained.
- BLOCKED: zero embedding catalog; existing Qwen embedding request returned
  upstream500, no vectors. Await author route setup or explicit temporary local
  credential authorization. No private local credential copied.
- Unproved: external alert delivery, unattended offsite schedule, WAL/PITR,
  independent object-store recovery and full-size canon/memory load.

Full evidence: [staging report](../docs/14-progress/STAGING-EMBEDDING-SCALE-OPERATIONS-2026-10-25.md).
No application deployment, commit or push. Existing stash remains intact.

## Authorized temporary embedding follow-up

On2026-10-25 the author explicitly selected local model
`openrouter/nvidia/nemotron-3.5-embed-8b:free` for the remaining staging test and
requires removal from staging afterward. This supersedes the pending credential
authorization above only for this model and this isolated test. Do not substitute
another model or overwrite existing live embeddings. Verify actual output width
and finite/nonzero vectors before staging activation; the database requires1536.
Use the existing local OpenRouter connection, keep its key out of logs/arguments
and Engram, and remove all temporary server configuration/credentials even on
failure. Already passed load/recovery/monitoring checks remain retained.

Actual follow-up: local55-second diagnostic timeout, one bounded retry HTTP504
at60,315ms, then distinct staging-origin single-input1536-dimension probe HTTP504
at60,332ms. Both504responses identify an upstream worker60,000ms timeout and
return no vectors/reported model/usage. Exact model exists in the public provider
embedding catalog, but no working1536-dimensional response or application ingest
was demonstrated. No automatic substitution, vector manipulation, migration or
application code change. No provider/model/key file was installed on staging;
the authorized key was sent only through SSH stdin into remote process memory.
Cleanup read-back PASS: selected key absent from16checked files and the last
30minutes of router journal; original2resident connection IDs preserved,
temporaryOpenRouter connections0, temporaryNovelForge selected-model rows0.
No credential file was created. This verifies the stated scope, not forensic
erasure of RAM or every historical server file. Existing local connection and
key were only read, not changed/deleted. Helper exact reviews APPROVE:
probe `b88464bb23ae707b4795ef8310849d98da02802dbb436143b72807ef681d71c3`;
absence `c02bbb4026fa5b60f76da6f6a52e10c6b7740af8eb873a44d41ed27c7766ba2b`.
Private probe/cleanup receipts remain ignored. Embedding acceptance stays BLOCKED
until this model returns actual compatible vectors; no additional retry pending.

The author then supplied four allowed alternatives: OpenRouter
`nvidia/nemotron-3.5-embed-1b:free`, `liquid/lfm-2.5-embedding-350m:free`,
`nvidia/nemotron-3-embed-1b:free` and
`nvidia/llama-nemotron-embed-vl-1b-v2:free`. The same temporary-use/removal policy
applies. Probe sequentially with one bounded request per candidate and stop at
the first genuinely compatible working response; no automatic provider switch
outside this explicit list. Retain previous failures and receipts. Catalog
describes Liquid output as1024dimensions, so do not pad it to fit1536storage.

Observed first alternative PASS: `nvidia/nemotron-3.5-embed-1b:free`, reported
`nvidia/nemotron-3.5-embed-1b`, HTTP200at1178ms, one finite/nonzero1536-vector.
Stop candidate probes. The actual provider honored `dimensions:1536`; existing
application transport drops this parameter, so extend the bounded scope to
`packages/ai-core/{types.ts,manager.ts,omniroute.ts,embedding-dimensions.test.ts}`,
`packages/ai-services/src/{ai.ts,retrieval.ts}` and a focused API regression.
Forward optional dimensions through existing ports and request the existing
storage width in both ingestion and search. Preserve omitted-field behavior,
validate positive integers, and retain arity/width/finite/model-provenance guards.
No provider/model hardcode, padding/truncation or database migration. Test patched
source in an isolated staging checkout/runtime, not by replacing live sources.

## Final embedding result and cleanup

Actual end-to-end API/domain acceptance PASS through the real local
akanesia-router, reached from staging by a verified loopback-only SSH reverse
tunnel. Existing OpenRouter upstream key stayed in Windows; only the existing
local gateway client key was temporarily encrypted in the disposable database.
The normal `buildApp`/authentication/routes/AiServices/registry/manager/transport
executed against real PostgreSQL and Redis. A read-only module overlay loaded
exactly the five reviewed patched source files without modifying live sources
or faking model responses.

Two harmless EN/ID reference fixtures ingested/published only in a new scratch
workspace. Two stored vectors have1536dimensions and reported model
`nvidia/nemotron-3.5-embed-1b`. An Indonesian query ranked the relevant English
document first in VECTOR and fused results. Both retrievers ran; all citation
spans matched immutable source versions exactly. The retrieval audit links to its
actual query generation. Three successful generations report33/35/12input tokens.
Re-ingestion skipped with no additional generation/model call. No private
manuscript was sent, story fact approved or live reference/index replaced.

New focused proof: seven unit cases, one filtered PostgreSQL API case covering
ingestion/query dimension propagation, three affected-package typechecks and
scoped TS lint PASS. Full old suites and prior successful scale/backup tests were
not repeated. The initial stale local DB password failure was fixed only in the
test subprocess environment, preserving all Docker services/data.

Cleanup PASS and separate read-back: scratch DB count0, owned Redis15empty,
source overlay removed, reverse listener20129absent, no temporary gateway URL
or selected-model row in the live database, original chapter-row hash unchanged.
The tested model/profile was intentionally temporary; the resident staging
catalog/profile remains unconfigured for ongoing semantic use. No application
deployment, commit or push. Existing stash and local provider configuration remain.

Separate exact source/helper reviews APPROVE. Private receipt:
`.nf-artifacts/embedding-real-api-receipt.json`. Final source/document review
manifests and measured scope are summarized in the report.
