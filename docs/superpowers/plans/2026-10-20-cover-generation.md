# Cover Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development after execution selection; follow the parent plan.

**Goal:** Generate 1–9 real selectable cover images from the active novel with
editable notes, styles and recommendation badges, then explicitly apply one.
**Architecture:** Bounded novel brief, real image-capable gateway adapter and
durable per-batch/per-image outcomes, reusing the existing cover validation/
storage/apply boundary. No automatic replacement of a novel's current cover.
**Tech Stack:** Existing Fastify/Prisma/BullMQ/Vue and gateway adapter; image
transport availability and current provider limits are recorded separately below.
**Spec:** ../specs/2026-10-20-workspace-chapter-lifecycle-design.md

## Global constraints

Parent constraints and routing plan model eligibility apply. Integer count1–9,
default1, max9 is a product output-count limit, not a local token/quota budget.
No novel content/body scan; no hardcoded provider model or Codex image tool
substituted for the application's real runtime. No commit/push.

## Review focus

Partial image results, duplicate retry after timeout, model incompatibility,
oversized image payload and stale cover apply are covered by tasks1–2.

### Task 1: Verified transport and durable generation

Files: `packages/ai-core/{types.ts,omniroute.ts,manager.ts}` and tests,
`packages/ai-services/src/{ai.ts,novel-cover.ts}`; create
`packages/ai-services/src/cover-generation.ts`,
`apps/api/src/cover-generation-routes.ts`, worker cover jobs and dedicated tests;
composition roots, Prisma schema and reviewed additive batch/item migration.

Interface: POST `.../novels/:novelId/cover-generations`
`{ count: number, style: string, notes: string, preferredModelRef: string|null, idempotencyKey: string }`;
GET `.../cover-generations/:batchId` returns requested count, actual slot
statuses, candidate IDs and errors. Model catalog exposes verified image
capability separately from text capabilities. Generation stays workspace/novel
authorized; poll/reload cannot read another tenant's candidates.

- [x] Verify actual configured gateway documentation/capability and image
  endpoint/auth without exposing credentials. If unavailable, record the exact
  limitation and retain the gate; continue other slices. No fake image response.
- [x] Freeze adapter/image normalization, batch/item storage, idempotency,
  cancellation/restart and payload limits in a reviewed contract before code.
  Existing cover accepts at most512KiB; provide a supported normalization path
  or explicit incompatibility before Apply. New image processing dependency
  needs explicit review/authorization rather than an untracked host binary.
- [x] Regress counts0/10/fraction, unauthorized model/tenant, provider partial
  result and timeout with uncertain outcome. Persist slot identities; use provider
  idempotency if supported, never blindly duplicate ambiguous submitted jobs.
- [x] Implement bounded brief from available synopsis/genre/approved visual
  facts, author notes and selected style; track source revision/provenance.
  Queue bounded real requests with per-slot actual outcomes, cancellation and
  honest PARTIAL/FAILED states. No raw tokens/base64 in logs or Engram.
- [x] Real scratch requests for count1 and count9 prove actual candidate images,
  requested/used models and persistence; provider-failure checks remain distinct
  from deterministic fault-injection regression tests.

### Task 2: Cover menu, badges, gallery and recoverable Apply

Files: create `apps/web/app/components/workspace/NovelCoverEditor.vue` and test;
writer, locale resources, cover routes/service and tests. Reuse existing cover
PUT/GET with an additive expected-cover/source-hash guard; verify recovery of
the previous cover rather than assume the audit's old hash stores its bytes.

UI: count picker1–9, chosen eligible model, editable compiled brief/notes,
style cards for3D/artistic/sketch/2D/manga/manhua/manhwa/custom, recommendation
badges with localized explanation. Recommendations are traceable suggestions,
not invented quality scores. Per-image progress/error and selected candidate
remain honest after refresh; successful candidates in a partial batch can be
explicitly chosen without claiming all nine succeeded.

- [x] Regress count bounds, unavailable image model, empty novel facts, notes
  preservation, partial/cancel/retry and stale novel/cover; labeled controls/axe.
- [ ] Retain manual keyboard/focus acceptance as unclaimed human evidence.
- [x] Add menu/editor and gallery; generate preserves the old cover. Apply
  checks candidate ownership/current expected cover, writes recoverably and
  updates actual cover URL. Selection alone performs no cover mutation.
- [x] Native scratch read-back proves selected bytes/hash, unchanged other
  novel, rollback to prior cover, and actual library refresh. Browser en/id
  desktop/mobile confirms badges and9-image layout without overflow.
- [x] Run cover API/component and adapter/worker regression tests, changed
  package types/lint, and separate exact-source review.

## Rollback and readiness

Update 2026-10-21: real native image transport is proved; reviewed optional
adapter ports and bounded normalization are implemented (37 adapter / 10
normalizer tests PASS). ADR-0019 and the cover task record the exact boundary,
author-supplied model candidates and observed incompatibility. No application
migration, batch pipeline or author gallery is implemented yet; this slice is
IN PROGRESS, not READY for acceptance. Preserve generated candidates, source pins and prior
covers when rolling back code; never drop data to undo a deployment. No new
object-storage service is assumed available from configuration alone.

Final update superseding the intermediate status above: durable pipeline/UI/
history and additive local activation are implemented and separately reviewed.
Core115, API/AI69, normalizer12, restore8, final cover/admin UI13 tests PASS;
root lint/typecheck PASS. Actual scratch count1+count9/native gallery/Apply/restore
and reload recovery are retained evidence, not repeated provider dispatches.
Encrypted backup clone-restore and main source-hash preservation verified. API
and dedicated cover consumer are running; old workflow/Nuxt/queues preserved.
Author-requested temporary Gemini disable leaves 157 matching entries disabled
and zero enabled, with eleven eligible non-Gemini image mappings. Single Lucid
and NanoBanana flash probes failed RATE_LIMIT/INVALID_REQUEST. Current provider
availability remains OPEN; successful historical Gemini output is not a current
health claim. No main image generation, commit/push or human acceptance inferred.

Subsequent author-approved binary amendment resolves the NanoBanana mismatch:
opt-in configured-gateway binary, no URL fetch/redirect/retry, bounded12MiB then
existing normalization. Single real Flash request SUCCEEDED, one attempt,
1,995,068 ->223,479 bytes, old cover unchanged and zero Gemini calls. Core123/
coverUI9 PASS, core/web types/rootlint PASS; independent review APPROVE. Verified
audited main default Flash; NBpro configured from shared-adapter evidence only,
not individually generated. Gemini remains disabled; existing main data/queues
preserved. Current Flash route blocker above is resolved; Cloudflare rate limit
remains external, and human acceptance is still separate.
