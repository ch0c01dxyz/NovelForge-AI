# ADR-0019: Bounded cover image transport and normalization

Status: accepted; application integration locally activated on 2026-10-21.
Date: 2026-10-21

## Context

The approved cover flow requires real image generation through the configured
application gateway. Text-model discovery, vision input and successful chat
requests do not establish image-output capability. Read-only router inspection
and real requests established a separate image catalog and generations endpoint.
One native Gemini request returned 691,769 image bytes, exceeding the existing
512 KiB cover boundary. A custom image model returned an unsupported-adapter
error. Those observations are not application-level cover acceptance.

## Decision

Add optional `AIGateway.listImageModels` and `generateImage` ports to preserve
compatibility with existing adapters and text callers. OmniRoute uses
`/v1/models/image` and `/v1/images/generations`, with exactly one image per
request. Provider identifiers remain administrator-managed configuration data;
the author's fourteen proposed model identifiers are recorded in the task.
Catalog availability, profile eligibility and observed transport outcomes remain
separate evidence. Do not dispatch image requests through chat transports.

Accept canonical base64 only; do not fetch arbitrary provider image URLs. Bound
response streaming before JSON parsing, limit decoded image input to 12 MiB,
and retain requested versus reported model/usage without inventing missing data.
Do not add automatic image retries: an ambiguous submitted request may already
have consumed provider resources. Existing safe error classification applies;
never retain raw provider error bodies, secrets or base64 in logs or memory.

Use the package-managed Sharp 0.35.5 decoder/encoder on supported Windows/Linux
Node runtimes. No existing dependency provides an image codec. Enforce a
24-million-pixel input limit and non-animated JPEG/PNG/WebP only, including an
explicit APNG chunk check when the decoder exposes just its first frame.
Rotate, strip metadata, flatten transparency and resize inside 1024 x 1536
without enlargement. Encode JPEG with a ten-second processing timeout and
reject outputs exceeding 512 KiB. Record original and normalized hashes
separately. Preserve the existing manual-upload validator and cover byte limit.

## Consequences and rollout

Author-approved amendment (2026-10-21): retain base64 JSON by default and allow
an explicit `nf:image-output=binary` model capability to request binary bytes
from the same configured gateway endpoint using `?response_format=binary`.
Installed 9router0.5.104 otherwise returns NanoBanana image URLs despite a base64
body request. NovelForge still never opens provider URLs. Refuse redirects and
non-JPEG/PNG/WebP content types, cap streamed binary bytes at12MiB, then pass an
internal base64 representation through the existing bounded decoder/normalizer.
Empty/partial/invalid output is not success. Model/usage attribution absent from
binary output remains unknown, and no fallback POST or automatic retry is added.
This amendment supersedes the earlier base64-only transport restriction.

Amendment verification: core123/coverUI9 PASS, core/web typecheck/root lint PASS;
independent delta and corrected rollout-script review APPROVE. One real isolated
NanoBanana Flash binary request SUCCEEDED with one attributed attempt and
1,995,068 ->223,479 normalized bytes. Prior cover unchanged, no Gemini dispatch.
Flash is now local default; Pro uses the same adapter contract but is not
individually generated. Audited configuration has a pre-change rollback plan;
read-back confirms Gemini remains disabled and main story hashes unchanged.

Integration update (2026-10-21): the foundation-only scope described below is
historical. The reviewed additive cover migration, image profile, durable worker/
API and author gallery/Apply/history are now implemented and locally activated.
Core115/API-AI69/normalizer12/restore8/final-cover-admin-UI13 tests and root lint/
typecheck pass. Real scratch count1+count9/native UI proves generation and restore.
Main source hashes are unchanged; encrypted backup clone-restore is verified.
The author subsequently disabled Gemini temporarily after a Google limit report;
all 157 matching catalog entries are disabled. Cloudflare/NanoBanana bounded
probes failed; current non-Gemini success remains unproved. See CURRENT and the
task for activation evidence. No automatic cover change, main image generation,
destructive rollback or commit/push occurred.

This adds transport and normalization only. It does not activate a model
profile, change a cover or create a usable generation screen. Separately reviewed
additive persistence, image-only profile routing, durable item/attempt fencing,
tenant authorization, cancellation, explicit Apply and recoverable cover history
must precede application activation. Reject image-only profiles on chat/stream/
embedding paths before extending profile enums. Model IDs are not dispatch code.

No database migration or data backfill is part of this foundation. Rolling back
these unused optional ports leaves existing data unchanged. Later application
rollback must preserve generated candidates, attribution and prior cover bytes.
No destructive down migration, main-story mutation or gateway-repository change
is authorized by this ADR.

## Evidence

Independent read-only review approved the contract, optional-port implementation
and dependency lockfile. Adapter regression: 37 tests pass; image normalization:
10 tests pass, including real decoding, pixel limits and animated WebP refusal.
The already-generated real Gemini image normalizes to 111,400 JPEG bytes with
SHA256 `8fabc2f255c3147a6b70be00e59238b802e77771e64523bc19ecf70ae8132292`.
This proof makes no new provider call or story/configuration write. Full batch,
gallery, Apply/recovery and count-nine acceptance remain unfinished.

Task: `tasks/workspace-authoring-cover-generation.md`.
Library API: https://sharp.pixelplumbing.com/api-constructor/ and
https://sharp.pixelplumbing.com/api-output/ .

## Approved Horde recovery amendment — 2026-10-21

The author explicitly approved queue recovery and cross-repository Horde changes
after inspecting akanesia-router. This scoped approval supersedes the original
gateway-write exclusion for the frozen Horde jobs plan only. Optional image-job
ports are selected by observed model capability data; other transports retain
their existing behavior. Gateway owns authenticated, key-scoped durable receipts
in its existing native SQLite KV store. Reserve before one upstream submission;
unknown acceptance never automatically submits again. NovelForge persists the
pinned logical request before dispatch and recovers status/result with GET only.
Terminal cover/Generation/attempt updates are fenced and atomic. Each image job
has a bounded30-minute observation deadline; observation can explicitly resume
the same accepted job without a new image. No new job schema/dependency.

Provider URL retrieval stays exclusively inside the gateway: exact verified
Horde HTTPS hosts, no redirects/credential forwarding, streamed byte bounds and
MIME/signature validation. Real recovery exposed Horde's official transient R2
account, added as one exact host after negative/signed-URL regressions and separate
review. Source/cover checks remain mandatory for Apply; generation itself never
replaces the current cover. Preserve receipts/candidates on rollback.

Plan and final evidence: `../superpowers/plans/2026-10-21-horde-cover-jobs.md`.
