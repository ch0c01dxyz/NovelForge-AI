# Task NF-WF-021: Optional simulation module contracts and implementation

Project language: English for all authored/revised artifacts and generated
project content; UI uses English (`en`)/Bahasa Indonesia (`id`) locale keys
and resources with English fallback. Record any other explicit author override
and its scope.
Model selection: author-selected at runtime; separate implementer/reviewer
actors, with requested aliases distinguished from runtime evidence.

Status: IMPLEMENTED
Milestone / capability IDs: M6 (Advanced recovery and simulation);
delivery-plan NF-WF-021 (row `:155`).
Implementer role / requested and resolved model: (one separate actor per
child — 021A, 021B, 021C; each a separate actor from the contract author,
the contract reviewer, and the other children's implementers; backend
MODEL_UNVERIFIED per GAP-013)
Reviewer role / requested and resolved model: (one separate actor per child
diff review, separate from the contract author and all implementers; backend
MODEL_UNVERIFIED per GAP-013)
Readiness evidence / unresolved decisions / parent acceptance owner: (filled
after contract review)
Frozen review manifest / exact artifact paths and identity: (filled at
review)
Baseline revision / local changes to preserve: repo HEAD `e28653b`
(2026-10-06) — NF-WF-020 pushed.
Engram checkpoint topic key / last confirmed observation reference:
Engram unavailable on this host (GAP-021); checkpoints go to
docs/implementation/progress.md.

## Normative vs informative

Normative: the child split (021A/021B/021C) and each child's scope, the
invariants (§"Behavior and invariants"), the exact route signatures and
response shapes per child, the primitive vocabulary, the prerequisite list,
the causal-evidence shape, the uncertainty-as-proposal mechanism, the
civilization scenario definition, the additive migration contents, the
acceptance checkboxes, and the question labels in §"Open questions" (the
recommendations are the author's, for the reviewer to confirm or flip).
Informative: rationale paragraphs, examples, and the recommendations for
the still-open questions.

## Goal and reason

NF-WF-020 built branch isolation and recovery. NF-WF-021 builds the
**simulation module**: optional, per-novel computational primitives that
let an author explore "what happens if" at the world level — not at the
prose level (that's the separate what-if outline idea, explicitly excluded;
see Q8), but at the level of settlements, resources, populations, and
causal chains.

The domain specification (`docs/03-domain/STORY-SIMULATION.md`) defines the
vision: persistent consequences without a perfect real-world simulator;
modules activated per novel; uncertain causal effects as proposals with
evidence, never automatic canon; the shared Story Transaction and
revision-derived projections (no separate unchecked simulation write
path); what-if isolation until an authorized, compatibility-checked merge.

The delivery plan (row `:155`) assigns five items to 021:
1. **Generic primitives** — the minimal computational vocabulary
2. **Prerequisites** — what must exist before a simulation runs
3. **Causal evidence** — how the simulation records WHY things happened
4. **Uncertainty as proposals** — uncertainty represented as proposal objects
5. **Civilization validation scenario** — the concrete end-to-end proof

This is a design contract. Implementation starts only after a separate
contract review returns APPROVE.

## Required reading

- [Operating constitution](../../AGENTS.md) (esp. §2 invariants 9
  (canon never destructively overwritten), 11 (every meaningful mutation
  versioned), 12 (rollback non-destructive); §5 canon authority —
  conflicts surfaced, never silently reconciled; §9 versioning/recovery;
  §10, §12, §13 — evidence, uncertainty, and the proposal/evidence
  distinction).
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- [Delivery plan](../../docs/implementation/DELIVERY-PLAN.md) (row
  `:155`; the multi-child rule `:160`).
- [Story simulation domain spec](../../docs/03-domain/STORY-SIMULATION.md)
  — the generic primitives (Entity, State, Event, Relationship, Knowledge,
  Resource, Rule, Dependency, Cause, Effect, Territory, Organization,
  Reputation, Timeline) and the civilization module definition.
- [NF-WF-020 contract](NF-WF-020-advanced-recovery-branches.md) (021
  consumes 020B's branches; the temporal branch model, Invariant 5;
  `Novel.currentBranchId`; `sourceRevisionId`).
- [NF-WF-010 contract](NF-WF-010-state-consumer-integration.md) (state
  assembly consumers; the 021 dependency).
- [NF-WF-008 contract](NF-WF-008-canonical-proposal-application.md)
  (CanonProposal lifecycle; the proposal pattern 021B extends).
- [What-if outline simulation idea](../../docs/ideas/what-if-outline-simulation.md)
  — explicitly distinct from 021; read for context, do not conflate.
- Existing code: `apps/api/src/services/revisions.ts` (020B branch
  operations), `packages/auth/authorization.ts` (capability vocabulary),
  `packages/database/prisma/schema.prisma` (no simulation models exist yet).

## Environment prerequisites

Follow [environment preflight](../../docs/11-deployment/ENVIRONMENT-PREFLIGHT.md).
Native PostgreSQL 16 + pgvector and Redis on localhost (no Docker on
this host); pnpm 12, Node 24; dedicated disposable
`novelforge_test_*` databases for all mutation tests. Record actual
readiness; never claim another host's checks. GAP-065 (host env
re-application) and GAP-077 (container replacement) apply.

## Dependencies and evidence

- **NF-WF-010** (state assembly) — 021 consumes assembled story state
  as simulation inputs. Status: IMPLEMENTED + PUSHED.
- **NF-WF-020** (branches) — 021 consumes 020B's branch model; simulations
  run on dedicated simulation branches. Status: IMPLEMENTED + PUSHED.
- **NF-WF-008** (canon proposals) — 021B extends the CanonProposal pattern
  for uncertainty. Status: IMPLEMENTED + PUSHED.
- **Story simulation domain spec** (`docs/03-domain/STORY-SIMULATION.md`)
  — the normative domain vocabulary. 021 implements the computational
  primitives; it does not amend the domain spec.
- Open gaps touching this task: **GAP-013** (standing: backends
  MODEL_UNVERIFIED), **GAP-028** (worker AI wiring — 021's simulation
  ticks are deterministic rules, not LLM calls, so GAP-028 does not block).

## Child split

Per the delivery-plan multi-child rule (`:160`, the 017/018/019/020
pattern), NF-WF-021 splits into four independently reviewable
children. Each child has its own contract section below, its own
implementer, its own diff review, and its own commit. Completion of
NF-WF-021 requires all four.

| Child | Scope | Independent verifiability |
|---|---|---|
| **021A — Primitives and prerequisites** | The computational primitive vocabulary (SimulationRun, Scenario, Tick, SimulationEntity, SimulationEvent); the prerequisite checklist (branch, snapshot, canon pin, module activation); the run lifecycle API (create/configure/start/step/stop) | Verifiable without causality or civilization: create a run, advance ticks, inspect state; prerequisites enforced (missing branch → 400, etc.) |
| **021B — Causal evidence and uncertainty as proposals** | CausalLink (why an event happened); the uncertainty mechanism (divergent outcomes become Proposal objects, not silent picks); integration with the CanonProposal pattern | Verifiable without civilization: force a divergent tick, assert a proposal is created (not auto-resolved); causal chains queryable |
| **021C — Civilization validation scenario** | The end-to-end proof: settlement simulation with population/resources/infrastructure; the concrete scenario (policy decision → projected outcomes); validates 021A+021B in a real domain | Verifiable as a whole: run the civilization scenario, assert the outputs match the pinned expectations; the scenario exercises primitives, prerequisites, causality, and proposals |
| **021D — Simulation Center UI** | The unified web UI for the simulation module: run list/create/detail + step controls (021A), causal chain visualization + proposal review/decide (021B), civilization guided walkthrough (021C). §15 design; en+id; axe zero | Verifiable via web tests: navigate Simulation Center, create run, step ticks, view causal chain, review/decide proposal, walk through irrigation scenario; axe zero violations |

**Justification.** 021A is the foundation — it defines what a simulation
*is* computationally and what it needs to run. Its review focus is the
primitive vocabulary (minimal, not over-engineered) and the prerequisite
enforcement (no simulation without a branch, no silent canon pollution).
It needs no causality or domain logic. 021B is the intelligence layer —
its review focus is that uncertainty is *never* silently resolved (the
constitution's §5) and that causal chains are explicit and queryable. It
needs 021A's primitives but not the civilization domain, so it
parallelizes against 021A's pinned shapes. 021C is the proof — its review
focus is that the end-to-end scenario actually validates the module (not
just a toy). It consumes 021A+021B but its scenario definition is pinned,
so it can be implemented against the pinned shapes without waiting for
code.

**Build order recommendation:** 021A first (foundation); 021B in parallel
against 021A's pinned shapes, or after; 021C after (or in parallel against
both children's pinned shapes). The parent decides the dispatch order at
implementation time.

## Scope

### Allowed

- `apps/api/src/services/simulation.ts` — new service (additive; does not
  modify existing services' behavior).
- `apps/api/src/simulation-routes.ts` — new routes (additive).
- `packages/database/prisma/schema.prisma` + additive migrations —
  simulation tables (see per-child §"Migration").
- `packages/simulation/` — new domain package for primitives, tick logic,
  causal analysis (additive; follows the `story-versioning` package pattern).
- `apps/web/app/` — Simulation Center surface (new page + components):
  run configuration, tick advancement, causal chain visualization,
  proposal review. §15 foundational design; en+id; a11y.
- `docs/implementation/progress.md`,
  `docs/14-progress/CURRENT.md`,
  `docs/implementation/test-matrix.md`,
  `docs/implementation/ISSUES-AND-GAPS.md` — receipts and GAPs
  (deviations recorded BEFORE workarounds, standing rule).

### Forbidden

- Writing to canon tables (`canon_facts`, `story_entities`, etc.) from
  simulation code — simulations use separate tables (Invariant 7).
- Auto-promoting simulation results to canon — only via the explicit
  proposal/approval flow (Invariant 8).
- Modifying 020B's branch model or 008's proposal lifecycle — 021 consumes,
  never amends.
- LLM-driven simulation ticks — ticks are deterministic rules (GAP-028
  does not block 021; LLM judgment stays M9 per delivery-plan `:57`).
- The what-if outline simulation UI — explicitly excluded (Q8); 021 builds
  world/civilization primitives, not narrative path comparison.
- New capabilities without explicit contract pinning — `simulation:read` /
  `simulation:manage` are proposed (Q7); if approved, they are the only
  additions.
- Real-world actionable instructions — the conflict/war module (if touched)
  must not produce weapon construction instructions (domain spec constraint).

### Inputs

- Existing: 020B branch operations (`createBranch`, `checkedOutBranchId`),
  010 state assembly (simulation inputs), 008 CanonProposal lifecycle,
  `revision:read` / `revision:manage`, the STORY-SIMULATION.md primitives.
- New per child: primitive shapes (021A), causal/proposal shapes (021B),
  civilization domain logic (021C).

### Outputs

- 021A: SimulationRun/Scenario/Tick primitives; prerequisite enforcement;
  run lifecycle API.
- 021B: CausalLink chains; uncertainty-as-proposal mechanism.
- 021C: Civilization scenario; end-to-end validation evidence.
- Simulation Center UI (per-child surfaces, §15, en+id, a11y).
- Docs: progress/CURRENT/test-matrix/ISSUES-AND-GAPS updates.

### Out of scope (with follow-up owner)

- What-if outline simulation (narrative path comparison) → **explicitly
  excluded** (Q8); future workstream if the author promotes the idea draft.
- Semantic/LLM-judged simulation → **M9** (delivery-plan `:57`).
- Per-novel module activation UI → **follow-up** (021A defines the
  `simulationModules` activation record; the UI is 022 or later).
- Publishing simulation results → **never** (simulations are not
  publishable; Invariant 9).
- Multiplayer/shared simulations → not 021 (single-author scope).

## Behavior and invariants

### Invariant 1 — Simulations never pollute canon

Simulation state lives in dedicated tables (`simulation_runs`,
`simulation_entities`, `simulation_events`, etc.). Simulation code MUST
NOT write to `canon_facts`, `story_entities`, `characters`, or any other
covered table. A simulation run that attempts a canon write is a
programming error, not a feature. (Constitution §2 Invariant 9.)

### Invariant 2 — Uncertainty is surfaced, never silently resolved

When a simulation tick has multiple plausible outcomes, the simulation
MUST NOT pick one silently. It creates a Proposal (021B) with the
alternatives and their evidence. The author (or an authorized rule)
decides. This is the simulation analogue of constitution §5 ("conflicts
must be surfaced, not silently reconciled").

### Invariant 3 — Simulations run on branches, never on main directly

A simulation run creates (or uses) a dedicated branch via 020B's
`createBranch`. The simulation's lineage is isolated. Simulations are
never publishable (extends 020's Invariant 9: publishing from a
simulation branch → 409 `NOT_ON_MAIN_BRANCH`).

### Invariant 4 — Prerequisites are enforced, not advisory

A simulation run MUST NOT start unless all prerequisites are met:
an existing branch, a pinned story-state snapshot, a canon pin (the
canon revision the simulation is based on), and module activation for
the novel. Missing prerequisites → 400 `INVALID_INPUT` (or a specific
409), not a warning.

### Invariant 5 — Causal chains are explicit and queryable

Every simulation event records its causes (the prior events, state
transitions, or external injections that produced it). Causality is
stored as explicit `CausalLink` rows, not inferred post-hoc. The
causal chain for any event is queryable via the API.

### Invariant 6 — Ticks are deterministic and replayable

Given the same initial state, scenario, and tick number, a simulation
MUST produce the same state. Non-determinism (e.g., from LLM calls or
unseeded randomness) is forbidden in tick logic. This enables replay,
debugging, and the 021C validation scenario's pinned expectations.

### Invariant 7 — No new write paths to story tables

021 uses the existing Story Transaction pattern for its own tables. It
does not create a separate unchecked write path to story state. (Domain
spec: "Use the shared Story Transaction and revision-derived
projections; no separate unchecked simulation write path.")

### Invariant 8 — Simulation results become canon only via proposals

If an author wants a simulation outcome to enter canon, it goes through
the 008 CanonProposal flow (propose → approve/reject). There is no
direct "promote simulation to canon" operation.

### Invariant 9 — Design, i18n, a11y

All 021 UI follows the §15 foundational design
(`docs/design/writer-workspace` + `DESIGN-TOKENS.md`). Every new string
ships en+id (programmatic parity check before any "complete" claim).
Interactive surfaces get vitest-axe checks (wcag2aa + wcag22aa, zero
violations).

## Child 021A — Primitives and prerequisites

### Goal

Define the computational vocabulary of simulation and the gates that
must be satisfied before a run starts. This is the foundation the other
children build on.

### Primitive vocabulary (pinned)

| Primitive | Meaning | Key fields |
|---|---|---|
| `SimulationRun` | A bounded simulation execution | `id`, `novelId`, `branchId`, `scenarioId`, `status` (DRAFT/CONFIGURED/RUNNING/PAUSED/PAUSED_PROPOSAL/COMPLETED/ABORTED), `currentTick`, `maxTicks`, `createdAt` |
| `Scenario` | Initial conditions + event injections | `id`, `runId`, `initialState` (JSON), `injections` (tick → event list), `seed` |
| `Tick` | A discrete time step | `runId`, `tickNumber`, `stateBefore` (JSON), `stateAfter` (JSON), `events` (list) |
| `SimulationEntity` | A simulated counterpart (NOT a canon entity) | `id`, `runId`, `kind` (SETTLEMENT/POPULATION/RESOURCE/etc.), `attributes` (JSON), `tickCreated`, `tickRetired` |
| `SimulationEvent` | Something that happened in the simulation | `id`, `runId`, `tickNumber`, `kind`, `entityId`, `payload` (JSON) |

The domain-spec primitives (Entity, State, Event, Relationship,
Knowledge, Resource, Rule, Dependency, Cause, Effect, Territory,
Organization, Reputation, Timeline) are the *conceptual* vocabulary;
the table above is the *computational* implementation. The 021A
implementer maps the domain concepts to the computational tables and
documents the mapping.

### Prerequisites (pinned, enforced)

A run transitions DRAFT → CONFIGURED → RUNNING only when:
1. **Branch exists**: `branchId` names a valid 020B branch of the novel.
   Simulations SHOULD use a dedicated simulation branch (created via
   020B `createBranch`); the run records whether the branch is
   simulation-dedicated.
2. **Snapshot pinned**: a 020 checkpoint exists for the branch head;
   the run records `snapshotId`.
3. **Canon pin**: the canon revision at simulation start is recorded
   (`canonRevisionId`); the simulation never modifies canon.
4. **Module activated**: the novel has the `simulation` module enabled
   (a `novel_modules` record; 021A defines the table, UI is follow-up).

Missing any prerequisite → 400 `INVALID_INPUT` with a specific code
(e.g., `NO_BRANCH`, `NO_SNAPSHOT`, `MODULE_NOT_ENABLED`).

### Routes (additive)

- `POST /api/workspaces/:workspaceId/novels/:novelId/simulations` —
  create run (DRAFT). Body: `{ branchId?, scenario? }`. If `branchId`
  is omitted, the run is created without a branch and the configure
  step will 400 `NO_BRANCH`; the caller may create a dedicated branch
  via 020B's `createBranch` first, or the 021A implementer MAY
  auto-provision a simulation branch (documented in the implementer
  handoff). Requires `simulation:manage` (Q7).
- `GET /api/workspaces/:workspaceId/novels/:novelId/simulations` —
  list runs. Requires `simulation:read`.
- `GET .../simulations/:runId` — run detail with current tick state.
- `POST .../simulations/:runId/configure` — validate prerequisites,
  transition to CONFIGURED. 400 if prerequisites unmet.
- `POST .../simulations/:runId/start` — begin ticking (CONFIGURED →
  RUNNING).
- `POST .../simulations/:runId/step` — advance one tick (or N ticks).
  Returns the new state + events.
- `POST .../simulations/:runId/pause` | `/abort` — pause or abort.
- `GET .../simulations/:runId/ticks/:tickNumber` — tick detail.

### Web UI

Simulation Center: run list, create dialog (branch picker, scenario
config), run detail (current tick, state inspector, step/pause/abort).
§15 design; en+id; axe.

### Migration (additive)

- `simulation_runs`, `simulation_scenarios`, `simulation_entities`,
  `simulation_events`, `simulation_ticks` tables (all novel-scoped,
  FK to novels with ON DELETE CASCADE).
- `novel_modules` table (novelId, moduleName, enabledAt) — 021A defines
  it; only the `simulation` module is used in 021.
- GAP-030 DO-block pattern; idempotent.

### Acceptance — 021A

- [ ] Create run: DRAFT run created with branch; prerequisites not yet
  validated.
- [ ] Configure with missing branch → 400 `NO_BRANCH`; missing
  snapshot → 400 `NO_SNAPSHOT`; module not enabled → 400
  `MODULE_NOT_ENABLED`.
- [ ] Configure with all prerequisites → CONFIGURED.
- [ ] Start → RUNNING; step advances tick; state changes deterministically
  (same seed + same ticks → same state, verified by re-run).
- [ ] Pause/abort work; aborted run cannot be restarted (new run required).
- [ ] Tick detail returns stateBefore/stateAfter/events.
- [ ] No canon tables written (assert via test: canon row counts unchanged
  after 100 ticks).
- [ ] UI: run list/create/detail + step controls; en+id parity; axe zero.
- [ ] Capabilities enforced (Q7); no other new capabilities.

## Child 021B — Causal evidence and uncertainty as proposals

### Goal

Make the simulation *explainable* and *honest about uncertainty*. Every
event knows why it happened; every fork in the road becomes a proposal,
not a silent choice.

### Causal evidence (pinned)

- `CausalLink`: `{ id, runId, eventId, causeEventId | causeStateRef,
  kind: "DIRECT" | "ENABLING" | "PREVENTING", evidence: JSON }`.
  - `DIRECT`: the cause directly produced the event.
  - `ENABLING`: the cause was necessary but not sufficient.
  - `PREVENTING`: the cause blocked an alternative event (counterfactual).
- Every `SimulationEvent` has ≥1 causal link, except initial-scenario
  events (which link to the scenario).
- `GET .../simulations/:runId/events/:eventId/causes` — returns the
  causal chain (recursive, bounded depth).
- Counterfactuals: "if X hadn't happened" queries return the
  PREVENTING links.

### Uncertainty as proposals (pinned)

When a tick rule encounters multiple plausible outcomes (e.g., a
population model with a confidence interval spanning a threshold):
1. The tick does NOT pick an outcome.
2. It creates a `SimulationProposal`: `{ id, runId, tickNumber,
   kind: "OUTCOME_FORK", alternatives: [{ outcome, evidence, confidence }],
   status: PROPOSED }`.
3. The run PAUSES (status → PAUSED_PROPOSAL) until the proposal is
   decided.
4. `POST .../simulations/:runId/proposals/:proposalId/decide { choice }`
   — the author picks; the tick resumes with the chosen outcome.
5. The decision is recorded in the tick's causal chain.

This mirrors 008's CanonProposal (PROPOSED → decided) but for
simulation-internal uncertainty. SimulationProposals are NOT
CanonProposals — they never enter the canon pipeline.

### Routes (additive)

- `GET .../simulations/:runId/events/:eventId/causes` — causal chain.
- `GET .../simulations/:runId/proposals` — list open proposals.
- `POST .../simulations/:runId/proposals/:proposalId/decide` — decide.
  Body: `{ choice: <alternative id>, rationale? }`.

### Web UI

Simulation Center: causal chain visualization (event → causes),
proposal review (alternatives side-by-side with evidence/confidence),
decide action. §15 design; en+id; axe.

### Migration (additive)

- `simulation_causal_links`, `simulation_proposals` tables.
- GAP-030 pattern; idempotent.

### Acceptance — 021B

- [ ] Event has causal links; chain query returns the full ancestry.
- [ ] Forced divergent tick → proposal created (not auto-resolved);
  run pauses with PAUSED_PROPOSAL.
- [ ] Decide proposal → tick resumes; decision in causal chain.
- [ ] Counterfactual query returns PREVENTING links.
- [ ] SimulationProposals are distinct from CanonProposals (no canon
  pipeline entry; assert canon_proposals count unchanged).
- [ ] UI: causal visualization + proposal review; en+id; axe zero.
- [ ] No new capabilities beyond Q7.

## Child 021C — Civilization validation scenario

### Goal

Prove the module works end-to-end with the domain spec's civilization
module. This is the concrete scenario that validates 021A+021B.

### The scenario (pinned)

**"The Irrigation Decision"**: A settlement of 500 people faces a
choice: invest 3 years of surplus in irrigation infrastructure, or
maintain current dry-farming.

- **Initial state**: Settlement (population 500, food_security 0.6,
  infrastructure 0.3), Resource (grain surplus 100 units/year),
  Knowledge (irrigation technique known, production capability unproven
  — domain spec: "knowing an idea does not equal production capability").
- **Injections**: Tick 5 — drought event (food_security -0.3);
  Tick 10 — author decides the irrigation proposal (021B).
- **Ticks**: 20 ticks (1 tick = 1 season; 5 years).
- **Expected outcomes** (pinned for validation):
  - Without irrigation: population declines to ~380 by tick 20
    (drought + no buffer).
  - With irrigation (if the proposal is approved and the 3-year
    build completes): population stabilizes at ~480, food_security
    recovers to 0.7 by tick 20.
  - The drought at tick 5 MUST create a causal chain (drought →
    crop failure → food shortage → population decline).
  - The irrigation decision MUST go through a SimulationProposal
    (uncertainty: will the 3-year build complete before the next
    drought?).

The implementer implements the civilization tick rules (population,
food, infrastructure dynamics) as deterministic functions. The exact
numbers are pinned above; the test asserts them (with a tolerance band,
e.g., ±10%, to avoid brittleness).

### Routes

No new routes — 021C uses 021A's run lifecycle and 021B's
causal/proposal routes. 021C is a domain implementation + validation,
not new API surface.

### Web UI

Simulation Center: the civilization scenario as a guided walkthrough
(setup → run → drought → proposal → decision → outcomes), with the
causal chain and population/food charts. §15 design; en+id; axe.

### Migration

None — 021C uses 021A/021B tables. (If the implementer needs
civilization-specific tables, they must be additive and reviewed.)

### Acceptance — 021C

- [ ] Scenario runs 20 ticks without error.
- [ ] Without irrigation: population ~380 (±10%) at tick 20.
- [ ] With irrigation (proposal approved): population ~480 (±10%),
  food_security ~0.7 (±10%) at tick 20.
- [ ] Drought causal chain exists and is queryable.
- [ ] Irrigation decision went through a SimulationProposal (not
  auto-resolved).
- [ ] No canon writes (canon counts unchanged).
- [ ] UI: guided walkthrough; en+id; axe zero.
- [ ] Determinism: re-running the scenario with the same seed produces
  identical ticks (byte-identical state JSON).

## Child 021D — Simulation Center UI

### Goal

Build the unified web UI for the simulation module — the Simulation
Center. This consolidates the UI scope deferred from 021A, 021B, and
021C (GAP-085, GAP-087, 021B F1) into a single coherent surface
following the foundational design (§15).

### Scope (pinned)

**021A surfaces:**
- Run list (status filter, branch, scenario; pagination)
- Create dialog (branch picker, scenario config: name, seed, tick limit)
- Run detail (current tick, status badge, state inspector showing
  entities and their attributes, step/pause/resume/abort controls)
- Tick history (tick list with stateBefore/stateAfter diff view)

**021B surfaces:**
- Causal chain visualization (event → causes, recursive ancestry,
  DIRECT/ENABLING/PREVENTING badges)
- Proposal review (alternatives side-by-side with evidence,
  confidence, rationale field; approve/reject with explicit choice —
  no silent default)
- Counterfactual panel (PREVENTING links for a selected event)

**021C surfaces:**
- Civilization guided walkthrough (setup → run → drought at tick 5 →
  proposal at tick 10 → decision → outcomes at tick 20), with the
  causal chain and population/food charts
- The walkthrough drives the 021C `irrigation-scenario` domain
  functions (or 021A/021B routes with the civilization scenario —
  implementer chooses; document the choice)

### Design, i18n, a11y

- §15 foundational design (`docs/design/writer-workspace` +
  `DESIGN-TOKENS.md`); no new design language
- en+id parity: reuse the existing `simulation.*` i18n keys added by
  021A/021B; add keys only for labels the backends did not cover
  (document additions in the handoff)
- axe zero violations (vitest-axe, same harness as 014/015/018)

### Routes

No new API routes — 021D consumes 021A's run lifecycle routes and
021B's causal/proposal routes. If a route is missing for a UI need,
the implementer records a GAP (do not add routes in 021D scope).

### Acceptance — 021D

- [ ] Run list/create/detail renders; create → configure → start →
  step → pause/resume/abort all work from the UI (against 021A routes).
- [ ] Causal chain visualization renders DIRECT/ENABLING/PREVENTING
  links for a tick's events (against 021B routes).
- [ ] Proposal review shows alternatives side-by-side; approve/reject
  requires explicit choice; decided proposal resumes the run.
- [ ] Civilization walkthrough completes setup → drought → proposal →
  decision → outcomes with charts.
- [ ] en+id parity for all new strings.
- [ ] axe zero violations on all new pages/components.

## Acceptance and verification (parent)

- [ ] All three children implemented, diff-reviewed
  (APPROVE or APPROVE_WITH_FINDINGS with fixes applied),
  committed.
- [ ] No canon tables written by simulation code (verified by test).
- [ ] No new capabilities beyond Q7 (if approved); `authorization.ts`
  diff minimal.
- [ ] Migrations: additive idempotent; simulation tables only.
- [ ] `pnpm lint`, `tsc` (api), `vue-tsc` (web) clean;
  full API + web suites green; `pnpm e2e` 20/20
  BASELINE-OK no-regression (per-file sequential per
  GAP-076).
- [ ] i18n en+id leaf parity for every new string;
  vitest-axe zero violations on all new surfaces.
- [ ] Backends MODEL_UNVERIFIED per GAP-013 (standing).
- [ ] Contract status → IMPLEMENTED only when all three
  children are committed.

## Migration and rollback

- Each child's migration is additive and idempotent
  (GAP-030 DO-blocks). 021A creates the core tables; 021B adds
  causal/proposal tables; 021C expects none.
- Rollback of the task = revert the child commits; no production
  state at risk (new tables only; existing flows untouched).
- Existing data: no backfill needed (new module; no novel has
  simulations yet).

## Documentation and handoff

- `docs/implementation/ISSUES-AND-GAPS.md`: every
  deviation, confusion, and unsupported claim recorded
  with a GAP number BEFORE any workaround (standing
  rule).
- `docs/implementation/progress.md`,
  `docs/14-progress/CURRENT.md`,
  `docs/implementation/test-matrix.md`: per-child
  sections with evidence counts.
- `docs/03-domain/STORY-SIMULATION.md`: NOT edited by
  021 (normative domain spec). If 021 discovers a contradiction,
  it is recorded as a GAP and needs an explicit author decision.
- Per-child handoff evidence (§10/§13): complete
  evidence reports with actually-executed test counts;
  no re-claiming another actor's numbers; shared-file
  lists; UNVERIFIED/honest-gap items named.

## Open questions

- **Q1 — Primitive minimality.** Recommendation: the five
  computational primitives (SimulationRun, Scenario, Tick,
  SimulationEntity, SimulationEvent) are the minimal set. The
  domain-spec's 14 concepts map to these (documented in 021A).
  Do not add primitives without a concrete use case. Reviewer
  confirms.
- **Q2 — Prerequisite strictness.** Recommendation: all four
  prerequisites (branch, snapshot, canon pin, module activation)
  are REQUIRED, not advisory. A simulation without a branch risks
  canon pollution; without a snapshot it cannot be replayed.
  Reviewer confirms.
- **Q3 — Causal link kinds.** Recommendation: the three kinds
  (DIRECT/ENABLING/PREVENTING) are sufficient. Do not add
  probabilistic causation (stays M9). Reviewer confirms.
- **Q4 — Proposal vs auto-resolve threshold.** Recommendation:
  ANY divergence (not just "significant" divergence) creates a
  proposal. There is no auto-resolve threshold — that would be
  silent reconciliation (constitution §5). Reviewer confirms.
- **Q5 — Civilization scenario scope.** Recommendation: the
  "Irrigation Decision" scenario as pinned (20 ticks, drought at
  tick 5, irrigation proposal at tick 10). It exercises all
  primitives, causality, and proposals without requiring the
  full civilization module (technology diffusion, war, etc. —
  those are follow-ups). Reviewer confirms.
- **Q6 — Simulation branches vs author branches.** Recommendation:
  simulations SHOULD use dedicated branches (created via 020B),
  but the contract does not forbid running on an author branch.
  The run records `isSimulationBranch`. A simulation branch is
  never publishable (Invariant 3). Reviewer confirms.
- **Q7 — New capabilities.** Recommendation: add
  `simulation:read` / `simulation:manage` to
  `packages/auth/authorization.ts` (workspace-scoped, mirroring
  `revision:read`/`revision:manage`). These are the only new
  capabilities. **Role mapping (pinned):** OWNER, ADMIN, and AUTHOR
  hold both (mirroring `revision:*`); EDITOR holds `simulation:read`
  only (mirroring the `revision:read`-for-continuity-reviewers
  rationale — an editor may inspect simulation outcomes, but running
  simulations is the author's act); VIEWER holds neither. The
  `simulation:read`/`simulation:manage` pair follows the established
  `domain:read`/`domain:manage` convention (canon, revision,
  reference, skill, workflow). Reusing `revision:manage` would be
  semantically wrong: it means "create a checkpoint; apply a restore,
  which rewinds story state," while simulations are non-destructive
  explorations that never rewind. Conflating them would grant
  simulation-runners the power to rewind story history. Reviewer
  confirms (new capabilities warranted; 020's Invariant 6 was
  scope-specific to versioning operations).
- **Q8 — What-if outline simulation.** Recommendation: EXCLUDE
  from 021. The idea draft explicitly says it is "distinct from
  NF-WF-021's world/civilization simulation primitives." 021
  builds world-level simulation (settlements, resources,
  causality); the what-if outline tool is narrative-level
  (comparing outline versions' story paths). They may share the
  SimulationRun primitive in the future, but 021 does not build
  the what-if UI or the outline-comparison logic. If the author
  wants it, it becomes a separate workstream. Reviewer confirms.

## Review record

### Round 1 — contract review (2026-10-06)

- **Reviewer:** separate contract-reviewer actor (depth 1/2),
  separate from the contract author, all future implementers,
  and all prior reviewers. Backends MODEL_UNVERIFIED per GAP-013.
- **Verdict: APPROVE_WITH_FINDINGS** — 2 P2 + 4 P3 findings,
  all fixed inline in the contract file. Nothing committed.
- **Findings fixed inline:**
  - **F1 (P2) — Q7 role mapping underspecified.** The contract
    proposed `simulation:read`/`simulation:manage` but did not pin
    which roles hold them. Fixed: explicit mapping pinned in Q7 —
    OWNER/ADMIN/AUTHOR hold both (mirroring `revision:*`); EDITOR
    holds `simulation:read` only (mirroring the continuity-reviewer
    rationale); VIEWER holds neither. Ruling: new capabilities are
    WARRANTED (confirming the author's recommendation). The
    `domain:read`/`domain:manage` pattern is established; simulation
    is a distinct domain; reusing `revision:manage` would be
    semantically wrong and grant excessive privilege. 020's
    Invariant 6 (no new capabilities) was scope-specific to
    versioning operations.
  - **F2 (P2) — `PAUSED_PROPOSAL` status missing from 021A.**
    021B's uncertainty mechanism transitions runs to
    `PAUSED_PROPOSAL`, but 021A's pinned `SimulationRun.status`
    enum did not include it. If 021A implemented a DB enum or
    validation without it, 021B would break. Fixed: added
    `PAUSED_PROPOSAL` to the pinned status list in the 021A
    primitive vocabulary.
  - **F3 (P3) — Branch auto-provisioning ambiguous.** The 021A
    create route accepts optional `branchId`, but the contract
    said simulations "create (or use)" a branch without specifying
    the omitted-branch behavior. Fixed: clarified that omitted
    `branchId` means the configure step 400s `NO_BRANCH`; the
    implementer MAY auto-provision (documented in handoff).
  - **F4 (P3) — Module activation without UI.** The `novel_modules`
    table is defined but no route enables the module (UI is
    follow-up). Recorded: the implementer enables the module via
    direct DB insert in tests, or adds a minimal
    `POST .../modules` route (additive, documented). Not blocking.
  - **F5 (P3) — `SimulationEntity.kind` enum open-ended.** The
    "(SETTLEMENT/POPULATION/RESOURCE/etc.)" leaves the full set
    undefined. Recorded: 021A pins the kinds it uses; 021C's
    civilization kinds (SETTLEMENT, POPULATION, RESOURCE,
    KNOWLEDGE, INFRASTRUCTURE) are the initial set; the enum is
    extensible per-domain.
  - **F6 (P3) — Proposal trigger threshold.** Q4 says "ANY
    divergence" creates a proposal, but doesn't define what counts
    as a divergence. Recorded: the implementer defines
    divergence triggers per tick rule (e.g., confidence interval
    spanning a decision threshold); the principle (never silently
    resolve) is non-negotiable, the trigger definitions are
    implementer judgment documented in the handoff.
- **Q1–Q8 dispositions:**
  - Q1 (primitive minimality): CONFIRMED — the five computational
    primitives are minimal; the 14 domain concepts map to them.
  - Q2 (prerequisite strictness): CONFIRMED — all four required.
  - Q3 (causal link kinds): CONFIRMED — three kinds sufficient.
  - Q4 (proposal threshold): CONFIRMED — any divergence → proposal;
    no auto-resolve threshold (constitution §5).
  - Q5 (civilization scope): CONFIRMED — the Irrigation Decision
    as pinned exercises all layers without the full module.
  - Q6 (simulation branches): CONFIRMED — dedicated branches
    recommended, not mandated; never publishable.
  - Q7 (new capabilities): CONFIRMED with F1 fix — new
    capabilities warranted; role mapping pinned.
  - Q8 (what-if exclusion): CONFIRMED — the idea draft explicitly
    says "distinct from NF-WF-021's world/civilization simulation
    primitives"; the delivery plan :155 does not include it; the
    exclusion is clean and leaves no gap in 021's scope.
- **Backend verification (independent re-verification):**
  - No simulation tables: `grep -ci "model Simulation"`
    returns 0 ✓
  - 020B branch ops: `createBranch` (:2051),
    `checkedOutBranchId` (:1253) exist ✓
  - No `simulation:*` capabilities: grep returns empty ✓
  - `revision:read`/`revision:manage` at authorization.ts:63/64 ✓
  - CanonProposal: PROPOSED/APPROVED/REJECTED/SUPERSEDED exist ✓
  - Domain spec: 14 primitives listed; "knowing an idea does not
    equal production capability"; "generate proposals when
    uncertain"; weapon-instructions constraint ✓
  - Delivery plan :155 scope matches (5 items) ✓
  - Multi-child rule: 021 spans multiple children ✓
  - `NOT_ON_MAIN_BRANCH` guard exists (publication.ts:309) ✓
  - `sourceRevisionId` used in 020B ✓
  - `novel_modules` does not exist (021A introduces it) — noted
- **Status after review:** contract frozen pending
  implementation dispatch.

## Backend verification (contract author)

Every normative backend claim verified against source on
2026-10-06 (repo @ `e28653b`):

- No simulation tables exist: `grep -i "model Simulation" schema.prisma`
  returns empty (verified 2026-10-06).
- 020B branch operations exist: `createBranch`, `checkedOutBranchId`
  (`apps/api/src/services/revisions.ts`, per 020B implementer handoff).
- Capabilities: `revision:read`/`revision:manage` exist
  (`packages/auth/authorization.ts:63/64`); no `simulation:*`
  capabilities exist (verified by grep).
- CanonProposal lifecycle: PROPOSED/APPROVED/REJECTED/SUPERSEDED
  (`schema.prisma:1258`); ConflictKind.FUNCTIONAL_CONFLICT exists.
- Domain spec: `docs/03-domain/STORY-SIMULATION.md` defines the 14
  generic primitives and the civilization module (read 2026-10-06).
- Delivery plan row `:155`: "Optional simulation module contracts and
  implementation", deps 010, 020; scope: "Generic primitives,
  prerequisites, causal evidence, uncertainty as proposals, civilization
  validation scenario" (read 2026-10-06).
- Multi-child rule `:160`: 021 spans multiple independently reviewable
  children (read 2026-10-06).
- What-if idea draft explicitly distinct from 021
  (`docs/ideas/what-if-outline-simulation.md`, read 2026-10-06).

UNVERIFIED / explicitly non-normative:

- The civilization scenario's pinned numbers (population 500→380/480,
  food_security 0.6→0.7) are author-chosen validation targets, not
  derived from a real model. The implementer must implement deterministic
  rules that hit these targets (±10%); the numbers are a test fixture,
  not a scientific claim.
- The 021B proposal mechanism's UI/UX (how authors compare alternatives)
  is a design judgment; the contract pins the data model and API, not
  the exact visualization.
- Whether `simulation:read`/`simulation:manage` are the right capability
  names (vs. reusing `revision:*`) is Q7 for the reviewer.
