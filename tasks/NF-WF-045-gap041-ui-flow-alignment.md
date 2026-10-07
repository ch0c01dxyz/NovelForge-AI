# Task NF-WF-045: Align the NF-WF-011 contract and E2E loop with the actual UI flow (GAP-041)

Project language: English for all authored/revised artifacts and generated
project content; UI uses English (`en`)/Bahasa Indonesia (`id`) locale keys
and resources with English fallback. Record any other explicit author override
and its scope.
Model selection: author-selected at runtime; separate implementer/reviewer
actors, with requested aliases distinguished from runtime evidence.

Status: APPROVED (contract review 2026-10-07 — APPROVE, 2 P3 observations non-blocking)
Milestone / capability IDs: GAP-041 (NF-WF-011 contract defect)
Implementer role / requested and resolved model: separate subagent actor; resolved model UNKNOWN (backends MODEL_UNVERIFIED per GAP-013)
Reviewer role / requested and resolved model: separate subagent actor (contract review + diff review); resolved model UNKNOWN (backends MODEL_UNVERIFIED per GAP-013)
Readiness evidence / unresolved decisions / parent acceptance owner: parent coordinator
Frozen review manifest / exact artifact paths and identity: TBD at review
Baseline revision / local changes to preserve: 1a3452b; branch work/gap040-gap043; implementation commit d7b8f6e (2026-10-07); docs commit c03a171 (GAP-041 closure)
Engram checkpoint topic key / last confirmed observation reference: n/a

## Goal and reason

Close GAP-041: the frozen NF-WF-011 contract's Invariant 2 pins two API
steps the UI does not perform. The E2E loop must replay the UI's ACTUAL
flow — workflow generation → approval → final-text review → publication →
public reader — and the contract must be amended (with a review record, never
silently) to match. Historical claims are preserved as amendments; nothing is
rewritten.

Observable result: the 011 E2E loop's API sequence is identical to the UI's
(`GenerationPanel.startRun` → `ApprovalDialog` → `ApplyBar` → canon review →
`FindingsPanel` → novel-page `publish()`), publication is proven through the
012 release path AND the 013 public reader (not a status flag), and the 011
contract carries dated amendments reconciling the original pins.

## Required reading

- [Operating constitution](../../AGENTS.md) (§10 evidence, §12 workflow) or equivalent CLAUDE.md.
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- [Role-based execution protocol](../../docs/06-ai/MULTI-LLM-ORCHESTRATION.md).
- [Environment preflight](../../docs/11-deployment/ENVIRONMENT-PREFLIGHT.md).
- The frozen contract: `tasks/NF-WF-011-author-preview-e2e.md` — Goal section,
  Invariant 2 (steps 1–8), Invariant 3, and the review-record section (P2-1).
- GAP-041 in `docs/implementation/ISSUES-AND-GAPS.md` (the three checks refuting
  `/generate`; the audit041 publication divergence).
- UI sources of truth: `apps/web/app/components/generation/GenerationPanel.vue`
  (`startRun`, lines 121–152; `resolveWorkflowId` with key
  `chapter-generation-review`, line 80) and
  `apps/web/app/pages/workspaces/[workspaceId]/novels/[novelId]/index.vue`
  (`publish()`, lines 807–842).
- Current loop: `apps/api/src/e2e/author-preview.loop.test.ts` (header
  deviation note; `startChapterRun`; steps 1–8).
- Release path: `apps/api/src/publication-routes.ts` (`POST .../publication/publish`);
  public reader: `apps/api/src/public-routes.ts`
  (`GET /api/public/novels/:slug/chapters/:number`).

## Environment prerequisites

Follow ENVIRONMENT-PREFLIGHT.md. Record OS/tool versions, service endpoints
(redacted), and the disposable scratch DB used. PostgreSQL 16 + pgvector and
Redis on this host (native, no Docker); E2E uses its own disposable database
(`novelforge_test_e2e` per the 011 contract) — never the working databases.

## Dependencies and evidence

- GAP-041 (OPEN) — the only issue this task closes. Do NOT modify
  ISSUES-AND-GAPS.md (coordinator-owned); the implementer records new findings
  in the handoff.
- NF-WF-011 contract (frozen) — amended only via a dated amendment section
  with the review record (see Scope).
- NF-WF-012 (publication lifecycle) and NF-WF-013 (public reader) contracts —
  the release path and reader shapes are pinned there; this task only replays
  them, never redefines them.
- Related but distinct: NF-WF-041 (existing task, novel-scoped workflow
  history) is unrelated to GAP-041 despite the number. GAP-034 was fixed by
  NF-WF-041; do not touch it.

## Scope

Allowed paths:
- `tasks/NF-WF-011-author-preview-e2e.md` — APPEND a dated "Amendments"
  section only. The original invariant text is preserved verbatim with
  superseded markers; the amendment text, the review record, and the GAP-041
  reference are added. No other edit to the file.
- `apps/api/src/e2e/author-preview.loop.test.ts` — align steps 6 (and the
  deliberate-FAIL gate test) with the publication/publish route; add the
  public-reader proof step. The header deviation note is updated to record
  the amendment (it stays as history).
- E2E helpers the loop file owns (if any new helper is needed for the
  reader proof).

Forbidden paths: production routes (`publication-routes.ts`, `public-routes.ts`,
`manuscript-routes.ts`, `orchestrator-routes.ts`), all UI files, every other
test file, all other contracts.

Out of scope: changing what `/generate` does, changing the publish route's
semantics, novel activation UX (no route exists in the loop's scope), the
NF-WF-011 fixture (Invariant 3, GAP-042 stays as-is).

## Behavior and invariants

### Amendment A — Invariant 2 step 1 (generation)

Superseded text (preserved): `POST /api/workspaces/:workspaceId/generate`
with `{ agentKey, instruction, novelId }` "starts the chapter workflow run".

Amended text: `POST /api/workspaces/:workspaceId/workflows/:workflowId/run`
with `{ novelId, input: { chapterNumber, outlineRef }, idempotencyKey }`,
where `workflowId` is resolved by key `chapter-generation-review`
(`runs.resolveWorkflowId`) and `idempotencyKey` is fresh per intentional
start (the backend dedupes a retried submit to the existing run — 200 path).

Rationale (the review record): GAP-041's three checks — `/generate` returns a
bare generation with no run row (steps 2's drive/approve is unimplementable
from it); the UI never calls it for chapter generation; the contract's own
Goal section already describes "generate (workflow run, fake gateway)". The
implementer deviation (workflow run route via the real
`chapter-generation-review` template, `createTestDriver`, approve at
AWAITING_APPROVAL) was recorded in GAP-041 BEFORE the workaround per
Invariant 10 and is ratified by this amendment. Step 7's "Next chapter:
`POST /generate` for chapter N+1" is likewise amended to the run route.

### Amendment B — Invariant 2 step 6 (publication)

Superseded text (preserved): `PATCH .../chapters/:chapterId/status` with
`{ status: "PUBLISHED" }` ("the 010 gate runs here").

Amended text: `POST .../novels/:novelId/chapters/:chapterId/publication/publish`
(the 012 release path — the exact call the novel page's `publish()` makes,
`index.vue:819`). This creates the Publication row the public reader resolves
(GAP-046). The gate assertions move with it:

- The deliberate-FAIL chapter (currently asserting 409 on PATCH
  `.../status`) must assert the publish route's typed refusal for a FAIL
  receipt / missing receipt. The UI maps `REVIEW_STALE` and
  `HARD_POLICY_VIOLATION` (index.vue:827–834); the route also enforces
  `NOT_ON_MAIN_BRANCH` (020B Invariant 9). The implementer pins the exact
  refusal code the FAIL fixture produces — the assertion names the code,
  never "409 or something".
- The PASS chapter's publish asserts 200 and a Publication row with status
  PUBLISHED (not merely `chapter.status === "PUBLISHED"`).

### New step 6b — public-reader proof (the readability invariant)

Publication is proven through the reader, not the status flag:

1. The loop novel is ACTIVE before the reader step (013's resolver only
   resolves ACTIVE novels; `createNovel` defaults to DRAFT — the test
   promotes via the same pattern `public-routes.test.ts` uses).
2. `GET /api/public/novels/:slug/chapters/:number` (anonymous, no cookie)
   returns 200 for the published chapter.
3. The returned content EQUALS the pinned chapterVersionId's content saved
   in step 3 (proves the reader serves the frozen version, 012 Invariant 4 —
   not currentVersionId). The assertion compares non-empty text; a 200 with
   empty or mismatched content fails.
4. Negative: the same URL for an UNPUBLISHED chapter (or a DRAFT novel)
   returns 404 `{ error: "NOT_FOUND" }` — the no-oracle rule (013).

Step ordering in the amended loop: generate → approve → save → canon →
final-text-review → publication/publish → public reader → continuity →
checkpoint/restore. (Steps 7–8 keep their existing numbers in the file's
comments; the contract's amendment lists the full amended sequence.)

### Preservation rules (normative)

- The 011 contract file gains ONE new top-level section, "## Amendments
  (2026-10-07, NF-WF-045)", containing Amendment A, Amendment B, step 6b,
  the GAP-041 reference, and this contract's review verdict. Original
  invariant text is never edited in place; superseded lines are quoted with
  a "SUPERSEDED by Amendment X" marker.
- The loop file's header deviation note is extended (not deleted): it records
  that the deviation is now a ratified amendment, keeping the original note
  as history.

## Acceptance and verification

- [ ] The E2E loop replays the UI's exact API sequence: run route +
  `chapter-generation-review` template (step 1), approve (2), save (3),
  canon (4), final-text-review PASS (5), publication/publish (6),
  public-reader 200 with pinned content (6b), continuity (7),
  checkpoint/restore (8).
- [ ] The deliberate-FAIL chapter asserts the publish route's typed refusal
  (named code, e.g. `REVIEW_STALE`/`HARD_POLICY_VIOLATION`) — the 409-gate
  coverage is preserved, not dropped.
- [ ] Public reader returns the published chapter's pinned content; the
  unpublished/DRAFT negative returns 404 NOT_FOUND.
- [ ] Contract amendment carries the review record (GAP-041 reference,
  verdict, date); original text preserved with superseded markers.
- [ ] `npx vitest run src/e2e/author-preview.loop.test.ts` — all pass on the
  disposable E2E database; `npx tsc --noEmit`; eslint on changed files.
- [ ] Separate diff review of the submitted revision; findings resolved.
- [ ] Zero skipped checks; record command, revision, exit code, test counts.

## Migration and rollback

None. Test-file and contract-appendix changes only. No schema, no production
code, no data migration. Rollback is `git revert`.

## Documentation and handoff

### Review record (2026-10-07, OBSERVED)

- **Contract review:** APPROVE (2 P3 observations, non-blocking; P3-1 ACTIVE wording, P3-2 sequence mapping).
- **Diff review:** APPROVE (2 P3 observations, non-blocking; P3-1 task-contract wording vs implementation, P3-2 review-record aging).
- **Implementation evidence:** loop file 3/3; step 6b: FAIL chapter → 409 `HARD_POLICY_VIOLATION` (named), PASS → 200 + Publication row (PUBLISHED, chapterVersionId pinned), novel ACTIVE via Q4 auto-flip (asserted); public reader 200 with pinned content verbatim + DRAFT negative 404 `NOT_FOUND`; `npx tsc --noEmit` clean; eslint clean. Deviations: (1) content compared against DB-stored version content (sanitized on write — correct oracle); (2) ACTIVE via Q4 auto-flip (stronger than manual promotion). No escalations.
- **Post-integration battery:** GREEN at `c03a171` (8 boxes; coordinator-owned report).

Follow the MULTI-LLM-ORCHESTRATION.md handoff playbook. The implementer's
handoff includes: the exact amended loop sequence, the publish-route refusal
code pinned for the FAIL fixture, the public-reader assertions (positive and
negative), test counts with OBSERVED results, and any deviation from this
contract with reasons. If the publish route's refusal codes differ from the
UI's mapping, that is a finding for the coordinator (possible GAP), not a
silent accommodation.

Update on completion (coordinator-owned): GAP-041 closure entry in
ISSUES-AND-GAPS.md, CURRENT.md progress, test-matrix if applicable. Do not
claim full platform completion.
