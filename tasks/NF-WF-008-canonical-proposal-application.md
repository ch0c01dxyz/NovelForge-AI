# Task NF-WF-008: Contracted extraction and canonical proposal application

Project language: English for all authored/revised artifacts and generated
project content; UI uses English (`en`)/Bahasa Indonesia (`id`) locale keys
and resources with English fallback.
Model selection: author-selected at runtime; separate implementer/reviewer
actors, with requested aliases distinguished from runtime evidence.

Status: DRAFT (contract not reviewed; implementation starts only after a
separate contract review returns APPROVE)
Milestone / capability IDs: M2 canon loop; DELIVERY-PLAN NF-WF-008
Implementer role / requested and resolved model: (to be assigned at dispatch)
Reviewer role / requested and resolved model: (separate actor; backend MODEL_UNVERIFIED per GAP-013)
Readiness evidence / unresolved decisions / parent acceptance owner: NF-WF-006
VERIFIED (extraction stage, `ce443c6`); NF-WF-007 VERIFIED (ProposalsPanel
renders Candidate Canon with the NF-WF-008 banner and zero canon-apply
actions, `1e103f8`); NF-WF-005 VERIFIED (approval decision semantics);
canon backend VERIFIED (proposal/approve/reject routes, atomic
per-proposal apply, `canon.test.ts`). GAP-028 remains OPEN and constrains
testing (see Scope).
Frozen review manifest / exact artifact paths and identity: (filled after contract review)
Baseline revision / local changes to preserve: main @ `5bc22aa` (ideas draft pushed 2026-10-05)
Engram checkpoint topic key / last confirmed observation reference: Engram unavailable
on this host (GAP-021); checkpoints go to docs/implementation/progress.md.

## Normative vs informative

- **NORMATIVE** (MUST): Scope, Behavior and invariants, Outputs,
  Acceptance and verification, Migration and rollback. Statements using
  MUST / MUST NOT / REQUIRED are binding.
- **INFORMATIVE**: Goal and reason, examples inside this section,
  Open questions, the Review record template at the end. These explain
  intent but are not acceptance gates by themselves.

## Goal and reason

Close the M2 canon loop. The NF-WF-006 template's `extract` stage ends
at extraction: proposals are CANDIDATES ONLY — "nothing here writes
canon". The NF-WF-007 UI renders them as Candidate Canon under an
explicit banner and offers no canon-apply action. This task fills
exactly that gap: the **contracted application** of approved proposals
to canon.

"Contracted" means every claim passes through an explicit, auditable
contract before it becomes story truth: evidence validated against the
immutable extraction artifact, conflicts checked against live canon,
an explicit canon approval (separate from text acceptance per the
constitution §11), and an atomic all-or-nothing state update with a
full audit trail. An unsupported claim is BLOCKED with reasons — never
silently dropped, never silently committed.

This is a design contract. Implementation starts only after a separate
contract review returns APPROVE.

## Required reading

- [Operating constitution](../../AGENTS.md) (esp. §2 architectural
  invariants 1, 2, 11, 12, 13, 14, 15, 18; §3 domain language — Canon,
  Candidate Canon, Story State, Revision; §5 canon authority —
  conflicts surfaced, not silently reconciled; §9 versioning/recovery —
  the high-impact mutation flow; §11 Definition of Done — generation,
  text acceptance, canon approval, publication are separate outcomes;
  §13 evidence).
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md) (§5
  product-AI boundaries: unsupported extracted facts remain Candidate
  Canon; conflicts go to author review; proposals reference the exact
  text and source revision).
- [NF-WF-005 contract](NF-WF-005-approval-decision-continuation.md)
  (approval snapshot semantics, STALE_APPROVAL, decision audit;
  Invariant 10 — no scope creep at the approval gate).
- [NF-WF-006 contract](NF-WF-006-chapter-generation-review-template.md)
  (the `extract` stage, extraction schema, draft-selection rule;
  invariant 7 — the template completes at text acceptance).
- [NF-WF-007 contract](NF-WF-007-writer-ui.md) (Invariant 8 —
  text/canon separation; the ProposalsPanel banner).
- [Story versioning](../../docs/03-domain/STORY-VERSIONING.md)
  (revision/checkpoint semantics the apply transaction must reuse).
- Existing canon backend: `apps/api/src/canon-routes.ts`,
  `apps/api/src/services/canon.ts` (`proposeCandidate`,
  `approveProposal` — duplicate re-check, supersede window rule,
  head CAS, audit), `apps/api/src/canon.test.ts`.
- [What-if simulation idea](../docs/ideas/what-if-outline-simulation.md)
  (simulations MUST NEVER enter this pipeline).

## Environment prerequisites

Same as NF-WF-007: native PostgreSQL 16 + pgvector and Redis on
localhost per `docs/11-deployment/ENVIRONMENT-PREFLIGHT.md` (no Docker
on this host); pnpm 12, Node 24; dedicated disposable `novelforge_test_*`
databases for mutation tests. Record actual readiness; never claim
another host's checks.

## Dependencies

- NF-WF-006 (extraction proposals with citations; the immutable
  extraction artifact).
- NF-WF-007 (ProposalsPanel shell and locale/test harness the 008 UI
  extends).
- NF-WF-005 (approval semantics as reference; 008 defines its own
  canon-approval decision — it does NOT reuse the run decide routes).
- NF-WF-002 (head-expectation CAS pattern, revision/checkpoint
  machinery the apply transaction reuses).
- Existing canon backend (entities, facts, proposals, `canon:manage` /
  `canon:approve` capabilities).

## Scope

### Allowed

- A **canon application**: a batch of contracted claims derived from
  ONE extraction (one run's `extract` step outcome). The application
  moves through `DRAFT → VALIDATED → APPROVED/APPLIED` or
  `DRAFT → VALIDATED → REJECTED`.
- **Contracting** (author-driven): binding each extract claim
  `{kind, text, citations[]}` to `(entity, predicate, object,
  validFromChapter)` plus validated evidence. The author performs the
  binding in the UI; the backend validates. No model call sits in the
  deterministic contracting/validation path.
- **Evidence validation** (deterministic): every citation
  `{source, span}` MUST resolve against the immutable extraction
  artifact; the span MUST be a verbatim substring; offsets recorded.
- **Conflict checks** at validation time and re-checked inside the
  apply transaction: duplicates, functional conflicts, stale basis.
- **Explicit canon approval**: a distinct authorized decision
  (`canon:approve`), per-item selection, recorded with actor,
  timestamp, and head pin. Separate from NF-WF-005 text acceptance —
  approving the run NEVER approves canon.
- **Atomic apply**: one transaction minting all approved facts (plus
  inline-created entities), supersede links, proposal decisions, and
  audit rows. All-or-nothing.
- **Full audit trail**: approving actor, application id, extract claim
  index, entity/predicate/object, evidence (artifact ref + spans +
  offsets), previous live values for supersedes, head revision.
- **Derived-invalidation intent**: the apply records which canon
  entries changed so memory consolidation (NF-WF-009) can rebuild.
- New Prisma models + migration (reviewed artifact) for applications;
  reuse of the existing canon fact/entity/revision/audit tables.
- A thin UI surface extending the NF-WF-007 page (review verdicts,
  contract claims, approve, applied state) with en/id locale keys.
- Tests: API-level against the real backend driving the 006 template
  via the existing `workflow-test-driver.ts` (fake gateway, GAP-028);
  component tests at the HTTP/`useApi` boundary.

### Forbidden

- Writing canon from an extraction without contracting, evidence
  validation, conflict checks, and explicit canon approval.
- Silently dropping an unsupported claim (it is BLOCKED with reasons,
  kept visible in the application).
- Auto-merging a conflict (constitution §5: conflicts are surfaced,
  not silently reconciled).
- A parallel canon store: everything lands in the existing canon
  tables; the application tables are batch bookkeeping, not a second
  truth.
- Model calls in the validation/approval/apply path (deterministic
  only). GAP-028 constrains any AI-involving test to the fake
  gateway/test driver.
- Accepting applications from **simulation** extractions (runs tagged
  `simulation: true`): refused at the boundary.
- Changing NF-WF-005 run-decision semantics, the 006 template, or the
  existing per-proposal canon routes' behavior.

### Inputs

- `runId` (+ optional `extractStepKey`, default `"extract"`) of a
  completed 006-template run. The run's extract-step outcome is the
  immutable evidence artifact. The run's `input.chapterNumber` is
  offered as the default `validFromChapter` suggestion (informative).
- Per claim, the author's contracting: entity (existing id, or
  `{kind, name}` for inline creation), predicate (1–200 chars),
  object (`{entityId}` or `{text}`), `validFromChapter` (int|null).
- The approver's decision: selected item ids, `confirmConflicts`
  (required when CONFLICT items are selected), `expectedHeadRevisionId`
  (tri-state, NF-WF-002D C12.1 pattern).

### Outputs

- Canon facts minted for approved claims (existing `canon_facts`
  semantics: supersede chains, validity windows, sources with
  `{quote, start, end}` + chapter version when known).
- Application rows (`CanonApplication`, `CanonApplicationItem`) with
  per-claim verdicts and the full audit trail.
- Revision + audit records via the existing machinery.
- API responses and UI states defined below.

### Out of scope (with follow-up owner)

- Memory consolidation from applied canon → **NF-WF-009** (008 emits
  derived-invalidation intent; 009 consumes it).
- Character/relationship/world/health workspaces → **NF-WF-010/016**.
- Multi-run or cross-chapter applications (one run per application;
  follow-up if needed).
- Model-assisted contracting suggestions → future enhancement (never
  authoritative; out of scope here).
- Publication/reader visibility of new facts → existing
  `availableFromChapter`/mode machinery, unchanged.
- The what-if simulation feature itself →
  `docs/ideas/what-if-outline-simulation.md` (draft only).

## Behavior and invariants

### Invariant 1 — Every claim is contracted before it can become canon

No extract claim reaches canon without an explicit contracting that
binds it to `(entity, predicate, object, validFromChapter)` and
validated evidence. The contracting is performed by the author; the
backend validates every field (entity exists and belongs to the novel,
predicate non-empty, object well-formed, chapter numbers in range).
An application item without a complete, valid contracting cannot be
selected for approval.

### Invariant 2 — Evidence is validated deterministically; unsupported claims are BLOCKED

For each citation `{source, span}` on a claim:
- `source` MUST name one of the extract step's bound inputs (e.g.
  `draft_write`, `draft_rewrite_1`, `draft_rewrite_2`). Any other
  value → the citation is unresolvable.
- The backend loads that input's text from the run's immutable step
  outcome — specifically the **`prose` field** of the referenced draft
  step's stored outcome (the extract inputs resolve to
  `$steps.{write,rewrite_1,rewrite_2}.json`, whose outputSchema is
  `{prose, sceneBreaks, title}`; there is no single "input's text") —
  and requires `span` to be a verbatim, non-empty substring of that
  `prose` string; the first-match offsets `(start, end)` within it are
  recorded. No match → unresolvable.
- A claim with zero resolvable citations gets verdict `UNSUPPORTED`
  with per-citation reasons. `UNSUPPORTED` items are BLOCKED from
  approval: selecting one → 409 `UNSUPPORTED_ITEM_SELECTED`. They
  remain visible in the application (never silently dropped).

Rationale: the extraction schema enforces only non-empty strings
(`contains`, not `minItems` — the schema compiler limitation). This
invariant is the actual evidence gate (evidence policy §5: "a citation
must resolve to an accessible version and actually support the
claim").

### Invariant 3 — Conflicts are checked at validation and re-checked at apply

At application creation (and on revalidate), each contracted item is
classified against live canon:
- `DUPLICATE` — an identical claim (same entity, predicate, object)
  is already canon. Cannot be selected for approval (409
  `DUPLICATE_ITEM_SELECTED`). Informational; the existing canon fact
  is shown.
- `CONFLICT` — a live fact for the same entity+predicate carries a
  different object (functional conflict). Surfaced with the live
  fact's statement and evidence. Selectable ONLY with explicit
  confirmation (`confirmConflicts: true` on approve); without it →
  409 `CONFLICT_NOT_CONFIRMED`. Approval supersedes per the existing
  window semantics — which REQUIRES `validFromChapter` (the existing
  "history destroyed by omission" rule is not relaxed).
- `APPLICABLE` — evidence valid, no duplicate, no conflict.

Classification is re-run INSIDE the apply transaction against canon
as it stands then (the existing `approveProposal` re-classification
rationale: a fact created after validation is exactly what validation
could not see). A newly-duplicate or newly-conflicting item aborts
the whole application.

### Invariant 4 — Stale basis refuses; re-validate, don't guess

The application pins the canon head revision at validation time.
If the head moved before approval, approve → 409 `STALE_APPLICATION`
(no state change). The author revalidates (`revalidate` re-runs
evidence + conflict checks against the new head); approval then
proceeds against fresh verdicts. The approve body accepts
`expectedHeadRevisionId` (tri-state: omitted asserts nothing, `null`
asserts "no head yet", uuid compares — NF-WF-002D C12.1).

### Invariant 5 — Canon approval is separate from text acceptance

Approving the NF-WF-005 run (text acceptance) MUST NOT create,
modify, or approve any canon state, and MUST NOT be presented as
canon approval. The application's approve is a distinct decision
requiring the `canon:approve` capability, recorded with actor id,
timestamp, selected item ids, and head pin. The review state exposes
the run's text-decision outcome as context only.

### Invariant 6 — Application is atomic

The apply is ONE database transaction: inline entity creations, fact
inserts, supersede updates, application/item status transitions, the
revision row (via the existing `withRevision` machinery — the two new
tables are registered in the revision scope map, `TABLE_SCOPE`, so
snapshot coverage includes them; additive, no behavior change), and
audit rows. Any failure rolls back everything; a partially-applied
application is impossible. The existing per-proposal approve route is
NOT used for batch apply (it is per-proposal by design and stays for
manual proposals).

### Invariant 7 — Full audit trail

Every applied item records: approving actor, application id, extract
claim index + kind + text, entity/predicate/object, evidence (artifact
ref `{runId, stepKey, inputName}`, quote, start, end), the previous
live value for supersedes, decided-at timestamp, and head revision.
Rejected applications and blocked items keep their verdicts and
reasons as audit. Audit history is never deleted.

### Invariant 8 — Simulations never enter this pipeline

A run is a simulation run iff `run.input.simulation === true` (no
schema change — this task adds no simulation column; the what-if idea
doc defines the flag's producer). An extraction from a simulation run
is refused at application creation (400 `SIMULATION_REFUSED`).
Simulation outputs are exploration artifacts; the canon boundary does
not admit them
under any flag or override.

### Invariant 9 — Impact is shown before approval; derived invalidation is recorded at apply

The review state includes the impact analysis: per APPLICABLE/CONFLICT
item, which live facts will be superseded (or that none will). The
approver confirms against the shown impact. At apply, the response
includes `invalidatedScopes` (entity ids whose facts changed) and the
application writes derived-invalidation intent for NF-WF-009; the
transaction commits canon + invalidation intent atomically (no
false-success projections).

### Invariant 10 — No scope creep at the canon gate

The application endpoints do not start runs, edit drafts, approve
text, publish chapters, or manage outlines. They contract, validate,
and apply extraction claims to canon — nothing else.

### Invariant 11 — Authorization is enforced server-side

`canon:manage` to create/revalidate an application; `canon:approve`
to approve/reject. Tenant scope resolves from stored rows (404 for
cross-tenant ids, never 403-disclosure). The UI never decides
permissibility.

## Outputs

### API routes (all under the existing canon router; `{error: CODE}` envelope)

Note: the new application routes are novel-scoped
(`/api/workspaces/:workspaceId/novels/:novelId/canon/applications/...`),
matching the rest of the canon router and Invariant 11's
404-on-cross-tenant rule. The pre-existing proposal approve/reject
routes are workspace-scoped (ADR-0008 §6) — the asymmetry is
deliberate and pre-existing, not introduced here.

| Method & path | Auth | Body | Success | Errors |
|---|---|---|---|---|
| `POST /api/workspaces/:workspaceId/novels/:novelId/canon/applications` | `canon:manage` | `{ runId: uuid, extractStepKey?: string, items: [{ claimIndex: int>=0, entity: { id: uuid } \| { kind: STORY_ENTITY_KINDS, name: string(1–300) }, predicate: string(1–200), object: { entityId: uuid } \| { text: string(1–2000) }, validFromChapter?: int(0–100000)\|null }] }` | 201 `{ id, status: "VALIDATED", headRevisionId, items: [{ id, claimIndex, kind, text, entityId\|null, entityName, predicate, object, validFromChapter, evidence: [{ inputName, quote, start, end }], verdict, verdictReasons: string[], conflictsWith?: { factId, statement } }] }` | 400 `INVALID_INPUT`, `SIMULATION_REFUSED`; 401 `UNAUTHENTICATED`; 403 `FORBIDDEN`; 404 `EXTRACTION_NOT_FOUND` |
| `GET /api/workspaces/:workspaceId/novels/:novelId/canon/applications/:applicationId` | `canon:read` | — | 200 full review state: application + items (as above) + `impact` (per item: `supersedesFactId \| null`) + `textDecision` (the run's 005 outcome, context only) + `decidedBy`, `decidedAt` when decided | 401/403/404 `APPLICATION_NOT_FOUND` |
| `POST /api/workspaces/:workspaceId/novels/:novelId/canon/applications/:applicationId/revalidate` | `canon:manage` | — | 200 `{ id, status: "VALIDATED", headRevisionId, items: [...] }` (fresh verdicts; status returns to VALIDATED from STALE) | 401/403/404; 409 `ALREADY_DECIDED` |
| `POST /api/workspaces/:workspaceId/novels/:novelId/canon/applications/:applicationId/approve` | `canon:approve` | `{ itemIds: uuid[1..], confirmConflicts?: boolean, expectedHeadRevisionId?: uuid\|null }` | 200 `{ applicationId, status: "APPLIED", headRevisionId, appliedItems: [{ itemId, factId, entityId, supersededFactId \| null }], invalidatedScopes: uuid[] }` | 400 `INVALID_INPUT`; 401/403; 404; 409 `STALE_APPLICATION`, `ALREADY_DECIDED`, `UNSUPPORTED_ITEM_SELECTED`, `DUPLICATE_ITEM_SELECTED`, `CONFLICT_NOT_CONFIRMED`, `VALID_FROM_CHAPTER_REQUIRED` (CONFLICT item selected without `validFromChapter` — existing window rule), `INLINE_ENTITY_KIND_MISMATCH` (inline entity name collides with an existing entity of a different kind) |
| `POST /api/workspaces/:workspaceId/novels/:novelId/canon/applications/:applicationId/reject` | `canon:approve` | `{ note?: string(≤2000) }` | 204 | 401/403/404; 409 `ALREADY_DECIDED` |

Notes:
- `claimIndex` refers to the index in the extract outcome's
  `proposals[]` array; duplicates in one request → 400.
- Inline `{kind, name}` entities are created inside the apply
  transaction (not at application creation); name uniqueness follows
  the existing entity rules (key derived as today).
- Fact `source` on minted facts: `{quote, start, end}` from validated
  evidence; `chapterVersionId` set when the draft has been applied to
  a manuscript chapter version, else null with the run reference in
  the audit payload.
- `textDecision` is read-only context (`APPROVED`/`REJECTED`/null);
  it never gates canon approval either way.

### Data model (new Prisma models; migration is a reviewed artifact)

- `CanonApplication { id, workspaceId, novelId, runId,
  extractStepKey, status: VALIDATED\|STALE\|APPLIED\|REJECTED,
  headRevisionId?, textDecision?, createdById, decidedById?,
  decidedAt?, createdAt }` (no `DRAFT` — creation runs validation
  synchronously and returns `VALIDATED` directly; no route ever
  produces a draft state. `STALE` is a **detected-not-persisted**
  logical state: the 409 `STALE_APPLICATION` is raised ephemerally at
  approve time with no state change (Invariant 4); the enum retains
  the value for forward compatibility, but no transition writes it.)
- `CanonApplicationItem { id, applicationId, claimIndex, kind, text,
  entityId?, inlineEntityKind?, inlineEntityName?, predicate,
  objectEntityId?, objectText?, validFromChapter?,
  evidence: Json, verdict, verdictReasons: String[],
  conflictsWithFactId?, canonFactId?, createdAt }`
- Status transitions (logical): `VALIDATED → STALE` (head moved,
  detected at approve); `STALE → VALIDATED` (via revalidate, which
  re-runs validation and persists `VALIDATED`); `VALIDATED → APPLIED` /
  `VALIDATED → REJECTED` (terminal). No other transitions.

### UI surface (thin; extends the NF-WF-007 page)

- The ProposalsPanel's NF-WF-008 banner gains the entry point:
  "Review for canon" → a review dialog/panel listing each claim with
  its citations, verdict chip (`APPLICABLE`/`CONFLICT`/`DUPLICATE`/
  `UNSUPPORTED` + reasons), the contracting controls (entity picker
  incl. inline-new, predicate input, object input, validFromChapter),
  impact preview (supersedes), and the approve/reject actions with
  the full decide-error mapping (STALE → revalidate affordance).
- `CONFLICT` items show the live fact side-by-side and require the
  explicit confirmation checkbox.
- Applied state shows per-item fact links + the audit note; the
  banner text updates to reflect applied/rejected state.
- en/id locale keys, English fallback, English error codes (007
  Invariant 9 pattern).

## Acceptance and verification

Testable; API-level tests drive the 006 template via
`workflow-test-driver.ts` (fake gateway, GAP-028) to produce real
extractions, then exercise the application routes. Component tests
mock at the HTTP/`useApi` boundary.

- [ ] **Unsupported claim blocked.** Extraction with a citation whose
  span is not in the draft (and one with an unresolvable `source`)
  → application created; items verdict `UNSUPPORTED` with reasons;
  approve selecting one → 409 `UNSUPPORTED_ITEM_SELECTED`; no canon
  fact exists for the claim afterwards; the item remains visible.
- [ ] **Evidence offsets exact.** A resolvable citation records the
  correct `(start, end)` and the minted fact's `source.quote` equals
  `artifactText[start:end]`.
- [ ] **Forced conflict.** Live fact `(e, p) = A`; extraction claims
  `(e, p) = B` → verdict `CONFLICT` with the live fact surfaced;
  approve without `confirmConflicts` → 409 `CONFLICT_NOT_CONFIRMED`;
  approve with confirmation + `validFromChapter` → old fact
  superseded, windows reconstructable as-of (old reachable before,
  new after); approve a superseding claim without
  `validFromChapter` → 409 (existing rule preserved).
- [ ] **Duplicate blocked.** Claim identical to live canon →
  verdict `DUPLICATE`; selection → 409 `DUPLICATE_ITEM_SELECTED`.
- [ ] **Stale application.** Move the canon head between validation
  and approval (direct fact write) → approve → 409
  `STALE_APPLICATION`, nothing applied; `revalidate` → fresh
  verdicts; approve → 200.
- [ ] **Atomicity.** Application with N items where a conflicting live
  fact is written after validation but before approve (sequential
  form — true mid-transaction concurrency is not deterministically
  forceable; the re-classification path is identical) → the whole
  apply rolls back: no facts minted, no entities created,
  application not `APPLIED`.
- [ ] **Audit trail.** After apply, each item's audit shows actor,
  extract claim index, evidence spans+offsets, and previous values
  for supersedes; retrievable via the application GET.
- [ ] **Simulation refused.** Extraction from a `simulation: true`
  run → 400 `SIMULATION_REFUSED` at application creation.
- [ ] **Text/canon separation.** Approving the 006 run creates zero
  canon facts; canon facts appear only after the application's
  approve. Component test: the 007 approve flow shows no
  canon-apply affordance beyond the 008 entry point.
- [ ] **Authorization.** Actor without `canon:manage` → 403 on
  create; without `canon:approve` → 403 on approve/reject;
  cross-workspace application id → 404.
- [ ] **Double-decide.** Approve twice → second is 409
  `ALREADY_DECIDED`; reject after approve → 409.
- [ ] **No-regression.** Full API suite green; `canon.test.ts`
  untouched and passing (existing proposal flow behavior unchanged);
  `pnpm lint`, `pnpm --filter @novelforge/web typecheck`,
  `nuxt build` clean.

## Migration and rollback

- One additive Prisma migration: `CanonApplication`,
  `CanonApplicationItem` (+ indexes on `(novelId, status)`,
  `(applicationId, claimIndex)` unique). Reviewed artifact; the
  migration must be idempotent-safe per the repo's DO-block
  convention (GAP-030).
- Rollback: down migration drops the two tables. SAFE only when no
  application is `APPLIED` (applied rows are audit history — the
  down migration MUST refuse when `APPLIED` rows exist; check in the
  migration or a pre-rollback guard). Canon facts/entities are never
  touched by rollback.
- No changes to existing tables.

## Documentation and handoff

- `docs/implementation/ISSUES-AND-GAPS.md`: new GAP entries for any
  deviation BEFORE workarounds (standing rule).
- `docs/implementation/progress.md` + `docs/14-progress/CURRENT.md`
  + `docs/implementation/test-matrix.md`: NF-WF-008 section on
  completion.
- The contract file stays frozen after review; deviations get GAP
  numbers, not silent edits.

## Open questions

1. **Model-assisted contracting.** Should a future enhancement
   suggest entity/predicate bindings from claim text (author still
   confirms)? Contract default: no — author-driven only. Is that
   the right permanent line, or should suggestion be in scope?
2. **Multi-run applications.** One run per application keeps the
   evidence chain simple. Is there a real need to contract claims
   across runs/chapters in one batch?
3. **validFromChapter defaulting.** The run's `chapterNumber` is
   offered as the UI default. Should the backend instead REQUIRE the
   author to choose explicitly (no default) to avoid thoughtless
   window-setting?
4. **CONFLICT confirmation strength.** Is per-item selection +
   `confirmConflicts` enough, or should CONFLICT approvals require a
   second distinct actor (four-eyes)?
5. **Retention.** Rejected applications and blocked items are kept
   as audit — forever, or is there a retention horizon?
6. **UI placement.** Extend the 007 ProposalsPanel review area, or a
   dedicated canon-review surface reachable from the Story Brain
   section? (007 owns the page shell; 008 needs a home.)

## Review record

(Reviewer: separate contract-reviewer actor, Muse Spark model family,
backend MODEL_UNVERIFIED per GAP-013. Contract SHA
`312f21500407d0bb25b35bb7d140fcbb4de8cf54` reviewed against HEAD
`5bc22aa61e54f22cfe6fb24b93ba2e40439ad063`.)

- **Verdict: CHANGES_REQUESTED** (no P1; 3 P2 normative findings F1–F3
  + 3 P3 F4–F6, all applied in the text above: F1 — evidence spans
  validated against the `prose` field of the referenced draft step's
  stored outcome (Invariant 2); F2 — simulation run defined as
  `run.input.simulation === true`, no schema change (Invariant 8);
  F3 — `DRAFT` dropped from the status enum (creation returns
  `VALIDATED`), `STALE → VALIDATED` added to transitions; F4 —
  atomicity test reworded to sequential form; F5 — new tables
  registered in the revision `TABLE_SCOPE`; F6 — novel-scoped routes
  noted as deliberate asymmetry vs workspace-scoped proposal routes.)
- **Backend fidelity verified strong**: canon router routes,
  `proposeCandidate`/`approveProposal` semantics (duplicate re-check,
  `validFromChapter`-required supersede, advisory + locked head CAS),
  C12.1 tri-state, all three `canon:*` capabilities, extraction
  schema `contains`-not-`minItems`, extract step inputs, the
  `DerivedRebuildIntent` table, GAP-030 DO-block convention — all
  confirmed against source. No path collisions for the 5 new routes.
- **Open questions adjudicated**: Q1 model-assisted contracting OUT
  (future enhancement); Q2 one run per application; Q3 keep UI
  default (run's `chapterNumber`) for `validFromChapter`; Q4
  single-actor per-item + `confirmConflicts` (four-eyes stays future);
  Q5 retention forever (consistent with audit invariant); Q6 extend
  the 007 ProposalsPanel review area.
- **Status after review**: contract DRAFT-frozen with findings
  applied; implementation may proceed. Reviewed 2026-10-05.
- **Implementation diff review** (independent reviewer, HEAD
  `8d28995`, 2026-10-05): **APPROVE_WITH_FINDINGS** — all 11
  invariants verified as pinned (author-driven contracting, evidence
  vs `prose`, conflicts + in-transaction re-check, stale basis +
  revalidate, text/canon separation, atomic apply, audit trail,
  simulation refusal, impact preview + invalidation intent, no scope
  creep, server-side auth). Checks: API 462/462 (20 files, incl.
  untouched `canon.test.ts`), web 48/48, story-versioning 17/17,
  lint clean, typechecks clean (3 web errors verified pre-existing
  in untouched files), nuxt build succeeds. GAP-028 respected (test
  driver/fake gateway); GAP-035 (COVERED_TABLES) and GAP-036 (VM
  reinstall) recorded before workarounds. Findings, all applied:
  F1 (P3) `STALE` documented as detected-not-persisted logical state
  in the data model; F2 (P3) `"STALE"` removed from the UI verdict
  union; F3 (P3) `VALID_FROM_CHAPTER_REQUIRED` and
  `INLINE_ENTITY_KIND_MISMATCH` added to the approve error table.
