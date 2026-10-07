# Task NF-WF-044: GAP-043 — Stale Provenance Tests (unconditional tier 7/8 staleness assertion)

Project language: English for all authored/revised artifacts and generated
project content; UI uses English (`en`)/Bahasa Indonesia (`id`) locale keys
and resources with English fallback.
Model selection: author-selected at runtime; separate implementer/reviewer
actors, with requested aliases distinguished from runtime evidence.

Status: APPROVED (contract review 2026-10-07 — APPROVE with 2 P3 observations, non-blocking)
Milestone / capability IDs: M9 (NF-WF-011 G9 follow-up)
Implementer role / requested and resolved model: (to be assigned — separate actor from contract author and reviewer)
Reviewer role / requested and resolved model: (to be assigned — separate actor from contract author and implementer)
Readiness evidence / unresolved decisions / parent acceptance owner: GAP-043 is OPEN (P1); this contract closes it.
Frozen review manifest / exact artifact paths and identity: (set at implementation dispatch)
Baseline revision / local changes to preserve: (coordinator-owned at dispatch)
Engram checkpoint topic key / last confirmed observation reference: (coordinator-owned)

## Goal and reason

Make the G9 compiler-tier staleness assertion unconditional. Today, the G9
gate test (`apps/api/src/e2e/gates.test.ts`, "G9 — forced-STALE detection")
asserts "tier 7/8 blocks MUST carry staleness metadata" only over
`compiled.blocks.filter((b) => (b.tier === 7 || b.tier === 8) && b.status === "PRESENT")`.
When no tier-7/8 block is PRESENT — no projection for the scope (UNAVAILABLE),
a structurally empty projection (EMPTY), or an over-budget block (OVERFLOWED) —
the loop executes zero iterations and that half of the gate passes vacuously.

The authoritative STALE signal IS asserted unconditionally via
`GET .../memory/status` (`freshness === "STALE"`), so stale detection is proven
end to end. But the compiler-tier half only constrains the PRESENT case, and a
future regression that silently drops staleness metadata from PRESENT blocks
would not be caught if the fixture ever stops producing PRESENT blocks.

The observable result: a dedicated test case with a pre-built projection for
the compiled scope, where the tier 7/8 blocks under test are proven PRESENT
(non-empty collection asserted before any loop), each carrying STALE freshness
metadata read from the block's provenance — never defaulted, never vacuous.

This is a design contract, not an implemented feature. No code changes are
authorized by this document; implementation requires a separate reviewed
dispatch.

## Required reading

- [Operating constitution](../../AGENTS.md) (§10 development rules, §12
  multi-LLM orchestration protocol; §5 conflicts surfaced, never silently
  reconciled).
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- [GAP-043](../../docs/implementation/ISSUES-AND-GAPS.md) (line 1201).
- [NF-WF-011 contract](../../tasks/NF-WF-011-context-compiler.md) (G9 gate;
  Invariant 2 freshness; tier 7/8 semantics).
- Existing implementation:
  - `packages/ai-services/src/context-compiler.ts` (tier 7/8 compilation,
    `memoryTier()` at line ~906; PRESENT requires structural content within
    budget; UNAVAILABLE/EMPTY/OVERFLOWED otherwise; freshness metadata in
    provenance at lines 317–319).
  - `packages/memory/src/freshness.ts` (`deriveFreshness`: STALE when the
    projection's source revision number != head revision number).
  - `packages/memory/src/rebuild.ts` (`processRebuild`: materializes
    projections per scope).
  - `apps/api/src/e2e/gates.test.ts` (G9 test at line 584; the vacuous
    filter at line 636–637).
  - `apps/api/src/e2e/setup.ts` (`e2e.compileFull`, memory port wiring).

## Environment prerequisites

Follow [environment preflight](../../docs/11-deployment/ENVIRONMENT-PREFLIGHT.md).
Record actual OS/tool versions, service endpoints (redacted), scratch DB
ownership and required tools. Ubuntu installs missing native task
prerequisites without Docker; Windows reuses existing running Docker
services/data. List permission/network/credential blockers; never reset
working databases for tests. Use disposable scratch databases for all
fixture tests (`novelforge_test_*`); never run two suites against the same
scratch database name concurrently.

## Dependencies and evidence

- **NF-WF-011** (context compiler + G9 gate): IMPLEMENTED — the G9 test
  exists and the authoritative `/memory/status` STALE assertion passes.
  This task strengthens the compiler-tier half; it does not replace the
  status-route assertion.
- **NF-WF-026** (worker AI wiring): IMPLEMENTED — the compiler lives at
  `packages/ai-services/src/context-compiler.ts`; the memory port is wired
  via the worker AI path. The test must use the same port wiring as the
  existing G9 test (no test-only compiler bypass).
- **GAP-043** (OPEN/P1) in
  [ISSUES-AND-GAPS](../../docs/implementation/ISSUES-AND-GAPS.md).
  Record new technical problems there before any workaround.

## Scope

### Allowed paths

- `apps/api/src/e2e/gates.test.ts` — add the dedicated unconditional
  stale-tier test case (new `it()` block within the G9 describe, or a new
  describe if the reviewer prefers; do not modify the existing G9 test's
  assertions).
- Test fixture/projection-seeding helpers used by the e2e suite (only if
  the existing helpers cannot produce a PRESENT tier 7/8 block; prefer
  reuse).
- `docs/implementation/ISSUES-AND-GAPS.md` — GAP-043 closure record only
  (coordinator-owned at closure time).

### Forbidden paths

- Production compiler changes (`packages/ai-services/src/context-compiler.ts`).
  If evidence during implementation shows the compiler drops staleness
  metadata from PRESENT blocks, record it as a separate GAP-043 sub-finding
  in ISSUES-AND-GAPS.md — do not silently fix the compiler in a test task.
- Changes to the existing G9 test's assertions or its `/memory/status`
  check.
- New API routes, schema/migration changes, new tiers, LLM in the test
  path.

### Inputs

- A chapter with saved content and at least one canon fact visible at the
  projection's source revision (so the built projection has structural
  content: facts, threads, or promises).
- `processRebuild` from `@novelforge/memory`, called with the chapter's
  scope at revision R1.
- A head-moving canon revision (R2) after the rebuild, making the R1
  projection STALE.
- `e2e.compileFull` with the memory port wired (same as the existing G9
  test).

### Outputs

- A named test asserting, unconditionally: the tier 7/8 PRESENT block
  collection is non-empty, and every block's provenance carries
  `freshness === "STALE"` with `sourceRevisionId` equal to R1 (the stale
  revision, not the head).
- GAP-043 closure record in ISSUES-AND-GAPS.md (coordinator-owned).

### Out of scope

- Fixing the compiler if it drops metadata (separate finding, not silent).
- The `/memory/status` authoritative assertion (already unconditional;
  untouched).
- UI changes, new gates, or changes to other e2e gate tests.

## Behavior and invariants

### The dedicated stale-tier test (normative)

1. Create a chapter and save content with enough substance for memory
   extraction (follow the existing G9 fixture pattern).
2. Ensure at least one canon fact exists and is visible at the current
   head revision R1 (create via `s.canon.createEntity` + `createFact`
   BEFORE the rebuild, unlike the existing G9 test which creates the
   fact after).
3. Read the head revision id R1; assert truthy.
4. Call `processRebuild(db, { workspaceId, novelId, scope: chapterScope(ch.id), sourceRevisionId: R1 })`.
5. Verify the projection row exists for the scope with `sourceRevisionId === R1`
   (query `db.memoryProjection`; assert the row is present — do not assume
   the rebuild succeeded).
6. Move the head: create a canon entity + fact (or any canon revision);
   read R2; assert `R2 !== R1`.
7. Compile WITHOUT rebuilding via `e2e.compileFull` (memory port wired).
8. **Anti-vacuous guard (normative):** filter
   `compiled.blocks.filter((b) => (b.tier === 7 || b.tier === 8) && b.status === "PRESENT")`;
   assert the resulting array has length > 0 (`.toHaveLength` with an
   explicit expected count, or `toBeGreaterThan(0)`). If this assertion
   fails, the test FAILS — it must never pass vacuously.
9. For each block in the non-empty collection, assert:
   - `b.provenance.freshness === "STALE"` (read from the block's
     provenance object).
   - `b.provenance.sourceRevisionId === R1` (the stale revision —
     proves the metadata reflects the actual stale projection, not a
     default or the head revision).
   - `b.provenance.chapterCoverage` is a non-empty array (proves the
     block carries real projection content, not an empty PRESENT).
10. Assert the block's `text` is non-empty (a PRESENT block with empty
    text would indicate the EMPTY-vs-PRESENT boundary is misclassified;
    per the compiler, PRESENT with no lines is impossible — this is a
    defense-in-depth check).

### Anti-vacuous rules (normative, apply to all new assertions)

- **R1:** No test passes on an empty collection. Every `.filter()` whose
  result is looped over or indexed into must be preceded by an explicit
  non-emptiness assertion (`.toHaveLength(n)` or
  `expect(arr.length).toBeGreaterThan(0)`).
- **R2:** No assertions inside a `for`/`forEach` loop without a preceding
  non-empty guard on the iterated collection. A loop that executes zero
  times asserts nothing.
- **R3:** No `array[0]!` or `.find(...)!` without first asserting the
  element exists (non-null assertion after a length/find check, not
  before).
- **R4:** Provenance assertions must name the expected values (R1 revision
  id, "STALE", non-empty coverage) — never assert mere presence of a
  `provenance` object.
- **R5:** The test must fail — not pass — if the fixture produces no
  PRESENT tier 7/8 block. A fixture that cannot produce PRESENT blocks is
  a broken fixture, not a passing test.

### Stale-handling proof (normative)

- The STALE freshness must derive from the actual revision skew
  (projection at R1, head at R2), proven by `sourceRevisionId === R1`
  on the block. A block claiming STALE with `sourceRevisionId === R2`
  (the head) would be incoherent — assert the distinction.
- The metadata must be read from `b.provenance` as produced by the
  compiler's `memoryTier()` path, not constructed by the test. The test
  must not set or default `freshness` itself.
- The existing `/memory/status` STALE assertion remains the
  authoritative end-to-end signal; this test constrains the
  compiler-tier half. Both must pass.

### Invariants (from NF-WF-011, restated)

- **Invariant 2 (freshness):** tiers 7/8 PRESENT blocks always carry
  freshness metadata. This task makes the test enforce it
  unconditionally.
- **Invariant 10 (no fabricated memory):** tiers 7/8 compile UNAVAILABLE
  (never empty PRESENT) when no projection exists. The new test does not
  weaken this — it only strengthens the PRESENT-case assertion.
- No production behavior change: this is a test-only task.

## Acceptance and verification

- [ ] **Unconditional stale-tier test**: new named test in
  `apps/api/src/e2e/gates.test.ts`; tier 7/8 PRESENT collection asserted
  non-empty before the loop (R1); every block has
  `provenance.freshness === "STALE"` and
  `provenance.sourceRevisionId === R1` (R4).
- [ ] **Anti-vacuous negative**: temporarily break the fixture (e.g.,
  skip the `processRebuild` call) and confirm the new test FAILS on the
  non-empty guard — proving it does not pass vacuously. (Restore the
  fixture afterwards; this is a one-time validation, not a committed
  test.)
- [ ] **Stale-metadata authenticity**: the test asserts
  `sourceRevisionId === R1` (stale revision), distinguishing it from the
  head R2. A test that only asserts `freshness === "STALE"` without the
  revision pin does not pass this gate.
- [ ] **No production changes**: `git diff` shows only the test file
  (and fixture helpers if needed). The compiler is untouched.
- [ ] **Existing G9 test untouched**: its assertions and the
  `/memory/status` check are byte-identical.
- [ ] **Commands**: `pnpm --filter @novelforge/api exec vitest run`
  on `src/e2e/gates.test.ts` (G9 describe); `npx tsc --noEmit` in
  `apps/api`; `pnpm lint` clean. Prerequisites: disposable scratch DB
  per ENVIRONMENT-PREFLIGHT; `DATABASE_URL` exported.
- [ ] Separate review of the submitted revision by an actor other than
  the implementer; findings resolved before GAP-043 closure.

Record actual results separately from expectations. Zero selected tests
or skipped integration checks do not pass this gate.

## Migration and rollback

No schema migration. No data migration. Test-only change: one new test
case (plus fixture-helper changes if needed). Baseline revision:
(coordinator-owned at dispatch). Rollback: revert the commit.

## Documentation and handoff

Update on verified evidence only:
- `docs/implementation/ISSUES-AND-GAPS.md`: GAP-043 closure record
  (status, evidence, revision) — coordinator-owned.
- `docs/14-progress/CURRENT.md` and test-matrix: verified scope.

Use the Engram save/recovery protocol per the playbook; on failure keep
the compact handoff in the task record and log it in ISSUES-AND-GAPS.md.
Never claim an unconfirmed save.

**Explicit non-goals for the reviewer to check:** no vacuous passing
(empty collections, unguarded loops, defaulted metadata); no production
compiler changes; no weakening of Invariant 10 (UNAVAILABLE stays
UNAVAILABLE); no assertion that the status-route check is redundant.

**Unknowns / risks:**
- Whether the existing e2e fixture's `processRebuild` at R1 produces a
  projection with structural content for the chapter scope depends on
  the memory extraction rules; the implementer must verify the
  projection row has non-empty structural content (facts/threads/promises)
  and adjust the fixture (canon fact before rebuild) if not.
- Tier 7 vs tier 8 PRESENT-ness may differ (chapterMemory/recentMemory
  vs arcMemory); the test asserts the union is non-empty and checks each
  block — it does not require both tiers to be PRESENT.
- The anti-vacuous negative validation (skipping the rebuild) is a
  manual one-time check; it is not committed as a test.
