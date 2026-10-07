# Task NF-WF-042: GAP-040 — Cross-branch revision guards (exact negatives + valid controls for all 4 consumers)

Project language: English for all authored/revised artifacts and generated
project content; UI uses English (`en`)/Bahasa Indonesia (`id`) locale keys
and resources with English fallback.
Model selection: author-selected at runtime; separate implementer/reviewer
actors, with requested aliases distinguished from runtime evidence.

Status: APPROVED (contract review 2026-10-07 — APPROVE_WITH_FINDINGS, 1P2+2P3 folded in)
Milestone / capability IDs: M9 (010 follow-up; 020B verification)
Implementer role / requested and resolved model: separate subagent actor; resolved model UNKNOWN (backends MODEL_UNVERIFIED per GAP-013)
Reviewer role / requested and resolved model: separate subagent actor (contract review + diff review); resolved model UNKNOWN (backends MODEL_UNVERIFIED per GAP-013)
Readiness evidence / unresolved decisions / parent acceptance owner: GAP-040 is OPEN (documented limitation; behavior is safe, semantics incomplete). Closure is VERIFY_PENDING per the 2026-10-07 audit.
Frozen review manifest / exact artifact paths and identity: (set at implementation dispatch)
Baseline revision / local changes to preserve: 1a3452b; branch work/gap040-gap043; implementation commit 5769a16 (2026-10-07); docs commit 635112e (GAP-040 closure)
Engram checkpoint topic key / last confirmed observation reference: (coordinator-owned)

## Goal and reason

Replace the vacuous GAP-040 test with real evidence. Today,
`branches.test.ts` ("GAP-040 branch-aware as-of") tests only memory, hits a
**non-existent** `POST /memory/recall` route (always 404 — the guard is never
exercised), allows `[400, 404]` (a 404 from the missing route or a missing
chapter fixture passes silently), and asserts only `.not.toBe(400)` for the
same-branch control (no valid-result proof). Health, character, and timeline
have no cross-branch tests at all, despite the 2026-10-07 audit noting
"health/assembly header coverage claim is unsupported."

The observable result: for each of the 4 as-of consumers (memory, health,
character, timeline), a cross-branch `asOfRevisionId` is refused with the
exact 400 `INVALID_INPUT` the 009 as-of semantics (009 Invariant 7) and the
010 contract's Invariant 3 require — proven by tests whose fixtures are
themselves proven valid first. No loose assertions that can hide a broken
fixture.

This is a design contract, not an implemented feature. No code changes
are authorized by this document; implementation requires a separate
reviewed dispatch.

## Required reading

- [Operating constitution](../../AGENTS.md) (§10 development rules, §12
  multi-LLM orchestration protocol; §5 conflicts surfaced, never
  silently reconciled).
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- [GAP-040](../../docs/implementation/ISSUES-AND-GAPS.md) (line 1087).
- [009 contract](NF-WF-009-revision-derived-memory.md) (Invariant 7 —
  cross-branch as-of → 400 `INVALID_INPUT`).
- [010 contract](NF-WF-010-state-consumer-integration.md) (Invariant 3 —
  "as of revision R" = the 009 as-of semantics).
- Existing implementation (guards added by NF-WF-020B; verify, do not
  assume):
  - `packages/ai-services/src/memory.ts` (~L170-186): `recallNovel`
    resolves `revisionId` → `(branchId, number)`; 404 if unknown;
    400 `INVALID_INPUT` if `rev.branchId !== checkedOutBranchId`
    (Invariant 5 — checked-out branch, not hardcoded `main`).
  - `apps/api/src/services/story-health.ts` (~L191-203):
    `evaluateHealth` — same guard shape.
  - `packages/ai-services/src/state-assembly.ts` (~L204-218):
    `asOfNumber()` — same guard shape; used by
    `assembleCharacterState` and `assembleTimeline`.
- Existing tests: `apps/api/src/branches.test.ts` (~L730-793, the
  vacuous test); `apps/api/src/state-consumers.test.ts` (service-level
  assembly test pattern).

## Environment prerequisites

Follow [environment preflight](../../docs/11-deployment/ENVIRONMENT-PREFLIGHT.md).
Record actual OS/tool versions, service endpoints (redacted), scratch DB
ownership and required tools. Ubuntu installs missing native task
prerequisites without Docker; Windows reuses existing running Docker
services/data. List permission/network/credential blockers; never reset
working databases for tests. Use disposable scratch databases for all
fixture tests.

## Dependencies and evidence

- **NF-WF-009** (as-of semantics, Invariant 7): IMPLEMENTED — the
  normative rule this task verifies.
- **NF-WF-010** (state-consumer integration, Invariant 3): IMPLEMENTED —
  names the 009 semantics for all consumers.
- **NF-WF-020B** (branch-aware as-of guards): IMPLEMENTED — added the
  `checkedOutBranchId` guard to all 4 consumers. This task verifies
  those guards; it does not reimplement them.
- Active issue: **GAP-040** (OPEN/P1, VERIFY_PENDING) in
  [ISSUES-AND-GAPS](../../docs/implementation/ISSUES-AND-GAPS.md).
  Record new technical problems there before any workaround.

## Scope

### Allowed paths

- `apps/api/src/branches.test.ts` — replace the vacuous
  "GAP-040 branch-aware as-of" test (L730-793). The replacement must
  not keep the old test's shape.
- New test file(s) for the 4-consumer coverage, if the implementer
  judges `branches.test.ts` the wrong home (e.g.
  `apps/api/src/cross-branch-asof.test.ts`). One writer per file.
- The 4 consumer services — **production code changes ONLY if a test
  proves a guard wrong** (see Behavior). The task brief is explicit:
  "Perbaiki production code hanya jika bukti menunjukkan guard masih
  salah" (fix production code only if evidence shows the guard is
  still wrong).
- Test helpers/fixtures needed for valid chapters, character state,
  timeline events, and health-evaluable content.

### Forbidden paths

- Any other production code, routes, services, or UI.
- Schema/migration changes.
- New API routes.
- Touching what-if/simulation (027/033), merge (028), restore (032),
  publication/notification/memory recovery (029/030/031), or the
  worker AI path (026).
- Editing the frozen 009/010 contracts (amend with review record if
  the semantics need changing — see Behavior).

### Inputs

- `asOfRevisionId`: a revision UUID on a non-checked-out branch B of
  the same novel.
- Control: `asOfRevisionId` of a revision on the checked-out branch
  (main in the fixture).

### Outputs

- Per consumer: an exact-negative test (400 + `INVALID_INPUT`) and a
  same-branch positive-control test (2xx + valid-result assertions).
- A closure record for GAP-040 in ISSUES-AND-GAPS.md (coordinator-owned,
  on verified evidence only).

### Out of scope

- `assembleRelationships` (`state-assembly.ts` L514-516 explicitly
  ignores `asOfRevisionId` with `void asOfRevisionId`) — not one of
  the 4 consumers; changing it is a separate contract.
- Amending the 010 contract to define the ceiling as branch-agnostic
  (the alternative the gap text offers) — this contract pursues the
  enforcement path the author implicitly chose via 020B. If evidence
  shows enforcement is wrong, the implementer stops and escalates;
  the contract is not amended silently.

## Behavior and invariants

### Guard semantics (normative — mirror of `memory.ts`, verified in all 4)

For each consumer, given `asOfRevisionId`:

1. Resolve: `db.revision.findFirst({ where: { id: asOfRevisionId, novelId } })`.
   Unknown id (or another novel's revision) → `NotFoundError` (404).
2. `checkedOutId = await checkedOutBranchId(db, novelId)` (Invariant 5 —
   the novel's checked-out branch, NOT hardcoded `main`).
3. If `rev.branchId !== checkedOutId` → 400 `INVALID_INPUT`
   ("cross-branch as-of is not supported").
4. Else the revision's `number` is the temporal ceiling (rows born
   after R.number are excluded; the ceiling is monotone, never a
   wrong truth claim).

### Fixture validity (normative — the anti-vacuity rule)

Every test file in this task MUST prove its fixture before asserting
negatives:

1. **Chapters exist.** The fixture novel MUST contain at least one
   chapter with persisted content/state relevant to the consumer
   (the old `seedFixture` created a novel with zero chapters — that
   is why a 404 was possible). The test MUST assert the chapter
   exists (e.g., `db.chapter.count > 0` or a 200 on a chapter read)
   before the cross-branch assertion.
2. **Consumer-relevant state exists.** Character tests need a
   character with state rows; timeline tests need timeline events;
   health tests need evaluable content (at minimum, the fixture must
   make the same-branch control return a well-formed 200 result —
   see rule 3).
3. **Positive control first.** Each negative test (or its
   `beforeEach`) MUST run the same-branch control and assert a
   valid result — not merely "not 400". Valid means: 2xx status AND
   consumer-specific content assertions (memory: non-empty recall
   with provenance; health: well-formed findings structure;
   character: characters array with expected entries; timeline:
   events array with expected entries). A control that passes on
   empty arrays proves nothing.
4. **Real surfaces only.** Memory: `GET /memory/as-of?revisionId=`
   (the existing `POST /memory/recall` hits no route — asserting on
   it is asserting on a 404). Health:
   `GET /story-health?revisionId=&chapter=`. Character/timeline:
   service-level `assembleCharacterState` / `assembleTimeline`
   (no HTTP routes exist; call the services as
   `state-consumers.test.ts` does).

### Forbidden assertion shapes (normative)

The following are contract violations in any test added by this task:

- `expect([400, 404]).toContain(status)` or any status-code union.
- `.not.toBe(400)` without accompanying positive content assertions.
- Assertions over arrays without first asserting non-emptiness
  (or asserting the exact expected length).
- Assertions inside a loop without asserting the loop executed
  (e.g., `expect(seen).toBeGreaterThan(0)` after the loop).
- Hitting a route that does not exist in the route table.

### Production-code rule

Write the tests first against the current guards. If all 8 tests
(4 negatives + 4 controls) pass, **no production change is made**
and GAP-040 closes on test evidence. If a negative fails because a
guard is missing or wrong (not because the fixture is broken —
fixture validity is proven first per above), the implementer:
1. Records the finding in ISSUES-AND-GAPS.md before any fix
   (standing rule),
2. Applies the minimal guard fix mirroring the other three
   consumers,
3. Re-runs the full set.

### Invariants

1. **No silent passes.** Every test proves its fixture, then its
   claim (constitution §5 spirit: conflicts and failures surface,
   never hide behind a 404).
2. **Exact errors.** Cross-branch → 400 with `error: "INVALID_INPUT"`,
   never a status union, never a different code.
3. **Same-branch behavior unchanged.** The controls prove the guards
   do not break legitimate as-of reads.
4. **Checked-out branch, not main.** Guards compare against
   `checkedOutBranchId` (Invariant 5); tests must exercise this by
   switching branches (main → B → main), not by assuming main.

## Acceptance and verification

- [ ] **Memory negative**: `GET /memory/as-of?revisionId=<B-rev>` →
      400, `error === "INVALID_INPUT"`. Fixture validity proven first
      (chapter exists; same-branch control returns 200 with
      non-empty recall + provenance).
- [ ] **Memory control**: `GET /memory/as-of?revisionId=<main-rev>` →
      200 with non-empty, provenance-carrying result.
- [ ] **Health negative**: `GET /story-health?revisionId=<B-rev>&chapter=1`
      → 400, `error === "INVALID_INPUT"`. Fixture validity proven first.
- [ ] **Health control**: same-branch → 200 with well-formed findings
      structure (assert shape, not just status).
- [ ] **Character negative**: `assembleCharacterState({ asOfRevisionId: <B-rev>, ... })`
      throws 400 `INVALID_INPUT` (assert the thrown error's
      status/code, not merely "throws"). Fixture: character + state rows.
- [ ] **Character control**: same-branch → characters array with the
      expected entries (non-empty, field assertions).
- [ ] **Timeline negative**: `assembleTimeline({ asOfRevisionId: <B-rev>, ... })`
      throws 400 `INVALID_INPUT`. Fixture: timeline events.
- [ ] **Timeline control**: same-branch → events array with the expected
      entries (non-empty, field assertions).
- [ ] **Old vacuous test removed**: `branches.test.ts` L730-793 replaced;
      no `[400, 404]`, no `/memory/recall`, no `.not.toBe(400)`-only
      assertions remain in the file.
- [ ] **Branch-switch discipline (both directions)**: each negative
      test exercises the guard in the forward direction (checked-out =
      main, as-of = B-revision → 400), proving the guard refuses
      non-checked-out revisions. Additionally, the mirror direction
      (checked-out = B, as-of = main-revision → 400) is exercised by
      the mirrored negative below — the only test that distinguishes
      `checkedOutBranchId` from a hardcoded `main`. Tests must switch
      branches explicitly, not assume main.
- [ ] **Mirrored negative (memory, REQUIRED; health/character/
      timeline, RECOMMENDED)**: switch the checked-out branch to B,
      then `GET /memory/as-of?revisionId=<main-branch-revision-id>` →
      assert exactly 400 with `error === "INVALID_INPUT"`. Fixture
      validity proven first (same rules as above). Rationale: a guard
      hardcoded to `main` would wrongly return 200 here (main is
      `main`), while the correct `checkedOutBranchId` guard refuses
      with 400 — this test is the only one that discriminates between
      the two implementations, and therefore the only test that
      proves Invariant 5 rather than merely assuming it. The same
      mirror is recommended (not required) for health (route),
      character and timeline (service-level), at minimum memory must
      have it.
- [ ] Commands: `pnpm --filter @novelforge/api exec vitest run`
      on the touched test files; `npx tsc --noEmit` in `apps/api`;
      `pnpm lint` clean. Prerequisites: disposable scratch DB per
      ENVIRONMENT-PREFLIGHT; `DATABASE_URL` exported.
- [ ] Separate review of the submitted revision by an actor other
      than the implementer; findings resolved before GAP-040 closure.

Record actual results separately from expectations. Zero selected
tests or skipped integration checks do not pass this gate.

## Migration and rollback

No schema migration expected (test + possibly guard fix only). If a
guard fix is needed, it is code-only additive (a branch check
mirroring the existing three). Baseline revision: (coordinator-owned).
Deployment compatibility: unchanged external behavior for same-branch
reads; cross-branch as-of callers (if any exist in the wild) get an
explicit 400 instead of a monotone-but-undefined ceiling. Rollback:
revert the commits.

## Documentation and handoff

### Review record (2026-10-07, OBSERVED)

- **Contract review:** APPROVE_WITH_FINDINGS (1 P2 + 2 P3). P2-1 (mirrored negative distinguishing checkedOutBranchId from hardcoded main) folded into the contract before implementation.
- **Diff review:** APPROVE, no findings. Verified: 9 acceptance tests as specified; no [400,404] unions; fixture-validity proofs; `autoCheckpoint` legitimate; no production changes; service-level testing sound.
- **Implementation evidence:** new `apps/api/src/cross-branch-asof.test.ts` 12/12; `branches.test.ts` 11/11; `state-consumers.test.ts` 32/32; `npx tsc --noEmit` clean; eslint clean.
- **Post-integration battery:** GREEN at `c03a171` (8 boxes; coordinator-owned report).

Update on verified evidence only:
- `docs/implementation/ISSUES-AND-GAPS.md`: GAP-040 closure record
  (status, evidence, revision) — coordinator-owned.
- `docs/14-progress/CURRENT.md` and test-matrix: verified scope.

Use the Engram save/recovery protocol per the playbook; on failure
keep the compact handoff in the task record and log it in
ISSUES-AND-GAPS.md. Never claim an unconfirmed save.

**Explicit non-goals for the reviewer to check:** no loose
assertions; no non-existent routes; no fixture-free negatives;
no production changes without a failing-then-fixed test proving
the guard was wrong; no scope creep into other consumers
(`assembleRelationships`), other gaps, or contract amendments.

**Unknowns / risks:**
- Whether `evaluateHealth`'s fixture needs specific content for a
  well-formed 200 (the implementer must discover the minimal valid
  fixture; if health requires heavy seeding, record the cost in the
  handoff rather than weakening the control).
- `assembleCharacterState`/`assembleTimeline` may require
  workspace-level capabilities beyond `canon:read` — the implementer
  must use a role that passes the gate (OWNER in fixtures) and must
  not catch-and-ignore authorization errors.
