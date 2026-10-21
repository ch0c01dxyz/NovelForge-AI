# Workspace cover generation

Status: implemented and locally activated; NanoBanana Flash binary transport has
real success evidence. Cloudflare rate limit remains an external limitation.
Root sole integration writer. Independent read-only
reviewer: review_enqueue_pins. Approved parent lane D and author continuation.

## Goal and dependencies

Generate 1–9 real selectable cover candidates from bounded active-novel context,
author notes and editable prompt/style, then explicitly Apply one recoverably.
Use existing Model/Gateway Managers, authorization, image cover validation and
writer design. No text-provider/image-tool substitution, new quota budgets,
automatic cover change or story mutation. Main manuscript and Docker data stay.

Read AGENTS, START-HERE, CURRENT, parent cover plan/spec, existing cover service/
routes, routing registry/manager, generation ledger, BullMQ lifecycle, design
tokens and workspace drawers. HEADce6f361; CI245files/2966testsPASS retained.
Observed native gateway /v1/models/image supports16 models; real Gemini count1
returns691769bytes. Custom bansosmontera image route refuses400. Details in issue
register; catalog metadata alone is not provider acceptance. Runtime identity is
host-owned; no invented or reused session registration.

## Frozen boundary proposal

### Author-supplied image model configuration (2026-10-21)

Keep these identifiers as gateway/model configuration data, never provider
dispatch branches in business code. The initial selection is the first eligible
configured model, originally `gemini/gemini-3.1-flash-image-preview`. Preserve admin profile
mapping, gateway availability and image-transport eligibility checks. The author
picker only shows eligible mapped models; SUPER_ADMIN can inspect the complete
catalog and incompatibility evidence.

Author amendment (2026-10-21): temporarily disable all catalog models whose
identifier contains Gemini following the author's Google quota-limit report.
Do not dispatch further Gemini requests or reactivate them during catalog sync.
Keep historical evidence and mappings. Prefer the separately routed Cloudflare
`cf/@cf/leonardo/lucid-origin` image candidate for the local cover default,
subject to actual transport verification. NanoBanana has a separate adapter;
its underlying Google quota relationship is unknown, not assumed independent.
The proposed Lucid default is superseded by the verified NanoBanana Flash binary
default below; the author-requested Gemini catalog disable remains in effect.

- `gemini/gemini-3.1-flash-image-preview`
- `gemini/gemini-3-pro-image-preview`
- `nb/nanobanana-pro`
- `nb/nanobanana-flash`
- `bansosmontera/gpt-image-2`
- `cf/@cf/black-forest-labs/flux-2-klein-9b`
- `cf/@cf/black-forest-labs/flux-2-klein-4b`
- `cf/@cf/black-forest-labs/flux-2-dev`
- `cf/@cf/leonardo/lucid-origin`
- `cf/@cf/leonardo/phoenix-1.0`
- `cf/@cf/black-forest-labs/flux-1-schnell`
- `cf/@cf/bytedance/stable-diffusion-xl-lightning`
- `cf/@cf/lykon/dreamshaper-8-lcm`
- `cf/@cf/stabilityai/stable-diffusion-xl-base-1.0`

Observed transport evidence: the first Gemini model produced one real image;
the custom `bansosmontera/gpt-image-2` request returned HTTP 400 because its image
adapter is unsupported in the current router. Keep that model unavailable until
new transport evidence clears the incompatibility. The remaining twelve models
are author-supplied candidates, not individually verified successes. Catalog
presence, administrator mapping and observed generation success are separate.

Add IMAGE_GENERATOR as a capability profile, separately mapped by admin. Existing
text profiles remain unchanged. Gateway listImageModels/generateImage are optional
ports. Reject IMAGE_GENERATOR on chat, streamed chat and embedding paths before
dispatch; image-only profiles must never enter text selectors or automatic routing.
Keep optional ports for compatibility; OmniRoute uses /v1/models/image and /v1/images/generations.
Author-approved transport amendment (2026-10-21): model capability marker
`nf:image-output=binary` opts into the configured gateway's binary query mode.
Base64 JSON stays the default. Accept only bounded JPEG/PNG/WebP responses,
refuse redirects, preserve unknown attribution/usage and normalize through the
same decoder. The application never fetches provider URLs and sends one POST.
The binary payload is re-encoded internally to the existing base64 service port.
Image generation requests exactly1 image per durable slot. Never fetch provider
image URLs: accept bounded base64 JPEG/PNG/WebP payloads only. URL-only/invalid/
oversized responses are explicit failures. Requested and reported model remain
separate; missing identity/usage stays unknown. Use the shared manager attempt
ledger with one outer image dispatch, no ambiguous POST retry/fallback. Gateway
internal routing remains its responsibility.

Add reviewed additive profile/table migration. CoverGenerationBatch records
actor/workspace/novel, client idempotency identity+input hash, count1–9, prompt,
style/notes, bounded source snapshot and cancel state. CoverGenerationItem records
unique batch/slot, state, generation identity, image metadata/normalized bytes,
original/normalized SHA256 and error category. NovelCoverVersion stores immutable
cover states including a captured prior/empty baseline, actor and source provenance.
Batch/item are OPERATIONAL, cover history CONFIGURATION: never story restore targets.
Never rewrite historical generation rows, cover versions or existing source pins.

Brief uses novel title/genres, approved synopsis and bounded approved visual facts;
no full manuscript scan. Pin current branch/head plus source fingerprint and old
cover hash. An edited author prompt is explicit input, not approved story canon.
Pin the immutable current cover-version identity too; equal bytes do not erase a
manual write. Ruling: a fresh, explicit selection of another unused candidate may
advance from this same batch's current applied lineage, with current hash CAS and
unchanged story source. A manual replacement invalidates the batch even if its
bytes are identical. This preserves useful gallery selection without relaxing
the stale-cover guard. Legacy batches lacking this identity fail closed.
Recommendations are deterministic genre/style matches with explanation badges,
not invented quality ratings. Preserve notes and editable prompt on errors.

POST .../novels/:novelId/cover-generations accepts count/style/notes/prompt,
preferredModelRef and idempotencyKey. Duplicate identical request returns same
batch before source refresh; changed client input with same key refuses409.
GET collection/detail returns tenant-gated metadata/status and authenticated
candidate image URLs, never gateway credentials. Models require existing admin
eligibility plus image catalog capability; no direct text-model image dispatch.

Worker uses a dedicated cover queue lifecycle with concurrency one. Reserve
PENDING -> RUNNING slot + active generation identity by atomic compare-and-set;
only its winner dispatches. Finalization must match the active generation/attempt,
so a late old response cannot replace an explicit retry. Keep retry linkage.
Reserve slot+generation atomically,
call gateway outside transactions, normalize/validate and persist result. Process
PENDING slots only. Interrupted RUNNING slot becomes UNCERTAIN on recovery rather
than silently duplicating an external job. Explicit retry creates new attributed
generation and retains history; UNCERTAIN retry requires acknowledged duplicate
risk. Cancellation stops future dispatch; current request may finish and is
honestly recorded. SUCCEEDED/PARTIAL/FAILED/CANCELLED reflect actual slots.
Enqueue failure retains recoverable batch identity; read/poll never auto-resubmits.

Use sharp0.35.5, package-managed Windows/Linux binaries, as the narrow standard
normalizer. Existing dependencies contain no image codec. This is necessary for
the approved real-image flow: observed provider output exceeds512KiB. Review the
dependency/lockfile explicitly under existing implementation authorization; no
untracked host binary or extra service. Bound encoded input and decoded pixels;
strip metadata/rotate, resize inside 1024 x 1536 bounds without enlargement and
JPEG encode within 512 KiB, otherwise refuse. Input is at most 12 MiB decoded
from base64 (16 MiB encoded), one non-animated JPEG/PNG/WebP frame, at most
24 million pixels; normalization has a 10-second processing timeout. Reject
multi-frame input rather than silently choosing a frame. Store original hash and normalized hash,
never imply the model returned the normalized bytes unchanged. Official API:
https://sharp.pixelplumbing.com/api-constructor/ and
https://sharp.pixelplumbing.com/api-output/ .

POST .../cover-generations/:batchId/items/:itemId/apply accepts expected current
cover hash and uses server-owned normalized bytes. Lock/recheck ownership, exact
candidate and pinned story source/current cover; refuse stale409. Capture prior
cover bytes before replacement, append a new immutable cover version and audit
atomically. Same already-applied candidate is an idempotent no-op only while that
candidate remains current; a later manual replacement must refuse stale Apply.
Existing manual
cover writes share history so concurrent upload invalidates an AI Apply. Restore
an older cover appends a new version; no destructive history rewrite. Cover is
display configuration, not an approval/mutation of canon or manuscript.

## UI and acceptance

Novel Cover workspace menu/drawer; selected eligible image model, style cards,
count1–9(default1), recommendation badges, editable brief/notes. Explicit Generate,
real per-slot progress/error, persistent gallery and explicit Apply/restore.
English/Indonesian, reference colors/components, keyboard/focus/mobile. Selection
alone never replaces cover; incomplete or uncertain output is not called success.
Keep an unknown submission journal in per-tab browser session storage, scoped by
the server-confirmed signed-in actor and novel. Reload may restore the exact
request, but only an explicit recovery action resubmits its original idempotency
identity. Another actor cannot consume that journal. Storage failures fall back
to in-memory recovery and the durable server batch collection.
OpenDesign tools currently unavailable: use approved checked-in design, record
the capability limit without claiming an OpenDesign run.

Tests: counts0/10/fraction; nonmember/viewer/cross-tenant; stale source/cover;
duplicate/mismatched idempotency; incompatible/disabled model; invalid bytes,
decode/pixel bounds/normalization; partial/cancel/restart/uncertain retry; previous
cover byte recovery and history. Dedicated test DB/Redis prefixes. Native actual
gateway count1 and count9, persisted model attribution and images, gallery en/id
desktop/mobile, selected bytes/hash/rollback and unchanged other novel. Reuse
capability image for normalization tests; do not repeat successful provider probes.
Separate exact-source/migration review, types/lint and verified Engram handoff.

Allowed paths: image-related core/services/API/worker/composition/schema/migration,
restore classification, cover UI/locales/tests, package manifest/lock, ADR/task/
progress/issues. Forbidden: router repository writes, main story mutation, image
tool substitution, automatic approval, force/reset/deploy/commit/push without
new applicable authorization. Rollback preserves old cover/history/candidates;
no down migration dropping data. No completion claim from contract files alone.

## Implementation and local activation evidence — 2026-10-21

Implemented image-only routing, bounded normalization/context, durable batches,
safe slot recovery, actor-attributed retries, EN/ID gallery and explicit Apply/
history restore. Root lint/typecheck PASS; core115, API/AI69 (cover20), image
normalization12, restore classification8 and final cover/admin UI13 tests PASS.
Separate exact-source review APPROVE (40-file manifest
`afb24c986a798a918ee67f99ea087bab51c42bc3d38d07b72f925e1ae18eabf9`).
Real scratch gateway/worker count1+count9 produced ten images; EN desktop/ID390px
mobile exercised gallery, Apply, library refresh, previous-cover byte restore
and unchanged control cover. Reload/lost-response recovery reused those images
with zero extra dispatches. These are automated observations, not author sign-off
or human screen-reader acceptance. Manual keyboard/focus acceptance is not claimed.

Encrypted main backup was decrypted/read-back and clone-restored with exact
source counts/hashes. Reviewed additive migration applied successfully. Final
read-back: zero pending migrations, eleven eligible mapped author image models,
157 Gemini-related catalog entries disabled, no enabled Gemini. API readiness
and Nuxt200; protected route401 without login. Dedicated cover consumer added;
existing workflow/Nuxt processes, queues, two waiting notifications and stash
preserved. Main novel/chapter/version/canon/user/workspace/cover hashes unchanged;
zero main image dispatches. Private backup/receipts remain ignored.

Gemini success is historical. After the author's temporary disable, single real
Cloudflare Lucid and NanoBanana flash probes respectively returned RATE_LIMIT
and INVALID_REQUEST; neither changed a cover. No further probes or Gemini calls.
Other models are catalog/mapping candidates, not individually proven successes.
Local Lucid priority is configuration only and does not imply healthy capacity.
Next: resolve provider availability before claiming current successful generation;
retain programmatic implementation acceptance and human acceptance separately.
No commit/push in this task.

## Binary transport resolution — 2026-10-21

The author explicitly approved extending the base64-only boundary to bounded
binary bytes from the configured gateway. Installed runtime9router0.5.104 confirms
NanoBanana JSON normalization returns URL-only data; `response_format=binary`
query selects bytes. Persisted pre-fix error identifies invalid image output;
the exact prior response body was not retained. No router checkout/runtime edits.

Regression-first binary/manager cases initially failed, then passed after the
opt-in implementation. Final core123 and cover UI9 PASS; core/web types and root
lint PASS. Actual scratch Flash binary output SUCCEEDED once, with one attempt:
1,995,068 bytes normalized to223,479; no Apply, old cover unchanged, no Gemini
dispatch. Binary attribution/usage remain unknown instead of inferred from the
requested ID. Existing count1/count9/gallery/Apply/restore evidence is reused.

Independent delta APPROVE (11-file manifest
`e32fedb8674107ed2069f8ab9f5c416088fea1706eeaf7302dec162811609e8a`).
Corrected activation script review APPROVE SHA256
`b26a8a1cbe0abbd0fb2215256d1af74ee1a637c91091ed24b413d335e9d5d951`.
The first draft's rollback receipt ordering was rejected before mutation and
fixed: rollback plan saved/read-back first, completion after final checks.
Main default now Flash; both NB models receive binary mode via shared adapter
evidence, Pro not individually generated. Gemini0enabled and main source hashes
unchanged; zero main image requests. Dedicated API/cover processes reloaded;
workflow/Nuxt/stash/notifications preserved. No commit/push. Cloudflare quota
availability and other-model successes remain unproved; human acceptance is
separate. This resolution supersedes the earlier current-route blocker above.

## Resumable Horde implementation evidence — 2026-10-21

Author approved implementing the analysis recommendation and syncing the gateway
Horde catalog. See `docs/superpowers/plans/2026-10-21-horde-cover-jobs.md` for the
frozen contract. Gateway durable owned jobs and NovelForge GET-only recovery are
implemented and separately reviewed. Core142, API cover24, cover UI10, relevant
types and root lint PASS. Gateway18 tests and production build PASS after the
real proof identified the missing official R2 result-host allowlist entry.
Only that exact account host is added, retaining HTTPS/no redirects/byte bounds.

Gateway job endpoints were activated by the author's restart;16 Horde models
have audited async/30-minute configuration with existing defaults preserved and
Gemini disabled. API/cover consumers reloaded safely; ready/homepage200. One real
scratch AbsoluteReality job survived worker restart and gateway reload and
completed SUCCEEDED: same job/Generation, one terminal attempt,278560 provider
bytes ->154667 normalized bytes. Intermediate provider429 recovered using GET,
without resubmission. Main story/cover hashes and scratch cover unchanged; no
Gemini dispatch or main Apply. Total observation20m09s includes diagnosis and
reload, not a measured20-minute provider queue. Historical analysis is retained.

## Horde queue analysis for author review — 2026-10-21

Author reports satisfactory real Horde images after15–20 minutes and asks for
analysis/ideas before router changes. Future AI streaming/buffer/catalog/model
investigations should inspect primary akanesia-router; no blanket write permission.

Checkout287253b5 image pipeline: resolve provider/model/credentials, POST Horde
`/generate/async`, receive job ID, poll `/generate/check/:id` every5 seconds, then
GET `/generate/status/:id` when done. Defaults include1024-square images,30 steps
and k_euler_a. Poll deadline600000ms; six consecutive check failures stop waiting.
Job ID is local to this request, without a durable exposed image-job API. Results
normalize to URLs; approved binary mode returns bytes through the gateway instead
of NovelForge fetching them. Provider account fallback may resubmit through a
different connection; one NovelForge POST does not prove one upstream Horde job.

Gateway20127 root200 and matching local10-minute source/build observed; exact
serving process/build for the author's long test is unverified. Do not contradict
their timing or claim a witnessed live20-minute test. NovelForge preparation adds
optional30-minute image timeout from model data, bounded1000..3600000ms. Sixteen
current Horde rows configured with audit/before-state receipt/read-back; current
default/priority/enablement and generic gateway/chat timeout unchanged. Core133/
types/focused lint PASS; independent code/config review APPROVE. Consumer reload
pending the current analysis; no router writes or new provider image requests.

Recommendation only: align queue-aware bounded deadlines and distinguish poll
failure from generation failure. Retain/retrieve an accepted Horde job after
reconnect. For resilient long waits, expose authenticated durable gateway image
submit/status/result with credentials and job ownership inside the gateway.
Reuse existing NovelForge cover batches/BullMQ/polling; preserve unknown outcomes,
byte limits, author quality/model selections and Gemini disable. Do not resubmit
accepted jobs on timeout. Router write/restart or new async API requires author
approval after this analysis.
