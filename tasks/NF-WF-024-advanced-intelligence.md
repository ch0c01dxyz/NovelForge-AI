# NF-WF-024 — Advanced Intelligence and Measured Optimization

Status: IMPLEMENTATION PRESENT / ACCEPTANCE BLOCKED (2026-10-07).
Implementation commit: 55998d0. GAP-100 and GAP-101 prevent full contract acceptance; NF-WF-023 release checks are not currently proven green. The prior IMPLEMENTED label described code delivery, not acceptance.

## Recorded scope amendment — 2026-10-07

Per the GAP-098 author-decision record and facac9f, 024C measured-cost Part 2 and its standalone TokenBudget tracker were removed from retained scope. Part 2 requirements below are preserved as historical contract text, not current implementation instructions. The separate 024A what-if bounded-execution budget remains required. This annotation references the recorded decision; it does not invent a new approval or prove retained 024 acceptance.

## Normative vs informative

Normative: the contract sections (Goal, Scope, Behavior and invariants,
Child sections, Acceptance). Informative: rationale, examples, and
appendices.

## Goal and reason

Make NovelForge smarter and faster without weakening anything it
already guarantees. Three thrusts:

1. **Evaluated what-if** — promote the `docs/ideas/what-if-outline-simulation.md`
   draft (the rejected 007 F2 alternative) into a real feature: compare
   simulated story paths across outline versions, with an evaluation
   harness that proves the comparison works (not just that it runs).
2. **Debugger** — give authors and developers a simulation debugger
   (breakpoints, watch, time-travel replay, event trace) on top of the
   021D Simulation Center.
3. **Semantic merge + measured cost improvements** — a deterministic
   semantic layer that safely resolves more 020C merges (never weakening
   the conservative guarantees), plus a battery of cost optimizations
   where every claim is measured before/after, never asserted.

The governing constraint (DELIVERY-PLAN): **without weaker
invariants**. Every 024 change must preserve all invariants from
014–023. The contract states, per child, exactly how that is verified.

This is M9. It depends on 023 (production release verification) for
**implementation order**: 023's acceptance battery is the invariant
guardrail 024 must keep green. The contract is drafted now; implementers
dispatch after 023 completes.

## Required reading

- `AGENTS.md` (constitution, especially §2 invariants 13–14, §5 canon
  authority, §10 development rules, §15 foundational design)
- `docs/06-ai/MODEL-EVIDENCE-POLICY.md`
- `docs/implementation/DELIVERY-PLAN.md` (the 024 row)
- `docs/ideas/what-if-outline-simulation.md` (the promoted idea draft;
  its six open questions are answered in 024A)
- `tasks/NF-WF-021-simulation.md` (simulation primitives 024A/024B
  build on; invariants 1–8)
- `tasks/NF-WF-020-advanced-recovery-branches.md` (020C conservative
  merge; 024C must not weaken it — "semantic merge stays M9")
- `tasks/NF-WF-006-*` / `tasks/NF-WF-007-*` (generation template and
  diff/review surfaces 024A reuses)
- `docs/design/writer-workspace/` + `DESIGN-TOKENS.md` (§15)

## Environment prerequisites

Standard: PostgreSQL 16 + pgvector, Redis 7, pnpm. See 021 contract
§Environment prerequisites. GAP-065 applies. Benchmarks (024C) require
a quiet host; record host conditions with each benchmark run.

## Dependencies and evidence

- 023: contract in progress (sibling orchestration); 024 implements
  after 023. 023's acceptance battery (014–022 promised scope) is 024's
  invariant guardrail.
- 021: IMPLEMENTED + PUSHED (simulation primitives; 021D Simulation
  Center).
- 020: IMPLEMENTED + PUSHED (020C conservative merge).
- 006/007: IMPLEMENTED + PUSHED (generation template; diff/review UI).
- 008: IMPLEMENTED + PUSHED (canon pipeline — what-if must never enter
  it).

## Child split

Per the delivery-plan multi-child rule, NF-WF-024 splits into three
independently reviewable children. Each child has its own contract
section below, its own implementer, its own diff review, and its own
commit. Completion of NF-WF-024 requires all three.

| Child | Scope | Independent verifiability |
|---|---|---|
| **024A — Evaluated what-if outline simulation** | Narrative-level what-if across outline versions (promotes the idea draft); bounded simulated trajectories; divergence detection; evaluation harness with fixture ground truth | Verifiable without the debugger or merge work: run the eval suite against fixture outline pairs; assert divergence recall, canon isolation, cost boundedness |
| **024B — Simulation debugger** | Breakpoints, watch, time-travel replay, event trace on 021 runs; evaluated via scripted fault-injection scenarios | Verifiable without what-if or merge: load a fixture run, set breakpoints, replay; assert fault detection and replay fidelity |
| **024C — Semantic merge + measured cost improvements** | Deterministic semantic layer over 020C merge (precision-gated evaluation); cost optimization battery (each measured before/after, independently revertible, invariant battery green) | Verifiable without what-if/debugger: run the merge fixture suite (100% precision required) and the benchmark suite (recorded deltas) |

**Build order:** 024A, 024B, 024C are mutually independent (no shared
tables; 024C touches 020C's flow read-only-plus-opt-in). Dispatch in
any order after 023. 024C's cost battery must run against the
post-023 tree.

## Scope

### Allowed

- What-if comparisons across outline versions (bounded, simulation-
  tagged, non-canon); divergence detection (structural + summaries);
  evaluation harness with fixture ground truth
- Debugger: breakpoints (tick / predicate / on-proposal), watch list,
  deterministic time-travel replay, causal event trace
- Semantic merge: deterministic analysis that narrows 020C
  `CONFLICT` → `CLEAN` only with proof; evaluated on a fixture set
  with a 100% precision gate
- Cost optimizations: query-count / latency reductions, each
  benchmarked before/after on a pinned workload, independently
  revertible, behavior-identical

### Forbidden

- Any what-if output entering the canon pipeline (008), memory
  consolidation (009), or the approved manuscript — ever, by any path
- Auto-resolving a true merge conflict (020C Invariant: apply only
  when conflicts empty; conflict → 409 with evidence)
- LLM in the merge **decision** path (advisory explanations in preview
  UI only, labeled as such)
- Editing simulation state mid-run in the debugger (breaks
  determinism/replay — 021 Invariant 6)
- Any optimization that changes observable behavior (status codes,
  error codes, shapes, authorization, validation, audit) — latency and
  query-count may change; nothing else
- Caching canon/authorization reads without invalidation tied to the
  existing revision/invalidation mechanism (§2.14)
- New capabilities (see §Capabilities)

### Inputs

- Outline versions (any status — 024A §Answers), 003 context compiler
  output, 006 generation template
- 021 simulation runs (024B), 020C merge preview/apply flow (024C)
- The 023 acceptance battery (024's invariant guardrail)

### Outputs

- What-if comparisons with divergence points (inspect-only)
- Debugger sessions (breakpoints, watch values, replayed states)
- Merge previews with semantic analysis (opt-in `mode: semantic`)
- Benchmark reports (before/after, per optimization)

### Out of scope (with follow-up owner)

- Auto-promoting what-if winners to canon (rejected by design; the
  author re-authors from insight, via 008 if canon changes are wanted)
- LLM-driven merge decisions (deferred indefinitely; deterministic
  only)
- Cross-novel benchmarking (single-novel workloads only)

## Behavior and invariants

### Invariant 0 — No weaker invariants (meta-invariant, governs all of 024)

Every 024 change must preserve **all** invariants from 014–023. "Preserve"
means: the 023 acceptance battery (which covers 014–022 promised scope
**plus 023's own Green definition** — see 023 contract §"Green") stays
green, and no 024 change alters an observable contract (routes,
status/error codes, shapes, capabilities, authorization, audit) unless via
a contract amendment reviewed separately. Any optimization that changes
observable behavior is rejected — only latency and query-count may change.
Each child states its own invariant-verification plan; the parent
re-runs the 023 battery before marking 024 IMPLEMENTED.

**Dispatch-time adequacy checklist** (parent completes before dispatching
024 implementers): (1) verify 023's Green definition is complete and the
battery exists; (2) record the exact battery scope (suites, thresholds);
(3) confirm the battery covers 023's own acceptance, not just 014–022.
Only then dispatch implementers.

### Invariant 1 — What-if never pollutes canon (§2.2, §5, 021 Invariant 1)

What-if runs are tagged `simulation: true` from creation. Their outputs
MUST NEVER enter the 008 canon pipeline, 009 memory consolidation, or the
approved manuscript. What-if results are inspect-only: there is no
approve/promote operation on a comparison. A test pins zero canon writes
across the full evaluation suite.

### Invariant 2 — Uncertainty is surfaced, never silently resolved (§5)

Divergence the what-if cannot attribute is reported as unattributed,
never smoothed over. Merge conflicts the semantic layer cannot prove
safe stay `CONFLICT` → 409 with evidence (020C behavior preserved).

### Invariant 3 — Bounded cost

Every what-if comparison declares `maxChapters` and `tokenBudget` up
front and requires explicit author confirmation. Execution halts at the
bound (partial results marked incomplete, never silently truncated).
The bound is enforced server-side, not by the LLM.

### Invariant 4 — Deterministic merge decisions

The semantic merge layer is deterministic: same inputs → same verdict,
no LLM in the decision path. LLM-generated explanations may appear in
the preview UI, labeled as advisory, and never influence apply.

### Invariant 5 — Debugger never mutates history

Breakpoints pause; watch observes; replay re-executes deterministically.
The debugger has no "edit state and continue" operation — 021
Invariant 6 (deterministic, replayable ticks) is what makes time-travel
sound, and mutating mid-run would break it.

### Invariant 6 — Design, i18n, a11y

§15 foundational design; en+id parity; axe zero violations.

### Capabilities (pinned)

**No new capabilities.** Rationale, per domain:

- 024A/024B reuse `simulation:read` / `simulation:manage` (021 Q7):
  what-if runs *are* simulations; the debugger *inspects* simulations.
  Creating a parallel `whatif:*` pair would fragment the simulation
  authorization domain for no access-control gain.
- 024C semantic merge reuses `revision:manage` (020C's merge requires
  it): semantic analysis is a *mode* of the existing merge flow, not a
  new privileged operation.
- 024C cost improvements are internal (no capability surface).

If the contract reviewer finds a privilege gap in this mapping, the
capability decision is revisited via contract amendment (021 Q7 / 022
F1 precedent).

## Child 024A — Evaluated what-if outline simulation

### Goal

Promote `docs/ideas/what-if-outline-simulation.md` from draft to
feature: the author picks 2+ outline versions, the system simulates the
story path each would produce (bounded), and shows where the paths
diverge. **Evaluated**: a fixture-based harness proves divergence
detection works, with PASS/FAIL thresholds — not just "it runs".

This is the **narrative-level** counterpart to 021's world-level
simulation (021 contract review Q8 kept them distinct). 024A consumes
021A's run lifecycle and tick storage (shared primitives), the 006
generation template (bounded variant), the 003 context compiler, and
the 007 diff/review surfaces.

### Answers to the idea draft's six open questions (pinned)

1. **Depth**: bounded — `maxChapters` (default 3) and `tokenBudget`
   (default pinned by implementer, documented) per comparison; explicit
   author confirmation required before execution (Invariant 3).
2. **Outline statuses**: any status allowed — this is the one legitimate
   use of non-APPROVED outlines. Each run records `outlineVersionId` +
   the version's status at comparison time.
3. **Divergence**: structural first (first tick/chapter where
   trajectories differ beyond a pinned threshold on a fixture-stable
   signal), plus an author-readable summary per divergence point.
4. **Approval flow**: none — "simulation review" is inspect-only. There
   is deliberately no approve/reject/promote operation (Invariant 1).
5. **Persistence**: persisted — comparisons are `whatif_comparison`
   rows linking 021A `SimulationRun`s, comparable later and re-runnable.
6. **021 interaction**: shared primitives — 021A run lifecycle + tick
   storage; 021B causal links optional per tick; never 021's
   world-entity kinds (narrative level stays in tick payloads).

### Routes (additive)

- `POST .../whatif/comparisons` — create (outlineVersionIds[2..],
  maxChapters, tokenBudget; requires `simulation:manage` + explicit
  `confirmed: true`)
- `POST .../whatif/comparisons/:id/run` — execute bounded (halts at
  budget; partial → `INCOMPLETE_BUDGET_EXHAUSTED`, never silent)
- `GET .../whatif/comparisons` — list; `GET .../whatif/comparisons/:id`
  — divergence points + side-by-side trajectories (requires
  `simulation:read`)

### Web UI

What-if panel: outline-version picker (any status, version + status
shown), budget controls with explicit confirm, divergence timeline
(structural points + summaries), side-by-side trajectory view reusing
007 diff surfaces. §15; en+id; axe.

### Migration (additive)

`whatif_comparison` (outlineVersionIds, runIds, divergencePoints JSON,
tokenBudget, tokenSpent, status). For runs: reuse 021A `simulation_runs`
(no new run table); add a `kind` column to `simulation_scenarios`
(additive, nullable, default `'STANDARD'`; GAP-030 pattern) with value
`'WHATIF'` for what-if runs. Simulated drafts live in 021A tick
payloads.

**Read-path isolation (pinned):** WHATIF runs are excluded from 021D's
Simulation Center run lists (`kind != 'WHATIF'` filter on the list
query — 024A scope includes updating 021D's list query); the what-if
panel is the sole surface for WHATIF runs. This preserves the 021 Q8
narrative/world separation.

### Evaluation (pinned — "evaluated", not just built)

`apps/api/src/whatif.eval.test.ts` (runnable via vitest):

- **Fixture set**: ≥5 outline-version pairs with **known, authored**
  divergence points (large, unambiguous story divergences, e.g. a
  character lives in A / dies in B), pinned in fixtures.
- **Metrics & thresholds**:
  - Divergence recall: detected known points / total ≥ 80%.
    (Rationale: 80% = 4/5 unambiguous fixtures; stubs are deterministic
    so a miss is a detector defect, not variance. Thresholds cannot be
    lowered to fit output per MODEL-EVIDENCE-POLICY §2.)
  - Canon isolation: zero canon-table writes across the full eval
    suite (assert row counts).
  - Cost boundedness: `tokenSpent ≤ tokenBudget` on every run; budget
    exhaustion yields `INCOMPLETE_BUDGET_EXHAUSTED`, never silent
    truncation.
- **LLM variance honesty**: the divergence-detection logic is
  evaluated against **stubbed generation** (deterministic) for the
  PASS/FAIL gate; one live-LLM smoke pair runs alongside, reported as
  MODEL_UNVERIFIED per GAP-013 (observed, not gating).
- The eval suite MUST pass for 024A sign-off; thresholds are part of
  the contract and cannot be lowered to fit output
  (MODEL-EVIDENCE-POLICY §2).

### Acceptance — 024A

- [ ] Comparison create/run/list works; non-APPROVED outlines usable;
  `confirmed: true` required.
- [ ] Eval suite green: recall ≥ 80%, zero canon writes, budget never
  exceeded.
- [ ] Budget exhaustion → `INCOMPLETE_BUDGET_EXHAUSTED` (partial results
  marked incomplete).
- [ ] No approve/promote path exists (grep-verified: no route, no UI
  affordance).
- [ ] UI: picker + budget confirm + divergence timeline + side-by-side;
  en+id; axe zero.
- [ ] 023 battery green (Invariant 0).

## Child 024B — Simulation debugger

### Goal

A debugger for 021 simulation runs: breakpoints, watch, deterministic
time-travel replay, and causal event trace — built on the 021D
Simulation Center. **Evaluated** via scripted fault-injection scenarios
with PASS/FAIL detection criteria.

021D already provides step/pause/resume and tick state diffs. 024B adds
what a stepper cannot do: stop *on condition*, observe *across* ticks,
go *backwards*, and walk *causality*.

### Scope (pinned)

- **Breakpoints**: tick number; entity-attribute predicate
  (`attributes.<path> <op> <value>`); on-proposal-raised. Hit → run
  pauses (uses 021A pause semantics; new `PAUSED_BREAKPOINT` status is
  NOT added — reuse `PAUSED`, with `pauseReason` recorded in a new
  nullable `pause_reason` column on `simulation_runs` — additive
  migration, GAP-030).
- **Watch list**: pinned entity-attribute paths, values shown per tick
  in a strip chart/table.
- **Time-travel**: replay to tick K by deterministic re-execution
  (021 Invariant 6); replayed state must be byte-identical to the
  original tick's `stateAfter` (asserted).
- **Event trace**: 021B causal-chain walk integrated into the debugger
  view (event → causes, recursively).
- **Not in scope**: editing state mid-run (Invariant 5 — forbidden);
  LLM "explain this bug" (deferred indefinitely); conditional
  breakpoints on LLM-judged predicates (deterministic predicates only).

### Routes (additive)

- `POST .../simulations/:runId/breakpoints` — create (kind, predicate
  JSON, enabled); `GET .../simulations/:runId/breakpoints`;
  `DELETE .../simulations/:runId/breakpoints/:id`
  (requires `simulation:manage` for mutations, `simulation:read` for
  list)
- `POST .../simulations/:runId/replay` `{ toTick }` — deterministic
  re-execution to tick K; returns the replayed state + fidelity proof
  (requires `simulation:read`). **Pinned: replay is non-persisting** —
  it returns replayed state + fidelity proof; it never overwrites
  stored ticks.

### Web UI

Debugger tab in the Simulation Center: breakpoint editor/list, watch
strip, replay slider (tick scrubber with fidelity badge), event trace
panel. §15; en+id; axe.

### Migration (additive)

`simulation_breakpoint` (runId, kind enum
`TICK`/`PREDICATE`/`ON_PROPOSAL`, predicate JSON, `watch` boolean column
(default false), enabled). Watch entries are `PREDICATE`-kind
breakpoints with `watch: true`. GAP-030.

### Evaluation (pinned)

Scripted fault-injection scenarios (fixtures, deterministic):

1. **Attribute crash**: injection drives an entity attribute off a
   cliff at tick 12 — a predicate breakpoint must fire at tick 12.
2. **Missing injection**: a scheduled injection is dropped — the watch
   strip must show the flatline; replay to tick 10 → 14 must reproduce
   it byte-identically.
3. **Proposal storm**: a tick raises ≥3 proposals — the on-proposal
   breakpoint must pause with all three listed.

PASS/FAIL per scenario (detection asserted in tests, not timed by a
human). Replay fidelity: `replay(K).stateAfter` byte-identical to
original tick K across all scenarios.

### Acceptance — 024B

- [ ] Breakpoints (3 kinds) fire; watch strip renders; replay
  byte-identical; trace walks 021B chains.
- [ ] Fault-injection eval: 3/3 scenarios detected.
- [ ] No state-edit operation exists (grep-verified).
- [ ] UI: debugger tab with all four surfaces; en+id; axe zero.
- [ ] 023 battery green (Invariant 0).

## Child 024C — Semantic merge + measured cost improvements

### Goal

Two measured bets in one child (both are "prove it with numbers"):

1. **Semantic merge**: a deterministic layer over 020C's conservative
   merge that safely resolves more merges — evaluated with a 100%
   precision gate.
2. **Cost improvements**: a battery of optimizations, each measured
   before/after on a pinned workload, independently revertible, and
   behavior-identical.

### Part 1 — Semantic merge (pinned rules)

A new analysis stage runs inside 020C's merge preview when
`mode: semantic` is passed (`POST .../branches/:branchId/merge/preview`,
optional `mode` param; default `conservative` = existing behavior
unchanged). The layer may **only** narrow `CONFLICT` → `CLEAN`, and only
by these deterministic rules:

- **S1 — Byte-identical change**: "identically changed on both" with
  byte-identical change payloads → `CLEAN`. (020C conservatively called
  this `CONFLICT`; the 020C review ruled that acceptable, but proof of
  byte-identity makes `CLEAN` safe.)
- **S2 — Disjoint text spans**: paragraph/sentence-granularity diff
  proving non-overlapping edit regions → `CLEAN`. Segmentation and
  diff MUST be deterministic algorithms (no LLM/ML segmenter) per
  Invariant 4 ("no LLM in the decision path").
- **S3 — Disjoint structured fields**: different fields of the same
  entity changed → `CLEAN`, **only if the fields are in different
  top-level groups** (e.g., `title` vs `description`) OR the pair is
  not in the pinned coupled-field denylist (`status`/`statusReason`,
  `role`/`roleDescription`, and any others the implementer documents).
  The fixture set MUST include adversarial coupled-field cases
  (e.g., both sides change `status` and `statusReason` differently)
  that must stay `CONFLICT` — the 100% precision gate only tests what
  the fixtures cover.

**Default: `CONFLICT`.** Anything the rules cannot prove safe stays
`CONFLICT` → 409 with evidence (020C behavior preserved). The apply
path is unchanged (applies only when conflicts empty). LLM is forbidden
in the decision path (Invariant 4); LLM-generated explanations may
appear in preview UI, labeled advisory.

**Evaluation (pinned — precision gate)**:
fixture set (≥12 merge scenarios) with ground truth:

- True-safe merges the conservative baseline refused (must now resolve:
  recall target ≥ 50%).
- True conflicts that must stay refused (**precision must be 100% —
  a single auto-merged true conflict FAILS the child**).
- The conservative baseline's verdicts on the fixtures are recorded
  first; semantic mode must never flip a conservative `CLEAN` to
  `CONFLICT` (no behavior regression on the safe side).

### Part 2 — Cost improvements (pinned method)

Each optimization is a separate, independently revertible commit-sized
change with:

1. **Benchmark before/after** on a pinned workload (defined in
   `docs/implementation/benchmarks/024C.md`): query count per
   operation + p95 latency. Numbers recorded in `test-matrix.md`;
   never claimed without a run (MODEL-EVIDENCE-POLICY §2).
2. **Threshold**: ≥15% improvement on the targeted metric; **no
   regression >5%** on any other benchmarked operation.
3. **Behavior-identical proof**: the full 023 battery green + no
   acceptance-criteria changes; any observable difference (beyond
   latency/query-count) rejects the optimization.
4. **Invalidation safety**: cached reads must tie invalidation to the
   existing revision/DerivedRebuildIntent mechanism (§2.14); a test
   pins stale-cache impossibility per optimization.

Candidate areas (non-binding; implementer measures and picks): N+1
elimination in state assembly / ledger reads, cached novel-scoped
reads with revision-pinned invalidation, index additions on hot
filter paths. **Forbidden**: touching authorization, validation, or
audit paths for speed; caching without invalidation proof.

### Routes

- Merge: no new routes — `mode: semantic|conservative` (default
  `conservative`) on the existing 020C preview route. Apply unchanged.
- Cost: no routes (internal).

### Web UI

Merge preview gains a mode toggle (conservative/semantic) + per-item
rule citations (S1/S2/S3) for semantically-resolved items; conflicts
unchanged. Cost: no UI (benchmark report in docs). §15; en+id; axe
for the toggle.

### Migration

None expected. (If an optimization needs an index, it ships as a
GAP-030 additive migration, reviewed with the optimization.)

### Acceptance — 024C

- [ ] Merge fixture suite: precision 100% (zero true-conflicts
  auto-merged), recall ≥ 50% on safe merges, no conservative-CLEAN
  flips.
- [ ] `mode` defaults to `conservative`; apply path byte-identical
  behavior (existing 020C tests green unchanged).
- [ ] No LLM in decision path (grep-verified).
- [ ] ≥1 cost optimization landed, each with recorded before/after
  (≥15% target-metric gain, ≤5% regression elsewhere), 023 battery
  green, invalidation test per cached read.
- [ ] UI: mode toggle + rule citations; en+id; axe zero.
- [ ] 023 battery green (Invariant 0).

## Acceptance and verification (parent)

- [ ] All three children implemented, diff-reviewed, evaluation suites
  green (024A recall ≥ 80%, 024B 3/3 fault scenarios, 024C precision
  100%).
- [ ] 023 acceptance battery green before and after (Invariant 0 —
  the "without weaker invariants" proof).
- [ ] Benchmark report recorded for every 024C optimization
  (before/after numbers in `test-matrix.md`).
- [ ] Full API suite green; web suite green; e2e BASELINE-OK.
- [ ] i18n en+id parity; axe zero.
- [ ] Backends MODEL_UNVERIFIED per GAP-013 (standing).
- [ ] `docs/ideas/what-if-outline-simulation.md` marked SUPERSEDED by
  024A (idea promoted to feature; history preserved per §10).
