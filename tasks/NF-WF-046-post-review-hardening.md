# Task NF-WF-046: Post-review hardening of NF-WF-042/044/045 (GAP-040/043/041)

Project language: English for all authored/revised artifacts and generated
project content; UI uses English (`en`)/Bahasa Indonesia (`id`) locale keys
and resources with English fallback.
Model selection: author-selected at runtime; separate implementer/reviewer
actors, with requested aliases distinguished from runtime evidence.

Status: VERIFIED (implementation complete 2026-10-07; contract APPROVED; diff review APPROVE; battery GREEN on `9265822`; pushed to `work/gap040-gap043`)
Milestone / capability IDs: M9 (post-review hardening; author directives on `c03a171`)
Implementer role / requested and resolved model: separate subagent actor (coordinator-dispatched); resolved model UNKNOWN — backends MODEL_UNVERIFIED per GAP-013
Reviewer role / requested and resolved model: separate subagent actor (coordinator-dispatched, distinct from implementer); resolved model UNKNOWN — backends MODEL_UNVERIFIED per GAP-013
Readiness evidence / unresolved decisions / parent acceptance owner: author reviewed `c03a171` locally and issued 5 fix directives + 1 clarification (2026-10-07). Parent coordinator.
Frozen review manifest / exact artifact paths and identity: (set at implementation dispatch)
Baseline revision / local changes to preserve: `c03a171` on branch `work/gap040-gap043` (6 commits on `1a3452b`); do NOT merge to main.
Engram checkpoint topic key / last confirmed observation reference: (coordinator-owned)

## Goal and reason

Harden the NF-WF-042/044/045 evidence per the author's local review of
`c03a171`. The author's five directives correct real weaknesses in the
submitted work:

1. The step-6b DRAFT-reader negative relies on a novel seeded by a *different*
   `it()` block (`e2e-loop-409`) — it passes vacuously (404 for "novel does
   not exist") when run standalone.
2. The published-version pinning proof compares reader content against the
   pinned version while `currentVersionId === published chapterVersionId` —
   it cannot distinguish "serves the pinned version" from "serves current".
3. The G9 stale-tier test promotes DRAFT → IN_REVIEW via direct DB update,
   bypassing the official `reviewFinalText` + `manuscript.setStatus` flow —
   it must not claim the official mutation flow was tested.
4. Handoff fields (implementer/reviewer, baseline, exact commits, review
   verdicts) are unfilled in the three task files; NF-WF-044 cites a
   non-existent document; CURRENT.md / START-HERE.md / DELIVERY-PLAN.md
   still point at the completed tasks as "next".
5. Targeted tests + the full battery must be re-run on the final revision —
   historical results are not evidence for the revised code.

The author's GAP-040 clarification: the test-direction fix was correct; do
NOT require health findings to always be non-empty — a healthy story can
legitimately produce zero findings. (Verified: the current health control in
`cross-branch-asof.test.ts` asserts shape via `Array.isArray`, not
non-emptiness — no change needed; this contract documents it.)

This is a design contract, not an implemented feature. No code changes are
authorized by this document; implementation requires a separate reviewed
dispatch.

## Required reading

- [Operating constitution](../../AGENTS.md) (§10 development rules, §12
  multi-LLM orchestration protocol; §13 every problem recorded in
  ISSUES-AND-GAPS.md before a workaround).
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md) (OBSERVED /
  DOCUMENTED / INFERRED / PROPOSED / UNKNOWN; unknown actor identities are
  marked UNKNOWN, never invented).
- The author's directives (verbatim substance in the task brief; the five
  numbered directives + the GAP-040 clarification).
- The three task contracts being hardened:
  `tasks/NF-WF-042-gap040-cross-branch-guards.md`,
  `tasks/NF-WF-044-gap043-stale-provenance-tests.md`,
  `tasks/NF-WF-045-gap041-ui-flow-alignment.md`.
- Current tests: `apps/api/src/e2e/author-preview.loop.test.ts` (step 6b,
  lines ~416–455), `apps/api/src/e2e/gates.test.ts` (G9, lines ~657–776),
  `apps/api/src/cross-branch-asof.test.ts` (health control, lines ~380–402).
- Production mechanics (all OBSERVED by the contract drafter):
  - `apps/api/src/services/final-text-review.ts` (`reviewFinalText`:
    evaluates the immutable version artifact against narrative policies;
    returns `ReviewVerdict`; no policies configured → PASS).
  - `apps/api/src/services/manuscript.ts` (`setStatus`: DRAFT → IN_REVIEW
    requires a PASS receipt for the current version via
    `assertPublishReviewGate`; PUBLISHED → IN_REVIEW "unpublish" is
    ungated; `saveChapter` on a PUBLISHED chapter throws
    `ConflictError("published chapters are immutable")`; returns
    `{ version: created.number, wordCount }` — the version NUMBER, so the
    version id must be read via
    `db.chapter.findUnique({ select: { currentVersionId: true } })`).
  - `apps/api/src/services/publication.ts`
    (`resolvePublicChapterNovelFirst`: serves `pub.chapterVersion.content`
    when the **Publication row's** `status === "PUBLISHED"` — the chapter's
    own status is not consulted; content comes from the PINNED
    chapterVersionId, never currentVersionId).

## Environment prerequisites

Follow [environment preflight](../../docs/11-deployment/ENVIRONMENT-PREFLIGHT.md).
Native Ubuntu, no Docker. PostgreSQL 16 + pgvector and Redis on localhost
(start if stopped; re-apply GAP-065 if the `novelforge_test` role is missing
— GAP-108 has recurred). Disposable scratch databases per suite
(`novelforge_test_*`); suites sharing a database name run sequentially,
never concurrently. `export DATABASE_URL` must point at an EXISTING
database (the harness creates scratch DBs from it); `export
PATH="$HOME/.local/bin:$PATH"` before pnpm.

## Dependencies and evidence

- **NF-WF-042/044/045**: IMPLEMENTED + REVIEWED + PUSHED
  (`work/gap040-gap043`, commits `03f5d8d` / `5769a16` / `d7b8f6e` +
  docs commits `e3ecfa1` / `635112e` / `c03a171`). This task hardens
  them; it does not reimplement them.
- **GAP-040 / GAP-043 / GAP-041**: marked CLOSED in ISSUES-AND-GAPS.md on
  the submitted evidence. The author's directives imply some evidence was
  incomplete; per directive 4 the implementer audits each closure entry
  and downgrades to VERIFY_PENDING where the hardening shows the evidence
  was incomplete (see Documentation). Do NOT modify ISSUES-AND-GAPS.md
  (coordinator-owned); record findings in the handoff.
- **NF-WF-011 contract**: amended by NF-WF-045 (appendix +97/−0). Fix 2
  strengthens step 6b within its existing scope; no new amendment is
  expected — but if the implementer finds otherwise, they STOP and route
  the amendment through review first (never silently).

## Scope

### Allowed paths

- `apps/api/src/e2e/author-preview.loop.test.ts` — fix 1 (independent
  DRAFT fixture) and fix 2 (pinning regression).
- `apps/api/src/e2e/gates.test.ts` — fix 3 (official G9 flow).
- `tasks/NF-WF-042-gap040-cross-branch-guards.md`,
  `tasks/NF-WF-044-gap043-stale-provenance-tests.md`,
  `tasks/NF-WF-045-gap041-ui-flow-alignment.md` — fix 4 (handoff fields;
  NF-WF-044 reference correction).
- `docs/14-progress/CURRENT.md`, `START-HERE.md`,
  `docs/implementation/DELIVERY-PLAN.md` — fix 4 (stale "next task"
  pointers).
- `tasks/NF-WF-011-author-preview-e2e.md` — appendix ONLY, and ONLY if a
  reviewed amendment is required (see fix 2).

### Forbidden paths

- All production code. In particular: do NOT open any permission to edit
  published chapters in production code to build the fix-2 fixture
  (directive 2 is explicit).
- All other test files, contracts, UI, routes, services, migrations.
- Editing the frozen NF-WF-011 contract body (appendix with review record
  only, if needed).

### Out of scope

- Re-running the author's local review; the author's acceptance decision.
- Merging to main (explicitly forbidden by the author).
- GAP-039/063 (author-owned product decisions), GAP-051 (human gate),
  GAP-013 (awaiting author gateway restart).

## Behavior and invariants

### Fix 1 — independent DRAFT-reader negative (author-preview.loop.test.ts)

**Problem (OBSERVED):** step 6b's negative does
`GET /api/public/novels/e2e-loop-409/chapters/1` expecting 404 NOT_FOUND,
relying on the `e2e-loop-409` novel seeded in the *previous* `it()` block
(line 219). Run standalone, the novel does not exist — the 404 proves
nothing about DRAFT non-resolvability.

**Normative fixture (implementer):**
1. Inside the step-6b test (not a shared `beforeAll`), seed an independent
   fixture: `seedWorkspace(db, ownerId, "<distinct-slug>")` (creates a DRAFT
   novel via the production `createNovel` path) + `manuscript.createChapter`
   + `manuscript.saveChapter` (chapter with content).
2. Prove fixture validity BEFORE the negative:
   - `db.novel.findUniqueOrThrow` → `status === "DRAFT"`.
   - `db.chapter.count({ where: { novelId } })` > 0.
   - (Stronger, recommended) an authenticated chapter read returns 200 —
     proving the chapter exists and is readable, so the subsequent 404 can
     only mean non-publicity.
3. Anonymous `GET /api/public/novels/<slug>/chapters/<n>` → 404 with
   `error === "NOT_FOUND"`.
4. The negative MUST pass in isolation: acceptance requires running the
   single test (`vitest run -t "<test name>"`) and observing green.

**Invariant:** no test in this file may depend on another `it()` block's
fixture for its assertions. (The existing `e2e-loop-409` negative may be
kept as a secondary assertion only if its dependency is made explicit AND
the independent fixture is the primary proof; otherwise remove it.)

### Fix 2 — pinning regression with divergent versions (author-preview.loop.test.ts)

**Problem (OBSERVED):** step 6b asserts reader content equals the pinned
version's content, but `currentVersionId === published chapterVersionId`
(V1). A reader that served "current" would pass identically — the test
cannot discriminate.

**Normative fixture (implementer):** after step 6's publish (V1 published;
`Publication.chapterVersionId = V1`, `chapter.currentVersionId = V1`):
1. `manuscript.setStatus({ actorUserId, workspaceId, novelId, chapterId,
   status: "IN_REVIEW" })` — the official, ungated PUBLISHED → IN_REVIEW
   "unpublish" path (manuscript.ts). Assert `chapter.status ===
   "IN_REVIEW"`.
2. Read the current version number first:
   `const { currentVersion } = await db.chapter.findUniqueOrThrow({
   where: { id: chapterId }, select: { currentVersion: { select:
   { number: true } } } })` — a dynamic read (not a hardcoded `1`),
   robust if the fixture ever gains a pre-step that bumps the version
   (a hardcoded `null` here would throw
   `ConflictError("stale version: expected null, current 1")` since the
   chapter already has V1; contrast Fix 3 step 1, where `null` is
   correct because that chapter is brand-new). Then
   `manuscript.saveChapter({ chapterId, content: "<distinct marker text
   V2>", expectedVersion: currentVersion.number })` → V2. Assert
   `chapter.currentVersionId !== V1` (read via `db.chapter.findUnique`,
   since `saveChapter` returns the version number, not the id).
3. Assert the Publication row is untouched:
   `db.publication.findUniqueOrThrow({ where: { chapterId } })` →
   `status === "PUBLISHED"` and `chapterVersionId === V1`.
4. Anonymous `GET /api/public/novels/<slug>/chapters/1` → 200. Assert:
   - `chapter.content` EQUALS V1's stored content (read
     `db.chapterVersion.findUniqueOrThrow({ where: { id: V1 } })`),
     non-empty;
   - `chapter.content` does NOT equal V2's stored content (assert
     inequality against the V2 row — proves "not current");
   - `chapter.publishedVersionNumber` equals V1's version number.
5. Rationale for the reviewer: the reader keys off the Publication row's
   PUBLISHED status and serves `pub.chapterVersion.content`
   (publication.ts) — the chapter's own IN_REVIEW status does not hide it.
   This is OBSERVED product behavior, not a fixture trick.

**Constraints (normative):**
- No production change to permit editing published chapters. The
  unpublish-then-save path uses only existing official flows.
- If the implementer finds this fixture needs a contract change (e.g.,
  the 011 amendment's step-6b text), STOP and route the amendment through
  review first. The drafter's assessment: none needed — this strengthens
  the existing 6b proof within its scope.

### Fix 3 — G9 via the official review flow (gates.test.ts)

**Problem (OBSERVED):** the new G9 test does
`db.chapter.update({ where: { id }, data: { status: "IN_REVIEW" } })`,
bypassing the review gate. It must not claim the official mutation flow
was tested.

**Normative sequence (implementer):** replace the direct DB update with:
1. `s.manuscript.createChapter({ ...ctx, title })` + `s.manuscript.saveChapter({
   ...ctx, chapterId, content: "<substantive prose>", expectedVersion: null })`
   (`null` is correct here: the chapter is brand-new with no versions yet).
2. Read the version id:
   `db.chapter.findUniqueOrThrow({ where: { id: ch.id }, select: { currentVersionId: true } })`.
3. `reviewFinalText({ actorUserId: ownerId, workspaceId, novelId, chapterId: ch.id,
   chapterVersionId })` via `createFinalTextReviewServices({ db, audit })`
   (add to the test file's `svc()`; import from
   `../services/final-text-review.ts`). **Assert the verdict is
   explicitly `"PASS"`** (not merely "did not throw"). No narrative
   policies are configured in this fixture, so PASS is expected — if the
   verdict is not PASS, the implementer stops and records the finding
   (do not weaken the assertion).
4. `s.manuscript.setStatus({ actorUserId: ownerId, workspaceId, novelId,
   chapterId: ch.id, status: "IN_REVIEW" })`. Assert `chapter.status ===
   "IN_REVIEW"` (read back from DB).
5. Canon fact BEFORE the rebuild (unchanged): `s.canon.createEntity` +
   `s.canon.createFact`.
6. R1 = `readHeadRevisionId`; `processRebuild(db, { workspaceId, novelId,
   scope: chapterScope(ch.id), sourceRevisionId: R1 })`; verify the
   projection row exists at R1 with structural content (unchanged).
7. Second canon entity + fact → R2; assert `R2 !== R1` (unchanged).
8. `e2e.compileFull({ ... storyPosition: chNum })` WITHOUT rebuild
   (unchanged).
9. Anti-vacuous guard + per-block assertions (STALE, `sourceRevisionId
   === R1`, non-empty `chapterCoverage`, non-empty `text`) — UNCHANGED.

**Fallback rule (normative):** if the official flow cannot produce the
fixture (e.g., `reviewFinalText` refuses for an unforeseen reason), the
implementer must NOT silently revert to the DB update. Document the
reason and the evidence limits, and route a fixture-exception amendment
through review per directive 3. The test must never claim the official
flow was tested when it was not.

### Fix 4 — handoff and documentation

**Task files** (`tasks/NF-WF-042-…`, `tasks/NF-WF-044-…`,
`tasks/NF-WF-045-…`): fill in, from OBSERVED session evidence only:
- Implementer role / Reviewer role: "separate subagent actor; resolved
  model UNKNOWN (backends MODEL_UNVERIFIED per GAP-013)". Do NOT invent
  model names or human names.
- Baseline revision: `1a3452b`; branch `work/gap040-gap043`; exact
  commits: `03f5d8d` (NF-WF-044), `5769a16` (NF-WF-042), `d7b8f6e`
  (NF-WF-045), docs `e3ecfa1` / `635112e` / `c03a171`.
- Review verdicts: contract reviews (042 APPROVE_WITH_FINDINGS 1P2+2P3
  folded; 044 APPROVE 2P3 non-blocking; 045 APPROVE 2P3 non-blocking)
  and diff reviews (042 APPROVE no findings; 044 APPROVE 1P3
  non-blocking; 045 APPROVE 2P3 non-blocking).
- Status fields: align with the actual state (implemented + reviewed;
  closure acceptance is the author's — see below).

**NF-WF-044 reference correction:** the Required reading cites
`../../tasks/NF-WF-011-context-compiler.md`, which does not exist. The G9
gate is defined in `tasks/NF-WF-011-author-preview-e2e.md` (line ~420).
Correct the link.

**Progress docs** (`docs/14-progress/CURRENT.md`, `START-HERE.md`,
`docs/implementation/DELIVERY-PLAN.md`): the "next task" pointers still
name GAP-040/043/041 proof work as pending. Update them to record:
implemented + reviewed + pushed on `work/gap040-gap043`, post-review
hardening (NF-WF-046) in progress, author local review/acceptance
pending. Do NOT mark author acceptance as given.

**ISSUES-AND-GAPS.md alignment:** ISSUES-AND-GAPS.md is coordinator-owned
— the implementer does NOT edit it. In the handoff, the implementer
lists for each of GAP-040/041/043 whether the current CLOSED entry is
justified by the (hardened) evidence or should be VERIFY_PENDING pending
the author's acceptance. The coordinator decides.

### Fix 5 — verification (targeted tests + battery)

1. Targeted: `author-preview.loop.test.ts` (full file + the step-6b test
   in isolation), `gates.test.ts` (full file), `cross-branch-asof.test.ts`
   + `branches.test.ts` + `state-consumers.test.ts` regressions;
   `npx tsc --noEmit` (apps/api); `pnpm lint` on changed files.
2. Battery on the FINAL code revision, per the repository contract
   (the 8-box NF-WF-023 battery: lint, tsc, vue-tsc, API suite, web
   suite, e2e per-file sequential, axe, new-GAP scan). Strictly
   sequential; same-DB suites never concurrent; disposable DBs.
3. The report records: command, revision, exit code, file/test counts,
   skipped tests, actual failures, and evidence limits. Historical
   results (including the `c03a171` battery) are NOT evidence for the
   revised code — every box re-runs.

### GAP-040 clarification (author, normative)

Do NOT require health findings to always be non-empty. A healthy story
can legitimately produce zero findings. The current health control
asserts shape (`Array.isArray(body.findings)`,
`Array.isArray(body.unresolved)`, `sourceRevisionId`) — this is correct
and unchanged by this task. If any health assertion added here requires
non-emptiness, that is a contract violation.

## Acceptance and verification

- [x] **Fix 1**: the DRAFT-reader negative uses an independent fixture
  (novel + chapter proven DRAFT and existing before the 404); the test
  passes in isolation (`vitest run -t` on the single test).
- [x] **Fix 2**: pinning regression with `currentVersionId !== published
  chapterVersionId`; reader serves V1's content (equality + inequality
  assertions + `publishedVersionNumber`); no production changes.
- [x] **Fix 3**: G9 uses `reviewFinalText` (verdict explicitly PASS) +
  `manuscript.setStatus` (status read back as IN_REVIEW); no direct DB
  status update; all R1–R5 anti-vacuous rules and STALE assertions kept.
- [x] **Fix 4**: task files' handoff fields completed with OBSERVED values
  only (unknown actors marked UNKNOWN); NF-WF-044's broken link fixed;
  CURRENT.md / START-HERE.md / DELIVERY-PLAN.md no longer point at
  completed work as "next"; ISSUES-AND-GAPS.md alignment proposal in the
  handoff (not edited by the implementer).
- [x] **Fix 5**: targeted tests green; full 8-box battery GREEN on the
  final revision (`9265822`) with a complete evidence table (command,
  revision, exit code, counts, skips, failures, limits).
- [x] Separate diff review of the exact submitted diff by an actor other
  than the implementer; findings resolved (APPROVE, 1 P3 informational).
- [x] Commit + push to the SAME branch `work/gap040-gap043`; no merge to
  main; no deployment.

Record actual results separately from expectations. Zero selected tests
or skipped integration checks do not pass a capability gate.

## Migration and rollback

No schema migration. No production code changes. Test-only + docs-only
changes. Baseline: `c03a171`. Rollback: revert the commit(s).

## Documentation and handoff

The implementer's handoff includes: exact files changed, the pinning
regression's V1/V2 ids and assertion outcomes, the G9 official-flow
verdict evidence, the isolation run of the step-6b test, the full battery
evidence table, the ISSUES-AND-GAPS.md alignment proposal (per gap:
CLOSED-justified or VERIFY_PENDING with reason), and any deviation from
this contract with reasons. Follow the MULTI-LLM-ORCHESTRATION.md handoff
playbook. Update CURRENT.md progress on completion (coordinator-owned
final wording).

**Explicit non-goals for the reviewer to check:** no production changes
(especially no published-chapter edit permission); no invented actor
identities or historical approvals; no claim that the official flow was
tested where it was not; no health non-emptiness requirement; no merge to
main; no use of historical test results as evidence for the revised code.

**Unknowns / risks:**
- Whether `reviewFinalText` returns PASS for the G9 fixture's prose with
  no policies configured — the implementer asserts it explicitly; a
  non-PASS verdict is a stop-and-record finding, not a skip.
- Whether unpublishing (PUBLISHED → IN_REVIEW) mid-loop affects step 7/8
  (continuity/checkpoint) — the implementer must run the FULL loop file,
  not just step 6b, and report any interference. If step 7/8 depend on
  the PUBLISHED chapter state, the pinning regression may need its own
  chapter/novel rather than reusing ch1 — the implementer decides with
  reasons recorded, preferring isolation over cleverness.
- The `e2e-loop-409` cross-test dependency: if kept as a secondary
  assertion, its dependency must be explicit; the primary proof is the
  independent fixture.

## Verification receipt (actual results, 2026-10-07)

**Revision:** `9265822` on branch `work/gap040-gap043` (commit "NF-WF-046:
Post-review hardening of NF-WF-042/044/045"). The battery ran on the
exact working tree that became this commit (code/test tree identical;
the commit additionally includes the docs-only ISSUES-AND-GAPS.md
GAP-108 recurrence note, which does not affect test outcomes).

**Targeted tests (implementer-OBSERVED):**
- Fix 1: `author-preview.loop.test.ts` full file 3/3; step-6b test in
  isolation (`vitest run -t`) 1/1 (2 skipped) — negative meaningful
  standalone.
- Fix 2: pinning regression — reader serves V1's content (equals V1,
  not V2, `publishedVersionNumber` = V1's number); steps 7/8
  unaffected (full loop 3/3).
- Fix 3: G9 isolation 1/1; full `gates.test.ts` 11/11.
- `npx tsc --noEmit` (apps/api) exit 0; `pnpm lint` on changed files
  exit 0.

**Full 8-box battery (implementer-dispatched runner, OBSERVED):**

| Box | Command | Exit | Result |
|---|---|---|---|
| 1 | `pnpm lint` (root) | 0 | clean |
| 2 | `npx tsc --noEmit` (apps/api) | 0 | clean |
| 3 | `npx vue-tsc --noEmit` (apps/web) | 0 | clean |
| 4 | `npx vitest run` (apps/api) | 0 | 58/58 files, 1047/1047 tests, 0 skipped |
| 5 | `npx vitest run` (apps/web) | 0 | 81/81 files, 488/488 tests, 0 skipped |
| 6 | e2e per-file sequential | 0 | 21/21 (loop 3, gates 11, long-novel 7) |
| 7 | `*.axe.test.ts` (apps/web) | 0 | 20/20 files, 91/91 tests, zero violations |
| 8 | new-defect scan | — | none found |

**Verdict: GREEN.** Environment: Ubuntu 24.04.5 LTS, native
PostgreSQL 16 + Redis, disposable DBs, no Docker. Note: GAP-108
recurred a 4th time during the battery (full VM reset); ~27 min spent
on environment recovery, no code defect. Box 4's first attempt failed
on environment (Prisma P3018, test role lacked superuser); fixed per
GAP-065 and re-run in full.

**Review receipt:** contract APPROVED (2026-10-07,
APPROVE_WITH_FINDINGS — 1 P2 + 1 P3 folded in, no re-review needed);
separate diff review APPROVE (2026-10-07, 1 P3 informational,
non-blocking). Reviewer: separate subagent actor, resolved model
UNKNOWN (backends MODEL_UNVERIFIED per GAP-013).
