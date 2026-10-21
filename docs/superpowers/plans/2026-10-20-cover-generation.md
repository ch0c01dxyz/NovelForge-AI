# Cover Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development after execution selection; follow the parent plan.

**Goal:** Generate 1–9 real selectable cover images from the active novel with
editable notes, styles and recommendation badges, then explicitly apply one.
**Architecture:** Bounded novel brief, real image-capable gateway adapter and
durable per-batch/per-image outcomes, reusing the existing cover validation/
storage/apply boundary. No automatic replacement of a novel's current cover.
**Tech Stack:** Existing Fastify/Prisma/BullMQ/Vue and gateway adapter; image
transport availability remains unverified and must be established first.
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

- [ ] Verify actual configured gateway documentation/capability and image
  endpoint/auth without exposing credentials. If unavailable, record the exact
  limitation and retain the gate; continue other slices. No fake image response.
- [ ] Freeze adapter/image normalization, batch/item storage, idempotency,
  cancellation/restart and payload limits in a reviewed contract before code.
  Existing cover accepts at most512KiB; provide a supported normalization path
  or explicit incompatibility before Apply. New image processing dependency
  needs explicit review/authorization rather than an untracked host binary.
- [ ] Regress counts0/10/fraction, unauthorized model/tenant, provider partial
  result and timeout with uncertain outcome. Persist slot identities; use provider
  idempotency if supported, never blindly duplicate ambiguous submitted jobs.
- [ ] Implement bounded brief from available synopsis/genre/approved visual
  facts, author notes and selected style; track source revision/provenance.
  Queue bounded real requests with per-slot actual outcomes, cancellation and
  honest PARTIAL/FAILED states. No raw tokens/base64 in logs or Engram.
- [ ] Real scratch requests for count1 and count9 prove actual candidate images,
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

- [ ] Regress count bounds, unavailable image model, empty novel facts, notes
  preservation, partial/cancel/retry, stale novel/cover and keyboard selection.
- [ ] Add menu/editor and gallery; generate preserves the old cover. Apply
  checks candidate ownership/current expected cover, writes recoverably and
  updates actual cover URL. Selection alone performs no cover mutation.
- [ ] Native scratch read-back proves selected bytes/hash, unchanged other
  novel, rollback to prior cover, and actual library refresh. Browser en/id
  desktop/mobile confirms badges, focus and9-image layout without overflow.
- [ ] Run cover API/component and adapter/worker regression tests, changed
  package types/lint, and separate exact-source review.

## Rollback and readiness

No real image support or migration has been proved yet; this slice is PLANNED,
not READY for acceptance. Preserve generated candidates, source pins and prior
covers when rolling back code; never drop data to undo a deployment. No new
object-storage service is assumed available from configuration alone.
