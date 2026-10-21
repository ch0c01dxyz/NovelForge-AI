# Routing and Workspace Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development after execution selection; follow the parent plan.

**Goal:** Make author-selected models execute, and make workspace definitions
creatable manually or through selected-model AI drafting.
**Architecture:** Preserve capability profiles, add concrete model preferences
as versioned data, and resolve only eligible admin-enabled mappings. Reuse
existing definition authorization/version/graph validation and worker executor.
**Tech Stack:** TypeScript, existing AI Manager, Fastify, Prisma and Vue.
**Spec:** ../specs/2026-10-20-workspace-chapter-lifecycle-design.md

## Global constraints

Parent constraints apply. Ordinary workspace creators are OWNER members and
can manage their definitions already; do not silently broaden collaborator
AUTHOR capabilities or grant global privileges. No model names hardcoded in
application code. No commit/push; separate review after each task.

## Review focus

Same provider model name on different gateways, admin disables between retries,
preference precedence, cross-workspace generated references and historic run
pins must all be explicitly tested below.

### Task 1: Safe model catalog and admin mapping controls

Files: `apps/api/src/ai-routes.ts`, `packages/ai-services/src/{ai.ts,ai-registry.ts}`,
`apps/web/app/composables/usePlatformAdmin.ts`,
`apps/web/app/components/platform-admin/ProfileMappings.vue`, admin page,
locales and their focused tests; new mapping component tests if none exist.

Interface: workspace-authorized GET `/api/workspaces/:workspaceId/model-options?profile=...`
returns `{ modelRef, providerModelId, displayName, gatewayId, profile }[]` only
for enabled, compatible mapped models/gateways. No credentials/provider config.
Admin mapping responses add internal `modelRef` without changing provider
`modelId` meaning. DELETE `/api/model-profiles/:profile/:modelRef` removes one
mapping; existing PUT handles enable/disable and priority with atomic audit.

- [x] Regress duplicate provider names across gateways, invalid profile/UUID,
  nonmember catalog and nonadmin mutation; disabling/removing one mapping cannot
  affect other mappings/usage history. Last removal reports no eligible model.
- [x] Implement safe catalog and row actions with readable names, confirmation,
  busy/error/empty states, preserving global model-disable semantics.
- [x] Test native API and UI, types; read back mapping mutation in scratch only.

Task1 evidence: native42PASS (subsequently44PASS with preference additions),
component4PASS, separate exact B1 review APPROVE. See execution ledger for scope
hashes. Request-specific compatibility belongs to Task2; the catalog currently
lists enabled mappings only.

### Task 2: End-to-end per-definition and per-request preference

Files: `packages/ai-core/{manager.ts,router.ts,types.ts}` and focused tests,
`packages/ai-services/src/{ai.ts,ai-registry.ts,worker-ai-path.ts}`,
`apps/api/src/{orchestrator-routes.ts,services/orchestrator.ts,definition-routes.ts,services/definitions.ts,services/definition-resolution.ts}`,
`packages/workflow-executor/{executor.ts,ports.ts}`, graph validation/tests,
Prisma schema and reviewed additive migration, generation/review UI and locales.

Contract: optional nullable `preferredModelRef` on immutable AgentVersion and
SkillVersion; `defaultModelRef` on immutable WorkflowVersion. Novel generation/
analysis defaults use existing versioned settings with audit/revision coverage;
otherwise include a reviewed additive store. Do not mutate historical versions.
Run start pins all relevant preferences and definition versions server-side.

Precedence: explicit permitted per-request/per-step preference > agent/skill
version preference > workflow version default > relevant novel operation default
> Automatic profile routing. Each level applies only if configured; invalid
explicit selection is a refusal, not silent inheritance. Workflow default is
for AI-backed steps, not a model that runs the orchestrator or deterministic code.

Manager consumes optional preferred model identity, validates against live
eligible profile candidates, attempts it first and uses disclosed existing
bounded transient/limit fallback. Record requested and actual attempted/used
models; never fabricate usage. Recheck admin-disabled eligibility between
fallback attempts. Exact persisted identity resolves gateway ambiguity.

Foundation progress (not Task2 completion): ADR-0018, shared manager preference,
live eligibility recheck and explicit buffered/streamed direct/orchestrated API
propagation implemented. Manager98/API44/orchestrator17PASS, exact independent
review APPROVE. Two actual configured gateway/model selections succeeded in
scratch with persisted attribution. Definition/version/default/worker/analysis
and UI portions below remain unfinished; do not mark the whole task complete.

Further verified progress: immutable definition preferences and exact enqueue
version pins are implemented, including granted Skill dependencies, FK retention,
RepeatableRead capture, protected idempotency, legacy marker and approval/orphan
recovery. Actual isolated BullMQ/gateway proof retained original v1 model choices
after v2 edits and resumed without repeating completed work. Matching workflow
consumer activated before new API locally, preserving story/run history. Full
Task2 still needs novel defaults, optional analysis/request workflow preference
propagation and author selectors; see execution ledger for exact scope/results.

Further progress: S3 extract/advice per-request preference and author selector are
implemented. Shared ActionMenu handles model/Automatic choices, catalog states,
retained stale selection and fallback disclosure. API70/web41PASS and native
en/id scratch browser proof; real authenticated gateway calls selected distinct
models and persisted usage, disabled preference refused without dispatch.
This covers optional SCALE assistance only. Versioned novel defaults, workflow
request/per-step preferences and generation/definition selectors remain pending.

Further progress: versioned novel defaults backend and author drawer are now
implemented. Config history/CAS/atomic audit, explicit CHAPTER/S3 consumers,
generation provenance and immutable enqueue default/absence pins are verified.
API158/executor22/worker-path4PASS, separate thirteen-file backend APPROVE;
fresh scratch history preservation and actual authenticated BullMQ/gateway
approval/resume/default-change proof. Main migration and matching-worker-before-
API activation preserve story/run history. Author defaults form and inheritance
labels: web51PASS, separate six-file UI APPROVE, actual en/id scratch browser
saves/read-back/CAS and menu proof. Scope and receipts are in the ledger.
Workflow request/per-step preferences and generation/definition selectors remain
pending. This is not Task2 or full Studio completion.

- [ ] Freeze ADR/schema/API/precedence contract and review all generation and
  optional analysis callers, including worker/stream paths, before dependent edits.
- [ ] Regress all precedence levels, automatic inheritance, incompatible/missing/
  disabled model, stale selection, mid-run definition edit, duplicate provider
  IDs and actual fallback attribution. Deterministic review remains deterministic.
- [ ] Implement shared manager preference and propagate pinned choices through
  executor/API/worker/review callers; UI displays inherited/resolved settings.
- [ ] Real configured gateway scratch exercise verifies distinct eligible
  selections and persisted attempts. Run manager/executor/API/worker/web tests
  and types for changed packages. No mock-only integration acceptance.

### Task 3: Workspace Studio creation, starter pack and AI drafts

Files: existing `apps/web/app/components/ai-studio/{DefinitionList.vue,DefinitionDetail.vue}`,
`apps/web/app/composables/useAiStudio.ts`, Studio page, definition routes/service;
create `DefinitionCreateDialog.vue` and test, workspace starter-pack service and
`apps/api/src/workspace-studio.test.ts`. Reuse checked-in chapter templates;
do not run the old PLATFORM seed unchanged. Shared locale edits stay with root.

Interfaces: POST `/api/workspaces/:workspaceId/studio/starter-pack` idempotently
installs versioned WORKSPACE-scoped executable definitions without overwriting
custom keys. POST `.../studio/definition-drafts`
`{ kind: 'agent'|'skill'|'workflow', instruction: string, preferredModelRef: string|null }`
returns a validated, unsaved draft and generation attribution. User reviews,
edits and explicitly saves through existing definition creation routes.
The drafting model and eventual definition execution models are separate fields.

- [ ] Regress empty-to-create manual CRUD, retained-version deletion refusal,
  starter pack retry/collision, nonmember/unauthorized mutations and workspace A
  changes invisible/inapplicable to B. Workspace-wide definitions resolve novel
  context per run; optional existing novel scoping remains intact.
- [ ] Add reference-aligned create/edit/version/publish/archive-or-guarded-delete
  UI, profile/model pickers, empty/error feedback and explicit starter-pack action.
- [ ] AI draft uses bounded server-authorized available definitions/tool catalog;
  schema/graph/reference checks reject cycles, nonexistent/cross-tenant refs,
  unsupported executable kinds, privilege instructions and arbitrary code. Failed
  draft is editable/refusable evidence, never silently installed or auto-run.
- [ ] Real gateway generates each definition kind in scratch; native save/list/
  publish/run and cross-workspace refusals prove the complete usable path.
  Workflow/skill prompts alone cannot install executable application features.
- [ ] Run definitions/parity/executor tests plus new Studio API/component tests,
  en/id browser CRUD and worker execution; record exact native runtime results.

## Commands and rollback

Progress 2026-10-20: workflow request/per-step routing and author generation model
controls implemented and separately reviewed; detailed scope, exact hashes and
native API/BullMQ/gateway/browser receipts are in the execution ledger. UI45PASS,
types/lint0. Main additive migration activated with history preserved and matching
workflow worker before API reload. No full Task2/B2 completion claim: definition
selectors and reload-safe uncertain-start reconciliation remain; Studio creation,
AI drafts and starter pack remain planned. Existing mounted-panel retry reuses
the exact request/key after unknown outcome and freezes new submissions.

Existing commands include `pnpm --filter @novelforge/api exec vitest run src/definitions.test.ts src/definition-resolution-parity.test.ts`
and affected package `test`/`typecheck` scripts. Add exact new tests to commands
when files exist. All DB tests use dedicated targets. Migrations are additive;
old versions inherit Automatic. Source rollback must retain historic model pins,
definition versions, generations and usage. Do not delete real definitions to
prove rollback or disable platform authorization to make workspace CRUD pass.

Progress 2026-10-20 follow-up: the mounted-panel retry limitation above is closed
for same-tab reload/remount using a validated account-scoped sessionStorage
journal with persist-before-POST/read-back, explicit same-key recovery and matching
cleanup. Final3file27PASS/types/lint0, separate exact6file APPROVE. Actual native
scratch browser EN/ID lost committed202 then reloaded and retried200 with sameID;
four attempts/two logical runs, cancelled after proof. No extra gateway call or
main story write. Tab closure/new-device recovery is outside this mechanism.
Next approved work remains definition model selectors and full Studio creation.

Progress follow-up: existing definition new-version editor now has profile-filtered
Agent/Skill model controls and Workflow union-catalog default; JSON and controls
remain synchronized. Catalog union remains authorized and deduplicated; execution
checks actual effective step profiles. Existing content/history preserved. Native
API47 retained+focused1PASS, web final sequential23PASS/types/lint0, independent
exact11file APPROVE. Native en/id six version writes/readback and read-only390px
containment proof pass. API reloaded200/owner catalog parity/story hashes intact.
No full B2/Studio completion: creation/AI drafts/starter pack still planned. Author
raised missing mobile sidebar/toggle, affected-screen clarification pending.
Current memory runtime is UNBOUND (timeout); execution ledger is file handoff.

Progress 2026-10-20: mobile story-menu follow-up complete (author clarified editor,
not AI Studio); root host binding later reconfirmed. B3 manual-creation subset now
implemented/reviewed/native-verified: managers create WORKSPACE Agent/Skill/
Workflow v1DRAFT with model selection, no publish/run. Unknown-save exact retry/
matching readback, scoped role/load/submission fences and native dialog focus.
Broad80PASS/focused final9PASS/types/lint0, independent13file APPROVE. Actual empty
scratch workspace EN/ID creates6drafts/modelreadback, lost201 recovery and tenant/
role/graph negative proof; no main story/gateway writes. Existing edit/version/
publish flow retained; manual Workflow graph remains JSON, not a visual builder.
Task3 remains OPEN for explicit starter pack, AI drafts and expanded CRUD/recovery;
do not mark the combined creation/AI/startup checklist complete from this subset.

Starter-pack execution contract (2026-10-20): explicit manager action installs
the checked-in chapter-generation-review workflow and its five agents as published
WORKSPACE v1 definitions, without starting a run. The UI states publication before
confirmation. Installation is one serializable transaction, including audit.
Exact existing published content is reused; any occupied key with different
content/status fails the entire installation with a visible key conflict. No
custom definition, model choice, version or PLATFORM row is changed. Concurrent
retry is bounded and cannot create duplicate identities/versions. Current scope
has no template Skill roles; do not invent decorative skill definitions.
Acceptance: actual disposable PostgreSQL/API install and read-back, repeat and
concurrent requests, custom-key rollback, tenant/role refusal, unchanged story/run
counts; localized UI proof and independent review. No schema migration, gateway
call or main-story mutation is needed for installation.

Starter-pack result: implemented/reviewed bounded installation above. Actual
PostgreSQL/API7PASS, web8files65PASS/types/lint/diff0; independent13file APPROVE
49f7957ff65ebc9f5bc4bbf324e741c3c20bd80b6227ec38434bf8844e5f1c30.
Native scratch browser EN1440/ID390/readback/lost200safe retry/custom-key409/role
control proof passes, unchanged story/run/generation counts, no gateway call.
Selected-model unsaved AI drafts and expanded CRUD remain OPEN; do not close the
combined Task3 checklist from manual creation plus starter installation alone.

Author follow-up: the Skill tab remaining empty does not satisfy the approved
three-kind Studio starter experience. Extend the pack with two checked-in,
machine-contract-backed Skills: chapter-context-distillation (TRANSFORM,
DEEP_PLANNER) and chapter-continuity-check (VALIDATION, CONTINUITY_REVIEWER).
This supersedes the earlier no-Skill template inventory, not the frozen chapter
graph. Existing packs gain only missing Skill identities/v1; existing Agent and
Workflow versions remain untouched. Skill key/content/category/model/status
conflicts abort the entire transaction. Reuse the manager gate and immutable
version/model editor, extend safe conflict-key parsing and localized pack copy.
These are reusable SKILL-step definitions, not an automatic new chapter workflow
stage or database retrieval port. No migration, auto-run, main story mutation or
commit/push. Root implements, independent reviewer verifies the exact delta.

Author model-catalog amendment: show the complete live configured router catalog
in the shared searchable model picker. Author explicitly retains profile gating:
unmapped/disabled/unsynced models remain visible but cannot be selected. Add
workspace-authorized GET model-catalog with optional profile through existing
GatewayManager adapter discovery; no direct provider calls from UI or definitions,
no auto-sync or mapping writes. Return actual internal IDs only when known and
safe disabled reasons. Existing model-options and all dispatch gates remain.
Search all catalog names/IDs/gateways client-side, render bounded batches with
Show more so all results stay reachable. Native details/search/Tab/Escape,
explicit loading/retry/empty/match counts, reference tokens and en/id resources.
No new routing policy, migration, gateway generation, story mutation or commit.

Catalog amendment result: API49PASS, final web13files104PASS, types/lint/diff0;
separate12file APPROVE/root hash efb146ffc3b7fbcfb96391e4327a653c4f4c618be00a688fc32ee6f6b43497fe.
Actual Akanesia-Router catalog set equals API set (3051 at10:48:45Z),7selectable
for CREATIVE_WRITER,3044disabled with explicit reasons. Native readonly en/id
desktop/mobile search/local selection/focus/Escape/dropdown geometry passes.
Initial native loading-focus defect repaired and covered by regression; consumer
mock URLs/flags updated to the new catalog contract. No provider generation,
catalog sync, profile mutation or story write. Inventory may change at router.

Author Profile-editor repair: existing Agent/Skill version dialog lacked the
creation form's canonical Profile control. Added MODEL_PROFILES/ActionMenu,
JSON-merged profile changes with retained model/draft, reactive eligibility,
read-only/submission guards. Workflow has no single Profile; its own default
model stays separate from step Agent/Skill profiles. Existing version API and
server gates remain unchanged. Final50PASS/types/lint/diff0, independent4file
APPROVE1497e9c7…a104a33c; actual scratch/router/browser EN1440/ID390 six appended
versions retain v1, selected profiles/models and graph. No main writes/generation.

Latest author catalog decision supersedes show-disabled: workspace model picker
and API expose eligible Profile-mapped models only. SUPER_ADMIN /admin Profiles
retains full live catalog through a privileged endpoint, searchable by name/ID/
gateway with bounded batches, explicit unmappable unsynced rows and reference
tokens. No routing eligibility expansion or automatic sync. Existing local model
admin API remains for enable/disable management; new live response joins actual
IDs and does not fabricate them. Independent review and native role/browser proof
required; preserve all versions/main configuration and no commit/push.

Eligible-author/admin-search result: workspace API+picker eligible-only, global
live catalog SUPER_ADMIN gated. Reference admin Profile picker searchable with
sync-required rows/actual UUIDs,100row batches, guarded save and adaptive popup.
API49PASS/web10files85PASS incl axe/types/lint/diff0; independent13file APPROVE
69e16a697be0196e8b523b1f36df595b4c17f6eb858c0cdcb68090fab01a8675.
Actual router en/id readonly browser proves admin3051/author7 at11:25:20Z,
global403/401 and search/hidden choices/focus/geometry. No main config/story write.
