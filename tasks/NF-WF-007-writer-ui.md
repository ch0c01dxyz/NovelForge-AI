# Task NF-WF-007: Writer generate/review/diff/accept UI

Project language: English for all authored/revised artifacts and generated
project content; UI uses English (`en`)/Bahasa Indonesia (`id`) locale keys
and resources with English fallback.
Model selection: author-selected at runtime; separate implementer/reviewer
actors, with requested aliases distinguished from runtime evidence.

Status: DRAFT (contract not reviewed; implementation starts only after a
separate contract review returns APPROVE)
Milestone / capability IDs: M2 author chapter loop; DELIVERY-PLAN NF-WF-007
Implementer role / requested and resolved model: (to be assigned at dispatch)
Reviewer role / requested and resolved model: (separate actor; backend MODEL_UNVERIFIED per GAP-013)
Readiness evidence / unresolved decisions / parent acceptance owner: NF-WF-004
VERIFIED (durable execution, sweeper, cancellation); NF-WF-005 VERIFIED
(approval decision and safe continuation); NF-WF-006 VERIFIED (chapter
generation/review template, implementation `ce443c6`, focused re-review
APPROVE of the F1 fix; GAP-031/032/033 recorded). GAP-028 remains OPEN and
constrains testing (see Scope).
Frozen review manifest / exact artifact paths and identity: (filled after contract review)
Baseline revision / local changes to preserve: main @ `ce443c6` (NF-WF-006 pushed 2026-10-05)
Engram checkpoint topic key / last confirmed observation reference: Engram unavailable
on this host (GAP-021); checkpoints go to docs/implementation/progress.md.

## Normative vs informative

- **NORMATIVE** (MUST): Scope, Behavior and invariants, Outputs,
  Acceptance and verification, Migration and rollback. Statements using
  MUST / MUST NOT / REQUIRED are binding.
- **INFORMATIVE**: Goal and reason, layout sketches inside this section's
  examples, Open questions, the Review record template at the end. These
  explain intent but are not acceptance gates by themselves.

## Goal and reason

Give the author the complete M2 chapter loop through real UI: pick a
chapter → start the NF-WF-006 template run → watch live run/stage states →
inspect the generated draft as a versioned diff with evidence findings →
approve/reject through the NF-WF-005 decision routes (snapshot-hash-checked,
text and canon decisions kept separate) → apply the accepted text against
the expected manuscript version → continue to the next chapter. Every
surface reads and writes through the NF-WF-004/005/006 backend; per
UX-UI.md, an API or mock panel is not completed UI. This task is the first
real consumer of the chapter generation template, and its acceptance
includes the failure classes the delivery plan demands for M2: loading and
error states, concurrent autosave, stale apply, and separated text/canon
decisions.

This is a design contract. Implementation starts only after a separate
contract review returns APPROVE.

## Required reading

- [Operating constitution](../../AGENTS.md) (esp. §2 architectural
  invariants, §3 domain language, §5 canon authority, §7 context rules,
  §9 versioning/recovery, §10 dev rules incl. the UI-localization
  exception, §11 Definition of Done — generation/text acceptance/canon
  approval/publication are separate outcomes, §12 orchestration, §13
  evidence).
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- [UX-UI architecture](../../docs/08-frontend/UX-UI.md) — the editor
  layout (left explorer / center editor / right AI rail / bottom status),
  the required author journey (generate → versioned diff + evidence →
  accept/reject text → decide Candidate Canon separately → apply against
  expected versions → consolidation status → next chapter), the required
  UI states (loading, empty, failed, incomplete stream, awaiting
  approval, cancelled, stale-source, rebuild-pending), inline-actions
  requirements, accessibility, and the Tailwind token rule (no scattered
  one-off styling).
- [NF-WF-004 contract](./NF-WF-004-durable-workflow-execution.md)
  (frozen) — durable execution: run route semantics (202/200 with
  `idempotencyKey`), guarded claims, sweeper, cancellation, the exact
  `RunView` shape (`GET .../workflow-runs/:runId` with per-step
  `{stepKey, sequence, kind, status, agentKey, ..., output, errorMessage,
  latencyMs, approvalSnapshot}`).
- [NF-WF-005 contract](./NF-WF-005-approval-decision-continuation.md)
  (frozen) — decide routes (`POST .../runs/:runId/approve|reject`,
  bodies, capabilities, error codes `STALE_APPROVAL` /
  `NO_APPROVAL_SNAPSHOT` / `ALREADY_DECIDED` / `RUN_CANCELLED` 409s, 403
  for missing `workflow:approve`, 404 for non-member), park-time
  `approvalSnapshot` (`{material: {instruction, outcomes, pins},
  snapshotHash}`) on the parked step row, resume semantics (resume acts
  on the persisted run; never restarts completed steps).
- [NF-WF-006 contract](./NF-WF-006-chapter-generation-review-template.md)
  (frozen) — the template this UI runs: stage list (compile → plan →
  write → voice/style review → bounded correction → final review →
  extract → approve), the required run-input contract (`{ novelId:
  uuid, chapterNumber: int ≥ 1, outlineRef: string }`, optional
  `{ targetWordCount?, styleNotes? }`), the draft-selection rule
  (latest-available: `rewrite_2` > `rewrite_1` > `write`), schemas
  (draft-schema `{prose, ...}`, findings-schema `{findings:
  [{category, severity, rule, evidence: {source, version, span},
  remediation}], needsCorrection}`, extraction-schema `{proposals:
  [{kind, text, citations: [{source, span}]}]}`), invariants 5 (evidence
  required) and 7 (approval decides text and proposals together at the
  snapshot level; the template completes at text acceptance), GAP-031/
  GAP-032/GAP-033.
- Existing web app: `apps/web/nuxt.config.ts` (Nuxt 4, Tailwind v4,
  dev port 3001, `/api` Nitro proxy), `app/composables/useApi.ts`
  (typed `ApiError(code, status)`; branch on 401→sign in, 403→permission,
  409→reload), `app/pages/workspaces/[workspaceId]/novels/[novelId]/index.vue`
  (chapter list, chapter editor with 1.5s debounced autosave PUT
  `{content, expectedVersion}` and 409 → refetch-don't-clobber, `selectSeq`
  stale-response guard, status footer), `server/api/[...path].ts` proxy.
- Manuscript API (`apps/api/src/manuscript-routes.ts`): `PUT
  .../chapters/:chapterId` (`{content, expectedVersion}`, 409 on stale
  version), `GET .../chapters/:chapterId/versions` (chapter version
  history), `PATCH .../chapters/:chapterId/status`.
- Planning API (`apps/api/src/planning-routes.ts`): `GET
  .../planning/outline-versions` (the APPROVED outline version is unique
  per novel — the source of `outlineRef`).
- [ISSUES-AND-GAPS](../../docs/implementation/ISSUES-AND-GAPS.md):
  GAP-028 (production-worker AI wiring — constrains testing; no
  production AI path in UI tests), GAP-013, GAP-018.

## Environment prerequisites

Follow [environment preflight](../../docs/11-deployment/ENVIRONMENT-PREFLIGHT.md).
This host (Ubuntu 24.04.5, x86_64): pnpm 12.5.1 at `~/.local/bin/pnpm`, Node
v24.20.0, PostgreSQL 16.15 + pgvector 0.6.0 on localhost:5432, Redis 7.0.15
on localhost:6379 (both started manually; no systemd auto-start). Root `.env`
is gitignored and points at scratch `novelforge_test` on localhost.
All test/migration work on scratch `novelforge_test_*` databases only; never
reset a working database. No Docker per project policy. The web app has no
test runner today (see Acceptance: the smallest justified addition).

## Dependencies and evidence

- NF-WF-004 (durable workflow execution): VERIFIED — the UI starts runs
  (`POST /api/workspaces/:workspaceId/workflows/:workflowId/run`,
  202 + `{runId, statusUrl}`, 200 on `idempotencyKey` repeat), polls the
  single-run status URL, and cancels (`POST .../runs/:runId/cancel`).
- NF-WF-005 (approval decision and safe continuation): VERIFIED — the UI
  decides parked runs through the approve/reject routes, echoes the
  snapshot hash read from `GET .../workflow-runs/:runId`, and handles
  every documented 409 code.
- NF-WF-006 (chapter generation/review template): VERIFIED — the PLATFORM
  workflow (`key: chapter-generation-review`) the UI runs; the UI resolves
  the workflow id from `GET /api/workspaces/:workspaceId/workflows` by
  key. GAP-028 is OPEN: the production worker has no AI wiring, so UI
  tests that need a real run MUST use deterministic step kinds or the
  existing `apps/api/src/workflow-test-driver.ts` (fake gateway) against
  the real API — never a production AI path, and never a mock panel
  standing in for completed UI.

## Scope

Allowed paths:
- `apps/web/app/` — new pages/components/composables for the chapter
  generation loop, integrated into the existing writer workspace page
  (`pages/workspaces/[workspaceId]/novels/[novelId]/index.vue`), plus
  the locale mechanism (see Invariants) and the component-test harness
  (see Acceptance).
- New components (proposed homes; names are implementer-final):
  `components/generation/GenerationPanel.vue` (start form + run history),
  `components/generation/RunStatusPanel.vue` (live run + step rows),
  `components/generation/DraftDiffView.vue` (versioned draft diff),
  `components/generation/FindingsPanel.vue` (evidence findings),
  `components/generation/ProposalsPanel.vue` (candidate proposals),
  `components/generation/ApprovalDialog.vue` (approve/reject, hash-echo),
  `components/generation/ApplyBar.vue` (manuscript apply with
  stale-apply guard).
- New composables: `composables/useWorkflowRuns.ts` (start/poll/cancel/
  decide against the real routes with the `selectSeq`-style stale-response
  guard), `composables/useChapterGeneration.ts` (the chapter-scoped loop
  state: selected run, snapshot pin, diff pin).
- Locale resources for `en`/`id` covering every new UI string (and the
  pre-existing writer-page strings before claiming localization
  complete).
- Tests: component tests (new runner — smallest justified addition),
  API-level forced-race tests for autosave conflict and stale apply,
  accessibility and locale verification.
- Docs: `docs/08-frontend/` (generation UI page if the folder pattern
  calls for it), `progress.md`, `CURRENT.md`, `test-matrix.md`,
  `ISSUES-AND-GAPS.md` (new problems only, per §13 and standing author
  instruction).

Forbidden paths: everything else — including `apps/api/*`,
`packages/*`, `apps/worker/*`, `packages/database/*` (no backend or
migration changes in this task), the canon-application path (NF-WF-008
owns it), the rich editor (NF-WF-015), reader surfaces (NF-WF-013/014),
AI Studio/admin (NF-WF-018), any domain-event producer (GAP-023), and
any new step kind or workflow machinery change. If the UI needs a
backend API that does not exist (for example a server-side
runs-by-chapter filter — see Open questions), the implementer STOPS that
part, records it in ISSUES-AND-GAPS.md as a follow-up task, and
continues the rest — never a silent backend change (constitution §12).

Inputs: the chapter workspace page context (`workspaceId`, `novelId`,
selected chapter `{id, number, title, currentVersion}`); the APPROVED
outline version id (from `GET .../planning/outline-versions`, unique
APPROVED per novel); author-optional `{targetWordCount?, styleNotes?}`.
Outputs: a working author loop — started runs, live run/stage views, a
versioned draft diff with evidence, snapshot-bound approve/reject, and a
stale-guarded manuscript apply — all against the real backend.

Out of scope (with follow-up owner): applying extraction proposals to
canon (NF-WF-008 — this UI shows proposals as Candidate Canon only);
rich Tiptap editing and selection-based inline AI actions (NF-WF-015 —
the textarea baseline stays); public reader/browse/reading-progress UI
(NF-WF-013/014); AI Studio and administration surfaces (NF-WF-018);
production-worker AI wiring (GAP-028); approval expiry/timeout and
pending-approval notifications (follow-up tasks); import/export formats
(NF-WF-017); multi-approver/quorum.

## Behavior and invariants

### Invariant 1 — Real backend only; no mock panels

Every surface in this task reads and writes through the NF-WF-004/005/006
backend routes listed in Required reading. No mock/demo/placeholder panel
counts as completed UI (UX-UI.md). Loading states MUST NOT be faked with
timers; they reflect actual request/poll state.

### Invariant 2 — The chapter loop is one continuous, observable flow

The UI implements this exact core loop (UX-UI.md required author
journey), in order:
1. **Pick chapter** — the existing chapter list (number, title, status,
   word count). Starting a run while another run for the same chapter
   is `AWAITING_APPROVAL` shows a warning naming the parked run; it
   MUST NOT auto-cancel the parked run (the decision is the author's).
2. **Start run** — resolve the workflow id from `GET
   .../workspaces/:workspaceId/workflows` by `key ===
   "chapter-generation-review"` (PLATFORM or workspace row; if the key
   is absent → empty state "template not installed", not a crash).
   Read the APPROVED outline version (`GET .../planning/outline-versions`;
   unique per novel) → `outlineRef`; `chapterNumber` from the selected
   chapter; `novelId` as the route's separate field; optional
   `targetWordCount` / `styleNotes`. POST the run route with a fresh
   client-generated `idempotencyKey` (uuid v4) per intentional start —
   a double-click or retried submit returns the existing run (200), never
   a second row.
3. **Watch** — poll `GET .../workflow-runs/:runId` (the `statusUrl`
   returned at start) while the run is `PENDING`/`RUNNING` (2s interval);
   render run status plus every step row's `{stepKey, kind, status,
   latencyMs, errorMessage}` in execution order, including `SKIPPED`
   rows on untaken correction branches. Polling pauses when the document
   is hidden and resumes on visibility (resource budget); every poll
   response carries the `selectSeq`-style monotonic guard already used
   by the page — a stale response MUST NOT overwrite newer state.
   Cancel is offered while the run is non-terminal (`POST .../cancel`);
   terminal runs MUST NOT offer cancel.
4. **Review** (at `AWAITING_APPROVAL`) — read the parked step's
   `approvalSnapshot` ONCE per review round and derive EVERYTHING from
   that single read: the draft text, the diff, the findings, the
   proposals, and the `expectedSnapshotHash` echo. Never mix snapshot
   reads. The draft is the latest-available per the NF-WF-006
   draft-selection rule: `outcomes.rewrite_2?.json` if that step
   SUCCEEDED, else `outcomes.rewrite_1?.json`, else `outcomes.write.json`;
   the panel MUST name which draft won ("Draft 2 of 2" style) and MUST
   show "pending stage" rather than fabricate text if the producing
   step is not `SUCCEEDED` (rebuild-pending state).
5. **Decide** — `ApprovalDialog`: approve `{expectedSnapshotHash,
   reason?}` / reject `{expectedSnapshotHash, reason}` (reason required
   for reject; the backend 400s without it). The dialog shows the hash
   being approved (truncated with full value on demand) and the decision
   binds to the snapshot read in step 4 — the UI MUST NOT silently
   re-fetch and re-approve after a 409.
6. **Apply** — enabled only when the run is `SUCCEEDED`. The accepted
   draft text is applied to the chapter via `PUT
   .../chapters/:chapterId` with `{content, expectedVersion}` (Invariant
   6). After a successful apply the UI offers "continue to the next
   chapter" (next by chapter number).

### Invariant 3 — Full state coverage, no silent gaps

Each surface MUST render all of: **loading** (initial fetch; run in
flight), **empty** (no runs for this chapter yet; no findings on a
passed review; no proposals; template key missing), **failed** (run
`FAILED` with the backend's `errorMessage`; step-row failure detail —
never invented text), **awaiting-approval** (parked: approve/reject
affordances + snapshot summary), **cancelled** (run `CANCELLED`: offer
"start new run", never resume), **stale-source** (see Invariants 5–6),
**rebuild-pending** (a needed step outcome is not `SUCCEEDED` yet —
the panel waits, it does not fabricate). An "incomplete stream" note
(AGENTS.md §6: partial output marked incomplete) applies wherever a
step's `output` envelope is present but its status is not `SUCCEEDED`.

### Invariant 4 — Evidence is one click from every claim

Findings render from the snapshot material's findings-schema outcomes
(`review_vs`, `review_final`) as `{category, severity, rule,
remediation}` with each finding's `evidence: {source, version, span}`
expandable in place (UX-UI.md: evidence one click away). Validator
failures surface as failed state with the rejection detail. The diff
view cites the pinned chapter version it was computed against.

### Invariant 5 — Decide errors are handled by code, never by retry

- 409 `STALE_APPROVAL` → enter stale-source state: "The run's material
  changed since you reviewed it." Re-fetch the run, recompute
  draft/diff/findings/proposals from the NEW snapshot, and require the
  author to review again. The approve button MUST NOT auto-retry.
- 409 `NO_APPROVAL_SNAPSHOT` → the run is undecidable: show "This run
  cannot be decided (no approval snapshot). Start a new run." No decide
  affordance.
- 409 `RUN_CANCELLED` → cancelled state.
- 409 `ALREADY_DECIDED` → benign: refetch the run and render current
  state (a duplicate click is not an error to the author).
- 403 → hide/disable decide affordances with "You don't have permission
  to decide runs." (`workflow:approve` is OWNER/ADMIN/AUTHOR only.)
- 404 → the run is gone for this tenant: show failed/gone state, never
  the material.

### Invariant 6 — Never apply AI text over unsaved or moved manuscript text

The Apply action is a guarded, explicit user action (never automatic):
- It is DISABLED unless: the run is `SUCCEEDED`; the editor has no
  unsaved text (`saveState === "saved"` — the existing autosave state);
  the chapter's current version still equals the version the diff
  was computed against (`diffPinnedVersion`); AND the chapter is not
  `PUBLISHED` (the manuscript PUT 409s with `{error:"CONFLICT"}` for two
  distinct reasons — stale version AND published-chapter immutability —
  which the UI cannot distinguish by code, so the published case is
  gated client-side: show "unpublish first" instead of the apply
  button).
- If the chapter version moved (someone — or the author's other tab —
  saved), Apply is BLOCKED with a stale-source message and a
  "Reload chapter and re-diff" recovery path. The PUT's
  `expectedVersion` is the second guard: a 409 from the PUT enters the
  same stale-source state. The UI MUST NOT refetch-and-resubmit the
  apply automatically.
- After a successful apply the chapter version advances; the run panel
  records which chapter version received the text (auditability: "Draft
  from run <id> applied to chapter v<n>").

### Invariant 7 — Autosave conflict handling is preserved and extended

The existing autosave contract stays: debounced PUT with
`expectedVersion`; a 409 means someone else saved first — refetch,
preserve the author's in-editor text, show the conflict state, never
clobber. The generation loop MUST NOT weaken this: starting, polling,
or applying a run never writes the editor except through the guarded
apply path (Invariant 6). Forced race tests are in Acceptance.

### Invariant 8 — Text acceptance and canon decisions are separate

The 005 approve/reject decision is TEXT ACCEPTANCE only (NF-WF-006
invariant 7: the snapshot binds text and proposals; the template
completes at text acceptance). Extraction proposals render in
`ProposalsPanel` as **Candidate Canon** — each with its `citations[]`
— under an explicit banner: "Not canon. Applying proposals to canon is
a separate step (NF-WF-008)." The UI MUST NOT offer any "promote to
canon" / "apply proposal" action. Approving the run MUST NOT be
presented as approving canon.

### Invariant 9 — Locale keys, English fallback, English error codes

All UI strings go through locale resources with `en` and `id` and
English fallback for missing keys (AGENTS.md §10 exception). Machine
error codes (`STALE_APPROVAL`, `INVALID_INPUT`, …) stay English and are
mapped to localized messages in the UI layer. Both locales and the
fallback MUST be verified before claiming localization complete.

### Invariant 10 — Accessibility per UX-UI.md

Keyboard: the approve/reject dialog traps focus, `Esc` cancels, and
focus returns to the invoking control on close; all run actions are
reachable by keyboard in a logical order. Semantics: real `<dialog>` /
`role="alert"` / `role="status"` for errors and live run states; the
diff view is navigable text, not a canvas. Contrast: the `nf-text-*`
token scale only. Motion: `prefers-reduced-motion` disables spinners and
poll-driven transitions (state changes still render, without
animation). Focus visibility uses the existing `nf-focus` token.

### Invariant 11 — No backend changes from this task

This is a UI task. If a needed capability is missing server-side, the
implementer records it in ISSUES-AND-GAPS.md as a follow-up and works
around within the existing routes (e.g. runs-for-a-chapter are found by
filtering `listRuns` client-side on `input.chapterNumber`) — never a
silent API change (constitution §12).

## Outputs

Exact surfaces (names are implementer-final, behaviors are normative per
the invariants above):

| # | Surface | Home | Reads / writes |
|---|---|---|---|
| 1 | Generation panel (start form: outline select, target words, style notes; run history for the chapter) | right rail of the chapter workspace page | `GET .../workflows` (key lookup), `GET .../planning/outline-versions`, `POST .../workflows/:workflowId/run`, `GET .../workflow-runs?workflowId=` |
| 2 | Run status panel (live run + step rows in sequence, cancel) | right rail / Generation panel | `GET .../workflow-runs/:runId` (poll), `POST .../runs/:runId/cancel` |
| 3 | Draft diff view (generated draft vs pinned chapter version) | center, above/beside editor on review | derived from `approvalSnapshot.material.outcomes` + `GET .../chapters/:chapterId` |
| 4 | Findings panel (findings + evidence, validator failures) | right rail / review area | derived from snapshot material |
| 5 | Proposals panel (Candidate Canon + citations, NF-WF-008 banner) | right rail / review area | derived from snapshot material |
| 6 | Approval dialog (approve/reject, hash echo, reason) | modal | `POST .../runs/:runId/approve|reject`, then poll |
| 7 | Apply bar (guarded manuscript apply + continue-to-next) | editor chrome / review area | `PUT .../chapters/:chapterId` `{content, expectedVersion}` |
| 8 | Locale resources `en` + `id` | `apps/web/app/i18n/` (or the locale module's convention) | — |

Styling reuses the existing Tailwind token system (`nf-bg-*`,
`nf-text-*`, `nf-border-*`, `nf-accent-*`, `nf-ok`, `nf-warn`,
`nf-focus`); no scattered one-off styling (UX-UI.md).

## Acceptance and verification

- [ ] Core loop end-to-end against the REAL backend with the test driver
  (GAP-028: `apps/api/src/workflow-test-driver.ts` fake gateway — never
  a production AI path, never a mock panel): pick chapter → start run
  (202 + `statusUrl`) → poll to `AWAITING_APPROVAL` → review shows the
  correct draft per the NF-WF-006 draft-selection rule (named winner),
  a versioned diff against the pinned chapter version, findings with
  expandable evidence, and proposals under the Candidate Canon banner →
  approve with the echoed hash → run `SUCCEEDED` → apply writes the
  chapter at the expected version → continue to next chapter. Reject
  path: run `FAILED` with the reason shown; no apply offered.
- [ ] **Forced race — autosave conflict.** Two concurrent chapter PUTs
  with the same `expectedVersion`: exactly one 200, one 409; the loser
  refetches and preserves in-editor text; the UI shows the conflict
  state and reloads (never clobbers).
- [ ] **Forced race — stale apply.** Pin diff at chapter vN; save vN+1
  (other actor/tab); attempt apply → blocked client-side (stale-source
  state) OR PUT 409 → same state; "reload and re-diff" recovery works;
  the manuscript keeps vN+1's text (no silent overwrite).
- [ ] **Forced race — double decide.** Two approves with the same hash:
  one succeeds, the other 409 `ALREADY_DECIDED` → UI refetches, no error
  shown.
- [ ] **Stale approval.** Park → change the material (re-rendered
  instruction or superseded prior outcome, as in NF-WF-005 acceptance) →
  approve with the old hash → 409 `STALE_APPROVAL` → UI re-reads the new
  snapshot and requires fresh review (no auto-retry).
- [ ] **Decide error matrix.** Each of `NO_APPROVAL_SNAPSHOT`,
  `RUN_CANCELLED`, 403 (actor without `workflow:approve`), 404 renders
  its specified state (Invariant 5); missing reject reason → 400
  surfaces inline.
- [ ] **State coverage.** Component tests render every Invariant-3 state
  for each surface (loading, empty, failed, awaiting-approval,
  cancelled, stale-source, rebuild-pending); the rebuild-pending case
  asserts NO draft text is fabricated before the producing step
  `SUCCEEDED`.
- [ ] **Apply gating.** Component tests: apply disabled with dirty
  editor; disabled when `diffPinnedVersion !== currentVersion`;
  disabled unless run `SUCCEEDED`; enabled path performs exactly one PUT
  with the pinned version.
- [ ] **Text/canon separation.** Component tests: proposals panel shows
  the Candidate Canon banner and offers no canon-apply action; approving
  the run is labeled text acceptance.
- [ ] **Double-submit safety.** Starting a run twice quickly (same
  `idempotencyKey`) yields one run row; the UI shows the existing run
  (200 path), not two panels.
- [ ] **Accessibility.** Keyboard-only approve→apply flow completes;
  dialog focus trap + `Esc` + focus return verified; `role` semantics
  present; `prefers-reduced-motion` disables animation (assert via
  media-query emulation); contrast uses token scale only.
- [ ] **Localization.** `en` and `id` render every new string; a missing
  `id` key falls back to English; error codes stay English in the UI
  mapping.
- [ ] **No-regression on the existing page.** The chapter list, editor,
  autosave, publish, and sign-in redirect behaviors are unchanged
  (covered by the new component-test suite; extended where the page is
  touched).
- [ ] Commands: `pnpm lint` clean; `pnpm --filter @novelforge/web
  typecheck` (`vue-tsc`) clean; `nuxt build` succeeds; the new
  component-test runner runs green with real counts (zero selected
  tests is not a pass); the API suites the loop touches stay green.
- [ ] Separate review of the submitted diff; findings resolved before
  commit. Contract review (this file) returns APPROVE before dispatch.

Record actual results separately from expectations. GAP-028 stays open:
no test in this task may depend on a production AI path.

## Migration and rollback

- No schema migration: this task uses existing tables and routes only
  (workflows, runs, steps, chapters, outline versions). The web app
  gains no server-side persistence.
- Rollback: revert the web commit; run history and manuscript data are
  untouched (existing RESTRICT semantics). A locale-mechanism addition
  rolls back with the same revert.
- Deploy order: web build → verify against the deployed API (the API
  already serves every route this UI needs). The new component-test
  runner is a devDependency; it does not affect production.

## Documentation and handoff

- Update `docs/implementation/progress.md` (NF-WF-007 section with
  verified counts only), `docs/14-progress/CURRENT.md`,
  `docs/implementation/test-matrix.md`.
- Record every new technical problem, confusion, blocker, or gap in
  `docs/implementation/ISSUES-AND-GAPS.md` before any workaround or
  completion claim (constitution §13; standing author instruction: all
  obstacles and problems are recorded there).
- Unknowns / risks: the exact start-form layout is implementer-designed
  within UX-UI.md; diff granularity (line vs word) is an implementer
  choice recorded in the handoff; real-model output quality is not
  asserted (GAP-028); the component-test runner choice is the smallest
  justified addition (see Open questions).
- Next dependency-ready task: NF-WF-008 (contracted extraction and
  canonical proposal application; depends on 006 and 007).

## Open questions

1. **Runs-by-chapter filter — RESOLVED at review (client-side; follow-up
   owns the server filter).** `GET .../workflow-runs` filters by
   `workflowId` + limit only; the UI filters client-side on
   `input.chapterNumber` (present on every row). A server-side
   `chapterNumber` filter is NOT a 007 option — it would violate
   Invariant 11 (no backend changes) for a non-blocking optimization.
   The implementer records the follow-up in ISSUES-AND-GAPS.md per
   Invariant 11.
2. **Outline approval moved mid-run — RESOLVED by author 2026-10-05
   (show non-blocking warning WITH highlighted changed parts).** If the
   author approves a newer outline version between run start and
   approval, the decide still binds to the parked snapshot (backend
   invariant). The UI MUST show a non-blocking notice at review time
   ("the approved outline moved since this run started — this decision
   still binds to the parked snapshot"): fetch the current approved
   outline version, diff its content against the outline version the
   run started from, and HIGHLIGHT the changed sections/parts in the
   notice so the author can see exactly what moved. The decision
   itself is unaffected.
3. **Parked-run collision UX.** Starting a new run while an older run
   for the same chapter is `AWAITING_APPROVAL` shows a warning per
   Invariant 2. Should the UI also offer one-click cancel of the parked
   run from that warning, or keep cancel only on the run panel?
4. **Post-approve apply timing — RESOLVED at review (accepted).** The
   contract enables Apply only at run `SUCCEEDED`. Confirmed against
   the executor: `approve` is the terminal step of the template graph
   (zero outgoing edges) and NF-WF-005 invariant 10 forbids model calls,
   re-rendering, or state mutation on the decide path — the snapshot
   draft is final. Apply-enabled-only-at-SUCCEEDED stands as written.
5. **Component-test runner choice.** `apps/web` has no test runner;
   the smallest justified addition is vitest + a Vue test utils
   package. Confirm this choice (or name the alternative) at review —
   do not invent an E2E command (delivery plan: a real runner is added
   when NF-WF-007/011 establishes it).

## Review record

(Reviewer: separate contract-reviewer actor, Muse Spark model family,
backend MODEL_UNVERIFIED per GAP-013. Contract SHA
`fe6a300768b2fd0e85bcf31440b8b69a5342090d` reviewed against HEAD
`ce443c67a40908cc174b891cfd4fb1272ce7a9cd`.)

- **Verdict: APPROVE_WITH_FINDINGS** (no P1/P2; 4 P3 findings F1–F4,
  all applied in the text above: F1 — Apply gated on non-PUBLISHED
  status (Invariant 6), because the manuscript PUT's two 409 CONFLICT
  paths are indistinguishable by code; F2 — no-regression acceptance
  reworded (no test runner exists on `apps/web` yet); F3 — Q1 resolved
  and tightened (client-side filter; follow-up owns the server filter);
  F4 — Q4 resolved (accepted): approve is terminal, no post-approve
  text mutation, Apply-at-SUCCEEDED stands).
- **Backend fidelity verified near-perfect**: all 12 named routes exist
  with the claimed paths/bodies; `RunView`/`StepRunView` match
  field-for-field; decide 409 codes, `workflow:approve` 403 mapping,
  tenant 404 pattern, run-body split, `statusUrl` format, and the
  approval-snapshot shape all confirmed against backend source.
  Invariant 11 (no backend changes) respected; GAP-028 constrains tests
  to the fake gateway/test driver.
- **Open questions adjudicated**: Q1 client-side (resolved), Q2 author
  decision 2026-10-05: show non-blocking outline-moved warning at
  review time WITH the changed outline parts highlighted (refined by
  author same day), Q3 keep
  cancel on the run panel only (reviewer decision), Q4 accepted
  (resolved), Q5 vitest + Vue Test Utils (accepted, smallest justified
  addition; no E2E command invented).
- **Unknown noted**: stale Prisma doc comment on `RunStatus.AWAITING_APPROVAL`
  (`packages/database/prisma/schema.prisma`) predates NF-WF-005; the
  frozen 005 contract is authoritative. Not a 007 defect.
- **Status after review**: contract remains DRAFT-frozen; implementation
  may proceed. Reviewed 2026-10-05.
