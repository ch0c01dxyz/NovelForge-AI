# Workspace chapter lifecycle, model selection and whole-novel publication

Status: DESIGN APPROVED by the author on 2026-10-20, including the discussion
addendum and additions below. Implementation plan review remains pending;
no implementation claimed. Historical proposal wording below is retained.
Owner: root. Separate exact-diff reviewer required for implementation.

## Intent and verified baseline

Author requests understandable chapter controls, manual/AI chapter creation,
reference-aligned dropdowns, chapter rename/delete, author model selection for
generation and AI analysis, admin removal of exhausted model profile mappings,
and a workspace Publish action covering the whole novel.

Git baseline main 7a5cac3 with the previous homepage/navigation polish still
uncommitted. Preserve every existing change, stash and author-provided debug.png.
Use docs/design/writer-workspace/index.html and DESIGN-TOKENS.md; en/id UI.
OpenDesign get_active_context failed Transport closed again this turn; do not
claim connector output. No dependency, Docker, worker, backup or credential
changes are authorized. No commit/push or live story publication is implied.

Observed source:

- Writer index.vue createChapter uses globalThis.prompt; the sidebar shows
  small text-glyph add/import/export controls. Import/export have native title
  attributes, but add lacks one and no visible action labels are provided.
- Chapter order is a native select; ActionMenu is the available shared menu.
- Manuscript DELETE route/service already exists, with authorization,
  mutation history and refusal for published chapters or retained evidence.
  The inspected manuscript routes expose no chapter-title rename route.
- Writer publish/saveAndReview publishes only activeChapter. Publication
  services pin the exact version and enforce review, branch, archive and
  schedule gates. Whole-novel publication is not established by these paths.
- ProfileMappings displays profile/provider modelId and supports mapping PUT,
  including enabled=false, but has no row disable/delete action. The current
  list response lacks the internal model reference needed to target a mapping
  unambiguously across gateways. Profile names are fixed capability enum values.
- Chapter generation starts an existing approved-outline workflow. The
  inspected generation input, orchestrator and manager options do not expose
  an author-selected concrete model preference.

## Proposed author experience

### 1. Understandable sidebar and dropdowns

Use SVG icons and visible localized labels Add chapter, Import and Export,
arranged in the existing narrow sidebar without overflow. Keep tooltip/title
and accessible names, disabled/loading states and keyboard focus. Use the
existing dropdown design language (stone surface, orange selection, matching
border, spacing and chevron); preserve keyboard navigation and explicit labels
for order and model selectors. Do not replace native controls with an
inaccessible clickable div. Preserve scroll container and chapter order.

### 2. Manual or AI chapter creation

Add opens a native modal with two explicit choices:

- Write manually: required author-entered title, then existing numbered draft
  creation and navigation to its editor. No browser prompt.
- Generate with AI: author instruction, target length and generation model;
  show the approved-outline prerequisite and current story position. Generate
  both title and manuscript through the existing workflow/manager boundary,
  with bounded context and structured validation. Use a recoverable numbered
  draft/run association and idempotency so retries cannot create duplicates.
  Surface missing outline/configuration as actionable refusal. A failed run
  is not a completed chapter. Title/prose remain draft candidates until author
  acceptance; no automatic canon approval or publication.

Exact title output integration must be verified against the installed workflow
definition and schema before implementation; do not assume the existing draft
contract already returns a title. Do not modify historical workflow versions.

### 3. Rename and delete

Each chapter has an explicit More actions menu: Rename and Delete. Rename uses
a prefilled title modal and a validated, authorized, revision/audit-backed
server mutation with conflict handling; retain chapter identity and number.
Published title changes follow existing publication immutability rules.

Delete opens confirmation with chapter title/number and explains constraints.
Reuse the existing deletion service and its evidence/publication restrictions.
Never cascade away retained review/canon evidence or silently unpublish. After
successful deletion select an adjacent chapter, or the empty editor. Preserve
unsaved edits through the existing save/conflict flow before changing targets.

### 4. Author model choice

Expose separate Generation model and AI analysis model preferences, including
Automatic (admin routing). Show only enabled, eligible, profile-mapped models
through a workspace-authorized safe catalog; no gateway credentials or admin
configuration writes. AI analysis covers optional AI-assisted review/guidance;
deterministic publication review does not become an LLM operation.

Selected model is attempted first for compatible tasks. Existing bounded
transient/limit fallback remains available and explicitly disclosed; record
requested and actually used models. Disabled, unmapped or incompatible choices
are rejected server-side even if the UI is stale. An author preference cannot
override per-role capability constraints or re-enable an admin-disabled model.
Resolve and pin selection for each new run/request; do not mutate in-flight
historical input. Persist novel-scoped preferences only after verifying an
appropriate existing versioned configuration store; otherwise document the
smallest reviewed schema change before migration. No local quota calculation.

### 5. Admin profile mapping actions

Show readable model names and stable internal identity. Add row actions Disable/
Enable and Remove mapping with confirmation and audit. Temporary provider limits
can use Disable and later Enable; Remove affects only this model/profile link.
Preserve fixed profile categories, model usage history, and unrelated mappings.
Keep platform-admin capability checks server-side. Global model disable remains
an existing separate action in the model catalog. No automatic deletion based
on an inferred quota balance. Active requests retain honest final outcomes.

### 6. Whole-novel Publish

Main header action becomes Publish novel. It opens a summary listing already
published, draft/ready, empty, scheduled and blocked chapters with the exact
version selected for each. Save the current editor first and review all target
versions. Show progress and actionable blockers; never present partial review
coverage as whole-novel success. Reuse fresh reviews where all dependency pins
are still valid. Existing published chapters remain published and are skipped.

Recommended policy: ALL OR NOTHING for previously unpublished chapters.
If any target chapter is empty, review-blocked, scheduled, stale, or otherwise
ineligible, publish none of the target batch. Show which chapters need repair.
After all targets pass, create required impact/checkpoint evidence and commit
the publication state atomically, rechecking authorization, membership, branch,
target set, exact versions and review dependencies inside the final transaction.
No LLM calls or human waiting inside that transaction. Retain audit/versioning
and durable downstream notification/cache intent; retries must be idempotent.
Avoid one unbounded synchronous HTTP request for thousands of reviews. Reuse
existing job/progress/recovery infrastructure after verifying its suitability.
Do not independently publish all chapters on the author's real novel as a test.

Alternative policies considered: publish ready chapters and report skipped
ones, or publish sequentially with resumable partial success. Both can expose
only a portion of a novel. They do not match the recommended all-or-nothing
interpretation and require a different explicit author decision.

## Scope, dependencies and implementation order

1. Sidebar labels, dropdown visual consistency and manual chapter modal.
2. Rename API/UI and existing safe delete integration.
3. Admin mapping controls and safe eligible-model catalog; manager/request
   preference plumbing for generation and optional AI analysis.
4. AI creation title/prose integration with the existing versioned workflow.
5. Novel-wide preflight/progress and atomic batch publication.

One writer; freeze shared routing/publication contracts before dependent work.
Allowed paths: targeted writer/generation/admin components, shared UI, en/id,
manuscript/publication/AI routing services and routes, relevant workflow
contracts, focused tests, necessary reviewed migration/ADR, task/progress/docs.
Forbidden: bypassing review/canon/versioning, raw provider HTTP in business
code, changing account roles/secrets, altering imported manuscript as a test,
unrelated redesign, destructive stack resets, commits/push/deployment.

Before implementation, complete source tracing of worker generation and
optional AI-analysis callers, workflow title schema, configuration storage,
publication checkpoint/locking and downstream notification behavior. These
are open implementation details, not claims of missing or working capability.
Write the implementation plan after author design review; scope any necessary
ADR/migration and rollback explicitly. Never infer approval from memory.

## Acceptance and negative checks

- EN/ID desktop/mobile: understandable controls, styled opened dropdowns,
  keyboard/Escape/focus, long labels, loading/empty/error states, no overflow.
- Manual creation/cancel; real-gateway AI title+prose creation and acceptance;
  failed/limited/interrupted request, missing approved outline, and idempotent
  retry retain recoverable state without duplicate or silently approved text.
- Rename with stale version and unauthorized user; delete confirmation/cancel,
  eligible draft, final chapter, published chapter and evidence-backed refusal.
- Author picks generation and AI-analysis model; real provider/model usage is
  read back. Stale/disabled/cross-profile model and unauthorized catalog access
  refuse. Fallback and final requested/used attribution are verified honestly.
- Admin disable/re-enable/remove one mapping without altering others or usage
  history; non-admin refusal; removal of last mapping yields a clear no-model
  state, never an implicit bypass or restoration.
- Batch publish valid targets once; one invalid target yields zero new public
  chapters; concurrent edit/new chapter/review-dependency change invalidates the
  batch; scheduled/archived/non-main/unauthorized/checkpoint failure refuse.
  Existing public chapters remain unchanged; retry and interrupted execution
  cannot duplicate publication/notifications. Prove rollback/recovery semantics.
- Test mutations and real gateway-generated content use disposable test novel/
  database, preserving acceptance data. Focused regression tests plus actual
  native API/browser evidence, appropriate types/lint and separate exact-diff
  review. No author or human screen-reader sign-off fabricated.

## Handoff

This document is a proposal based on source inspection, not implemented work.
Pending author review: approve the design, especially all-or-nothing publication
and the meaning of Remove mapping, or specify changes. Previously verified
homepage/navigation work remains uncommitted and must be preserved.

## Discussion addendum — chapter consistency, covers and workspace Studio

Author asked for explanations before approval. This addendum records source
findings and recommendations only; it is not author approval or implementation.

Observed: the checked-in chapter-generation-review draft schema already has
an optional title alongside required prose. Generated-chapter mode should
require both and review their agreement against the same pinned context.
Provide author notes before generation (tone, viewpoint, events to include,
spoilers to avoid, title preferences). Preserve those instructions through
planning, writing and review. Conflicts with approved story truth must be
surfaced rather than silently rewriting canon. After prose revisions, reassess
title/content alignment. Structured schema validation proves shape only; it
cannot guarantee semantic consistency. Author preview/edit/accept remains.

Observed: novel cover PUT/GET and image validation/storage already exist;
the inspected AIGateway exposes chat, streaming, embeddings and health, not
an image-generation contract. Proposed Cover workspace menu: compile a
bounded editable brief from the active novel's available synopsis, genre,
approved character/world visual facts and mood; show missing data explicitly.
Allow additional author notes, style choice (3D, artistic, sketch, 2D, manga,
manhua, manhwa and custom), preview and explicit Apply as cover. Offer style
recommendations as suggestions, never as a proven objective best match.
Keep current cover until the author applies a result; preserve provenance and
recoverable prior cover. Use spoiler controls and avoid assuming unrecorded
visual details are canon. Require verified real image-capable gateway/provider
integration through the existing adapter architecture before claiming image
generation. Text-only model catalog entries are not proof of image support.

Observed: definition services support PLATFORM/WORKSPACE scopes, server-side
membership/capability gates, versioning and guarded deletion. Workspace
OWNER/ADMIN can manage definitions; the current AUTHOR role is not granted
agent/skill/workflow management. Existing UI supports reading, new versions
and publishing, but inspected list/composable do not provide complete create/
delete management from an empty Studio. The old seed-chapter-template script
creates PLATFORM definitions, so it must not be used unchanged to satisfy
workspace-only author setup. Runtime list emptiness cause remains unverified
this turn; source support does not establish installed definitions.

Recommendation: provide an explicit Install starter pack action and workspace
create/edit/version/publish/archive-or-guarded-delete controls. Start with
existing chapter-generation roles (planner, writer, reviewers, extractor),
reuse approved installed capabilities, and add analysis/cover brief workflows
only when their actual execution ports/contracts are implemented. Do not seed
decorative definitions or imply prompts install executable tools. Starter pack
and author customizations use the active workspace scope, never global writes.
Within that workspace, each run still resolves the selected novel's context;
workspace scope does not automatically mean one-novel-only scope. New edits
affect future pinned runs; retain historical versions and refuse destructive
deletion of referenced definitions. Keep current OWNER/ADMIN management rights
unless the author explicitly requests a separate AUTHOR capability change.

If adopted, extend implementation planning and acceptance to title/content
agreement and author-note propagation, actual image generation/failure/apply/
recovery, workspace starter-pack idempotency and cross-workspace isolation,
definition CRUD authorization, and absence of global mutation. No application
changes, model calls, database population or new acceptance tests this turn.

## Author approval and additions — 2026-10-20

The author explicitly approved this design and its recommended changes.
The earlier pending-approval statements describe the historical proposal stage.
The following additions are requirements, not completed capabilities:

- Cover generation count is author-selectable, integer 1 through 9 inclusive,
  maximum nine requested images per batch. Show each actual result/failure and
  select one successful candidate for explicit Apply. Never present fewer
  returned images as a fully completed request. Recommendation text is shown
  as localized badges, including recommended style suggestions; do not invent
  objective quality scores or imply that a badge is author acceptance.
- Each AI-backed agent and skill has its own optional concrete-model
  preference; a workflow has a default model preference. Preserve capability
  profiles. Specific agent/skill preferences take precedence over the workflow
  default; Automatic inherits the next eligible default. Expose the resolved
  preference and actual attempted/used model. Deterministic validation,
  retrieval and authorization remain executable code and cannot be replaced
  by a model selection. AI-assisted retrieval/analysis is a separate AI-backed
  capability with its own model preference.
- Studio permits manual definition creation or AI-assisted generation for
  agents, skills and workflows. The author chooses the model used to draft
  the definition separately from the models the resulting definition runs.
  Generated definitions must pass the same schema/graph/reference validation
  and remain draft until reviewed/saved/published. No arbitrary generated code,
  network tool, privilege grant or automatic execution is permitted.
- Ordinary author accounts may own at most one workspace; novels within it
  have no application count cap. Owner/admin exemption was requested, but its
  account-level interpretation needs clarification: every workspace creator
  automatically receives workspace OWNER, so exempting that membership alone
  would defeat the author limit. The only current global role is SUPER_ADMIN.
  A focused clarification question is pending; do not silently invent an
  account role or infer an exemption from workspace membership. Enforce the
  resolved policy server-side with concurrency control; preserve all existing
  workspaces and content. Do not confuse ownership count with memberships.

Execution plan: ../plans/2026-10-20-workspace-authoring-program.md. No commit,
push, live story publication or destructive data cleanup is included.
