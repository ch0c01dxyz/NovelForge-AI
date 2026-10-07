# Task NF-WF-011: Author-preview E2E and bounded long-novel fixture

Project language: English for all authored/revised artifacts and generated
project content; UI uses English (`en`)/Bahasa Indonesia (`id`) locale keys
and resources with English fallback.
Model selection: author-selected at runtime; separate implementer/reviewer
actors, with requested aliases distinguished from runtime evidence.

Status: DRAFT (contract not reviewed; implementation starts only after a
separate contract review returns APPROVE)
Milestone / capability IDs: M1–M3 minimum milestone proof; DELIVERY-PLAN
NF-WF-011 (depends on NF-WF-010); feeds NF-WF-012, NF-WF-023; partially closes
GAP-010 (E2E-runner + bounded-fixture scope; the full 2,500-chapter load
receipts remain NF-WF-023's scope and stay open there)
Implementer role / requested and resolved model: (to be assigned at dispatch)
Reviewer role / requested and resolved model: (separate actor; backend MODEL_UNVERIFIED per GAP-013)
Readiness evidence / unresolved decisions / parent acceptance owner: NF-WF-010
VERIFIED (`1454ed9` — state assembly tiers 4/6, `reviewFinalText` +
`FinalTextReview` receipts, `evaluateHealth` all 7 categories bounded,
`PolicyError` → 409 mapping, setStatus-out-of-DRAFT gate, committed and
pushed 2026-10-05). NF-WF-009 VERIFIED (`1d0a718` — revision-pinned
structural memory, `recallNovel`, freshness derivation, settle-revision
continuity). NF-WF-003 VERIFIED (context compiler tiers 1–10, char
budgets, mandatory-tier overflow refusal). NF-WF-005 VERIFIED (atomic
`decideRun`, idempotency keys, resume semantics). NF-WF-002 VERIFIED
(checkpoint / preview / apply restore, non-destructive). GAP-028 remains
OPEN and constrains testing (fake gateway/test driver for AI paths).
Frozen review manifest / exact artifact paths and identity: (filled after contract review)
Baseline revision / local changes to preserve: main @ `1454ed9` (NF-WF-010 pushed 2026-10-05)
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

Everything before this task proved components in isolation: the compiler
compiles, memory rebuilds, reviews refuse, restores apply — each against
small fixtures. Nobody has yet run the **author's actual loop** end to
end (generate → review → accept → next chapter → restore) against the
real service stack, and nobody has measured what the platform does at
novel scale (the mission is 2,000–2,500+ chapters; every budget in the
compiler is a char count that has never met a long novel).

This task does two things:

1. **Author-preview E2E**: a real, deterministic runner (`pnpm e2e`)
   that executes the full write-to-next-chapter loop through the exact
   service stack the UI calls — generate (workflow run, fake gateway) →
   approve → apply → final-text review → accept (010's setStatus gate)
   → next-chapter generation consuming settled state → checkpoint →
   restore — and asserts every M1–M3 gate along the way. "Preview" is
   pinned below: it is the author's generation surface on the novel
   page, and the E2E replays its exact API sequence. This is not a
   mock screen (constitution: no static mock counts as complete) and
   not a new E2E command invented ad hoc — the delivery plan requires
   a real runner, and 011 establishes it.
2. **Bounded long-novel fixture**: a deterministic, seeded fixture
   novel at a bounded-but-meaningful scale (300 chapters — pinned
   below) that the same runner measures: compiler context size and
   query counts at chapter 300, memory recall/rebuild at scale, health
   evaluation bounds, restore at scale. Every measurement is recorded;
   thresholds are pinned before measuring (GAP-010's closure check).

This is a design contract. Implementation starts only after a separate
contract review returns APPROVE.

## Required reading

- [Operating constitution](../../AGENTS.md) (esp. §2 invariants 11, 13,
  14, 16 — every meaningful mutation versioned; §7 context rules;
  §9 — restore creates a new revision, history stays recoverable;
  §11 Definition of Done — revalidate the final edited text).
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- [Delivery plan](../../docs/implementation/DELIVERY-PLAN.md) (NF-WF-011
  row; minimum milestone proof M1–M3; "Never invent an E2E command:
  add a real runner when NF-WF-007/011 establishes it").
- [NF-WF-003 contract](NF-WF-003-chapter-context-compiler.md) (tiers,
  budgets, mandatory-tier overflow, invariant 7: the two compiler
  callers must not drift).
- [NF-WF-005 contract](NF-WF-005-approval-decision-continuation.md)
  (atomic decide, idempotency, resume-after-restart).
- [NF-WF-007 contract](NF-WF-007-writer-ui.md) (the author-preview
  surface: generate → review → diff → accept; text and canon
  decisions separate).
- [NF-WF-009 contract](NF-WF-009-revision-derived-memory.md)
  (settle revisions, freshness, as-of; structural-only).
- [NF-WF-010 contract](NF-WF-010-state-consumer-integration.md)
  (setStatus-out-of-DRAFT gate, `reviewFinalText`, `evaluateHealth`,
  `PolicyError` envelope).
- Existing code: `apps/api/src/workflow-test-driver.ts`
  (`createTestDriver` — the real service stack with the fake gateway
  adapter), `apps/api/src/orchestrator-routes.ts` (`POST /generate`),
  `apps/api/src/services/workflow-runs.ts` (`decideRun`, idempotency),
  `apps/api/src/manuscript-routes.ts` (chapter save, setStatus),
  `apps/api/src/story-health-routes.ts` (final-text review),
  `apps/api/src/revision-routes.ts` + `services/revisions.ts`
  (checkpoint / preview / apply), `apps/api/src/services/
  context-compiler.ts` (budgets, mandatory tiers),
  `apps/web/app/pages/workspaces/[workspaceId]/novels/[novelId]/
  index.vue` + `apps/web/app/components/generation/` (the preview
  surface), `packages/auth/authorization.ts` (capability vocabulary).

## Environment prerequisites

Same as NF-WF-010: native PostgreSQL 16 + pgvector and Redis on
localhost per `docs/11-deployment/ENVIRONMENT-PREFLIGHT.md` (no Docker
on this host); pnpm 12, Node 24; dedicated disposable
`novelforge_test_*` databases — the E2E runner owns
`novelforge_test_e2e` and MUST NOT touch any other database. Record
actual readiness; never claim another host's checks. The long-novel
fixture build is the heaviest operation in the repo's test surface;
the contract pins a build-time budget (Invariant 4).

## Dependencies

- NF-WF-010 (setStatus gate, `reviewFinalText`, `evaluateHealth`,
  `PolicyError`; the loop's accept step).
- NF-WF-009 (memory recall/rebuild at scale; settle-revision
  continuity for the next-chapter step).
- NF-WF-008 (canon proposal apply/reject for the M3 accepted/
  rejected-claims gates).
- NF-WF-007 (the author-preview UI surface whose API sequence the
  E2E replays).
- NF-WF-006 (the chapter generation template the generate step
  runs through the test driver).
- NF-WF-005 (approval resume-after-restart semantics).
- NF-WF-003 (compiler tiers, budgets, mandatory overflow).
- NF-WF-002 (checkpoint / preview / apply restore mechanics).
- GAP-010 (this task's gap: E2E runner + bounded fixture; full
  2,500-chapter load receipts stay NF-WF-023's scope).
- GAP-028 (fake gateway/test driver for all AI-involving paths —
  the E2E never touches a production AI path).

## Scope

### Allowed

- `apps/api/src/e2e/` — the E2E runner: `run.ts` (the `pnpm e2e`
  entry), `author-preview.loop.test.ts` (the write-to-next-chapter
  loop), `long-novel.fixture.ts` (the bounded fixture builder),
  `long-novel.measure.test.ts` (measurements at scale),
  `measure.ts` (the query/latency/context measurement harness),
  `gates.test.ts` (the M1–M3 gate assertions, if not folded into
  the loop file). Test-only code; not imported by production
  bundles.
- `package.json` scripts: `pnpm e2e` (the real runner). No other
  new scripts.
- `docs/implementation/test-matrix.md`, `docs/implementation/
  progress.md`, `docs/14-progress/CURRENT.md`,
  `docs/implementation/ISSUES-AND-GAPS.md` — receipts, baselines,
  and any deviation BEFORE workarounds (standing rule).
- Docs: a short `docs/implementation/E2E-RUNNER.md` describing how
  to run the loop, what it asserts, and where the baselines live.

### Forbidden

- Any production service/route/schema change. The loop exercises
  the existing stack; if the loop needs a production change, that
  is a new task, not a quiet edit (constitution §12 — agents must
  not broaden scope silently).
- Real-browser automation in 011 (see Q2 — API-level loop now;
  browser pass is a follow-up decision).
- New HTTP routes, new Prisma models, new migrations. (If the
  implementer finds a migration is genuinely required, it follows
  the GAP-030 idempotent DO-block convention and gets its own
  review — but the contract expects none.)
- Touching any database other than `novelforge_test_e2e` (and the
  per-file scratch DBs the existing suites already use).
- Seeding the fixture through revision-less bulk inserts for
  measured tables: every measured row MUST be attributable to a
  real revision (Invariant 4), otherwise the scale measurements
  are fiction.

### Inputs

- `createTestDriver(db, { encryptionKey, createGateway })`
  (`apps/api/src/workflow-test-driver.ts:50`) with the fake
  gateway adapter (GAP-028) — the same driver the API suites use.
- Fastify `app.inject` against the real route tree (the same
  `buildApp` wiring the API tests use).
- The pinned API sequence (§ Invariant 2).
- Deterministic seed `FIXTURE_SEED` (pinned constant, § Invariant 4).

### Outputs

- `pnpm e2e`: green runner on a scratch DB; per-gate assertions;
  a measurements receipt (JSON + human-readable) written to
  `docs/implementation/e2e-baseline.json` (new file, committed)
  with query counts, latencies, context sizes, and thresholds.
- GAP-010 closure evidence for the E2E-runner + bounded-fixture
  scope (the 2,500-chapter load scope stays open under NF-WF-023).
- `docs/implementation/E2E-RUNNER.md`.

### Out of scope (with follow-up owner)

- Real-browser E2E (Playwright/Cypress) → **follow-up** (Q2;
  candidate owner NF-WF-023 or a dedicated UI-E2E task).
- Full 2,500-chapter load operation → **NF-WF-023** (011 proves
  the harness + thresholds at the bounded 300-chapter scale).
- Publication/reader flows → **NF-WF-012–014**.
- The memory-rebuild BullMQ worker in the loop → the loop uses
  the driver's fake queue (009's worker path is already tested in
  009); wiring the real worker into E2E is a follow-up if needed.
- New UI for the fixture or measurements → none; the fixture is
  test-only.

## Behavior and invariants

### Invariant 1 — The loop runs the real stack, not a model of it

The E2E loop MUST execute against the real service wiring: Fastify
`app.inject` on the production route tree + `createTestDriver` (the
full service stack with the fake gateway adapter). Forbidden in the
loop: stubbing `generate`, stubbing the compiler, stubbing
`reviewFinalText`/`evaluateHealth`, stubbing the revision
machinery, or asserting against hand-built expected JSON that does
not come from the services. The fake gateway is the ONE allowed
stand-in (GAP-028), and it is the production-shaped seam: the
driver's comment (`workflow-test-driver.ts:6`) states it runs "the
real AI path (fake gateway adapter)". A green loop where the
domain logic was mocked is a failure of the task, not a pass —
the reviewer MUST check the imports of the loop file for stubs.

### Invariant 2 — "Author-preview" is pinned to the UI's exact API sequence

"Author-preview" means the generation surface on the novel page
(`apps/web/app/pages/workspaces/[workspaceId]/novels/[novelId]/
index.vue` with `components/generation/`: `GenerationPanel` →
`RunStatusPanel` → `DraftDiffView` → `ApplyBar` → `ApprovalDialog`
→ `CanonApplicationReview` → `FindingsPanel`). The contract pins
the API sequence the UI performs for one accepted chapter, and the
E2E loop replays exactly this sequence (order matters):

1. `POST /api/workspaces/:workspaceId/generate`
   (`orchestrator-routes.ts:56`) with `{ agentKey, instruction,
   novelId }` — starts the chapter workflow run.
2. Drive the run to terminal via the test driver (as the worker
   would). If the run parks at `AWAITING_APPROVAL`:
   `POST /api/workspaces/:workspaceId/workflow-runs/:runId/approve`
   with `{ expectedSnapshotHash }` (`runId` is a path param;
   `definition-routes.ts:522` → `runs.decideRun`;
   `workflow:approve` capability).
3. `PUT /api/workspaces/:workspaceId/novels/:novelId/chapters/
   :chapterId` (saveChapter → creates the `ChapterVersion`;
   `manuscript-routes.ts:107`).
4. Canon decisions through the NF-WF-008 routes (apply accepted
   proposals, reject the rest — text and canon decisions stay
   separate per 007 Invariant 8).
5. `POST /api/workspaces/:workspaceId/novels/:novelId/chapters/
   :chapterId/final-text-review` with `{ chapterVersionId }`
   (`story-health-routes.ts:110`); verdict MUST be `PASS`.
6. `PATCH /api/workspaces/:workspaceId/novels/:novelId/chapters/
   :chapterId/status` with `{ status: "PUBLISHED" }`
   (`manuscript-routes.ts:138`; the 010 gate runs here — a `FAIL`
   receipt or missing receipt MUST 409, and the loop asserts the
   409 path on a deliberately-failing chapter before the passing
   one).
7. Next chapter: `POST /generate` for chapter N+1; the loop
   asserts the 009 N→N+1 continuity (the compiled context's
   tier 7/8 blocks carry chapter N's settled state at a revision
   ≥ chapter N's settle revision).
8. `POST .../checkpoints` → `POST .../restores/preview` →
   `POST .../restores/:restoreOperationId/apply`
   (`revision-routes.ts:125,166`); history-preservation
   assertions (Invariant 8).

If the UI's sequence changes (a new call, a reordered step), the
loop MUST change with it — UI↔E2E drift is a contract violation,
caught by the reviewer comparing the page's methods against the
loop file. (The exact click order inside the `.vue` file is
UNVERIFIED by the author; the API sequence above — verified
against route sources — is the normative pin.)

### Invariant 3 — The bounded long-novel fixture

The fixture is a deterministic, seeded novel built by
`long-novel.fixture.ts`:

- `FIXTURE_CHAPTERS = 300`, `FIXTURE_REVISIONS = 30` (10 chapters
  per revision — every measured row is attributable to a real
  revision; no revision-less rows for measured tables).
- `FIXTURE_CHARACTERS = 60`, `FIXTURE_FACTS = 3,000` canon facts
  (≈10/chapter), `FIXTURE_TIMELINE_EVENTS = 300`,
  `FIXTURE_THREADS = 30` (threads/promises), character states +
  knowledge windows for a rotating cast, relationship stances for
  a bounded pair set, one approved outline covering all chapters.
- `FIXTURE_SEED` — a pinned constant; the builder uses a seeded
  PRNG (mulberry32 or equivalent) so the fixture is deterministic
  for a fixed seed: identical row counts and identical sampled
  content hashes across runs (the acceptance's testable form).
  Flakes caused by nondeterministic seeding are a task failure.
- 300 is **bounded, not the mission target**: it is 30× the
  `recentMemory` window (10), large enough that compiler budgets
  bind and memory/health paths do real work, and small enough to
  build inside the build-time budget. The 2,000–2,500-chapter
  mission scale is NF-WF-023's load scope; 011 proves the harness,
  the thresholds, and the first receipts.

Why these numbers bind the budgets: 3,000 facts exceed
`FACT_BUDGET_CHARS` (6,000) by roughly two orders of magnitude in
raw text, so tier 3 MUST exercise the droppable-block path;
300 chapters exceed `HEALTH_HISTORY_CHAPTERS` (50), so health
windowing MUST engage; 30 revisions × 7 scopes give the memory
rebuild real multi-revision work.

### Invariant 4 — Measurements are recorded, then gated

The measurement harness (`measure.ts`) wraps each measured
operation and records: wall-clock latency (p50/p95 over the
measured repetitions), DB query count (via a test-only Prisma
middleware counter — `measureQueries(label, fn)`), and context
size in chars per compiler tier. Every measurement runs against
the fixture novel at chapter 300 (the worst case in the fixture).

Pinned thresholds (chosen BEFORE measuring, per GAP-010's closure
check — generous absolute ceilings for the bounded scale):

| Operation | Latency ceiling | Query ceiling |
|---|---|---|
| `compileContext` chapter 301 (full tiers) | 10 s p95 | 500 queries |
| `recallNovel` chapter 300 | 2 s p95 | 200 queries |
| memory scope rebuild at head (one scope) | 60 s | — |
| `evaluateHealth` at chapter 300 | 30 s p95 | 1,000 queries |
| checkpoint create + preview + apply | 120 s total | — |
| fixture build (all 300 chapters) | 600 s | — |

The rebuild measurement MUST call `processRebuild` from
`@novelforge/memory` directly (the same function the BullMQ
worker invokes): the test driver's memory queue is a no-op fake
(`workflow-test-driver.ts:77-79`), so `POST /memory/rebuild`
returns 202 without rebuilding — measuring the route would
measure a no-op, not a rebuild.

Plus the no-regression rule: the first green run records actuals
to `docs/implementation/e2e-baseline.json`; every later run fails
if any measurement regresses by more than 2× vs the recorded
baseline (the implementer may re-baseline only with a recorded
reason, never silently). Context-size assertions: the compiled
context for chapter 301 MUST satisfy tiers 2–9 ≤
`CONTEXT_BUDGET_CHARS` (18,000); tier 1 (instruction) is outside
that budget per the compiler's own accounting.

A measurement that cannot run in CI (e.g. the 600 s fixture
build) MUST still run locally and its receipt MUST be committed;
"too slow for CI" without a receipt is not a pass. The contract
requires the implementer to record which measurements run in CI
vs locally in `E2E-RUNNER.md`.

### Invariant 5 — M1 gates: pinned context, no silent drops, restore preserves history

- **G1 — current outline + temporally correct state reach the
  pinned context.** Compile chapter 301 on the fixture novel:
  the tier 2 (OUTLINE) block MUST carry the current approved
  outline's id/version (not a stale one); the tier 4 (STATES)
  block MUST reflect state as of chapter 300's settle revision
  (010's settle rule). Assert both pins explicitly.
- **G2 — required facts cannot be silently dropped.** With
  `mandatoryTiers: [TIERS.INSTRUCTION, TIERS.CANON]` and an
  artificially shrunk `contextBudgetChars`, a compile whose
  mandatory CANON block overflows MUST return the tier-3 block
  with status `OVERFLOWED` and the compiled context with
  `canDispatch: false` ("the caller must not dispatch",
  `context-compiler.ts:348-349`) and MUST NOT dispatch generation.
  The loop asserts: no run was created, and the overflow is
  surfaced (not an empty context).
- **G3 — restore preserves history.** On the loop novel:
  checkpoint → apply two mutations → `previewRestore` →
  `applyRestore` → assert: revision count increased by exactly 1,
  the new revision has `origin: "RESTORE"`, all pre-restore
  revisions are still readable (history endpoint), and the
  restored state matches the checkpoint pin. Non-destructive
  restore is the M1 claim; the test proves it.

### Invariant 6 — M2 gates: UI loop, resume after restart, no duplicate writes

- **G4 — author generates, reviews and accepts through the UI's
  sequence.** The loop (Invariant 2, steps 1–6) runs green on a
  fresh loop novel: chapter reaches `PUBLISHED`, a `FinalTextReview`
  receipt with verdict `PASS` exists for the published version,
  and the deliberately-failing chapter asserts the 409
  `HARD_POLICY_VIOLATION` path before the passing one (the 010
  gate is exercised, not bypassed).
- **G5 — approval resumes after restart without regenerating
  completed steps or duplicating writes.** Create a run, drive it
  to `AWAITING_APPROVAL`, then DROP the driver instance
  (simulating a worker restart; same DB, new driver). Call
  `decideRun(approve)` and drive to terminal. Assert: completed
  steps were not re-executed (step output rows identical —
  compare `output` hashes before/after), no duplicate writes
  (exactly one `ChapterVersion` for the chapter, exactly one
  decision row), and the run reaches the same terminal state as
  an uninterrupted run. Additionally: re-`POST` the run-creation
  with the same `idempotencyKey` → 200 with the existing run
  (no second run).
- **G6 — text and canon decisions stay separate in the loop.**
  The loop applies text (step 3) and canon (step 4) as distinct
  operations and asserts the canon application went through the
  008 proposal/approval path (an `CanonApplication` row with
  status `APPLIED`), never a direct fact insert.

### Invariant 7 — M3 gates: accepted informs, rejected doesn't, stale detected, evidence cited

- **G7 — accepted changes inform the next chapter.** Apply a
  canon fact through the 008 routes on the loop novel, then
  compile chapter N+1: the tier 3 (CANON) block MUST contain the
  new fact (by fact id).
- **G8 — rejected claims do not.** Reject a canon proposal
  through the 008 routes, then compile chapter N+1: the tier 3
  block MUST NOT contain the rejected claim's fact id, and the
  009 memory for chapter N+1 MUST NOT contain it either
  (rejected-fact exclusion at the E2E level).
- **G9 — stale projections are detected.** Build memory at head
  R1, create revision R2 (a canon apply), then compile chapter
  N+1 WITHOUT rebuilding: tier 7/8 blocks MUST carry staleness
  metadata (PRESENT with explicit staleness — never silent), and
  `GET .../memory/status` MUST report the scope `STALE`.
- **G10 — voice/knowledge/rhythm checks cite evidence.**
  `reviewFinalText` on the loop chapter and `evaluateHealth` on
  the fixture novel: EVERY finding MUST satisfy
  `assertFindingEvidence` (non-empty evidence with ids) —
  asserted end to end, not just at the unit level. At least one
  `KNOWLEDGE_BOUNDARY_VIOLATION` (or other 010 rule) finding is
  forced via fixture content and its evidence pins the fact id
  and the knowledge row.

### Invariant 8 — Restore is non-destructive, always

Every restore in the loop (G3 and the loop's step 8) MUST create
a new revision; MUST NOT delete or rewrite any prior revision,
checkpoint, chapter version, or canon fact row; the
`restoreOperation` row MUST reach a terminal status. The test
asserts row counts for `revisions`, `checkpoints`,
`chapter_versions`, and `canon_facts` before/after: revisions +1,
everything else unchanged in count (state changes, not row
deletion).

### Invariant 9 — Authorization is enforced on the loop

The loop runs as a novel member with the OWNER role for setup
and asserts the negative paths: a VIEWER (or non-member) calling
`POST /generate` for the novel → 401/403/404 per the existing
route gates; `decideRun` requires `workflow:approve`
(`workflow-runs.ts:441`); restore requires `revision:manage`
(`revisions.ts:1035`); setStatus keeps its existing
`chapter:publish`/`chapter:update` selection. No new
capabilities are introduced (capability vocabulary verified in
`packages/auth/authorization.ts` — `novel:*`, `chapter:*`,
`canon:*`, `workflow:approve`, `revision:*` all exist; there is
no `novel:manage`).

### Invariant 10 — No scope creep at the E2E gate

The loop MUST NOT become a place to fix product bugs it finds:
if the loop exposes a product defect, the implementer records it
in `ISSUES-AND-GAPS.md` with a GAP number and keeps the loop
asserting the contracted behavior (or marks the gate blocked
with the gap reference). Silent workarounds in the loop file —
retry-until-green, sleep-based waits for async paths, weakened
assertions — are forbidden. Async waits MUST be
condition-polling with a bounded timeout, never `sleep(N)`.

## Outputs

### Service API (test-only)

```ts
// apps/api/src/e2e/measure.ts
measureQueries<T>(label: string, fn: () => Promise<T>): Promise<{ result: T; queryCount: number }>;
measureLatency<T>(label: string, repetitions: number, fn: () => Promise<T>): Promise<{ p50Ms: number; p95Ms: number }>;
measureContext(compiled: CompiledContext): Record<string, number>; // per-tier char sizes
writeBaselineReceipt(path: string, receipt: E2EBaseline): void;    // docs/implementation/e2e-baseline.json

// apps/api/src/e2e/long-novel.fixture.ts
buildLongNovelFixture(db, opts: { seed?: number } = {}): Promise<FixtureNovel>;
// Creates FIXTURE_CHAPTERS chapters across FIXTURE_REVISIONS revisions
// (10 chapters/revision), FIXTURE_CHARACTERS characters, FIXTURE_FACTS
// canon facts, FIXTURE_TIMELINE_EVENTS timeline events,
// FIXTURE_THREADS threads/promises, one approved outline.
// Deterministic for a fixed seed. Returns ids + the head revision.
```

### The runner

- `pnpm e2e` → vitest run over `apps/api/src/e2e/` against
  `novelforge_test_e2e` (created/dropped by the runner; never any
  other database). Exit non-zero on any gate failure or threshold
  breach. The runner is the delivery-plan-mandated real runner —
  011 establishes it; it MUST NOT be invented ad hoc per run.
- `docs/implementation/e2e-baseline.json` — the committed
  measurements receipt (query counts, latencies, context sizes,
  thresholds, fixture seed, git SHA of the measured tree).
- `docs/implementation/E2E-RUNNER.md` — how to run, what each
  gate asserts, CI vs local measurements, how to re-baseline.

### HTTP routes / data model

None. No new routes, no new Prisma models, no migrations. (If the
implementer discovers a genuine need, it follows the GAP-030
idempotent DO-block convention and gets its own review — the
contract expects none and the reviewer MUST challenge any.)

### Error codes

The loop asserts existing codes only: 400 `INVALID_INPUT`, 401/403/
404 tenant gates, 409 `CONFLICT` (idempotency/head races), 409
`HARD_POLICY_VIOLATION` / `REVIEW_STALE` (010 gate, `PolicyError`
envelope), `ALREADY_DECIDED` / `RUN_CANCELLED` (005), `NOT_FOUND`
(restore). No new error codes.

## Acceptance and verification

Testable; the E2E suite IS the verification. AI-involving paths use
the fake gateway/test driver (GAP-028) — never a production AI path.

- [ ] **`pnpm e2e` exists and is green** on a scratch
  `novelforge_test_e2e` database: the full loop (Invariant 2,
  steps 1–8) completes; every gate G1–G10 passes; no stubs of
  domain logic in the loop file (reviewer checks imports).
- [ ] **M1/G1**: tier 2 carries the current approved outline
  id/version; tier 4 reflects chapter 300's settle revision.
- [ ] **M1/G2**: mandatory CANON overflow → tier-3 block
  `OVERFLOWED`, compiled context `canDispatch: false`, no run
  created, surfaced (never an empty context).
- [ ] **M1/G3**: restore → revisions +1 with `origin: "RESTORE"`;
  pre-restore history readable; state matches the checkpoint pin.
- [ ] **M2/G4**: loop chapter reaches `PUBLISHED` with a `PASS`
  receipt; the 409 `HARD_POLICY_VIOLATION` path asserted on a
  failing chapter first.
- [ ] **M2/G5**: restart-resume — step outputs identical
  (hash-compared), exactly one `ChapterVersion`, one decision
  row; idempotency-key re-POST → 200 existing run.
- [ ] **M2/G6**: canon applied via the 008 proposal path
  (`CanonApplication` `APPLIED`), never a direct fact insert.
- [ ] **M3/G7**: accepted fact present in next chapter's tier 3
  (by fact id).
- [ ] **M3/G8**: rejected claim absent from tier 3 AND from
  009 memory for the next chapter.
- [ ] **M3/G9**: forced STALE → tier 7/8 carry staleness
  metadata; `/memory/status` reports `STALE`.
- [ ] **M3/G10**: every finding from `reviewFinalText` +
  `evaluateHealth` satisfies `assertFindingEvidence`; one forced
  rule finding pins fact id + knowledge row.
- [ ] **Measurements recorded**: `e2e-baseline.json` committed
  with query counts, p50/p95 latencies, per-tier context sizes
  for chapter 301; all thresholds in Invariant 4 met;
  no-regression rule (>2× vs baseline fails) implemented.
- [ ] **Fixture determinism**: two consecutive builds with
  `FIXTURE_SEED` produce identical row counts and identical
  sampled content hashes.
- [ ] **Authorization negatives**: non-member generate →
  401/403/404; restore without `revision:manage` refused.
- [ ] **No-regression**: full API suite green; `pnpm lint`,
  typechecks clean; existing suites untouched in behavior.
- [ ] **GAP-010 closure (E2E scope)**: runner + bounded fixture +
  receipts exist; the 2,500-chapter load scope is explicitly
  handed to NF-WF-023 (not claimed closed).

## Migration and rollback

None. No schema changes, no data migration. The fixture lives and
dies inside `novelforge_test_e2e`, which the runner creates and
drops. Rollback of the task = delete `apps/api/src/e2e/` and the
`pnpm e2e` script — no production state is touched by the task at
any point.

## Documentation and handoff

- `docs/implementation/ISSUES-AND-GAPS.md`: new GAP entries for
  any deviation or defect the loop exposes BEFORE workarounds
  (standing rule); GAP-010 closure check updated for the E2E
  scope (2,500-chapter load stays open under NF-WF-023).
- `docs/implementation/progress.md` + `docs/14-progress/CURRENT.md`
  + `docs/implementation/test-matrix.md`: NF-WF-011 section with
  the gate results and the measurement baselines.
- `docs/implementation/e2e-baseline.json`: the committed receipt.
- `docs/implementation/E2E-RUNNER.md`: runner docs.
- The contract file stays frozen after review; deviations get GAP
  numbers, not silent edits.

## Open questions

1. **Fixture size vs CI runtime.** Is 300 chapters the right
   bounded scale, or should the CI fixture be smaller (e.g. 100)
   with the 300-chapter build local-only? The contract pins 300
   with a 600 s build budget; the reviewer should judge whether
   that budget is realistic for CI.
2. **Real-browser pass.** The loop is API-level (Fastify inject).
   M2's gate says "author generates, reviews and accepts through
   UI" — the contract satisfies this via the pinned UI→API
   sequence + existing 007 component tests. Is a real-browser
   pass (Playwright) required for 011, or is it a follow-up?
   (Author recommendation: follow-up; the API sequence is the
   normative pin.)
3. **Threshold numbers.** The Invariant 4 ceilings are generous
   first guesses chosen before measuring. Should any be tighter,
   or should 011 record baselines only and let NF-WF-023 set
   the load thresholds?
4. **Fixture as dump vs generated.** The contract generates the
   fixture per run from `FIXTURE_SEED`. Should a built fixture
   also be committed as a SQL dump for faster iteration, or does
   the dump rot risk outweigh it? (Author recommendation:
   generated only.)
5. **Memory worker in the loop.** The loop uses the driver's fake
   memory queue. Should the E2E instead drive the real BullMQ
   `memory-rebuild` worker (Redis-backed) to prove the 009 async
   path end to end? (Author recommendation: no — 009's worker
   path is already tested; the loop measures recall/rebuild
   logic, not the transport.)

## Review record

(Reviewer: separate contract-reviewer actor, Muse Spark model family,
backend MODEL_UNVERIFIED per GAP-013. Contract reviewed against HEAD
`1454ed9`. The reviewer made mechanical inline fixes listed below;
no design changes.)

- **Verdict: APPROVE_WITH_FINDINGS** — 3 P2 (all fixed inline),
  7 P3 (4 fixed inline, 3 observations).
- **P2-1 — setStatus route is PATCH, not POST.** Invariant 2's
  pinned 8-step sequence and the backend-verification bullet said
  `POST .../chapters/:chapterId/status`; the route is
  `app.patch` (`manuscript-routes.ts:138`). Fixed in both places.
- **P2-2 — G2 named a nonexistent overflow field.** The contract
  said "`mandatory` false → 'the caller must not dispatch'";
  the actual signal is `canDispatch: false` on the compiled
  context (`context-compiler.ts:348-349`) with the tier-3 block
  status `OVERFLOWED` (`mandatory` is a per-block boolean that is
  `true` on the overflowed block). Fixed in Invariant 6 and the
  acceptance checkbox.
- **P2-3 — rebuild threshold unmeasurable as written.** The
  driver's memory queue is a no-op fake
  (`workflow-test-driver.ts:77-79`), so `POST /memory/rebuild`
  202s without rebuilding. Pinned: the measurement calls
  `processRebuild` from `@novelforge/memory` directly (the same
  function the BullMQ worker invokes).
- **P3 (fixed inline):** approve body is `{ expectedSnapshotHash }`
  (`runId` is a path param); line-number corrections
  (story-health `:109`/`:93`, revision `:124`/`:165`);
  GAP-010 header now says "partially closes" (the 2,500-chapter
  load scope stays open under NF-WF-023); "byte-identical"
  softened to the acceptance's testable form (row counts +
  sampled content hashes).
- **P3 observations (not changed):**
  1. The >2× no-regression rule applies to noisy latency p95s as
     well as deterministic query counts/context sizes — consider
     pinning the strict rule to the deterministic measurements
     and a recorded tolerance (or local-only) for latencies, or
     expect CI flakes (interacts with Q3).
  2. "UI↔E2E drift is a contract violation" is enforced only by a
     review-time manual comparison; consider a pinned comment in
     the loop file naming the UI methods it mirrors as a
     tripwire for future UI changes.
  3. Thresholds are generous first guesses (by design, per
     GAP-010) — Q3 stands: 011 may record baselines and let
     NF-WF-023 set load thresholds.
- **Backend verification (reviewer, independent):** all author
  claims re-verified — `POST /generate` (`orchestrator-routes.ts:56`,
  body `:22-28`), approve route (`definition-routes.ts:522`,
  body `{expectedSnapshotHash}`), `decideRun` + `workflow:approve`
  gate + `ALREADY_DECIDED`/`RUN_CANCELLED` + idempotency dedup
  (`workflow-runs.ts:441-479, 255-269`), saveChapter
  (`manuscript-routes.ts:107`), story-health routes (`:75`/`:93`/
  `:109`), restore routes (`revision-routes.ts:98/124/165` →
  201s; `revision:manage` gate `:1035`; `origin: "RESTORE"`
  `:1113`), compiler budgets/tiers/mandatory (`context-compiler.ts:
  60-63, 66-75, 275, 348-349, 722`), test driver
  (`workflow-test-driver.ts:50`, fake gateway `:6`), memory
  routes (`:61`/`:74`), capability vocabulary (no `novel:manage`),
  all 7 UI components exist, no `pnpm e2e` script exists yet
  (011 adds it — not invented), GAP-010 text matches the split
  claim. Two line-ref drifts (above) corrected.
- **Normative judgment:** G1–G10 are testable and sufficient for
  the delivery-plan minimum proofs (M1 pinned context/no-silent-
  drops/restore; M2 UI sequence via the pinned API calls + resume
  + text/canon separation; M3 accepted/rejected/stale/evidence);
  thresholds are meaningful ceilings chosen pre-measurement per
  GAP-010; the 300-chapter fixture is justified (30× the
  `recentMemory` window; binds `FACT_BUDGET_CHARS`,
  `HEALTH_HISTORY_CHAPTERS`, multi-revision memory work); the
  >2× rule is sound for deterministic measurements (see
  observation 1); "no new routes/migrations/capabilities/codes"
  is achievable — all 8 steps map to existing routes verified
  above.
- **Q1–Q5** are genuinely open and the right questions.
- **Status after review:** contract DRAFT-frozen with findings
  applied; implementation may proceed. Reviewed 2026-10-05.

## Backend verification (contract author)

Every normative backend claim in this contract was verified against
source on 2026-10-05 (repo @ `1454ed9`). File:line references:

- `POST /api/workspaces/:workspaceId/generate` (+ `/generate/stream`):
  `apps/api/src/orchestrator-routes.ts:56` (`:75`); body
  `{ agentKey, instruction, novelId?, contextQuery? }` (`:22-28`).
- `decideRun` — `apps/api/src/services/workflow-runs.ts:441`;
  `workflow:approve` gate (`:444`); atomic decide transaction
  (`:457`); `ALREADY_DECIDED` / `RUN_CANCELLED` codes
  (`:468-479`); idempotency-key dedup → existing run
  (`:255-269`, `:102`).
- Approve route `POST .../workflow-runs/:runId/approve`:
  `apps/api/src/definition-routes.ts:522`.
- `PUT .../novels/:novelId/chapters/:chapterId` (saveChapter →
  new `ChapterVersion`): `apps/api/src/manuscript-routes.ts:107`.
- `PATCH .../chapters/:chapterId/status` `{IN_REVIEW|PUBLISHED}`:
  `apps/api/src/manuscript-routes.ts:138` (body `:32-33`); 010's
  setStatus gate in `apps/api/src/services/manuscript.ts`
  (out-of-DRAFT only).
- `POST .../chapters/:chapterId/final-text-review`:
  `apps/api/src/story-health-routes.ts:109`; `GET .../story-health`
  (`:75`); `GET .../story-health/unresolved` (`:93`).
- Restore: `POST .../checkpoints` → 201,
  `POST .../restores/preview` → 201 (`:124`),
  `POST .../restores/:restoreOperationId/apply`
  (`apps/api/src/revision-routes.ts:165`); `applyRestore`
  (`apps/api/src/services/revisions.ts:1034`) requires
  `revision:manage` (`:1035`); restore creates a new revision
  with `origin: "RESTORE"` (`:1113`).
- Compiler: `FACT_BUDGET_CHARS = 6_000`,
  `REF_BUDGET_CHARS = 6_000`, `CONTEXT_BUDGET_CHARS = 18_000`
  (`apps/api/src/services/context-compiler.ts:60-63`); tiers
  1–10 (`:66-75`); mandatory-tier overflow → "the caller must not
  dispatch" (`:348`); `mandatoryTiers` input (`:275, :722`).
- Test driver: `createTestDriver`
  (`apps/api/src/workflow-test-driver.ts:50`); fake gateway
  adapter (`:6`, `:46-50`); stateAssembly port (010).
- Memory routes: `GET .../memory/status` (`:61`),
  `POST .../memory/rebuild` (`apps/api/src/memory-routes.ts:74`).
- Capabilities: `packages/auth/authorization.ts:17-27`
  (`novel:*`, `chapter:*` incl. `chapter:publish`), `:45`
  (`workflow:approve`), `:56` (`canon:read`), `:63-64`
  (`revision:read/manage`); NO `novel:manage` (full list `:17-64`).
- Author-preview UI: novel page
  (`apps/web/app/pages/workspaces/[workspaceId]/novels/[novelId]/
  index.vue:11,21,617`); generation components
  (`apps/web/app/components/generation/`: `GenerationPanel.vue`,
  `RunStatusPanel.vue`, `DraftDiffView.vue`, `ApplyBar.vue`,
  `ApprovalDialog.vue`, `CanonApplicationReview.vue`,
  `FindingsPanel.vue`).
- GAP-010 (this task's gap):
  `docs/implementation/ISSUES-AND-GAPS.md:77,679` — "Expect real
  writer/reader loop and measured bounded 2,500-chapter
  operation"; closure check "Choose thresholds in the load
  contract before measuring".

UNVERIFIED / explicitly non-normative:

- The exact click order inside the novel page's `.vue` file was
  not traced line-by-line; the contract pins the API sequence
  (verified above) as normative and requires the reviewer to
  check UI↔E2E drift.
- Absolute threshold numbers in Invariant 4 are author-chosen
  ceilings (pre-measurement, per GAP-010's closure check), not
  measured values — Q3 asks the reviewer to judge them.
- CI runtime for the 300-chapter fixture build is estimated, not
  measured — Q1.

## Implementation review record

(Diff reviewer: separate actor from contract author/reviewer/implementer,
Muse Spark model family, backend MODEL_UNVERIFIED per GAP-013. This section
is an additive record — no normative contract changes.)

- **Round 1 verdict: CHANGES_REQUESTED (2026-10-05).** Independent re-run
  confirmed the implementer's 17/17 e2e claim (pnpm e2e, 3 files, exit 0),
  but the acceptance "Measurements recorded" was not genuinely met:
  **P1-1** — restore latency never measured; compile 37.6 s vs the 10 s
  ceiling with no latency assertion; no p95 recorded anywhere;
  per-tier context sizes only console.log'd, never in the baseline JSON;
  the >2× no-regression rule was dead code (`checkNoRegression` called by
  nothing); fixture-build "measurement" was a cache hit (0 ms).
  **P2-1** — G1 implemented as DB-level checks only (no compilation, no
  tier-2/tier-4 pins, relaxation unrecorded in ISSUES-AND-GAPS.md).
  **P2-2** — restore capability negative (`revision:manage`) untested.
  **P2-3** — G10 asserted `evaluateHealth` findings only; the
  `reviewFinalText` half missing. **P2-4** — progress.md inaccurate (the
  21-file API-suite failure on the old VM — /tmp 100% full — was not
  recorded). **P3** — E2E-RUNNER.md wrong revision count; fixture
  determinism missing row-count comparison; G9's conditional compiler-tier
  half unrecorded. GAP-041/042 judged LEGITIMATE adaptations (contract
  defects: `/generate` never starts a run — GenerationPanel uses the
  workflow run route; per-mutation revisions make ~4,000 the honest count).
  No inline fixes (none small-and-safe); returned to implementer.
- **Round 2 verdict: APPROVE_WITH_FINDINGS (2026-10-05).** Rework verified
  by re-reviewer's own runs: `pnpm e2e` 20/20 green (loop 3/3, gates
  10/10, measurements 7/7); restore measured via real API (1,054 ms
  ≤ 120 s); compile 246/309 ms p50/p95 with 252 queries (the 37.6 s
  number was fixture-build contamination — no ceiling breach, no GAP);
  p95 recorded + asserted for compile/recall/health; per-tier sizes in
  the schema-correct `e2e-baseline.json`; the >2× no-regression rule is
  wired and proven live; fixture build measured real (40,923 ms ≤ 600 s)
  with `SKIP_FIXTURE_BUILD=1` documented. G1 as specified: 300 real
  outline nodes via `planning.createOutlineNode` + horizon policy (window
  300), chapter 300 published via reviewFinalText→PASS→setStatus; tier 2
  PRESENT with `provenance.outlineVersionId === fixture.outlineVersionId`,
  tier 4 PRESENT with FRESH memory at ≥ settle rev. P2-2: VIEWER →
  403 FORBIDDEN on checkpoint create / restore preview / restore apply.
  P2-3: `reviewFinalText` evidence assertions added (FAIL chapter
  non-vacuous COOLDOWN_VIOLATION). Full API suite re-run on the fresh
  VM: 530/530 (the old 21-file /tmp-full failures are gone; the single
  interim failure was the pre-existing `writer-ui.test.ts` race flake,
  GAP-044). New gaps: GAP-043 (G9 conditional tier half), GAP-044
  (pre-existing race flake). Lint + typechecks clean. Ready to commit.

## Amendments (2026-10-07, NF-WF-045)

This section amends the frozen contract above to close GAP-041. The
original invariant text is preserved verbatim with SUPERSEDED markers;
nothing above is edited in place. Review record: NF-WF-045 contract
APPROVED (2026-10-07, contract review — APPROVE, 2 P3 observations
non-blocking); implementation verified (loop 3/3 pass on the disposable
E2E database; tsc + eslint clean); separate diff review APPROVE
(2026-10-07, 2 P3 observations non-blocking).

### Amendment A — Invariant 2 step 1 (generation)

SUPERSEDED (original Invariant 2 step 1, preserved):

> 1. `POST /api/workspaces/:workspaceId/generate`
>    (`orchestrator-routes.ts:56`) with `{ agentKey, instruction,
>    novelId }` — starts the chapter workflow run.

AMENDED step 1: `POST /api/workspaces/:workspaceId/workflows/:workflowId/run`
with `{ novelId, input: { chapterNumber, outlineRef }, idempotencyKey }`,
where `workflowId` is resolved by key `chapter-generation-review`
(`runs.resolveWorkflowId`) and `idempotencyKey` is fresh per intentional
start (the backend dedupes a retried submit to the existing run — 200 path).

Review record (GAP-041): three independent checks refute the `/generate`
pin — `/generate` returns a bare generation with no run row (step 2's
drive/approve is unimplementable from it); the UI (`GenerationPanel.vue`)
never calls it for chapter generation; the contract's own Goal section
already describes "generate (workflow run, fake gateway)". The implementer
deviation (workflow run route via the real `chapter-generation-review`
template, `createTestDriver`, approve at AWAITING_APPROVAL) was recorded in
GAP-041 BEFORE the workaround per Invariant 10 and is ratified by this
amendment. Invariant 2 step 7's "Next chapter: `POST /generate` for chapter
N+1" is likewise amended to the run route.

### Amendment B — Invariant 2 step 6 (publication)

SUPERSEDED (original Invariant 2 step 6, preserved):

> 6. `PATCH /api/workspaces/:workspaceId/novels/:novelId/chapters/
>    :chapterId/status` with `{ status: "PUBLISHED" }`
>    (`manuscript-routes.ts:138`; the 010 gate runs here — a `FAIL`
>    receipt or missing receipt MUST 409, and the loop asserts the
>    409 path on a deliberately-failing chapter before the passing
>    one).

AMENDED step 6: `POST /api/workspaces/:workspaceId/novels/:novelId/chapters/:chapterId/publication/publish`
(the 012 release path — the exact call the novel page's `publish()` makes,
`index.vue:819`). This creates the Publication row the public reader
resolves (GAP-046). The gate assertions move with it:

- The deliberate-FAIL chapter asserts the publish route's typed refusal:
  409 `HARD_POLICY_VIOLATION` via the shared `assertPublishReviewGate`
  (`manuscript.ts:380` — the same gate the PATCH route enforced, so the
  UI's `REVIEW_STALE` / `HARD_POLICY_VIOLATION` mapping in `index.vue:827–834`
  is preserved). The assertion names the code, never "409 or something".
- The PASS chapter's publish asserts 200 and a Publication row with status
  PUBLISHED and `chapterVersionId` equal to the pinned version (not merely
  `chapter.status === "PUBLISHED"`).

### New step 6b — public-reader proof (the readability invariant)

Publication is proven through the reader, not the status flag:

1. The loop novel is ACTIVE before the reader step (013's resolver only
   resolves ACTIVE novels). No manual promotion: the publish route flips
   DRAFT→ACTIVE on first publish (Q4, `publication.ts` — idempotent), and
   the loop asserts `novel.status === "ACTIVE"` after step 6.
2. `GET /api/public/novels/:slug/chapters/:number` (anonymous, no cookie)
   returns 200 for the published chapter.
3. The returned `chapter.content` EQUALS the pinned chapterVersion's stored
   content (compared against the version row — the content is sanitized on
   save, so the raw workflow prose is not the comparison target). This
   proves the reader serves the frozen version (012 Invariant 4). The
   assertion requires non-empty, verbatim-equal content; a 200 with empty
   or mismatched content fails.
4. Negative: the same URL for a DRAFT novel returns 404
   `{ error: "NOT_FOUND" }` — the no-oracle rule (013).

### NF-WF-046 hardening note (2026-10-07) — step 6b

The step-6b implementation was hardened per the author's local review
of `c03a171` (NF-WF-046, contract APPROVED, diff review APPROVE):

- **Independent DRAFT fixture.** The 404 negative no longer reuses the
  deliberately-failing chapter's novel from a prior `it()` block. The
  test seeds its own novel (`seedWorkspace`, DRAFT by default) +
  chapter inside the test, proves the fixture (novel DRAFT, chapter
  exists, authenticated read 200) before the anonymous GET → 404
  NOT_FOUND, and passes in isolation (`vitest run -t`, 1/1).
- **V1/V2 pinning regression.** After step 6's publish, the loop
  unpublishes via the official `manuscript.setStatus` PUBLISHED →
  IN_REVIEW path (ungated, status read back), reads the current
  version number dynamically, saves V2 with distinct marker content,
  and asserts `currentVersionId !== V1` while the Publication row
  still pins `chapterVersionId === V1`. The anonymous reader must
  return 200 with content equal to V1's stored content (non-empty),
  NOT equal to V2's content, and `publishedVersionNumber` equal to
  V1's number. This proves the reader serves the pinned version, not
  merely the current one. No production changes were made to build
  this fixture.

### Amended loop sequence (acceptance mapping)

The E2E loop replays the UI's exact API sequence, now numbered:

1. generate — workflow run route + `chapter-generation-review` template
2. drive → AWAITING_APPROVAL; approve (`decideRun`)
3. save chapter (PUT → creates the `ChapterVersion`)
4. canon decisions (create + approve application)
5. final-text-review PASS
6. publication/publish (POST → Publication row PUBLISHED)
6b. public reader — 200 with pinned content; 404 NOT_FOUND negative
7. next-chapter continuity (009 N→N+1 over settled state)
8. checkpoint → restore preview → restore apply (non-destructive)

The loop file's header deviation note is extended (not deleted) to record
that the generation deviation is now a ratified amendment, keeping the
original note as history.
