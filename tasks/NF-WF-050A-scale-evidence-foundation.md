# NF-WF-050A: Version-bound SCALE evidence foundation (S1)

Status: IMPLEMENTED (2026-10-09; implementation complete, review pending).
Implementation: schema + migration (reviewed APPROVE_WITH_FINDINGS, P2s fixed,
deployed to scratch), service (createScaleEvidenceServices), routes
(/api/workspaces/.../scale-evidence), manuscript delete 409, restore-scope
OPERATIONAL, 22 acceptance tests (9/22 pass; GAP-118 fixture alignment OPEN).
Typecheck (ai-services, api) clean; ESLint clean; git diff --check clean.
GAP-039 remains OPEN.
Milestones: M3/M5/M8; capability CAP-06; issue GAP-039.
Parent: [NF-WF-050](NF-WF-050-scale-evidence-workflow.md).
Decision: [ADR-0016](../docs/adr/ADR-0016-scale-evidence-and-author-decisions.md).
Baseline: `7c3616d` on `main`; preserve unrelated edits.
Contract author and assigned future implementer: local coordinator `/root`.
Separate contract/implementation reviewer: `/root/review_recovery_034`.
Separate contract consistency reviewer: `/root/review_mutations_034`.
Model choice is runtime-controlled; no requested/resolved model is asserted.
Acceptance owner: project author. READY requires separate contract approval;
implementation requires separate exact-diff review, never self-approval.

## Outcome and boundary

Provide an authorized, tenant-isolated API to append and inspect complete
author-authored assessments of operative conflicts in one saved chapter version.
Absence, explicit no-conflict declarations and stale assessments remain distinct.
This is an assessment annotation, not canon or a final-review verdict. S1 does
not change protagonist standing, infer events, approve text or enable AI.

050B owns consumption by final-text review, HARD incomplete/violation gates,
SOFT guidance, standing changes/exceptions, receipt pins and the localized
author UI. 050C owns optional AI proposals. Until those gates pass, the existing
SCALE self-comparison defect remains OPEN; 050A must not claim it is repaired.

## Required reading and verified source facts

Read START-HERE, AGENTS/CLAUDE, CURRENT, DELIVERY-PLAN, task template,
MODEL-EVIDENCE-POLICY, MULTI-LLM-ORCHESTRATION and ENVIRONMENT-PREFLIGHT.
Read ADR-0016 and the parent, then these exact sources/callers:

- `packages/database/prisma/schema.prisma`: Chapter, ChapterVersion, Scene,
  StoryEvent, NovelBranch, Revision and FinalTextReview.
- `packages/narrative-rhythm/scale.ts`, `vocabulary.ts`, `scale.test.ts`.
- `packages/ai-services/src/manuscript.ts`, `canon.ts`, `revisions.ts`,
  `narrative.ts`; `packages/ai-services/index.ts`.
- `packages/auth/authorization.ts`; `packages/story-intelligence/index.ts`
  and the exported `verifySpan` implementation.
- `packages/story-versioning/snapshot.ts`, `restore-scope.ts`,
  `restore-scope.test.ts`.
- `apps/api/src/manuscript-routes.ts`, `platform-routes.ts`, `app.ts`,
  `services/manuscript.ts`, `services/final-text-review.ts`, `manuscript.test.ts`.

Observed at baseline: ChapterVersion holds sanitized HTML and is append-only;
Scene is mutable structure without text spans. Current final-text review uses
standing.scale as proposal.scale and discards the result. `verifyEvidenceQuote`
is exported from ai-services; `verifySpan` from story-intelligence. Restore
classification is a closed seven-class contract, including OPERATIONAL.
`advanceForMutation` only accepts snapshot-covered tables. These are inspected
source facts, not newly executed integration evidence.

## Exact proposed storage contract

Add one Prisma model `ScaleEvidenceSet`, mapped to `scale_evidence_sets`.
No conflict/beat/entity-scale table or mutable current-set pointer is needed.

| Field | Required semantics |
| --- | --- |
| id | Server-generated UUID primary key. |
| workspaceId, novelId | UUID foreign keys, tenant scope, existing parent-deletion Cascade convention. |
| chapterVersionId | UUID FK ChapterVersion, onDelete Restrict; submitted version belongs to the scoped chapter/novel. |
| sourceBranchId | UUID FK NovelBranch, onDelete Restrict; server checked-out branch. |
| sourceRevisionId | Nullable UUID FK Revision, onDelete Restrict; null represents an actual headless branch, never omitted provenance. |
| sequence | Positive integer, monotonic within `(sourceBranchId, chapterVersionId)`. |
| declaration | Database enum `CONFLICTS` or `NO_OPERATIVE_CONFLICT`. |
| explanation | Nonempty trimmed text, max 4,000 characters, including coverage rationale. |
| conflictsJson | JSON array validated against the frozen claim schema below; not an arbitrary dictionary. |
| previousSetId | Nullable self-FK Restrict, exact previous set for this branch/version; null for first set. |
| actorUserId | Authenticated User UUID FK Restrict; server-resolved, never supplied by client. |
| createdAt | Server timestamp; never determines precedence. |

Add unique `(sourceBranchId, chapterVersionId, sequence)` and an index supporting
tenant-scoped branch/version history by sequence. Add database CHECKs for positive
sequence, JSON array shape and declaration/array cardinality coherence.
Service validation checks cross-FK tenant consistency and all JSON fields on
write and safe serialization on read; malformed retained rows fail explicitly.
No update/delete API; replacing a set appends a whole set and retains its predecessor.

Classify the new table OPERATIONAL in restore-scope. Keep COVERED_TABLES and
snapshot format unchanged. Do not advance story revisions/checkpoints for an
annotation or pass this uncovered table to `advanceForMutation`. The immutable
set, predecessor, actor and sequence are the authoritative assessment audit.
An optional existing audit-log notification is not its correctness boundary.

## Operative conflict and quote schema

Eight scale labels only: PERSONAL, FAMILY, VILLAGE, TOWN, CITY, PROVINCE,
KINGDOM, EMPIRE; reuse the existing vocabulary, do not introduce numeric tiers.
Each conflict is a strict object:

```ts
{
  scale: NarrativeScale;
  relevance: "ACTION" | "STAKES" | "CONSEQUENCE";
  explanation: string; // trimmed, 1..4000 chars: why this scale is operative
  source: { start: number; end: number; quote: string };
}
```

`source` refers only to the enclosing immutable ChapterVersion.content.
Offsets are nonnegative integer JavaScript UTF-16 offsets into stored sanitized
HTML, using `verifySpan` bounds semantics, not plain-text/byte offsets. Verify
quotes using existing `verifyEvidenceQuote`, including inline HTML/whitespace
behavior. Quote is trimmed, 1..2,000 characters; enforce a nonempty prose span.
Maximum 100 claims per set. Reject exact duplicate claims; overlapping spans
are allowed when they support distinct explained operative conflicts.

CONFLICTS requires 1..100 claims. NO_OPERATIVE_CONFLICT requires an empty array
and explicit coverage explanation. Both affirm the author's assessment of the
whole saved chapter; missing tags are never converted to a no-conflict result.
Mentioning an empire, character rank or place alone is not operative conflict.
The author must explain action, stakes or consequence supported by the quote.
Reject absent relevance/explanation; do not invent a keyword classifier or
claim schema-valid quotes prove semantics. Semantic correctness is an author
attestation and review responsibility, not a model-confidence threshold.

Deliberate S1 bound: chapter-version text anchors only. No scene/event IDs or
live foreign keys in claims. Scene lacks immutable prose; structured events
are mutable/restorable. Their adapters require a later reviewed provenance
contract. S1 does not require a beat table, every scene or invented conflict.

## Frozen service and HTTP contract

New service in ai-services: `createScaleEvidenceServices({ db })` with methods
`readCurrent`, `listHistory`, `appendSet`. Follow existing service tenant gates;
HTTP code remains in API routes. Register once in `apps/api/src/app.ts`.
All routes use existing authenticated session cookies and strict Zod schemas.
POST has a 4,000,000-byte route body limit so valid bounded claim arrays,
Unicode and JSON escaping fit; retain the field/count limits independently.
HTTP base: `/api/workspaces/:workspaceId/novels/:novelId/chapters/:chapterId/scale-evidence`.

- GET base: current assessment for the server currentVersionId and checked-out
  branch. Return `{ chapterVersionId, branchId, currentHeadRevisionId,
  assessment, status, staleReasons }`. `assessment` is null or the latest set;
  status is UNASSESSED, CURRENT or STALE. An unsaved chapter returns null version
  and UNASSESSED. Never fill absence with historical or another branch's evidence.
- GET `/history`: require `chapterVersionId`, optional positive integer
  `beforeSequence`, `limit` default 20/max 100. Resolve checked-out branch on the
  server. Return `{ items, nextBeforeSequence }`, ordered sequence descending;
  cursor is exclusive. Version must belong to route chapter. Reading older
  version history is allowed; current applicability is never implied.
- POST base: strict body `{ chapterVersionId, expectedBranchId,
  expectedHeadRevisionId, expectedSetId, declaration, explanation, conflicts }`.
  UUID fields; expectedHeadRevisionId and expectedSetId are REQUIRED nullable
  UUIDs, not optional. Client cannot set actor, sequence, timestamp or branch.
  Return 201 with the persisted set and CURRENT applicability. The set's branch
  and revision come from authoritative locked reads, not client provenance.

Reads require `chapter:read`. Writes require BOTH `chapter:update` and
`canon:manage`: source changes are author assertions, not editor suggestions.
Reuse capabilities, add no role or LLM authority. Viewers/editors cannot write
without those capabilities; test the actual role matrix. Non-members/foreign
novels, chapters or versions return the existing tenant-safe 404; authenticated
members lacking a capability get 403. Invalid schema/quote returns existing
400 validation mapping; unauthenticated returns 401. Do not add a second global
error handler or reveal foreign entity existence in diagnostics.

409 stale branch/head/set/current-version conflicts use existing ConflictError
mapping and `currentHeadRevisionId` where available. Client refetches and lets
the author revise; no blind retry/automatic rebase. Repeating a successful POST
with its old expectedSetId returns 409, not a second assessment or fake success.

## Concurrency, applicability and recovery

One DB transaction locks novel FOR NO KEY UPDATE, checked-out branch FOR UPDATE,
then chapter FOR UPDATE, following `lockManuscriptBranch` order. Do not use a
main-branch-only helper. Recheck tenant/version ownership, currentVersionId,
expectedBranchId and null-safe expectedHeadRevisionId under those locks.
Read latest branch/version set by sequence and compare null-safe expectedSetId.
Append sequence + 1 and previousSetId atomically. No unlocked max/count allocation,
no LLM call inside transaction. Failure leaves no row or predecessor change.
Concurrent appends from the same expectation yield one 201 and one 409.

Current means: latest set for the current chapter version and checked-out branch,
with sourceRevisionId equal to that branch's actual current head (null-safe).
Any head change conservatively makes existing evidence STALE, even if unrelated;
return SOURCE_REVISION_CHANGED. Changing text produces UNASSESSED for the new
version, leaving old history intact. Checkout resolves that branch's own latest
set only; no inheritance from main. Restoration cannot resurrect applicability
by timestamp or identical text: its new head makes prior sets stale.
This conservative S1 ceiling can later be narrowed by a separately reviewed
dependency fingerprint; do not implement speculative ancestry/fingerprint logic.
Read current version, checkout, branch head and latest set in one consistent
database snapshot (RepeatableRead transaction); never combine independently
read values into a false CURRENT response during a concurrent save/checkout.

Full and selective restore never rewind/delete sets. Source revision/branch and
chapter-version history remain retained. RESTRICT citations mean deleteChapter
must detect referenced versions under its existing transaction/locks and return
a useful 409 instead of an uncaught FK 500. Include the concurrency race with
assessment creation; do not erase assessments to permit deletion. Novel/workspace
whole-parent deletion follows existing cascades, separately from chapter deletion.
No new branch-deletion API; existing operations must not delete retained source
branches/revisions. Test parent cleanup against actual FK ordering.

050A never invalidates or issues final-review receipts itself. 050B must pin the
selected assessment ID, source revision/version and relevant policy versions;
assessment replacement must invalidate applicability even when story head does
not change. Restored historical receipts cannot bypass those checks. Absence,
stale evidence and invalid schema must remain usable incomplete inputs for
050B's HARD hold and deterministic missing-data explanations/examples.

## Allowed implementation paths

Everything else is forbidden without a reviewed contract amendment:

- `packages/database/prisma/schema.prisma` (model, enum, inverse relations only).
- `packages/database/prisma/migrations/20261008_nf_wf_050a_scale_evidence/migration.sql` (new reviewed additive artifact).
- `packages/ai-services/src/scale-evidence.ts` and `packages/ai-services/index.ts` (new service/typed exports).
- `apps/api/src/scale-evidence-routes.ts`, `apps/api/src/app.ts` (registration).
- `apps/api/src/services/manuscript.ts` (citation-aware deleteChapter only).
- `apps/api/src/scale-evidence.test.ts` (service/routes/recovery/migration negatives).
- `apps/api/src/manuscript.test.ts` (deletion regression only).
- `packages/story-versioning/restore-scope.ts` and `restore-scope.test.ts` (classification).
- This task, parent, ADR-0016, START-HERE, CURRENT, DELIVERY-PLAN and
  ISSUES-AND-GAPS (precise progress/contract evidence updates).

Do not modify final-text-review, SCALE assessor behavior, publication gate,
canon mutations, narrative standing policies, snapshot coverage, auth roles,
UI, localization, S3, gateways, quota/usage taxonomy, dependency manifests,
lockfiles or historical migrations. These exclusions retain parent scope;
they do not reduce the full platform or close GAP-039.

## Prerequisites and required acceptance

Windows: reuse running author Docker; Ubuntu: native dependencies/services,
no Docker. Follow ENVIRONMENT-PREFLIGHT; Node >=22 and frozen pnpm install,
PostgreSQL/pgvector and Redis where API fixtures require it. Record endpoints
without secrets and actual versions. Use owned disposable databases exclusively.
Check each selected test runs; zero/skipped DB tests are not acceptance.

Required executable evidence after implementation (none run for this contract):

1. Real API create/read/replace/history, strict schemas, valid no-conflict and
   empty legacy states; monotonically append-only predecessors/sequence.
2. All eight scales, unknown labels, empty/oversized claims, missing relevance,
   duplicate claims, invalid offsets, surrogate/HTML quote mismatches,
   normalized inline markup and quiet chapters without forced conflict.
3. Tenant/role negatives including cross-novel/current-version substitution,
   client actor/provenance injection and editor/viewer writes denied.
4. Branch checkout, headless branch, wrong expected branch/head/version/set,
   two simultaneous writes, duplicate retry, rollback after insert failure;
   assert history cardinality and content, not only response codes.
5. Save a new text version, unrelated revision change, FULL/selective restore:
   old history persists but cannot become current accidentally; current branch
   selects only its own history. Invalid legacy JSON is explicit failure.
6. Cited chapter deletion 409, uncited existing behavior unchanged, concurrent
   delete/create safe; disposable parent cleanup respects the FK contract.
7. Migration reviewed separately before apply: deploy from empty DB and populated
   baseline with prior migration checksums/data preserved. No fabricated backfill.
   Restore-scope completeness passes without snapshot coverage expansion.
8. No gateway call/canon/standing mutation or story-head advancement on annotation;
   no claim of repaired SCALE verdict or implemented UI.

Commands, run only with the owned test DB configuration required by fixtures:

```text
pnpm --filter @novelforge/database exec prisma validate
pnpm --filter @novelforge/database db:deploy
pnpm --filter @novelforge/database generate
pnpm --filter @novelforge/api test -- src/scale-evidence.test.ts src/manuscript.test.ts
pnpm exec vitest run packages/story-versioning/restore-scope.test.ts packages/narrative-rhythm/scale.test.ts
pnpm --filter @novelforge/ai-services typecheck
pnpm --filter @novelforge/api typecheck
pnpm exec eslint packages/ai-services/src/scale-evidence.ts packages/ai-services/index.ts apps/api/src/scale-evidence-routes.ts apps/api/src/app.ts apps/api/src/services/manuscript.ts apps/api/src/scale-evidence.test.ts apps/api/src/manuscript.test.ts packages/story-versioning/restore-scope.ts packages/story-versioning/restore-scope.test.ts
git diff --check
```

Use separate empty/populated scratch runs for deploy; do not run migrate dev or
reset against working data. Record setup, selected/passed/failed test counts,
exact revision/diff and separate migration/implementation review verdicts.

## Migration, rollback and handoff

Additive enum/table/constraints/indexes only. Existing chapters have no sets and
remain UNASSESSED; do not infer tags from titles, standing or generated text.
Rollback application registration/service to the baseline while retaining new
table/history; no destructive down migration. No working DB apply, deployment
approval or production acceptance is granted by this planning artifact.

Completion requires implemented API, reviewed migration, named negatives,
documentation and exact-diff separate review; mark VERIFIED only for S1 foundation.
Then freeze/review 050B against actual S1 interfaces before writing its code.
GAP-039 remains OPEN until the parent's complete author workflow is verified.

Checkpoint fallback: documentation contract prepared at baseline `7c3616d`;
implementation not started. GAP-021 runtime binding is unavailable; no attributed
Engram write or save success is claimed. Resume by checking Git, this contract,
review verdict and prerequisites, then execute the first unfinished acceptance step.

Contract review (2026-10-08): recovery reviewer APPROVE; consistency reviewer
found one HTTP-prefix correction, applied (`/api/workspaces/...`). Both confirmed
the S1-only boundary and B/C ownership. Read consistency and multi-predecessor
parent cleanup are mandatory implementation checks, not passing runtime claims.
The final frozen contract's SHA256 is recorded externally in CURRENT so this
artifact does not hash itself. All seven changed documents' local Markdown
links resolved and `git diff --check` passed. No new runtime tests were run.

## Scope amendment (2026-10-09) — migration proof test file

**Reviewed by:** scope amendment reviewer (separate actor; backends MODEL_UNVERIFIED per GAP-013). **Verdict: APPROVE.**

Adds `apps/api/src/scale-evidence-migration.test.ts` to the allowed implementation paths.

**Justification:** the re-review (commit `23261fb`) made populated migration proof mandatory ("Empty/populated migration, legacy data/checksum preservation and parity proof remain mandatory; the external P3 annotation cannot make them optional"). The existing `scale-evidence.test.ts` could not host this proof without violating the one-writer-per-file rule during parallel repair work. The new file contains only migration acceptance tests: empty-database deploy schema verification and populated-baseline checksum preservation with no-backfill proof, on a dedicated disposable database.

**Explicitly:** test-only addition. No implementation changes, no new product behavior, no new routes/services/schema, no changes to historical migrations. The file does not modify the migration under test.
