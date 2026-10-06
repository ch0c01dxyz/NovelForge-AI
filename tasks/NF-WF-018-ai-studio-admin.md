# Task NF-WF-018: AI Studio and administration/evaluation surfaces

Project language: English for all authored/revised artifacts and generated
project content; UI uses English (`en`)/Bahasa Indonesia (`id`) locale keys
and resources with English fallback. Record any other explicit author override
and its scope.
Model selection: author-selected at runtime; separate implementer/reviewer
actors, with requested aliases distinguished from runtime evidence.

Status: REVIEW_PENDING
Milestone / capability IDs: M2 (platform half); delivery-plan NF-WF-018
Implementer role / requested and resolved model: (separate actors per child;
backend MODEL_UNVERIFIED per GAP-013)
Reviewer role / requested and resolved model: (separate actor; backend
MODEL_UNVERIFIED per GAP-013)
Readiness evidence / unresolved decisions / parent acceptance owner: contract
review returned APPROVE_WITH_FINDINGS round 1 (2026-10-06; 2 findings
fixed inline; Q1–Q6 confirmed as decided, recorded in the
Review record; the §"Open questions" wording is the author's
recommendation and the CONFIRMED resolutions are the decisions of
record).
Frozen review manifest / exact artifact paths and identity: (filled at review)
Baseline revision / local changes to preserve: repo HEAD at review time
Engram checkpoint topic key / last confirmed observation reference: (n/a)

## Normative vs informative

Normative: the child-task split (§"Child-task split" — the only authorized
decomposition), the safe-secrets invariant (Invariant 1), the definition
versioning UI semantics (Invariant 2), the authorization boundaries
(Invariant 3), the receipts honesty rules (Invariant 4), the GAP-028
boundary (Invariant 5), the i18n/a11y rules (Invariant 6), the §15 design
conformance (Invariant 7), the forbidden paths, the exact additive backend
additions, and the acceptance checkboxes. Informative: rationale
paragraphs and the §"Open questions" recommendations (the question labels
are normative — the recommendations are the author's, for the reviewer to
confirm or flip).

## Goal and reason

NovelForge has a complete AI-operations backend with no management
surface: versioned agent/skill/workflow definitions, durable runs with
human approvals, encrypted gateway credentials, data-driven model
profiles and routing, and per-generation/evaluation receipts all exist
behind API routes — but there is no screen anywhere that shows them.
The delivery-plan acceptance is: "Safe secrets, definition versioning,
graph/run/approval UI, profiles/routing, usage/failure/evaluation
receipts". This contract splits the work into three independently
reviewable children (018A AI Studio, 018B platform administration, 018C
receipts) and pins exactly what each surface shows, which backend it
reads, and which authorization axis gates it — without weakening the
safe-secrets or tenant boundaries the backend was built on.

## Required reading

- [Operating constitution](../../AGENTS.md) (§2 invariants, §6 AI gateway
  rules, §10 dev rules, §11 Definition of Done, §13 evidence/issues,
  §15 design system).
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- [Delivery plan](../../docs/implementation/DELIVERY-PLAN.md) (NF-WF-018 row
  at `:152`; the child-split rule at `:160-162`; CAP-13 at `:86`).
- [NF-WF-004 contract](NF-WF-004-durable-workflow-execution.md) — the
  durable execution substrate (runs, steps, idempotency, cancel).
- [NF-WF-005 contract](NF-WF-005-approval-decision-continuation.md) — the
  approval decision contract (snapshot hash, atomic decide, 409 codes);
  the 005 decide routes this task surfaces in an inbox.
- [NF-WF-010 contract](NF-WF-010-state-consumer-integration.md) —
  `reviewFinalText` receipts and `evaluateHealth` (computed, not
  persisted).
- Foundational design: `docs/design/writer-workspace` and
  `docs/design/DESIGN-TOKENS.md` (constitution §15).
- Existing implementation: `apps/api/src/ai-routes.ts` (gateway/model/
  profile/generation routes), `apps/api/src/services/ai.ts` (gateway
  management, masked views), `apps/api/src/ai-registry.ts` (per-call
  credential decryption), `apps/api/src/definition-routes.ts`
  (agent/skill/workflow definition, version, publish, run, approve,
  reject, cancel routes), `packages/auth/authorization.ts` (capability
  model — the platform axis), `packages/ai-core/crypto.ts`
  (credential encryption).

## Environment prerequisites

Follow [environment preflight](../../docs/11-deployment/ENVIRONMENT-PREFLIGHT.md).
Native PostgreSQL 16 + pgvector and Redis on localhost (no Docker, per
project policy). All test databases are scratch `novelforge_test_*` only.
`APP_ENCRYPTION_KEY` must be set in the environment for any test that
touches gateway credentials (the encryption key is an env secret, never
committed). No new infrastructure, no new services, no new npm
dependencies expected (UI-only task; any new dep is a reviewer-visible
finding).

## Dependencies and evidence

- NF-WF-004 (IMPLEMENTED): durable runs, step rows, idempotency, cancel —
  the run records 018A reads.
- NF-WF-005 (IMPLEMENTED): the decide contract (snapshot hash, atomic
  decide, 409 codes) — 018A's approvals inbox calls the 005 routes
  unchanged.
- NF-WF-010 (IMPLEMENTED): `FinalTextReview` receipts (durable) and
  `evaluateHealth` (computed on demand) — 018C surfaces both with their
  semantics honestly labeled.
- NF-WF-011 (IMPLEMENTED): `pnpm e2e` — no-regression acceptance.
- Open gaps touching this task: GAP-013 (MODEL_UNVERIFIED, standing),
  GAP-028 (OPEN/P1 — production worker AI wiring; 018 does NOT own the
  fix — Invariant 5 pins the honest boundary), GAP-039 (OPEN — SCALE
  never FAILs; 010 story-intelligence, NOT 018), GAP-040 (OPEN —
  cross-branch as-of; 010 story-intelligence, NOT 018), GAP-063 (OPEN —
  `AIGateway` has no quota fields despite §6 requiring "quota
  observations"; 018B records the absence honestly, does not add the
  schema — Q5).

## Child-task split

The three children below are the only authorized decomposition. Each
child is independently reviewable and independently implementable; a
child's diff review verifies only that child's spec plus the shared
Invariants (1–7). **NF-WF-018 is complete only when 018A, 018B, and 018C
are all diff-reviewed and verified** — no partial completion counts.

### NF-WF-018A — AI Studio: definitions, run graph, approvals inbox (workspace-scoped)

Bounded scope: the management surface for the 004/005 backend —
browse versioned agent/skill/workflow definitions (current version,
status, version history, publish), launch runs, inspect runs (step
graph with per-step status/outcome/error), and decide parked
approvals from an inbox. Every action rides a frozen route
(definitions CRUD/versions/publish; run/cancel/approve/reject;
run list/get), plus additive backend items: a `?status=` filter
on the run list route (Invariant 1(d)) — the frozen route filters
only by `workflowId`/limit, so the approvals inbox cannot list
AWAITING_APPROVAL runs reliably without it — and the three
GAP-064 versions-list routes (`GET /api/agents/:agentId/versions`,
`GET /api/skills/:skillId/versions`,
`GET /api/workflows/:workflowId/versions`): the frozen routes serve
the current version only, so the pinned "immutable version history"
acceptance cannot ride frozen routes (see GAP-064; ruled
contract-conformant by the 018A diff review).

Inputs: workspace membership + capabilities. Outputs: an AI Studio
page under the workspace showing definitions, versions, runs, and
the approvals inbox.

Acceptance (all testable):
- [ ] AI Studio page lists the workspace's agents, skills, and
      workflows with current version number and status
      (DRAFT/PUBLISHED/ARCHIVED).
- [ ] Definition detail shows the immutable version history; a new
      version append is visible after an edit; the run record pins
      the exact version numbers it executed.
- [ ] Run list shows runs with status; run detail renders the step
      graph (per-step key, status, outcome/error) from the frozen
      step rows.
- [ ] Approvals inbox lists AWAITING_APPROVAL runs; approve/reject
      calls the frozen 005 routes with the snapshot hash; the 005
      409 codes surface actionably.
- [ ] Capability gating: definition editing requires `*:manage`
      (OWNER/ADMIN); runs and the inbox are visible to anyone with
      `workflow:read`/`workflow:approve`; launching requires
      `workflow:run`. A VIEWER sees nothing.
- [ ] The 007 writer-page components (ApprovalDialog,
      RunStatusPanel, GenerationPanel) are untouched — the inbox is
      the management view, not a replacement.

### NF-WF-018B — Platform administration: gateways, models, profiles, routing (SUPER_ADMIN only)

Bounded scope: the safe-secrets administration surface for the §6
gateway backend — gateway list (masked), create/rotate/revoke
credentials, enable/disable, priority/weight/timeout/maxRetries
editing, health-check trigger, model catalog management
(enable/disable, sync), profile-mapping editing, routing overview.
UI over existing frozen routes, plus three tiny additive backend
items (Invariant 1).

Inputs: SUPER_ADMIN platform role. Outputs: a platform admin page
showing gateways, models, profiles, and routing with audit evidence.

Acceptance (all testable):
- [ ] Gateway list shows masked rows only (`hasCredential`, never a
      value or ciphertext); create/rotate accept a write-only
      `apiKey`; after rotation the old key no longer decrypts.
- [ ] Delete (revoke) removes the gateway and cascades to its
      catalog models and mappings; audit rows record
      `gateway.created/updated/deleted` with identity only.
- [ ] Model catalog shows per-gateway models with enabled flags and
      capabilities; sync-models refreshes the catalog; profile
      mappings are editable per profile.
- [ ] Routing overview shows priority/weight/timeout/maxRetries per
      gateway and the deployment routing strategy as read-only
      (env-level, honestly labeled "deployment config").
- [ ] The admin page is unreachable without SUPER_ADMIN (platform
      axis — a workspace OWNER gets 403, not a login wall).
- [ ] GAP-063's quota absence is shown honestly (no quota columns
      invented); the GAP stays open.

### NF-WF-018C — Usage, failure, and evaluation receipts (workspace-scoped)

Bounded scope: the observability surface — generations ledger
(tokens, latency, attempts, error categories; honestly labeled "no
cost accounting"), failure log (FAILED generations, no-route
states), evaluation receipts (`FinalTextReview` per chapter
version — the durable receipt; health computed on demand — labeled
live), and the workspace AI audit trail. One additive backend
route (the audit read).

Inputs: workspace membership + capabilities. Outputs: a receipts
surface under the workspace AI Studio showing the ledger, failures,
evaluations, and audit trail.

Acceptance (all testable):
- [ ] Generations ledger lists generations with task, profile,
      status, input/output tokens, latency, and error category;
      detail shows per-attempt rows (gateway, model, status,
      latency). No cost column exists anywhere.
- [ ] Failure log filters FAILED generations and surfaces the
      actionable no-model state (GAP-028's "not configured" is a
      documented category, not a silent error).
- [ ] Evaluation receipts show `FinalTextReview` rows per chapter
      version (verdict, violations, revision pin); health is shown
      as a live computation with the "computed on demand, not
      stored" label — never presented as a durable receipt.
- [ ] Workspace AI audit trail lists the AI-infrastructure audit
      actions (gateway/model events for the platform view;
      workflow/agent/skill/generation/run events for the workspace
      view) with actor, time, and payload.
- [ ] Capability gating: ledger and failures require
      `generation:read`; the audit trail requires `workflow:manage`.

## Scope

### Allowed

- `apps/web/app/pages/workspaces/[workspaceId]/ai-studio/` (new):
  studio page + tabs for definitions, runs, approvals (018A) and
  receipts (018C); follows the 007 component pattern
  (props/emits, vitest tests, no store).
- `apps/web/app/pages/admin/` (new): platform admin page for
  gateways/models/profiles/routing (018B), SUPER_ADMIN-gated.
- `apps/web/app/components/ai-studio/` (new): `DefinitionList.vue`,
  `DefinitionDetail.vue`, `VersionHistory.vue`, `RunList.vue`,
  `RunGraph.vue` (step graph), `ApprovalsInbox.vue`,
  `GenerationLedger.vue`, `FailureLog.vue`,
  `EvaluationReceipts.vue`, `AuditTrail.vue`.
- `apps/web/app/components/platform-admin/` (new):
  `GatewayList.vue`, `GatewayForm.vue` (create/rotate),
  `ModelCatalog.vue`, `ProfileMappings.vue`, `RoutingOverview.vue`.
- `apps/web/app/composables/` (new, additive): `useAiStudio.ts`,
  `usePlatformAdmin.ts`, `useReceipts.ts` (thin fetch wrappers over
  the frozen routes; no business logic).
- `apps/api/src/ai-routes.ts`, `apps/api/src/auth-routes.ts`
  (additive only): the two audit-read routes and the session
  `platformRole` field (Invariant 1's backend items).
- `apps/api/src/definition-routes.ts`,
  `apps/api/src/services/workflow-runs.ts` (additive only): the
  run-list `?status=` filter (Invariant 1(d)) and the three
  GAP-064 versions-list routes
  (`GET /api/agents/:agentId/versions`,
  `GET /api/skills/:skillId/versions`,
  `GET /api/workflows/:workflowId/versions` — read-only, gated
  like the detail routes; added by 018A, ruled contract-conformant
  by the 018A diff review).
- `apps/web/app/i18n/en.ts`, `id.ts`: studio, admin, receipts
  locale keys.
- Tests for all of the above (API route tests + web vitest tests,
  007 harness pattern); docs updates (progress.md, CURRENT.md,
  test-matrix.md, ISSUES-AND-GAPS.md for deviations BEFORE
  workarounds).

### Forbidden

- Any change to the credential encryption mechanism
  (`packages/ai-core/crypto.ts`), the per-call decryption seam
  (`ai-registry.ts`), or the masked-view rule — Invariant 1 is
  additive-surface only.
- Any change to the definition versioning model, the run/step
  records, the 005 decide contract, or the generation receipt
  writes — 018 is a read/management surface, not a backend
  redesign.
- Adding quota fields to `AIGateway` (GAP-063 stays open; Q5).
- Cost accounting columns or pricing logic (Q3 — follow-up).
- Persisting `evaluateHealth` results (Q2 — 010's design stands).
- Fixing GAP-028's worker wiring (Invariant 5 — different task).
- GAP-039/GAP-040 changes (010 story-intelligence, not 018).
- New capabilities in `packages/auth/authorization.ts` — 018 reuses
  the existing capability set (Invariant 3).
- Changes to the 007 writer-page components, the ApplyBar, the
  publish gates, or the reader pages.

### Inputs

- Existing frozen routes (definitions, runs, approve/reject,
  cancel, gateways, models, profiles, generations) with their
  pinned request/response shapes.
- Workspace membership + role; platform role (SUPER_ADMIN) from
  the session.

### Outputs

- The AI Studio page (definitions, run graph, approvals inbox);
  the platform admin page (safe-secrets gateway management,
  models, profiles, routing overview); the receipts surface
  (ledger, failures, evaluations, audit trail).
- Nine additive backend items: the two audit-read routes, the
  session `platformRole` field, the run-list `?status=` filter,
  the three GAP-064 versions-list routes (018A), the GAP-066
  routing-strategy read (018B), and the GAP-067
  final-text-reviews read (018C — ruled contract-conformant by
  the 018C diff review, the GAP-064/066 precedent).

### Out of scope (with follow-up owner)

- Cost accounting / pricing for generations → future task (Q3).
- Persisted health-evaluation receipts → 010's design decision (Q2).
- GAP-028 worker AI wiring → its own follow-up task (Invariant 5).
- Quota observations on `AIGateway` → GAP-063 (Q5).
- The scene-context panel → GAP-059 (016 follow-up).

## Behavior and invariants

### Invariant 1 — Safe secrets: masked views, write-only credentials, audit identity only

Constitution §6 requires the gateway configuration to carry an
encrypted credential reference; the backend satisfies it with
`AIGateway.credentialCiphertext` (AES-256-GCM, `v1:<iv>:<tag>:<data>`
base64url — `packages/ai-core/crypto.ts:35`), decrypted per call in
`ai-registry.ts:37` and handed to the adapter in memory only. The
018B admin UI must not weaken this:

- The UI NEVER receives a credential value or ciphertext:
  `toGatewayView` (`apps/api/src/services/ai.ts:248-285`) returns
  `hasCredential: boolean` only (`ai.ts:49-50`). Any UI field that
  echoes a credential is a P1 finding.
- Credentials are write-only: `POST /api/gateways` and
  `PATCH /api/gateways/:gatewayId` accept `apiKey` in the request
  body; the server re-encrypts (`ai.ts:302`, `ai.ts:348-351`) and the
  response is the masked view. The UI shows "Set"/"Not set" and a
  "Rotate" action — never a prefilled value.
- Revocation is deletion: `DELETE /api/gateways/:gatewayId`
  removes the gateway; `AIModel.gatewayId` is `onDelete: Cascade`
  (`schema.prisma:430`) and `ModelProfileMapping.modelRef` is
  `onDelete: Cascade` (`schema.prisma:452`), so the catalog and
  mappings go with it; `GenerationAttempt.gatewayId` is
  `onDelete: SetNull` (`schema.prisma:503`) so attempt history
  keeps its rows with the gateway reference nulled.
- Audit records identity, never the credential:
  `gateway.created/updated/deleted` payloads carry name/baseUrl
  only (`ai.ts:317-325`).
- Additive backend items (the only ones 018 authorizes):
  (a) `GET /api/admin/audit-log` — SUPER_ADMIN only
  (`gateway:read`), filters the platform audit actions
  (`gateway.*`, `gateways.health-checked`, `model-profile.mapped`,
  `model.updated`, `models.synced`, `models.sync-failed`);
  (b) `GET /api/workspaces/:workspaceId/audit-log` — workspace
  membership + `workflow:manage`, `?action=` filtered to the
  pinned AI-infrastructure action allowlist
  (`workflow.*`, `agent.*`, `skill.*`, `generation.*`,
  `model-profile.mapped` is platform-scoped and excluded);
  (c) `GET /api/auth/session` gains an additive `platformRole:
  "SUPER_ADMIN" | null` field so the web app can gate the admin
  nav (the session is the user's own — no new disclosure);
  (d) `GET /api/workspaces/:workspaceId/workflow-runs` gains an
  additive `?status=` query param (a `RunStatus` enum value,
  optional) — the `workflow:read` gate is unchanged; the param
  follows the existing optional-`workflowId` pattern in
  `listRunsQuery`.
  (e) `GET /api/admin/routing-strategy` — SUPER_ADMIN only
  (`gateway:read`), returns the deployment routing strategy
  (`AI_ROUTING_STRATEGY` env, default `"PRIORITY"`) as
  `{ strategy }`, read-only. No frozen route serves this
  env-level value (GAP-066): `listGateways` returns a bare
  `GatewayView[]` and `checkHealth` returns per-gateway results,
  so the pinned routing-overview acceptance ("the deployment
  routing strategy as read-only, env-level, honestly labeled
  'deployment config'") cannot be met without it. Ruled
  contract-conformant by the 018B diff review (the GAP-064
  precedent: genuinely necessary for a pinned acceptance,
  identical gating, additive read-only, no schema change, no
  new capabilities, recorded before implementation).

### Invariant 2 — Definition versioning UI: immutable history, exact run pins

The backend versions definitions like Chapter/ChapterVersion
(`schema.prisma:522-525`): the definition row holds identity and a
`currentVersionId` pointer; every edit appends an immutable version
(`AgentVersion` `schema.prisma:628`, `SkillVersion` `:672`,
`WorkflowVersion` `:730`); statuses are
DRAFT/PUBLISHED/ARCHIVED (`schema.prisma:540-552`).

- 018A shows the version history as an append-only list: version
  number, created-at, created-by, and status transitions. No UI
  affordance edits a version in place — "edit" always appends via
  `POST .../:id/versions` (`definition-routes.ts:231,322,406`).
- Publishing is the existing `POST .../:id/publish` action
  (`definition-routes.ts:257,345,425`); the UI labels the lifecycle
  DRAFT → PUBLISHED → ARCHIVED and refuses to present ARCHIVED as
  runnable.
- The run detail pins the exact executed versions
  (`WorkflowRun.workflowVersionId` + `workflowVersionNumber`,
  `schema.prisma:758-759`; step rows pin agent/skill version
  numbers, `:822-845`) — "replayable after the definitions move
  on" is visible in the UI, not just the schema.
- Deleting a definition refuses with 409 when runs reference it
  (`schema.prisma:761-763`, `onDelete: Restrict`) — the UI
  surfaces the refusal actionably, never as a 500.

### Invariant 3 — Authorization: the existing axes, no new capabilities

018 adds no capability (`packages/auth/authorization.ts` is
forbidden-path). The surfaces ride the existing two axes:

- Workspace axis: `agent:read`/`skill:read`/`workflow:read` (view
  definitions and runs); `agent:manage`/`skill:manage`/
  `workflow:manage` (edit/publish definitions — OWNER/ADMIN);
  `workflow:run` (launch); `workflow:approve` (decide parked
  steps — OWNER/ADMIN/AUTHOR, `authorization.ts:136,162`;
  deliberately not EDITOR/VIEWER); `generation:read` (ledger).
- Platform axis: `gateway:read`/`gateway:manage`,
  `model:read`/`model:manage`, `platform:define` are in
  `PLATFORM_ONLY_CAPABILITIES` (`authorization.ts:57-63`) and
  exercisable only by `platformRole === "SUPER_ADMIN"`
  (`authorization.ts:152-154`). A workspace OWNER is explicitly
  NOT a gateway admin (`authorization.ts:57-63` comment) — the
  018B page must 403 for OWNER, and the web nav must hide it
  without a SUPER_ADMIN session (Invariant 1(c)).
- Server-side enforcement is the backend's; the UI gates are
  progressive enhancement (hidden nav, disabled buttons) — the
  contract forbids relying on UI hiding as the authorization.

### Invariant 4 — Receipts honesty: what is stored vs computed vs absent

- `Generation` (`schema.prisma:466-494`) is the usage receipt:
  task, profile, status, `inputTokens`/`outputTokens`,
  `latencyMs`, `errorCategory`/`errorMessage`, `promptVersion`,
  `contextSnapshot`. `GenerationAttempt` (`schema.prisma:496-516`)
  is the per-attempt receipt (gateway, model, status, latency).
  018C shows these verbatim from the frozen ledger routes
  (`ai-routes.ts:335,350`).
- There is NO cost/price field anywhere — 018C must not invent a
  cost column or estimate. The ledger header carries the honest
  label "tokens and latency only — no cost accounting" (Q3).
- `FinalTextReview` (`schema.prisma:2741-2772`) is the durable
  evaluation receipt per `chapterVersionId` (verdict, violations,
  revision pin). `evaluateHealth` (`story-health.ts:100`)
  performs no `db.*.create`/`upsert` — it is computed on demand;
  018C labels it "live computation, not a stored receipt" and
  never presents a health snapshot as durable.
- Failures: `Generation.errorCategory`/`errorMessage` are
  sanitized ("never credentials or raw provider bodies",
  `schema.prisma:482-483`); the no-route state (409 "no model is
  configured for profile X", `ai.ts:680-690`) is a first-class
  failure category in the log, not a silent gap.

### Invariant 5 — GAP-028 boundary: surface the state, do not fix it

GAP-028 (OPEN/P1): on the production worker, AGENT/SKILL steps
fail with "AI generation is not configured on this worker"
(`executor.ts:721`), RETRIEVAL with "retrieval is not configured
on this deployment" (`executor.ts:562`) — the factories live in
`apps/api/src`, which `apps/worker` must not import
(`workflow-jobs.ts:1-16`). Deterministic kinds work.

- 018A/018C show these failures in the run graph and failure log
  with their clear messages — the honest surface of the gap.
- 018 does NOT move factories to shared packages, does NOT add
  worker AI wiring, and does NOT claim the worker executes AI
  steps. The GAP-028 closure check ("Worker executes an AGENT
  step end-to-end in a staging deployment") belongs to its own
  follow-up task.

### Invariant 6 — i18n and accessibility

All new strings via `useLocale()` with `en` + `id` keys and English
fallback. Tables (ledger, audit, version history) have accessible
headers; the run graph has a text equivalent (the step list) for
screen readers; dialogs (gateway form, approve/reject confirm)
are Esc-dismissable with focus return; destructive actions
(revoke gateway, delete definition) are confirmed. New components
get vitest-axe checks (the 014/015/016 `apps/web/a11y` precedent);
the manual screen-reader pass follows GAP-051's owner.

### Invariant 7 — Design: §15, no reinvention

`docs/design/writer-workspace` + `DESIGN-TOKENS.md` are the
foundational design (constitution §15). The studio and admin
surfaces inherit the same design language, colors, typography,
spacing, components, and interaction patterns — the admin page is
not a separate visual language. `nf-` tokens throughout; orange
restricted to AI affordances per DESIGN-TOKENS.md. Any intentional
departure is a documented author decision recorded with its scope
before implementation.

## Acceptance and verification

### 018A

- [ ] Studio lists agents/skills/workflows with current version +
      status; version history is append-only and visible.
- [ ] Run list + run detail: steps render with status/outcome/
      error; the pinned executed version numbers are shown.
- [ ] Approvals inbox: AWAITING_APPROVAL runs listed via the
      additive `?status=AWAITING_APPROVAL` filter (Invariant 1(d));
      approve/reject calls the frozen 005 routes with the snapshot
      hash; the 005 409 codes surface actionably.
- [ ] Capability matrix tested: VIEWER sees nothing; AUTHOR can
      view runs and decide approvals but cannot edit definitions;
      ADMIN/OWNER can.
- [ ] 007 writer-page components untouched (regression suite).

### 018B

- [ ] Gateway CRUD masked: list shows `hasCredential` only; create/
      rotate write-only; revoke cascades; audit rows carry
      identity only.
- [ ] A workspace OWNER (non-SUPER_ADMIN) gets 403 on every
      gateway/model/profile route and never sees the admin nav.
- [ ] Model catalog + profile mappings editable; sync-models
      refreshes; routing strategy shown read-only as deployment
      config.
- [ ] GAP-063 stays open; no quota columns invented.

### 018C

- [ ] Ledger lists generations with tokens/latency/attempts/
      errors; "no cost accounting" label present; no cost
      column anywhere.
- [ ] Failure log surfaces FAILED generations and the no-model
      409 state as a documented category.
- [ ] Evaluation receipts: FinalTextReview rows per version;
      health shown as live computation with the not-stored label.
- [ ] Audit trail (workspace + platform) lists actions with
      actor, time, payload; action filters work.

### 018 as a whole

- [ ] All three children diff-reviewed APPROVE/APPROVE_WITH_
      FINDINGS (findings resolved).
- [ ] Full suites green: web, API, `pnpm e2e` (011) BASELINE-OK;
      lint + tsc + vue-tsc clean.
- [ ] i18n: en + id keys for every new string; missing-key
      fallback.
- [ ] No-regression: 004/005/007/010/011/015/016/017 surfaces
      behave as before.

Record actual results separately from expectations. Zero selected tests
or skipped integration checks do not pass a capability gate.

## Migration and rollback

None — no schema changes (GAP-063 and quota stay open by decision;
the additive audit-read routes, the session field, and the run-list
status filter read existing rows). Rollback is removing the new
pages/components/routes (admin and studio behavior is additive; the
backend routes they read are frozen). The session `platformRole` field is additive to
the response shape — clients that ignore it are unaffected.

## Documentation and handoff

Update `docs/implementation/progress.md`, `docs/14-progress/CURRENT.md`,
`docs/implementation/test-matrix.md` with verified scope per child;
record deviations in `docs/implementation/ISSUES-AND-GAPS.md` BEFORE any
workaround (standing rule). GAP-028, GAP-039, GAP-040, GAP-063 stay
open with their pinned owners; the contract must not claim them.

List unknowns, blocked checks, observed versus inferred findings,
risks, and the next dependency-ready task. Do not claim full platform
completion.

## Open questions

Genuinely open tradeoffs. The recommendations are the author's, for the
reviewer to confirm or flip before implementation.

- **Q1 — Studio page placement? (Recommendation: `/workspaces/
  :workspaceId/ai-studio` for 018A+018C tabs, `/admin/*` for
  018B.)** Workspace-scoped surfaces belong under the workspace;
  platform administration belongs at a top-level admin section
  (the platform axis is not workspace-scoped). Reviewer may
  prefer a different IA.
- **Q2 — Persist `evaluateHealth` results? (Recommendation: no.)**
  Health is computed on demand by 010's design; persisting it
  would redefine 010's semantics and create a stale-receipt
  problem. 018C surfaces it honestly as live.
- **Q3 — Cost accounting? (Recommendation: no in 018.)** No cost
  field exists; pricing needs provider rate data that is not in
  the schema. A pricing follow-up can add it with an ADR.
- **Q4 — Does 018 own any part of GAP-028? (Recommendation: no.)**
  The fix needs shared-package factories (a different task's
  architecture work); 018 surfaces the configuration state
  honestly.
- **Q5 — Quota observations (§6) in 018B? (Recommendation: no
  schema change; GAP-063 stays open.)** Adding quota fields
  without a provider quota source would be unverifiable UI.
  The reviewer may instead authorize the schema addition — that
  is a contract amendment, not a silent change.
- **Q6 — Audit-read route capability for the workspace trail?
  (Recommendation: `workflow:manage`.)** The trail spans workflow/
  agent/skill/generation events; `workflow:manage` (OWNER/ADMIN)
  is the administrative read. Reviewer may prefer a narrower
  gate.

## Review record

(Reviewer: separate actor from the contract author and the future
implementers; backend MODEL_UNVERIFIED per GAP-013.)

### Round 1 — contract review (2026-10-06). Verdict: APPROVE_WITH_FINDINGS (2 findings, fixed inline)

**F1 (P2) — the approvals inbox had no backend status filter.**
The contract pinned "UI-only: every action rides an existing frozen
route" for 018A and an acceptance checkbox "Approvals inbox lists
AWAITING_APPROVAL runs" — but the run list route
(`GET /api/workspaces/:workspaceId/workflow-runs`) only filters by
`workflowId`/limit (`listRunsQuery`,
`apps/api/src/definition-routes.ts:117-120`; service
`services/workflow-runs.ts:641`), so the inbox could not list
AWAITING_APPROVAL runs reliably (client-side filtering over a
paginated, recency-ordered list drops old parked runs). Fixed: 018A
now owns one additive backend item — `?status=` query param on the
run list route (optional `RunStatus` enum value, `workflow:read`
gate unchanged, following the existing optional-`workflowId`
pattern). 018A's scope wording, the additive-items list (now four
items), the Outputs, the Allowed paths (`definition-routes.ts`,
`services/workflow-runs.ts`), the inbox acceptance checkbox, and
"Migration and rollback" were updated accordingly. No schema
change.

**F2 (P3) — line-reference drift in the backend-verification note.**
Corrected: `PLATFORM_ONLY_CAPABILITIES`
`authorization.ts:57-63` → `:88-94`; `workflow:approve` grants
`:136,162` → `:134,166`; `canPlatform` `:152-154` → `:248`;
`toGatewayView` `ai.ts:250-286` → `:248-285`; the platform-gates
line list replaced with the verified pattern
(`requirePlatformCapability` imported at `ai.ts:28`; verified call
sites `ai.ts:290,329`).

**Q1–Q6 decisions of record:** Q1 CONFIRMED —
`/workspaces/:workspaceId/ai-studio` (018A+018C tabs) and
`/admin/*` (018B), matching the workspace vs platform authorization
axes. Q2 CONFIRMED — no persisted `evaluateHealth`; persisting it
would redefine 010's frozen semantics and create a stale-receipt
problem. Q3 CONFIRMED — no cost accounting in 018; no cost field
exists and inventing pricing without rate data would violate the
evidence policy (follow-up with an ADR). Q4 CONFIRMED — 018 owns
none of GAP-028; the worker wiring fix is architecture work for a
different task (018 surfaces the "not configured" state honestly
per Invariant 5). **Q5 CONFIRMED (keep-open)** — no schema change:
`AIGateway` has no quota fields, no quota writer, and no quota
consumer anywhere in the backend (verified against
`schema.prisma`; §6's "quota observations" has no data producer —
OmniRoute is external), so adding bare columns would be dead
schema (the GAP-052/056 anti-pattern); the delivery-plan
acceptance does not include quotas; GAP-063 stays open with its
follow-up owner. Q6 CONFIRMED — `workflow:manage` for the
workspace audit trail (administrative read over
workflow/agent/skill/generation events; OWNER/ADMIN axis).

**Independent verification (reviewer's own, 2026-10-06, repo @
`bcede18`):** definition routes verified exact
(`definition-routes.ts:179,208,219,231,257`; `:272,299,310,322,345`;
`:360,383,394,406,425,440`; run `:461`, cancel `:485`, approve
`:521` (takes `expectedSnapshotHash`), reject `:542`, run list
`:563`, run get `:578`); ai-routes gateway/model/profile routes
exact (`:136,149,155,164,180,193`; `:207,213,219,232`; ledger
`:335,350`); session returns `{userId, expiresAt}` only
(`auth-routes.ts:109-115` — the `platformRole` additive item is
genuinely necessary); no audit-read route exists (the two audit
routes are genuinely necessary and minimal); `toGatewayView`
returns `hasCredential` only (no value/ciphertext);
`encryptCredential`/`decryptCredential` AES-256-GCM
(`crypto.ts:30-44`); per-call decrypt (`ai-registry.ts:37`);
revocation cascades exact (`AIModel.gatewayId`/`ModelProfileMapping.
modelRef` `onDelete: Cascade`; `GenerationAttempt.gatewayId`
`onDelete: SetNull`); platform audit actions
(`gateway.created/updated/deleted`, `gateways.health-checked`,
`models.sync-failed/synced`, `model.updated`,
`model-profile.mapped`) and workspace actions
(`workflow.*`, `agent.*`, `skill.*`, `generation.*`) all exist —
the pinned audit filter allowlists are accurate; 005 approve route
takes the snapshot hash (`expectedSnapshotHash`); 007
writer-page components (`ApprovalDialog.vue`,
`RunStatusPanel.vue`, `GenerationPanel.vue`,
`useWorkflowRuns.ts`) exist and are correctly pinned as untouched;
GAP-063 verified real (no quota fields on `AIGateway` or
`AIModel`); GAP-028/039/040 ownership pins accurate.
**Trusted from the author's verification:** schema line numbers
for version models/statuses/run-step pins, `sync-models` response
shape, per-step outcome envelope shapes.

## Backend verification (contract author)

Every normative backend claim in this contract was verified against
source on 2026-10-06 (repo @ `bcede18`). File:line references (a
subset spot-checked directly by the author; the rest by a separate
read-only recon subagent, cross-checked):

- Definition versioning: `Agent` `schema.prisma:576`,
  `AgentVersion` `:628` ("Immutable agent revision. Never updated
  in place", `:627`); `Skill` `:645`, `SkillVersion` `:672`;
  `Workflow` `:693`, `WorkflowVersion` `:730`; versioning comment
  `:522-525`; statuses `:540-552`; run version pins
  `:758-759` (`workflowVersionId` + `workflowVersionNumber`);
  step version pins `:822-845`; delete→409 Restrict `:761-763`.
- Definition routes: `apps/api/src/definition-routes.ts` —
  agents CRUD/versions/publish `:179,208,219,231,257`; skills
  `:272,299,310,322,345`; workflows `:360,383,394,406,425,440`;
  run `:461`, cancel `:485`, approve `:521`, reject `:542`;
  run list `:563`, run get `:578`.
- Secrets: `AIGateway.credentialCiphertext`
  `schema.prisma:400-401` ("AES-256-GCM ciphertext
  (iv:tag:data). Never selected into API responses.");
  `encryptCredential`/`decryptCredential`
  `packages/ai-core/crypto.ts:35` (docblock `:1-15`);
  key wiring `apps/api/src/app.ts:253-254`
  (`APP_ENCRYPTION_KEY`); per-call decrypt
  `apps/api/src/ai-registry.ts:37`; masked view
  `toGatewayView` `apps/api/src/services/ai.ts:248-285`,
  `hasCredential` `:49-50`; gateway routes
  `apps/api/src/ai-routes.ts:136,149,155,164,180,193`;
  model/profile routes `:207,213,219,232`;
  platform gates via `requirePlatformCapability`
  (`ai.ts:28` import; verified call sites `ai.ts:290,329`).
- Revocation cascades: `AIModel.gatewayId onDelete: Cascade`
  `schema.prisma:430`; `ModelProfileMapping.modelRef onDelete:
  Cascade` `:452`; `GenerationAttempt.gatewayId onDelete:
  SetNull` `:503`.
- Profiles: `ModelProfile` enum `schema.prisma:355-364`;
  `ModelProfileMapping` `:447-462`;
  `AIModel` `:425-445`; gateway priority/weight
  `:403-405`, timeout/maxRetries `:406-407`, health
  `:348-353,414`; routing strategy env
  `apps/api/src/services/ai.ts:211-216`.
- Receipts: `Generation` `schema.prisma:466-494`;
  `GenerationAttempt` `:496-516`; generation row written
  before transport `ai.ts:600-613`; ledger routes
  `ai-routes.ts:335,350`; `FinalTextReview` `:2741-2772`;
  `evaluateHealth` no create/upsert (`story-health.ts:100`,
  grep-verified); generations routes `:250,269`.
- Audit: `AuditLog` `schema.prisma:234-249`;
  `createAuditService` `apps/api/src/services/audit.ts:21-23`;
  gateway audit `ai.ts:317-325`; no audit-read route exists
  (grep-verified — the 018 additive item).
- Capabilities: `packages/auth/authorization.ts:13-49`
  (verbatim list); platform-only set `:88-94`;
  `workflow:approve` grants `:134,166`;
  `canPlatform` `:248`.
- Session: `/api/auth/session` returns `{userId,
  expiresAt}` only (`auth-routes.ts:109-115`) — no
  platformRole (the 018 additive item).
- UI absence: no gateway/studio/admin/run-graph UI in
  `apps/web/app` (grep-verified); workflow UI confined to
  007 writer-page components
  (`GenerationPanel.vue`, `RunStatusPanel.vue`,
  `ApprovalDialog.vue`, `useWorkflowRuns.ts`).
- GAP-028: `apps/worker/src/workflow-jobs.ts:1-16`;
  `executor.ts:62,562,566,721`.
- GAP-063 recorded in `ISSUES-AND-GAPS.md` BEFORE this
  contract (2026-10-06).

UNVERIFIED: exact `Generation` view shape returned by
`listGenerations` (implementer pins from the route); the
`sync-models` response shape (implementer pins); per-step
outcome envelope shapes in run-get (implementer pins from
`WorkflowStepRun` rows); `platformRole` availability on the
user row for the session field (implementer verifies the
Prisma user model has the field — the platform axis exists
in authorization.ts so the row must carry it).

### Round 2 — NF-WF-018A diff review (2026-10-06). Verdict: APPROVE_WITH_FINDINGS (1 finding, fixed inline)

(Reviewer: separate actor from the contract author, the contract
reviewer, and the 018A implementer; backend MODEL_UNVERIFIED per
GAP-013. Nothing committed — working tree only.)

**F1 (P3) — GAP-064 ruling (APPROVE_WITH_FINDINGS, not CHANGES_REQUESTED).**
The implementer added three additive routes
(`GET /api/agents/:agentId/versions`,
`GET /api/skills/:skillId/versions`,
`GET /api/workflows/:workflowId/versions`) beyond the contract's
four-item additive list, returning a bare array instead of a
`{agentId, versions}` envelope. Ruled contract-conformant:
(a) the routes are genuinely necessary for the pinned "append-only
version history" acceptance (Invariant 2) — no frozen route serves
version history (the detail routes return the current version only);
(b) the gating rules are identical to the frozen detail routes
(missing/PLATFORM-DRAFT → 404, cross-tenant → gateRead refusal,
same `agent:read`/`skill:read`/`workflow:read` caps);
(c) the bare-array shape matches the existing list-route
convention and is consumed verbatim by `useAiStudio.listVersions`;
(d) no schema change, no new capabilities, additive read-only
routes; (e) the deviation was recorded in GAP-064 BEFORE any
workaround (standing rule). Fixed inline: the contract's
child-scope, Allowed-paths, and Outputs sections now record seven
additive backend items (the three GAP-064 routes added).

**GAP-064 CLOSES** on this review (verified: version-list tests —
ascending order, 404 for unknown ids and PLATFORM-scoped DRAFTs,
cross-tenant refusal).

**Independent verification (reviewer's own, 2026-10-06, this
host):** `src/ai-studio.test.ts` 6/6 green (re-ran myself —
?status= filter genuine: 3 seeded runs, only the AWAITING_APPROVAL
one returned; invalid status → 400 INVALID_INPUT; VIEWER 403 /
AUTHOR 200 / outsider 404; version-list ascending + gating tests
genuine); web `useAiStudio.test.ts` + `components/ai-studio/`
20/20 green; `app/a11y/ai-studio.axe.test.ts` 10/10 green (0
violations); API `tsc --noEmit` exit 0; web `vue-tsc --noEmit`
exit 0; zero `@ts-ignore`/`@ts-expect-error` in new web files;
i18n `aiStudio` subtree en/id leaf parity 76/76 (checked
programmatically); `WorkflowRunStatus` enum includes
AWAITING_APPROVAL (schema.prisma:561-570). The implementer's
recorded full-suite claims (API 699/699, web 290/290, e2e 20/20
BASELINE-OK, lint clean) are consistent with my targeted re-runs
but are NOT re-claimed here.

**Item-by-item:** F1 `?status=` filter — verified (optional
`RunStatus` enum, `workflow:read` gate unchanged, follows the
existing `workflowId` pattern; inbox lists via the server filter,
not client-side). Capability matrix — server enforces
(`packages/auth/authorization.ts` untouched; role gates verified
in tests); the web capability helpers mirror ROLE_CAPABILITIES
exactly (VIEWER→nothing; EDITOR→read+run, no approve; AUTHOR→
read+run+approve, no manage; OWNER/ADMIN→manage). 007 boundary —
`components/generation/*`, `useWorkflowRuns.ts`, `ApprovalDialog`,
`RunStatusPanel`, `GenerationPanel` untouched; the writer-page
change is the single additive nav link only (role-gated,
progressive enhancement). Approval flow — inbox calls the frozen
005 approve/reject routes with the verbatim park-time
`snapshotHash` (`expectedSnapshotHash`); 005's 409 codes mapped to
actionable messages (`STALE_APPROVAL`/`NO_APPROVAL_SNAPSHOT`/
`ALREADY_DECIDED`/`RUN_CANCELLED` + FORBIDDEN); reject requires a
reason. Run graph — per-step status/outcome/error/latency +
pinned executed version numbers shown. No 018B/018C scope creep —
no platform-admin routes, no audit-read routes, no receipts UI
(the receipts-tab extension point is the authorized 018C marker).
No forbidden-path violations — no schema changes/migrations, no
new capabilities.

**Observations (not findings):** (a) an untracked
`docs/adr/DRAFT-GAP-062-pdf-unicode-font.md` ships in this tree —
clearly marked DRAFT, decision pending (owner: Klein), no
behavioral impact; acceptable as decision groundwork, not scope
creep; (b) `docs/adr/` contains other committed ADRs, so the
location is consistent.

### Round 3 — NF-WF-018B diff review (2026-10-06). Verdict: APPROVE_WITH_FINDINGS (2 findings, fixed inline)

(Reviewer: separate actor from the contract author, the contract
reviewer, the 018A/018B implementers, and all prior reviewers;
backend MODEL_UNVERIFIED per GAP-013. Nothing committed — working
tree only.)

**F1 (P2) — the new test file did not typecheck (6 errors); the
implementer's "tsc clean" claim was false.** `apps/api`'s
`tsconfig.json` includes `**/*.ts`, so `src/platform-admin.test.ts`
is typechecked; the rest of the package is clean but the new file
had 5 `TS2532` indexed-access violations (`rows[0]`/`results[0]`
under `noUncheckedIndexedAccess`) plus a `TS2322`/`TS2339` pair
from `payload?: unknown` breaking `app.inject`'s overload. Fixed
inline (test-only, no behavior change): `rows[0]!`/
`results[0]!` after the length assertions, `payload?:
Record<string, unknown>`. Re-verified: API `tsc --noEmit` exit 0,
`platform-admin.test.ts` 9/9 green post-fix, web `vue-tsc
--noEmit` exit 0.

**F2 (P3) — GAP-066 ruling (APPROVE_WITH_FINDINGS, not
CHANGES_REQUESTED).** The implementer added
`GET /api/admin/routing-strategy` beyond the contract's additive
list (the third 018B additive item, the GAP-064 pattern). Ruled
contract-conformant: (a) genuinely necessary for the pinned
"routing overview" acceptance — no frozen route serves the
env-level strategy (`listGateways` returns a bare `GatewayView[]`,
`checkHealth` returns per-gateway results only; changing either
shape would break a frozen route); (b) the gate is the identical
platform pattern (`gateway:read` → SUPER_ADMIN,
`requirePlatformCapability`, 403 for workspace OWNER — tested);
(c) minimal additive read-only route returning `{ strategy }`
(env `AI_ROUTING_STRATEGY`, default `"PRIORITY"`, never
editable); (d) no schema change, no new capabilities; (e) recorded
in GAP-066 BEFORE implementation (standing rule). Fixed inline:
the contract's 018B child scope, Invariant 1 additive-items list
(now (a)–(e)), and Outputs section now record eight additive
backend items (the GAP-066 route added).

**GAP-066 CLOSES** on this review (verified: env-level strategy
served read-only; the UI labels it "Deployment config — set via
environment, read-only here.").

**Independent verification (reviewer's own, 2026-10-06, this
host):** `src/platform-admin.test.ts` **9/9** green (re-ran
myself — masked list (no value/ciphertext in body), rotate
write-only (new key decrypts, old does not), delete cascade
(models + mappings removed, attempt rows survive via SetNull),
audit payloads identity-only, workspace OWNER 403 on every
platform route incl. both new routes, session `platformRole`
SUPER_ADMIN/null, audit-log allowlist + `?action=` filter +
400 on non-allowlisted action, routing-strategy SUPER_ADMIN-only,
health-check trigger audited); web
`app/composables/usePlatformAdmin.test.ts` 4/4 +
`app/a11y/platform-admin.axe.test.ts` 10/10 (0 violations) +
`app/components/platform-admin/` 8/8 green; API `tsc --noEmit`
exit 0 (post-F1 fix); web `vue-tsc --noEmit` exit 0; zero
`@ts-ignore`/`@ts-expect-error` in new files; i18n
`platformAdmin` subtree en/id leaf parity 91/91. The
implementer's recorded full-suite claims (API 708/708, web
312/312, e2e 20/20 BASELINE-OK, lint clean) are consistent with
my targeted re-runs but are NOT re-claimed here.

**Item-by-item:** (1) Safe secrets — `toGatewayView` is the only
view returned (`hasCredential` only; verified in code and test);
create/rotate are write-only (`apiKey` field wiped on mount and
after submit, never prefilled); `crypto.ts`/`ai-registry.ts`
untouched (zero diff in `packages/ai-core`); audit rows carry
identity only (`{name, baseUrl}`, verified frozen write side +
read test); no credential value/ciphertext found anywhere in the
web diff, tests, or docs (grep sweep). (2) GAP-066 — ruled above;
contract updated. (3) Delete=revoke cascade — schema pins exact
(`AIModel.gatewayId`/`ModelProfileMapping.modelRef` Cascade,
`GenerationAttempt.gatewayId` SetNull); the test genuinely
asserts all three outcomes. (4) Session `platformRole` — the
contract-UNVERIFIED item is now VERIFIED: Prisma `User`
carries `platformRole PlatformRole?` (`schema.prisma:44`),
`PlatformRole = { SUPER_ADMIN }` (`:33-35`), the session is the
user's own (no new disclosure). (5) Audit log routes — Zod enum
allowlist → 400 `INVALID_INPUT` on anything else; rows include
actor email, not credential material; workspace-scoped actions
never appear (018C's trail). (6) Authorization — server enforces
on every route (the 403 test iterates all 12 platform routes
for a workspace OWNER); the web admin nav link hides without
SUPER_ADMIN (progressive enhancement only), and the admin page
itself notes server enforcement. (7) No 018B/018C scope creep —
no schema changes, no new capabilities
(`packages/auth/authorization.ts` untouched), GAP-063 stays open
(the routing overview shows the quota absence honestly, no
invented columns), the workspace audit-read route stays 018C's.
(8) Evidence — see the verification paragraph above.

**Observations (not findings):** (a) the
`GatewayView {  id: string;` same-line formatting artifact from
the implementer's interface edit was normalized to the file's
convention (cosmetic, tsc-clean either way); (b) the 018B
implementer left an honest procedural note in ISSUES-AND-GAPS.md
about concurrent vitest/e2e scratch-DB teardown failures —
environmental, correctly attributed, with the sequential-run
lesson recorded; (c) no dedicated route-level 413-style test is
needed for the routing-strategy read (read-only GET, no
payload).

### Round 4 — NF-WF-018C diff review (2026-10-06). Verdict: APPROVE_WITH_FINDINGS (1 finding, fixed inline)

I am a separate actor from the contract author, contract reviewer, the 018A/018B/018C implementers, and all prior reviewers; backends I verify are MODEL_UNVERIFIED per GAP-013.

**F1 (P3) — GAP-067 ruling (APPROVE_WITH_FINDINGS, not CHANGES_REQUESTED).** The implementer added `GET /api/workspaces/:workspaceId/novels/:novelId/final-text-reviews` beyond the contract's additive list — the same necessity logic as the GAP-064/066 precedent: (1) genuinely necessary for the pinned "FinalTextReview rows per chapter version (verdict, violations, revision pin)" acceptance — the frozen POST route is write-only, `latestReceipt` (`final-text-review.ts:239-246`) is server-internal to the 012 publish gate, and the audit action `review.final-text-evaluated` carries only `{chapterVersionId, verdict}` in its payload and is outside the contract's pinned audit allowlist, so the audit trail cannot substitute; (2) additive read-only, minimal shape (`{id, chapterId, chapterNumber, chapterTitle, chapterVersionId, verdict, hardViolations, advisory, evaluatedPolicies, revisionId, createdAt}`), identical membership + `canon:read` gate as the frozen POST route, no schema change, no new capabilities; (3) the deviation was recorded in GAP-067 BEFORE implementation (standing rule). Fixed inline: the contract's additive-items list updated to nine items (Invariant 1 (f): the GAP-067 route added). **GAP-067 CLOSES** on this review.

**Independent verification (reviewer's own, 2026-10-06, repo @ `ba6febd`):** (1) Receipts honesty — ledger reads the frozen `Generation`/`GenerationAttempt` routes (`ai-routes.ts:335,350`, untouched); no cost column or estimate anywhere (only the honest label `receipts.ledger.noCostLabel` en+id); ledger headers are created/task/profile/status/in/out tokens/latency/error category; per-attempt detail rows carry gateway, model, status, latency; `evaluateHealth` is a GET-only story-health route (`story-health-routes.ts:75`) called on demand by `useReceipts.getStoryHealth`, labeled `receipts.evaluations.healthLiveLabel` en+id. (2) Audit-log route — `WORKSPACE_AUDIT_ACTIONS` is the 10-action pinned allowlist (`workflow.*`, `agent.*`, `skill.*`, `generation.*`; `model-profile.mapped` excluded); `?action=` Zod enum → 400 INVALID_INPUT on anything else; membership + `workflow:manage` gate; rows are identity-only (`actorUserId`, `actorEmail`, never credentials). (3) Capability gating — server: ledger `generation:read`, evaluations `canon:read`, audit `workflow:manage`; tests assert 403 (AUTHOR on audit, VIEWER on receipts/evaluations) and 404 (non-member, cross-workspace); UI gating matches `ROLE_CAPABILITIES` (progressive enhancement only). (4) Failure log — FAILED filter works via `locked-status`; the no-model 409 state is a documented first-class category (`receipts.failures.noModelTitle/noModelBody`); error categories come from the pre-existing 8-value `ErrorCategory` enum (sanitized classification, never credentials). (5) No 018A/018B scope creep — the diff touches only 018C routes/services/components/the tab shell; `packages/auth/authorization.ts` and the Prisma schema are untouched; GAP-063 stays open. (6) Evidence — my own runs: `src/receipts.test.ts` **7/7**, web `useReceipts.test.ts` + `AuditTrail.test.ts` + `EvaluationReceipts.test.ts` + `GenerationLedger.test.ts` + `receipts.axe.test.ts` **23/23** (axe 0 violations en+id); API `tsc --noEmit` exit 0; web `vue-tsc --noEmit` exit 0; zero `@ts-ignore`/`@ts-expect-error` in new files. Consistent with the implementer's recorded claims (API 715/715, web 335/335, e2e 20/20 BASELINE-OK, lint clean), which I do NOT re-claim. (7) The 018A tab shell's marked 018C extension point (`// NF-WF-018C: the "receipts" tab is added here by 018C`) was used as authorized — no 018A regression.

**Observations (not findings):** (a) `FailureLog` has no dedicated test file — it is a thin wrapper (locked-status FAILED + the no-model note) over `GenerationLedger`, which is tested; acceptable. (b) The FAILED filter is client-side over the fetched page — consistent with the pinned additive scope (no new ledger route param); acceptable.
