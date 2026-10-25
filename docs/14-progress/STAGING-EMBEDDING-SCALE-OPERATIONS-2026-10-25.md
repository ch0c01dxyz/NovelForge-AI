# Staging embedding, read scale and gateway recovery evidence

Date: 2026-10-25 (Asia/Jakarta; host receipt timestamps use UTC).
Source baseline: `6d9e25cb8e372e94ff4163b590ab28ea381dde90`.
Task: [bounded acceptance contract](../../tasks/staging-embedding-scale-operations-acceptance.md).
This report records new evidence only. Previously passed generation, cover
generation, reader, PostgreSQL daily backup and local embedding checks are retained
with their original scopes, not rerun as new acceptance.

## Environment and approved budgets

Existing staging host: Ubuntu26.04.1, four vCPUs, approximately7.7GiB RAM,
Node24.22.1, PostgreSQL18.6, Python3.14.4, existing authenticated Redis.
Native services and private operator directories were reused; no Docker reset,
new database role elevation, application deployment, commit or push.

The author explicitly approved a structural2,500-chapter dataset,20virtual users
for five minutes, readAPIp95<=2seconds, servererrors<1%, noOOM, abort above85%
host memory or main-service health failure. This budget excludes LLM generation
latency. It is not an approved budget for all remaining M8 workloads or recovery.

## Observed: structural read-load PASS

A fresh private custom PostgreSQL archive was restored into exclusively named
`nf_acceptance_scale_20261025`. PostgreSQL restored its extensions without
granting the application superuser; the scratch API received SELECT access.
The original10chapters remained unchanged. An additional2,490DRAFT chapters and
versions repeated existing source content only in the disposable database. They
are explicitly structural fixtures, not new or author-approved story content.

The actual API server ran as the unprivileged application account, bound only
to loopback8325, against the clone and initially empty, task-owned RedisDB15.
No worker ran on that database. Fresh30-day scratch authentication avoided
session-renewal writes. Twenty virtual clients used one request per second each,
with distinct test addresses through the existing trusted-loopback proxy setting.
No live rate limiter or validator was weakened.

| Read workload | Requests | p95 | Maximum | Status |
| --- | ---: | ---: | ---: | --- |
| Complete2,500chapter summary list | 1,200 | 104.64ms | 246.81ms | all200 |
| Current version of chapter2,500 | 1,200 | 89.55ms | 219.49ms | all200 |
| Character list | 1,200 | 98.76ms | 246.26ms | all200 |
| Author-mode canon list | 1,200 | 88.30ms | 221.31ms | all200 |
| Reference list | 1,200 | 87.38ms | 175.93ms | all200 |

Total6,000requests;302.10seconds including monitoring completion; zero errors or
aborts. Maximum sampled host memory29.76%; `/proc/vmstat` OOM-kill counter delta0.
The complete chapter-list response was checked for exactly2,500entries.

This measures HTTP requests to the actual application on loopback, not public
internet/browser performance. Canon, characters and references retain the small
real-novel dataset: this is not proof of2,500chapters' worth of distinct canon,
memory retrieval, simultaneous AI generations, write conflicts or story quality.
No inference of full production release follows from the result.

Preparation failures were diagnostic errors, not application defects: the first
launcher omitted `/usr/sbin` from PATH; a canon smoke URL omitted `mode=AUTHOR`.
Both were corrected before timed load. The completed load SSH transport remained
open after remote process exit; its exact local process was closed after the
remote successful receipt was independently read back. Test acceptance uses that
receipt, not a claimed successful SSH process exit.

## Observed: router and cover recovery PASS

Reviewed Python standard-library diagnostics used SQLite's online backup API
against `/var/lib/9router/db/data.sqlite`, preserving committed WAL contents,
tables, indexes and triggers. Read-only source snapshot inventory matched the
archive and its separately reopened recovery copy. Integrity was `ok`, foreign
key violations0. Snapshot188,416bytes, SHA256:

`fac59ce8c672ec9ece499463dccc120edc425b6b2aff7cf9c70c3d80d517aba6`

All12application tables were retained, including2provider nodes,2connections,
1resident router API key and11kv entries. No credential value was printed.
This is separate from the router's best-effort migration backups, which do not
constitute a complete operational recovery archive.

The fresh PostgreSQL archive2,632,348bytes was restored into the scratch database.
The accepted cover decoded to327,440bytes with its original SHA256:

`18a0cb8242b2d9c77fbb73686488a323eb247590b071a376e3de886561d2a5d0`

Cover bytes currently live in PostgreSQL JSON. This drill adds their previously
missing recovery proof; it does not regenerate an image or assume Garage stores
the cover. Separate unexamined object-store content is not accepted by inference.

An AES-256-GCM encrypted bundle containing the consistent router snapshot,
fresh PostgreSQL archive and necessary environment configuration was copied
off-host to an ignored Windows evidence directory protected by an explicit
current-user ACL. The random encryption key was stored using user-scoped DPAPI,
read back, unprotected and used for the actual recovery. No plaintext environment
file was extracted. SQLite integrity and2/2/1node/connection/key counts passed on
Windows. A corrupted authentication tag caused decryption refusal with no output.

Ciphertext2,585,017bytes, SHA256:
`dc71737b0fa366e12d96c283603b5aa05ce45f3f1a5e5d184e4b462736d1ba1c`.
The local PostgreSQL file passed custom-archive signature validation; its full
SQL restore was proved on the staging clone, not separately on Windows.
DPAPI recovery depends on preserving the current Windows user's profile.

## Observed: on-demand monitoring and negative controls PASS

The diagnostic successfully checked API DB/Redis readiness, router liveness,
authenticated router catalog284models, all five application/gateway/storage
services, archive freshness, disk and memory. It did not claim provider
generation success from these checks. A deliberately unused loopback port caused
`URLError` and nonzero exit, without stopping a live service.

Read-only queue inspection found seven queues with zero waiting, active,
delayed and failed entries. No live Redis flush occurred. Isolated Redis cleanup
must verify its task marker before removing test-only data.

Five new focused Linux tests passed: committed-WAL/index preservation, existing
lock refusal, failed-request/empty-catalog detection, real cross-origin redirect
credential refusal, and missing/fresh/stale archive detection. Review caught the
default urllib redirect risk before any credential-bearing helper execution;
redirects now fail closed. A targeted rerun after closing HTTP error handles
passed without the earlier ResourceWarning. Existing passed suites were retained.

## Blocked or unproved

Real staging embedding remains BLOCKED. The gateway embedding catalog returned
HTTP200with zero models; both configured upstream model catalogs had no named
embedding candidates. A real `/v1/embeddings` probe using the existing Qwen chat
model returned upstream500`FUNCTION_INVOCATION_FAILED`, not vectors. No embedding
mapping was invented, no local credential was copied, and no semantic quality or
1,536-dimensional staging vector acceptance is claimed. The author's question
about reusing existing models does not authorize copying private local keys.

Unattended offsite scheduling, external alert delivery, WAL/PITR, full object-store
recovery and full-size canon/memory load remain unproved. The new helpers are
on-demand diagnostics, not a continuous monitoring/notification installation.
Human story acceptance and deferred screen-reader acceptance remain separate.

## Evidence and review

Private receipts: `.nf-artifacts/staging-scale-load-receipt.json`,
`.nf-artifacts/staging-recovery-private-20261025/receipt.json`, root-private
operator state/archive/logs and tool receipts. Private artifacts remain ignored.
Exact scale helper review hash:
`b2a6ca41b3a3b7d808c3bf1a472b7efca6ca7e39e6af1d721b6ea7e68c222200`.
Exact encrypted recovery helper review hash:
`a1f0cd90959f2856579a9e3c03197718695bc47a8bb07cfac962ccf457fd63d1`.
Final source/document review and cleanup outcomes are recorded in the task.

## Author-selected Nemotron follow-up

The author subsequently authorized exactly
`openrouter/nvidia/nemotron-3.5-embed-8b:free` from the existing local OpenRouter
connection and required its removal from staging after testing. This supersedes
the earlier pending authorization only for this model/test; no other model was
substituted and no previously passed load/recovery checks were repeated.

The real OpenRouter embedding catalog confirmed the exact model exists.
[Official model documentation](https://openrouter.ai/nvidia/nemotron-3.5-embed-8b:free)
describes native4,096-dimensional output with truncation support; NovelForge
stores1,536dimensions. This is a documented compatibility concern, not evidence
that a provider has honored a1,536-dimensional request.

Observed capability probes used only short synthetic text, not private manuscript:

| Origin and request | Actual result |
| --- | --- |
| Local, two EN/ID inputs, default dimensions | Diagnostic timeout at55seconds; no vectors observed |
| Local, bounded retry with180-second deadline | HTTP504at60,315ms; upstream worker timeout at60,000ms |
| Staging, one input, explicit `dimensions:1536` | HTTP504at60,332ms; upstream worker timeout, zero vectors |

Neither model identity nor token usage was reported by the failed responses.
The staging probe is a direct provider capability diagnostic, not application
ingestion or hybrid-search acceptance. No output was truncated/padded, no schema
was widened, no capability mapping was invented and no application contract was
changed merely to make the test pass. Stop further automatic retries until the
upstream route is working.

The selected credential travelled through encrypted SSH stdin and remote process
memory only. No staging provider connection, NovelForge model/mapping or credential
file was created. Read-back absence checks and exact independent helper review
are recorded in the task:16checked files and the last30minutes of router journal
contained no selected key; original2connection IDs remained; temporaryOpenRouter
connections and selected-model NovelForge rows were both0. No credential file
was created. This is scoped absence verification, not secure erasure of RAM.
Embedding remains BLOCKED on upstream availability and observed dimension
compatibility. The earlier successful bounded scale/recovery evidence remains
valid with its original scope.

Probe/cleanup private receipts:
`.nf-artifacts/staging-nemotron-probe-receipt.json` and
`.nf-artifacts/staging-nemotron-cleanup-receipt.json`.
Independent exact helper reviews APPROVE:
probe `b88464bb23ae707b4795ef8310849d98da02802dbb436143b72807ef681d71c3`;
cleanup `c02bbb4026fa5b60f76da6f6a52e10c6b7740af8eb873a44d41ed27c7766ba2b`.

## Working lighter-model application acceptance

The author supplied four further allowed free OpenRouter models. The first
NVIDIA1Bcandidate worked, so the others were not probed unnecessarily.
`openrouter/nvidia/nemotron-3.5-embed-1b:free` returned HTTP200in1,178ms with one
finite/nonzero1,536-vector, reporting `nvidia/nemotron-3.5-embed-1b` and12input
tokens/cost0for that capability probe. The Liquid candidate's catalog describes
1,024-dimensional output; no padding or schema alteration was attempted.

The successful provider request exposed a real integration gap: NovelForge's
embedding ports did not carry `dimensions`. The minimal fix adds this optional
field through AiServices, GatewayManager and OmniRouteGateway, rejects invalid
positive-integer widths before HTTP, and requests the existing1536storage width
from both ingestion and query retrieval. Legacy callers omitting dimensions
retain their old HTTP body. No model/provider hardcode, vector manipulation,
database migration, weakening of width/finite/arity validation or change to
model-provenance filters.

Focused proof: seven unit cases PASS after six expected pre-fix failures; one
filtered PostgreSQL API case PASS verifies both ingestion and query requests.
The other28cases were unselected, not claimed as newly passed. Three affected
package typechecks and scoped TS lint PASS. A stale local `.env` DB password
caused the first regression setup to fail; only the test subprocess received
the privately read existing Docker acceptance credential. No role/password
change, Docker restart or working-data reset.

For actual application proof, normal `buildApp`/auth/routes and domain services
ran unprivileged in a fresh disposable staging database with isolated Redis15.
A reviewed native ESM source overlay loaded exactly the five patched modules
while resolving all other dependencies from the existing checkout. It did not
intercept HTTP/model responses or replace live application files. The existing
local akanesia-router was reached through SSH reverse forwarding; the actual
staging listener was verified as127.0.0.1:20129before any key transmission.
OpenRouter's upstream key stayed in Windows. Only the existing local gateway
client key was temporarily encrypted in scratch gateway configuration.

Observed in-process API/domain result:

- Two short, harmless EN/ID reference documents created and ingested through
  authenticated API routes in a new scratch workspace; no private manuscript.
- Two stored finite1,536-dimensional vectors with reported model
  `nvidia/nemotron-3.5-embed-1b`.
- LEXICAL and VECTOR retrieval ran. An Indonesian fishing query ranked the
  relevant English document first in VECTOR and fused results. This is a
  two-document relevance check, not a multilingual benchmark.
- Every returned citation matched its immutable source version's exact span.
  Retrieval audit references the actual query generation.
- Three successful model generations report33,35and12input tokens respectively;
  attempt and generation usage are not added together.
- Unchanged re-ingestion returned skipped without another model/generation.

All temporary resources were removed, with independent read-back: scratch DB0,
Redis15empty, source overlay absent, reverse listener absent, temporary gateway
URL and selected model absent from the live database. Original live chapter-row
hash matched. Temporary client-key storage disappeared with the scratch DB;
there was no upstream credential installation on staging. Existing local provider
and resident server configuration were preserved. No claim of forensic RAM/WAL
erasure follows from logical cleanup.

Exact separate helper reviews APPROVE:

| Helper | SHA256 |
| --- | --- |
| Source overlay loader | `0a7f222048333b7892a2ec688978da9a0e7a815780c5576e9d4f1ff6f48a612e` |
| Actual API probe | `2c8e2bf63b6e65b7888a5ecedaffb967456055c833b4be9956ddd9e429a7be04` |
| Root scratch orchestration | `837d62f2b8d87375f3c267dbfcc852c6d3e4a0e663a342897bb7f76f90970214` |
| Local controller | `8f9f0cc7b4fbd26e486d741359b6c9f6055652245a75cbbf619dd3cd2c0c4007` |

Private aggregate receipt: `.nf-artifacts/embedding-real-api-receipt.json`.
This supersedes the earlier embedding blockage for the tested isolated flow.
It does not establish public HTTP/browser acceptance or deployment of the patch;
the resident staging embedding profile is intentionally unconfigured after
cleanup. Continuous offsite/alerts/PITR/full canon-memory scale and human author
acceptance remain separate. No commit/push or application deployment.
