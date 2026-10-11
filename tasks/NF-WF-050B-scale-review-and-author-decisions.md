# NF-WF-050B: SCALE review, author decisions and usable author workflow

Status: CLOSED / ACCEPTED — 2026-10-11. Live author-workflow acceptance
(scenarios 1–11) completed at dcb2f49 + reviewed repairs; repair set committed
as b7969de; criterion-to-evidence reconciliation in
docs/14-progress/050B-acceptance-reconciliation-2026-10-11.md shows all frozen
acceptance criteria satisfied. GAP-119 closed with the child; GAP-039 remains
OPEN (retains 050C + integrated acceptance + human screen-reader pass).
Historical status: IMPLEMENTED / SOURCE_REVIEWED / ACCEPTANCE_PENDING.
Integration update (2026-10-09): the author authorized merging external
`800cf3707d488f88cbc2447d1d992f3aeb6d89bf`. Separate technical/recovery
actors approve the submitted source; CURRENT and GAP-119 own exact local
checks and corrected external-report provenance. The original contract below
remains frozen; implementation acceptance does not close its complete
regression/live-author/publication gate or parent GAP-039. Do not redispatch
this child as implementation-not-started. The original baseline and proposed
interfaces below document the design boundary rather than present absence.
Milestones: M3/M5/M8; CAP-06; parent GAP-039; technical seams GAP-119.
Parent: [NF-WF-050](NF-WF-050-scale-evidence-workflow.md).
Spec: [ADR-0016](../docs/adr/ADR-0016-scale-evidence-and-author-decisions.md).
Baseline: `a0010c2`, reviewed 050A integrated through `843a263`.
Contract owner and proposed implementation coordinator: `/root`.
Separate gate/contract reviewer: `/root/review_mutations_034`.
Separate recovery/migration reviewer: `/root/review_recovery_034`.
Acceptance owner: project author; runtime model choice remains author-controlled.
External implementer assignment must be recorded before dispatch. One writer per
file; no implementation actor may approve its own submitted diff.

## Goal, dependency and evidence boundary

An author can label an immutable chapter version, understand its actual SCALE
assessment, decide a standing change or narrow exception, obtain a fresh review
and proceed through the same enforced API/worker publication gate. This child
implements S1 consumption and S2; it makes no model/gateway calls. S3 is 050C.

050A provides append-only validated evidence and strict head/branch/version/set
CAS. Its local 64/64 pre-merge receipt and separate technical approvals are in
[CURRENT](../docs/14-progress/CURRENT.md); they do not verify 050B. Existing
review/gate seams are source observations recorded in GAP-119, not new test
results. Every new symbol/schema/route below is PROPOSED until implemented.

Read START-HERE, AGENTS/CLAUDE, DELIVERY-PLAN, MODEL-EVIDENCE-POLICY,
MULTI-LLM-ORCHESTRATION, ENVIRONMENT-PREFLIGHT, task template, ADR-0016,
050A, the parent and the source/test paths below. Read the writer-workspace
design and DESIGN-TOKENS before UI work. Historical docs_compare is not active.
English artifacts; UI en/id keys and English fallback. No whole-manuscript
retrieval, guessed facts/approvals, provider hardcodes or new quota logic.

## Scope and interfaces

Allowed existing paths (only changes needed by this contract):

- `packages/database/prisma/schema.prisma`; one new migration under
  `packages/database/prisma/migrations/<new timestamp>_scale_review_decisions/`.
- `packages/ai-services/src/{scale-evidence,narrative,policy-errors,ai,revisions,platform}.ts`
  and `packages/ai-services/index.ts`.
- `packages/story-versioning/{impact,restore-scope,restore-scope.test}.ts`.
- `apps/api/src/{app,narrative-routes,story-health-routes}.ts` and
  `apps/api/src/services/{final-text-review,manuscript,publication}.ts`.
- `apps/worker/src/{publication-jobs,publication-jobs.test}.ts`.
- `apps/api/src/{manuscript,narrative,publication,state-consumers,scale-evidence}.test.ts`.
- `apps/api/src/services/platform.integration.test.ts`: only S2 novel-cleanup
  success/refusal and transaction rollback coverage.
- `apps/web/app/components/workspace/{NarrativePanel,PolicyList}.vue`,
  `apps/web/app/components/workspace/workspace-research-narrative-health.test.ts`,
  `apps/web/app/pages/workspaces/[workspaceId]/novels/[novelId]/index.vue`,
  `apps/web/app/composables/{useReceipts,useReceipts.test}.ts`,
  `apps/web/app/components/ai-studio/{EvaluationReceipts.vue,EvaluationReceipts.test.ts}`,
  `apps/web/app/i18n/{en,id}.ts`.
- This task, parent, ADR-0016 technical amendment, START-HERE, CURRENT,
  DELIVERY-PLAN, ISSUES-AND-GAPS and `docs/03-domain/NARRATIVE-RHYTHM.md`.

Proposed new paths:

- `packages/ai-services/src/scale-decisions.ts`: S2 author decision service.
- `packages/ai-services/src/final-text-review-gate.ts`: shared transactional
  receipt applicability check for API and worker, without HTTP/UI imports.
- `apps/api/src/scale-decision-routes.ts`: strict S2/context endpoints.
- `apps/api/src/scale-review.test.ts`, `scale-decisions.test.ts`,
  `scale-review-migration.test.ts`: real boundary, concurrency and upgrade proofs.
- `apps/web/app/components/workspace/ScaleReviewPanel.vue`,
  `ScaleReviewPanel.test.ts`, `ScaleReviewPanel.axe.test.ts`.

Everything else is forbidden without a separately reviewed amendment. Historical
migrations, snapshots and receipts are not rewritten. No new capability, beat
table, scene/event evidence adapter, novel standing table, extraction, AI setting,
dependency, deployment or working-database mutation is in scope. If another
fixture/caller actually needs a change, record it in GAP-119 and amend exact paths
before editing; never replace passing expectations with weaker assertions.

Reuse `createScaleEvidenceServices`, `ScaleEvidenceClaim`, quote/span/predecessor
validators, `scaleStandingOf`, `assessScaleAppropriateness`, `PolicyError`,
`advanceForMutation`, existing auth and the current locale/design components.
Extract a transaction-compatible SCALE context reader from the 050A service;
reuse it inside review/decisions/gates instead of nesting transactions or copying
claim validators. Its public wrapper retains 050A capability and tenant gates.

## Deterministic assessment contract

Keep overall `FinalTextVerdict` PASS/FAIL; do not add an enum verdict for unknown.
Add a nullable JSON `FinalTextReview.scaleReview` column (SQL `scale_review`).
Null denotes a legacy receipt, never new proof of SCALE completeness. Proposed
protocol 1 JSON contains:

- `protocol: 1`; `state: NOT_CONFIGURED | INCOMPLETE | WITHIN_REACH | VIOLATION |
  EXCEPTED | NO_OPERATIVE_CONFLICT`; `blocking: boolean`.
- `pins`: chapterVersionId, checked-out branchId, sourceRevisionId, latest
  evidenceSetId (nullable), policy fingerprint (including explicit absence),
  applicable approved exception outcome ID (nullable).
- `claims`: every evidence claim's index, scale, reach, gap, ok, source span/quote
  and whether an approved exception covers that exact claim.
- `missingData`: bounded items with code, field/source, reason, explanation,
  illustrative example and nextAction. Examples are explicitly hypothetical.

Fingerprint canonical JSON with lexicographically sorted object keys, preserved
array order, SHA-256 UTF-8. Hash the SCALE policy presence, id, hardness,
hardReason and payload; never use updatedAt or row ID alone as a policy version.
Absence has an explicit representation; creating/deleting/replacing a policy
changes applicability. No FK from a receipt pin to mutable policy/decision rows;
validate tenant/identity at read and retain the snapshot/fingerprint.

| Observed input | Result | Gate effect |
|---|---|---|
| No SCALE policy | NOT_CONFIGURED | No SCALE hold; never label SCALE PASS |
| Configured HARD; required standing/evidence malformed, missing or stale | INCOMPLETE | FAIL overall, hold with SCALE_ASSESSMENT_INCOMPLETE |
| Configured SOFT; same incomplete input | INCOMPLETE | Advisory only |
| CURRENT CONFLICTS and all actual claims inside validated reach | WITHIN_REACH | No SCALE hold |
| Complete claims beyond reach, HARD | VIOLATION | FAIL, HARD_POLICY_VIOLATION unless a valid exception covers every violating claim |
| Complete claims beyond reach, SOFT | VIOLATION | Advisory only |
| Complete claims with approved scoped resolution of all violations | EXCEPTED | No SCALE hold; display decision and original violations |
| CURRENT explicit NO_OPERATIVE_CONFLICT and valid policy | NO_OPERATIVE_CONFLICT | Complete quiet chapter; zero conflict comparisons |

`access: []` is valid explicit data; missing/null/non-array/unknown-scale access
is invalid. Fix `isValidScalePayload` and its error wording; reputation stays an
integer 0..100 descriptive value, without a new threshold. Standing must validate
even for a quiet chapter. Missing/malformed configured HARD SCALE fails closed;
other policy kinds retain their existing malformed-on-read behavior.

Assess every ACTION/STAKES/CONSEQUENCE claim using its own scale. A mention is
not an operative conflict; no inference from title, standing, prose or a model.
Findings cite set ID, claim index, immutable version/span, policy and decision.
INCOMPLETE never creates a fabricated proved violation: hardViolations includes
only proved hard violations. Overall FAIL also includes blocking INCOMPLETE;
gate consumers must read scaleReview, not infer blocking from array length.
Existing non-SCALE hard failures still block an otherwise WITHIN_REACH chapter.
Guidance distinguishes missing labels, stale source, invalid standing/access
and unreviewed decisions; no pending proposal satisfies a required assessment.
An unrelated unused proposal does not invalidate complete author-authored data.

## Review consistency and all consuming gates

`reviewFinalText` retains its existing inputs and adds protocol 1 scaleReview to
its output/receipt. Require an owned current version (foreign version 404,
owned obsolete version 409 REVIEW_STALE); never review branch A against main B.
One transaction locks novel NO KEY UPDATE -> checked-out branch UPDATE ->
chapter UPDATE, re-reads checkout/currentVersion/head/policies/latest set and
applicable decision, validates retained evidence, computes and upserts receipt.
FinalTextReview.revisionId remains non-null. A headless participating branch
refuses409 REVIEW_STALE with no receipt writes and an explicit missing-baseline
explanation; never borrow main's head or manufacture a revision. The context
reader may still return a nullable head for guidance/050A authoring.
No LLM/human wait in that transaction; no story-head advance for review itself.
An older evaluator cannot overwrite a newer receipt from a different snapshot.
Preserve existing version-keyed receipt replacement; audit truthful pins/outcome.

Proposed `checkFinalTextReviewGate(tx, {workspaceId, novelId, chapterId,
chapterVersionId})` returns `{ok:true}` or `{ok:false, code}` with codes
REVIEW_STALE, SCALE_ASSESSMENT_INCOMPLETE, HARD_POLICY_VIOLATION. The caller
must hold the lock order above; this is a transaction-client-only helper.
It re-reads current context, validates protocol/schema and checks ALL pins before
trusting verdict. Invalid/mismatched pins -> REVIEW_STALE; fresh incomplete HARD
-> SCALE_ASSESSMENT_INCOMPLETE; fresh proved HARD failure -> HARD_POLICY_VIOLATION.
Legacy/null receipts are REVIEW_STALE when any SCALE row is present. When SCALE
is absent, preserve legacy non-SCALE PASS/FAIL compatibility; no new SCALE proof
is inferred. New protocol receipts compare explicit policy absence too.

- `latestReceipt` must expose SCALE status/pins, not silently reduce it to verdict.
- `assertPublishReviewGate` wraps the shared result in typed PolicyError.
- `setStatus` re-reads chapter/version/status inside its locked transaction,
  gates before writes, and advances the same participating branch. Preserve
  DRAFT exit/PUBLISHED gate coverage and ungated PUBLISHED -> IN_REVIEW unpublish.
- Immediate publication uses tx, not outer db. Re-read checkout under lock and
  preserve main-only publishing. API and scheduled worker use the same helper;
  remove the worker's independent verdict-only decision logic.
- Worker keeps existing refusal -> UNPUBLISHED + audit, successful job semantics;
  record the new incomplete code distinctly. Never publish on a stale review.
- Receipt list serialization in ai.ts/useReceipts/EvaluationReceipts preserves
  protocol fields and displays legacy/current/stale evidence honestly.

Head changes caused by status, scheduling, standing changes, restore or unrelated
story mutations conservatively stale 050A data. Do not weaken 050A or silently
repin sets/exceptions. The author must explicitly append a fresh assessment and
review after such a change before the next guarded action. Scheduling can remain
ungated as today, but UI must explain that review at the post-schedule head is
required before fire time; edits afterwards can still cause refusal. Successful
publication consumes the fresh receipt before advancing its revision; that
post-publication head change does not retroactively unpublish released text.

## S2 storage, decisions and authorization

Propose two append-only OPERATIONAL tables, outside COVERED_TABLES:

- `ScaleDecisionProposal` / `scale_decision_proposals`: UUID id, workspace/novel,
  chapterVersionId, sourceBranchId, nullable sourceRevisionId/evidenceSetId,
  policy snapshot/fingerprint, monotonically allocated proposal sequence per
  (branch, chapterVersion), kind STANDING_CHANGE or CHAPTER_EXCEPTION,
  strictly validated JSON payload, proposerUserId, reason (1..4000 chars),
  optional predecessor proposal ID for alternatives, createdAt TIMESTAMP(3).
- `ScaleDecisionOutcome` / `scale_decision_outcomes`: UUID id, proposalId unique,
  same tenant/version/branch, monotonically allocated decision sequence per
  (branch, chapterVersion), action APPROVE/REJECT/ALTERNATIVE, actorUserId,
  reason (1..4000), nullable alternativeProposalId/resultRevisionId, createdAt
  TIMESTAMP(3). Uniqueness on (branch, chapterVersion, sequence) provides CAS
  history; latest outcome ID is the decision-head token. No mutable status row.

Proposal sequence has its own (branch, chapterVersion, sequence) uniqueness;
it is independent of outcome sequence. Creating a proposal/alternative allocates
that proposal sequence under the same locks, without advancing the decision head.

FK chapter versions and actors Restrict; proposal predecessor/outcome relations
Restrict; source branch/revision/evidence IDs must be owned and stored provenance
must validate. No FK to NarrativePolicy (restore deletes/reinserts it). Parent
novel/workspace cleanup explicitly deletes outcomes then proposal chains before
versions/actors; never rely on cascades crossing retained Restrict chains.
The production seam is platform.ts:deleteNovel: one authorized novel-scoped
transaction locks the novel, removes only its S2 rows and attempts the existing
parent delete. Any existing canon/workflow restriction rolls back ALL S2 cleanup;
do not erase history on a refused deletion. No new workspace/user deletion API:
owned test fixture cleanup follows the same explicit dependency order.
Indexes support bounded novel/branch/version lists and proposal lookup.
Validate retained JSON on reads; arbitrary casts are not accepted proof.

STANDING_CHANGE payload: complete `standing {scale, access, reputation}` plus
hardness/hardReason for initial policy creation or explicit policy replacement.
It changes only the existing approved SCALE NarrativePolicy, not CanonFact or
character state. CHAPTER_EXCEPTION payload: nonempty unique claimIndices
covering identified current complete violations and explanatory reason; max100.
Exceptions cannot complete missing data, bless unverified sources, override
other HARD policies/hard canon or alter standing. Latest approved applicable
exception for the exact set/policy/head is effective; old exceptions remain
history. Replacing evidence deliberately expires an exception, not revives it.

Proposed endpoints under `/api/workspaces/:workspaceId/novels/:novelId`:

- GET `/chapters/:chapterId/scale-review-context`: server-derived current
  version/branch/head, latest set, policy+fingerprint, decision head, applicable
  exception, receipt/applicability and checklist. One coherent read snapshot.
- POST `/chapters/:chapterId/scale-decisions`: kind/payload/reason plus REQUIRED
  chapterVersionId, expectedBranchId, nullable expectedHeadRevisionId,
  expectedSetId, expectedDecisionId and exact expectedPolicyFingerprint.
- GET same path: version query, beforeSequence/limit (default20, max100); bounded
  proposals descending by proposal sequence, each with nullable unique outcome.
  Include undecided proposals; beforeSequence applies to PROPOSAL sequence.
  Return `{items, nextBeforeSequence}`; take limit+1, cursor is the last returned
  item's sequence when more exist, never the omitted item's sequence.
- POST `/chapters/:chapterId/scale-decisions/:proposalId/decision`: action/reason,
  same required expectations; ALTERNATIVE requires a new strictly validated
  payload of the same kind, atomically linked as a new pending proposal.
  APPROVE/REJECT forbid alternative payload. Actor/time/sequence are server-set.

POST proposal returns201 `{proposal, decisionHeadId}`. POST decision returns200
`{outcome, alternativeProposal:null|proposal, currentHeadRevisionId}`. New JSON
schemas are strict at every level; reject client actor/time/sequence IDs and
unknown fields. Reasons are trimmed 1..4000 chars; standing enums match the eight
existing values, access contains at most eight unique values, claim indices are
integers0..99. Decision/proposal bodies are bounded to64KiB; the unchanged 050A
append route retains its separate existing body/count/text limits.

Membership/novel/source gates precede diagnostic state; unauthenticated401,
foreign404, insufficient capability403, invalid shape400, stale/duplicate409.
Read requires chapter:read AND canon:read; proposal requires chapter:update AND
canon:manage; decision additionally requires canon:approve. Enforce in exported
services as well as routes; UI grants never confer authority.
Lock novel -> checked-out branch -> chapter; re-read all required expectations
before any write. Proposal/outcome/source must match tenant/version/branch.
Stored proposal branch/head/version/set/policy pins must also match current
context at decision time; current client expectations cannot repin an old
proposal. A stale proposal requires a new proposal, with the old record retained.
Duplicate decision409 with zero writes; concurrent stale expectedDecisionId409.
REJECT records one outcome without policy/head mutation. ALTERNATIVE records
one outcome + new pending proposal; it is not approval. Pending creation and
rejections do not change the receipt's applicable approved exception pin.

APPROVE STANDING_CHANGE uses new HIGH `scale.standing.approve` classification.
Before any policy write call advanceForMutation with expected head, actual
branch, narrative_policies, revision/change-set and mandatory pre-change
checkpoint plus durable rebuild intent in the SAME transaction. A missing
baseline/checkpoint refuses all writes. Then update policy and outcome with
resultRevisionId; any failure rolls back both. Approved policy is REWOUND;
decision audit is OPERATIONAL and never automatically re-applied after restore.
Exception approval changes no story truth/head, but atomically appends outcome.

Existing SCALE put/delete endpoints cannot bypass these pins or lock ordering.
Route standing changes/initialization through the same explicit approve service
(an existing direct write needs explicit authorDecision:APPROVE, the same caps,
reason/expectations and atomically recorded proposal/outcome). SCALE hardness-only
changes/deletion need reason, branch/head/policy CAS and branch-aware revision
under the same lock order; stand-changing direct calls without explicit approval
are refused400. ALL policy puts/deletes, including non-SCALE, must lock and
advance the checked-out branch in narrative.ts rather than the main-only wrapper.
Otherwise a non-SCALE HARD edit could retain a false fresh PASS on branch B.
Keep non-SCALE payload/capability/error semantics compatible; do not change the
global revision helper or unrelated callers. No main-targeted createWithRevision
shortcut for S2 HIGH.
For SCALE PUT, extend the existing body with REQUIRED chapterId,
chapterVersionId, expectedBranchId, nullable expectedHeadRevisionId/expectedSetId/
expectedDecisionId, expectedPolicyFingerprint and reason; authorDecision is
required APPROVE when standing changes or the policy is initialized. Retain the
existing kind/hardness/hardReason/payload fields and return NarrativePolicyView.
For SCALE DELETE, use the same required context/reason body without payload or
authorDecision; no novel-global deletion via an unpinned empty-body request.
Non-SCALE requests retain their existing schemas. Initial standing approval may
pin an absent/unassessed set; it does not complete evidence or release a gate.
Exception approval requires a CURRENT complete set and validated standing.

## Usable author UI

ScaleReviewPanel in NarrativePanel receives the workspace's selected chapter;
index.vue wires actual saved version context. No selection/unsaved edits -> clear
save/select instruction, not invented IDs or offset conversion. Use context API
to fetch server IDs; ChapterDetail currently lacks a version UUID.
Expose validated standing/access fields and hardReason, 050A claim creation/
replacement/history and NO_OPERATIVE_CONFLICT, current/stale review, per-claim
reach/gap, full deterministic checklist, S2 proposal/approve/reject/alternative
and rerun-review actions. No raw JSON-only editor as the completion surface.
Offsets/quotes refer to saved sanitized HTML's UTF-16 positions, not editor DOM
or plain-text offsets; provide a saved-source excerpt/selection aid and server
validation. Never submit an unverified optimistic text-selection conversion.

Loading/empty/403/404/400/409/network states, disabled duplicate submit, focus
and keyboard behavior follow the design system. Invalidate state on novel,
chapter, save, branch or policy change; ignore late requests for old selections.
Show fresh-assessment requirements after head-changing actions. UI status is
informational; backend independently enforces every mutation and release gate.
Checklist labels/explanations/examples use translation resources en/id + fallback;
user-authored prose/reasons and canonical scale machine values retain provenance.
No AI button/settings/guidance call until 050C.

## Bounded implementation order and acceptance

Execute serial reviewed slices under this contract; one writer per file.
Never claim the umbrella done after the first slice or dispatch dependent UI
against an unfrozen server contract.

1. Add reviewed nullable receipt JSON and OPERATIONAL decision storage; fix empty
   access, freeze exported context/pin/gate shapes and HIGH operation. Prove empty
   and populated upgrades using private migration copies, genuine Prisma ledger,
   unchanged legacy data/checksums, null legacy receipts and restore classification.
2. Implement real S2 authorization/CAS/checkpoint/outcome boundaries and the
   transactional review/shared API-worker gate; separately review source diff.
3. Wire localized author flow and receipt display; verify end-to-end decisions,
   fresh review and immediate/scheduled gate behavior. Separately review exact
   final source, migrations and UI; update only evidenced capability scope.

Required negative/acceptance scenarios (write red proof before nontrivial code):

- VILLAGE standing vs KINGDOM operative claim: HARD fails, SOFT advises;
  approved KINGDOM access passes, access[] validates, reputation grants nothing.
- Missing set, stale set/head, missing standing, malformed HARD payload and
  quiet chapter are distinct; malformed SOFT remains advisory. Mixed claims
  evaluate all; exceptions covering only some violations cannot release a gate.
- Replacement set WITHOUT head movement, absent policy -> HARD, policy deletion/
  replacement, branch switch, restore and later saved text invalidate receipt.
- Headless branch review returns409 without a receipt; pending proposals paginate
  without omissions; non-SCALE policy edits on branch B advance B and invalidate
  its prior receipt without changing main.
- Under actively held locks, concurrent save/head/policy/evidence/exception
  changes either serialize into fresh review or refuse, never publish stale text.
- Direct setStatus, immediate publication and real scheduled worker all enforce
  pins/incomplete/violation; scheduled refusal retains audit and no public flip.
- Unauthorized direct services and routes, foreign source/proposal/predecessor,
  malformed retained JSON, duplicate and concurrent decisions write nothing.
- REJECT/ALTERNATIVE preserve approved standing; APPROVE writes one checkpoint,
  revision, policy, outcome and rebuild intent atomically; failed checkpoint,
  invalid policy or stale expectations leave no partial effect.
- Exception approved for one version/branch/set/policy does not affect another;
  no missing-data/canon/non-SCALE bypass. Restore rewinds policy, preserves
  decision history, expires applicability; old snapshots remain reconstructable.
- Chapter/version deletion with retained decisions refuses409; owned parent
  cleanup succeeds without deleting another novel's history.
- Real UI author flow includes source validation, no-conflict declaration,
  complete checklist, stale recovery, all decisions, both locales and missing-key
  fallback; delayed old selection responses cannot restore stale controls.

## Commands, preflight, migration and rollback

Document-only review needs Git/Node, not newly provisioned services. For coding,
follow ENVIRONMENT-PREFLIGHT: Ubuntu native dependencies, no Docker; Windows
reuses existing Docker/data. Integration/migration tests use owned disposable
databases and isolated Redis/job namespace if a real queue is exercised. Do not
run database db:deploy against the default working environment. Native host
readiness and runtime identity are verified anew, never copied from this receipt.

Expected checks, not executed results:

```text
pnpm --filter @novelforge/database generate
pnpm --filter @novelforge/database exec prisma validate
pnpm exec vitest run apps/api/src/scale-review.test.ts apps/api/src/scale-decisions.test.ts apps/api/src/scale-review-migration.test.ts
pnpm exec vitest run apps/api/src/scale-evidence.test.ts apps/api/src/manuscript.test.ts apps/api/src/narrative.test.ts apps/api/src/publication.test.ts apps/api/src/state-consumers.test.ts apps/worker/src/publication-jobs.test.ts
pnpm exec vitest run packages/story-versioning/restore-scope.test.ts
pnpm --filter @novelforge/ai-services typecheck
pnpm --filter @novelforge/api typecheck
pnpm --filter @novelforge/worker typecheck
pnpm --filter @novelforge/web typecheck
pnpm --filter @novelforge/web exec vitest run app/components/workspace/ScaleReviewPanel.test.ts app/components/workspace/ScaleReviewPanel.axe.test.ts app/components/workspace/workspace-research-narrative-health.test.ts app/composables/useReceipts.test.ts app/components/ai-studio/EvaluationReceipts.test.ts
git diff --check
```

Run changed-source ESLint with an explicit frozen file list. No zero-selected,
skipped-required, mocked-only API/worker gate or schema-only UI acceptance.
New proposed tests exist only after implementation. Record exact revision,
commands/counts/environment, negative failure proof and cleanup separately.

Additive tables and nullable JSON column, no historical backfill. Avoid new
COVERED_TABLES keys: existing snapshots cannot reconstruct an added REWOUND
exception table without compatibility work. Test old snapshots lacking
scale_review restore as legacy/null, not fabricated current proof. Do not add
Restrict FKs to mutable policy or rewound receipt rows. Parent/version cleanup,
timestamp parity, no-copy-secrets private fixtures and success/failure migration
source isolation are mandatory.
Application rollback retains data/history; keep the fresh gate patch or pause
guarded approval/publication and the publication worker before an older verdict-
only binary is run. An old publisher is not a safe rollback merely because
storage is additive. No destructive down migration or live deployment approval.

## Handoff and review manifest

This contract is documentation only; no feature tests or migrations have run.
Both separate reviewers APPROVE the technical contract and ADR amendment on
2026-10-09. Initial findings were corrected: parent cleanup now specifies a
bounded production path and required rollback proof; the contract requires all
policy mutations to advance the checked-out branch, a no-write headless review
refusal and independent pending-proposal pagination. This acceptance is not
implementation completion.
Manifest identity is recorded outside this file in CURRENT after final edits.
GAP-119 closes only with implementation proofs; GAP-039 additionally retains
050C and full author-workflow acceptance. No silent S3 scope reduction.

Engram attribution has no authoritative runtime session ID (GAP-021). Do not
invent one or claim saved memory. This task/CURRENT are fallback checkpoints:
recover Git state, role, task manifest, affected sources and next unfinished
slice after context reset. Record the runtime implementer before dispatch and
review the submitted implementation independently of this contract acceptance.
