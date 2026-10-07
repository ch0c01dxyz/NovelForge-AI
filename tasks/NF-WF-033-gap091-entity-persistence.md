# NF-WF-033 — GAP-091: SimulationEntity Persistence Contract

Status: APPROVED (contract review 2026-10-07 — APPROVE_WITH_FINDINGS, 2P2+3P3 folded in; coordinator verified the fixes per reviewer's note)

Task ID: NF-WF-033
Goal: Implement SimulationEntity persistence per the 021A contract —
closing GAP-091 (the `simulation_entities` dead table).
Milestone / capability IDs: M6 (021A simulation follow-up); reuses
`simulation:read` / `simulation:manage` (no new capabilities).
Implementer role / requested and resolved model: TBD at dispatch
(separate actor from contract author and reviewer).
Reviewer role / requested and resolved model: TBD at dispatch
(separate actor from contract author and implementer).
Readiness evidence / unresolved decisions / parent acceptance owner:
This contract; GAP-091 closure check; parent coordinator acceptance.
Frozen review manifest / exact artifact paths and identity: TBD at
implementation dispatch.
Baseline revision / local changes to preserve: TBD at dispatch
(post NF-WF-027/028).
Engram checkpoint topic key / last confirmed observation reference: TBD.

## Normative vs informative

Normative: Goal, Scope, Behavior and invariants, Acceptance and
verification, Migration and rollback. Informative: rationale, examples,
appendices.

## Goal and reason

GAP-091 (OPEN / P3): `simulation_entities` is a dead table. The 021A
contract defined SimulationEntity as a computational primitive
(`id`, `runId`, `kind` — F5 kinds pinned, `attributes` JSON,
`tickCreated`, `tickRetired`), and migration
`20261006_nf_wf_021a_simulation` created the table, but the tick
implementation persists state only in
`simulation_ticks.stateBefore`/`stateAfter` JSON — no code path ever
writes or reads `simulation_entities` (023A tenant-isolation audit,
2026-10-07: zero non-test query sites; only doc comments and
`deleteMany` in test cleanup).

Author decision 2026-10-07: option (a) — implement entity persistence
per the 021A contract (not option (b), drop the table).

Fix: give entities a real write path (initial entities at run start,
per-tick deltas in the same transaction as the tick row) and a real
read path (run-scoped entity listing, current and historical), while
keeping the JSON tick state as the authoritative replayable record
(024B deterministic replay depends on it). Entities become the
queryable, identity-bearing materialization of simulation state —
addressable by id, filterable by kind, with a defined lifespan —
rather than a second source of truth competing with tick JSON.

This is a design contract, not an implemented feature. No code changes
are authorized by this document; implementation requires a separate
reviewed dispatch. A reviewed contract is required before any mutation
change (standing rule).

## Required reading

- [Operating constitution](../../AGENTS.md) (§10 development rules,
  §12 multi-LLM orchestration protocol; §5 conflicts surfaced, never
  silently reconciled).
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- [GAP-091](../../docs/implementation/ISSUES-AND-GAPS.md) (line ~1912)
  and the 2026-10-07 author decision (option a).
- [021A contract](../../tasks/NF-WF-021-simulation.md) (Child 021A:
  primitive vocabulary — SimulationEntity row; F5 kinds review;
  acceptance).
- [024 contract](../../tasks/NF-WF-024-advanced-intelligence.md)
  (024B deterministic replay — `computeTick` as the shared pure
  function; replay fidelity holds by construction).
- Existing implementation:
  - `apps/api/src/services/simulation.ts` (`computeTick` pure
    function; `stepRun` tick loop; `SimulationError` codes; `gate()`
    membership/capability pattern; `getRunOrThrow` run scoping).
  - `packages/database/prisma/migrations/20261006_nf_wf_021a_simulation/migration.sql`
    (§4 `simulation_entities` table; §5 `simulation_events.entity_id`
    FK).
  - `packages/database/prisma/schema.prisma` (`SimulationEntity`
    model).
  - `packages/story-simulation/irrigation-scenario.ts`
    (`SimulationEntity` interface; `createInitialEntities` —
    021C's civilization entities as the reference example;
    `tickCivilization` — NOT wired into the API tick path).
- `docs/11-deployment/ENVIRONMENT-PREFLIGHT.md` (test DB setup).

## Environment prerequisites

Follow [environment preflight](../../docs/11-deployment/ENVIRONMENT-PREFLIGHT.md).
Record actual OS/tool versions, service endpoints (redacted), scratch
DB ownership and required tools. Use disposable scratch databases for
all entity fixture tests. Never reset working databases for tests.

## Dependencies and evidence

- **NF-WF-021A** (simulation primitives): IMPLEMENTED — run
  lifecycle, `computeTick`, tick/event persistence, prerequisite
  gates. This task adds the entity write/read paths; it does not
  change tick semantics.
- **NF-WF-024B** (deterministic replay): IMPLEMENTED — `computeTick`
  is the shared pure function used by both `stepRun` and replay.
  This task MUST NOT change `computeTick`'s input/output contract
  (stateBefore → stateAfter + events); replay fidelity depends on it.
- **NF-WF-021C** (civilization domain): IMPLEMENTED as a pure
  package (`tickCivilization`, `createInitialEntities`) — NOT wired
  into the API `stepRun`. This task defines the entity seam that a
  future 021C-wiring task would use; wiring 021C itself is out of
  scope.
- **NF-WF-023A** (tenant-isolation audit): the audit that found
  GAP-091. No isolation risk was found (no queries = no leak); this
  task must not introduce one.
- Active issue: **GAP-091** (OPEN/P3) in
  [ISSUES-AND-GAPS](../../docs/implementation/ISSUES-AND-GAPS.md).
  Record new technical problems there before any workaround.

## Scope

### Allowed paths

- `apps/api/src/services/simulation.ts` —
  - Scenario input: accept optional `initialEntities` on run
    creation/configuration (kind + attributes; ids assigned by the
    service).
  - `stepRun`: persist initial entities at run start; per tick,
    derive entity deltas via a new pure function and persist them
    in the SAME transaction as the tick row and event rows.
  - New service method: `listEntities` (run-scoped, tick/kind
    filters), gated by `simulation:read`.
  - New pure function: `deriveEntityDeltas` (or equivalent) —
    deterministic, no LLM, no randomness (021 Invariant 6).
  - Tick rules MAY set `simulation_events.entity_id` (the FK
    already exists); the 021A minimal rule leaves it null.
- `apps/api/src/simulation-routes.ts` (or equivalent route file) —
  additive `GET .../simulations/:runId/entities` route
  (`simulation:read`; query params `tick?`, `kind?`).
- `packages/database/prisma/schema.prisma` — no model changes
  expected (table already matches); only if the reviewer requires
  it (e.g., a missing index).
- Tests: new fixture file(s) for entity lifecycle (create on run
  start, per-tick deltas, retirement, historical listing,
  isolation, determinism). Existing simulation test files keep
  passing unchanged.
- Docs: update the 021A section note and
  `docs/implementation/ISSUES-AND-GAPS.md` (GAP-091 closure record)
  with verified scope only.

### Forbidden paths

- **Changing `computeTick`'s signature or semantics.** It is the
  024B shared pure function; replay fidelity holds by construction
  only if it stays `(stateBefore, tickNumber, injections) →
  (stateAfter, events)`. Entity deltas are derived AFTER/AROUND it,
  never inside it.
- **Making entities the authoritative tick state.** The JSON
  `stateBefore`/`stateAfter` remains the replayable record. Two
  competing sources of truth would break 024B and complicate
  rollback reasoning. (Rationale in Behavior.)
- **Writing to canon tables.** 021 Invariant 1 is restated and
  re-tested, not relaxed.
- **Wiring 021C's `tickCivilization` into `stepRun`.** Separate gap,
  separate contract. This task builds the seam; it does not choose
  the civilization reducer.
- **Backfilling entities for pre-existing runs.** Forward-only
  (see Migration). No fabricated provenance.
- **New capabilities, new simulation statuses, schema changes to
  existing tables, UI changes.**

### Inputs

- Scenario: `{ initialState?, injections?, seed?, maxTicks?,
  initialEntities?: Array<{ kind: SimulationEntityKind,
  attributes: Record<string, unknown> }> }` (additive, optional).
- Per-tick entity rules (optional, scenario-defined): a pure
  reducer `(stateBefore, stateAfter, tickNumber, liveEntities) →
  EntityDelta` where `EntityDelta = { upsert: Array<{ id?,
  kind, attributes }>, retire: string[] }`.
- `listEntities`: `{ runId, tick?: number, kind?:
  SimulationEntityKind }`.

### Outputs

- Persisted `simulation_entities` rows: initial entities at run
  start (`tickCreated = 0`), per-tick deltas applied atomically
  with the tick.
- `listEntities` result: entities live at the requested tick
  (default: run's `currentTick`), each with `id`, `kind`,
  `attributes`, `tickCreated`, `tickRetired`.
- New route: `GET .../simulations/:runId/entities`.

### Out of scope

- The tick algorithm itself (`computeTick` unchanged).
- 021C civilization wiring (`tickCivilization` →
  `stepRun`); the 021C state→entity attribute mapping as a
  production reducer (the contract defines the seam and gives the
  021C mapping as a non-normative example).
- Entity relationship graphs (the 14 domain concepts' Relationship
  primitive maps to events/causal links, not to entity FKs — no new
  entity↔entity relations).
- UI surfaces for entities (Simulation Center entity views are a
  follow-up).
- Removing or deprecating the JSON tick state.
- Cross-run entity identity (entities are per-run; no global
  entity registry).

## Behavior and invariants

### Entity model (021A F5, restated normatively)

| Column | Semantics |
|---|---|
| `id` | UUIDv5 (or equivalent deterministic scheme), derived from `runId + kind + tickCreated + ordinal-within-tick` (see Deterministic entity ids). Service-assigned at creation from a stable scheme — never randomly. Stable identity within a run; byte-identical across identical reruns. |
| `runId` | FK → `simulation_runs`, ON DELETE CASCADE. Entities are per-run; no cross-run identity. |
| `kind` | `SimulationEntityKind`: SETTLEMENT / POPULATION / RESOURCE / KNOWLEDGE / INFRASTRUCTURE (pinned; extensible per-domain per F5). |
| `attributes` | JSONB. The entity's current attribute set (mutable — updated per tick). |
| `tickCreated` | Integer. First tick at which the entity exists. Initial entities: `0`. |
| `tickRetired` | Integer, nullable. First tick at which the entity no longer exists; null = still live. |
| `createdAt` | Row creation timestamp (audit, not simulation time). |

**Lifespan rule (normative):** an entity is live for ticks
`tick ∈ [tickCreated, tickRetired)`; `tickRetired = null` means live
through the run's current tick. `listEntities(tick = T)` returns
exactly the entities with `tickCreated <= T AND (tickRetired IS NULL
OR tickRetired > T)`.

### Deterministic entity ids (normative)

Entity `id`s MUST be derived deterministically — never randomly
assigned. The service MUST use a stable scheme: UUIDv5 (or
equivalent) computed from `runId + kind + tickCreated +
ordinal-within-tick`, where `ordinal-within-tick` is the entity's
index within the tick's created set (for initial entities: the
index in the `initialEntities` array; for per-tick creations: the
index in reducer output order), starting at 0.

This is REQUIRED by the determinism invariant (021 Invariant 6 /
024 Invariant 4): "same seed + same ticks run twice →
byte-identical entity rows" is achievable only if ids are
deterministic. Random UUIDs (UUIDv4) are forbidden for entity
ids. `createdAt` is audit metadata and is EXCLUDED from
byte-identical comparisons (wall-clock cannot be deterministic);
every simulation-meaningful column (`id`, `runId`, `kind`,
`attributes`, `tickCreated`, `tickRetired`) MUST be byte-identical
across identical reruns.

### Source of truth (normative decision)

**The JSON tick state (`simulation_ticks.stateBefore` /
`stateAfter`) remains the authoritative, replayable simulation
record.** Entities are a queryable, identity-bearing
materialization derived from the same tick computation, persisted
in the same transaction.

Rationale:
- 024B deterministic replay is defined as re-running `computeTick`
  over the JSON states. Making entities authoritative would require
  redefining replay in terms of entity deltas — a larger, riskier
  change with no acceptance need behind it.
- The tick JSON is append-only history; entities are a live
  projection with lifespan. The two answer different questions
  ("what was the full state at tick 5?" vs. "which settlements
  exist now?"). Keeping one authoritative avoids divergence bugs.
- Consistency is by construction: deltas are derived from the same
  `(stateBefore, stateAfter)` the tick persists, in the same
  transaction (see Transaction boundaries).

### Write path

1. **Initial entities (run start).** At `createRun` time (not first `stepRun` — the scenario row has no `initialEntities` column, so persisting at creation is the only implementable reading without a forbidden schema migration), after validation and inside the run-creation transaction, if `scenario.initialEntities` is present
   and non-empty, create one `simulation_entities` row per entry:
   `kind` and `attributes` from the entry, `tickCreated = 0`,
   `tickRetired = null`, ids derived per the deterministic scheme
   (see Deterministic entity ids). Empty/absent →
   zero rows (valid; not all simulations need entities).
   Validation: `kind` must be a valid `SimulationEntityKind`
   (400 `INVALID_INPUT` otherwise); `attributes` must be a JSON
   object. Validation occurs when the scenario is accepted (run
   creation/configuration): on failure the run is not created —
   400 `INVALID_INPUT`, zero entity rows, no partial state.
2. **Per-tick deltas.** After `computeTick` returns
   `(stateAfter, events)` for tick N, the service loads the run's
   currently-live entities and calls the pure
   `deriveEntityDeltas({ stateBefore, stateAfter, tickNumber: N,
   liveEntities, entityRules })`:
   - `entityRules` is the scenario's optional entity reducer. When
     absent, deltas are empty (entities persist untouched — the
     021A minimal rule has no entity semantics).
   - `upsert` entries with an `id` update that entity's
     `attributes` (in place); without an `id` they create a new
     row (`tickCreated = N`) with a deterministically-derived id
     (`runId + kind + N + ordinal-within-tick`, see Deterministic
     entity ids). `retire` ids set `tickRetired = N`.
   - Unknown ids in `upsert`/`retire` → 400 `INVALID_INPUT`
     (fail the tick; never silently ignore).
3. **Event linkage (optional).** Tick rules may set
   `entity_id` on `simulation_events` rows when an event concerns a
   specific entity. The FK (`ON DELETE SET NULL`) already exists.
   The 021A minimal rule leaves it null.

### Entity-rules resolution (normative)

At tick time, the service MUST resolve `entityRules` from a
**scenario-kind-keyed registry**: a static mapping from scenario
`kind` to entity reducer function. The scenario `kind` field
exists ('STANDARD' / 'WHATIF').

- Registered kinds map to their reducer; the reducer becomes the
  `entityRules` for that tick.
- Unknown or unregistered kinds resolve to null — no rules —
  which is the 021A minimal rule ("leaves it null"): deltas are
  empty and entities persist untouched.
- The registry is **code, not data**: it lives in the service
  module (`apps/api/src/services/simulation.ts` or a sibling
  module it imports), is fixed at deploy time, and is never read
  from or written to the database. No per-run, per-user, or
  per-request rule injection.
- Rationale: entity reducers are simulation semantics (like
  `computeTick` itself), not user content. A DB-backed registry
  would make tick behavior depend on mutable data, breaking
  determinism reasoning and the 024B replay contract.

### Transaction boundaries (normative)

For each tick N, the following are written in **one database
transaction**: the `simulation_ticks` row, the
`simulation_events` rows, and the entity delta writes (upserts +
retirements). The `simulation_runs.currentTick` advance for the
batch commits with the batch (existing behavior — extend the
transaction to cover entity writes, do not split it). If the
implementation batches multiple ticks per transaction today,
entity writes join that same transaction — never a separate one.
The rule is: extend whichever transaction the batch already uses.

If any write fails, the whole tick fails: no tick row, no events,
no entity changes, `currentTick` unadvanced. There is never a tick
whose JSON and whose entities disagree, because they are computed
from the same inputs and committed together.

Initial-entity creation (run start) is likewise in the transaction
of the first tick batch (or its own transaction if no ticks are
stepped — implementation detail, but atomicity per batch is
required).

### Read path

- `listEntities({ actorUserId, workspaceId, novelId, runId, tick?,
  kind? })`: gates `simulation:read` via the existing `gate()` +
  `getRunOrThrow` (workspace + novel scoping — the tenant
  boundary). Returns entities live at `tick` (default: run's
  `currentTick`), optionally filtered by `kind`, ordered by
  `tickCreated, id` (deterministic).
- Route: `GET /api/workspaces/:workspaceId/novels/:novelId/simulations/:runId/entities`
  with query `?tick=` / `?kind=`. Additive; `simulation:read`.
- `getTick` tick detail MAY include the tick's entity deltas
  (additive field; contract does not require it — implementer
  documents the choice).
- The JSON tick state is NOT removed and NOT deprecated.
  `getTick` keeps returning `stateBefore`/`stateAfter`/`events`
  unchanged.

### Consistency

- **By construction:** deltas derive from the persisted tick
  inputs in the same transaction (see Transaction boundaries).
- **No 020B rollback integration:** confirmed by inspection —
  `apps/api/src/services/revisions.ts` contains zero simulation
  references. Simulation runs are append-only: ticks are never
  deleted or rewritten (only `abortRun` changes status; there is no
  un-tick). Entity rows therefore never need rollback compensation
  beyond the per-tick transaction. If a future revision rollback
  ever touches simulation tables, that is a new contract.
- **Determinism (021 Invariant 6 / 024 Invariant 4):**
  `deriveEntityDeltas` is pure — same `(stateBefore, stateAfter,
  tickNumber, liveEntities, entityRules)` → same deltas. No LLM,
  no unseeded randomness, no wall-clock in deltas. Entity ids are
  derived deterministically (see Deterministic entity ids —
  random UUIDs are forbidden), so same seed + same ticks →
  byte-identical entity rows (asserted in tests).

### Tenant isolation

- Entities carry no `novel_id`/`workspace_id`; they inherit the
  tenant boundary via `runId` → `simulation_runs(workspace_id,
  novel_id)`. **Every entity query MUST resolve through a gated
  run lookup** (`getRunOrThrow` + capability gate) and filter by
  that run's id. Direct `simulationEntity` queries keyed by novel
  or workspace are forbidden (they would bypass the run gate).
- Reads: `simulation:read`. Writes (via `stepRun`):
  `simulation:manage`. The existing `gate()` 404-for-non-members
  behavior (ADR-0004) applies unchanged.
- The 023A audit's finding (no leak — no queries existed) must
  remain true in the stronger sense: the new queries are
  run-scoped, and the negative tests prove cross-novel 404s.

### Preserved invariants (must not weaken)

- 021 Invariant 1: simulations NEVER write to canon tables
  (regression-tested: canon counts unchanged after ticks that
  write entities).
- 021 Invariant 3: simulations run on branches; never publishable.
- 021 Invariant 4: prerequisites enforced (unchanged).
- 021 Invariant 6 / 024 Invariant 4: deterministic, replayable,
  LLM-free tick path.
- 024B replay: `computeTick` untouched; replay over JSON states
  still byte-identical.

## Acceptance and verification

- [ ] **Initial entities:** scenario with `initialEntities`
  (2 kinds) → `createRun` persists 2 rows, `tickCreated = 0`,
  `tickRetired = null`, kinds/attributes match input
  (field-by-field assert).
- [ ] **No entities when undefined:** scenario without
  `initialEntities` → zero entity rows after ticks (valid).
- [ ] **Invalid initial kind:** scenario with `initialEntities`
  containing an invalid kind → 400 `INVALID_INPUT`, zero entity
  rows, run creation fails atomically (no partial run, no orphan
  rows).
- [ ] **Per-tick updates:** scenario with an entity reducer that
  bumps an attribute per tick → after 3 ticks the entity's
  `attributes` reflect 3 applications; the tick rows and entity
  rows agree (attributes derived from the persisted
  `stateAfter`).
- [ ] **Retirement:** reducer retires an entity at tick 2 →
  `tickRetired = 2`; `listEntities(tick = 1)` includes it,
  `listEntities(tick = 2)` excludes it, `listEntities()` at
  `currentTick = 3` excludes it.
- [ ] **Atomicity:** forced failure in entity writes (e.g.,
  invalid kind injected mid-batch in a test double) → no tick
  row, no event rows, no partial entity writes, `currentTick`
  unadvanced.
- [ ] **Unknown entity id:** delta references unknown id →
  400 `INVALID_INPUT`, tick fails atomically.
- [ ] **Kind filter:** `listEntities({ kind: "RESOURCE" })`
  returns only RESOURCE rows.
- [ ] **Tenant isolation:** entities from novel A's run →
  404 from novel B's context (same workspace, different novel);
  non-member → 404; VIEWER calling `stepRun` → 403.
- [ ] **Determinism:** same seed + same ticks run twice →
  byte-identical entity rows (JSON-serialized comparison,
  including `id` values — achievable because ids are derived
  deterministically, see Deterministic entity ids; `createdAt`
  excluded as wall-clock audit metadata).
- [ ] **024B regression:** existing replay tests pass unchanged;
  tick JSON shapes unchanged.
- [ ] **No canon mutation:** canon table counts identical before
  and after entity-writing ticks.
- [ ] **Pre-existing runs:** run with ticks but zero entity rows
  → `listEntities` returns `[]` (not an error).
- [ ] **Event linkage (if implemented):** event with `entity_id`
  → `simulation_events` row carries it; deleting the entity
  (via run delete cascade test) nulls it per `ON DELETE SET NULL`.
- [ ] **Route-level:** `GET .../entities` → 200 with the entity
  list; `?tick=` / `?kind=` filter; 401 unauthenticated;
  404 for unknown run; no new error handler (existing
  `SimulationError` → platform-routes mapping).
- [ ] Commands: `pnpm --filter @novelforge/api vitest run`
  on the new entity test file(s) + `simulation.test.ts`
  regression; `npx tsc --noEmit` in `apps/api`;
  `pnpm lint` clean. Prerequisites: disposable scratch DB per
  ENVIRONMENT-PREFLIGHT; `DATABASE_URL` exported.
- [ ] Separate review of the submitted revision by an actor other
  than the implementer; findings resolved before GAP-091 closure.

Record actual results separately from expectations. Zero selected
tests or skipped integration checks do not pass this gate.

## Migration and rollback

- **Schema migration:** none. The `simulation_entities` table,
  `SimulationEntityKind` enum, indexes, and the
  `simulation_events.entity_id` FK already exist
  (`20261006_nf_wf_021a_simulation`, idempotent per GAP-030).
- **Data migration:** none — forward-only. Pre-existing runs and
  ticks have zero entity rows; `listEntities` returns `[]` for
  them. No backfill: the flat JSON state of historical runs has no
  defined entity mapping, and fabricating one would be false
  provenance (the GAP-011 precedent: never backfill what the
  schema cannot prove).
- **Rollback:** code-only revert. Entity rows written by the new
  code remain in the table but are inert (no reader depends on
  them except the new route, which reverts with the code).
  No database state to repair.
- **Deployment compatibility:** old code ignores the new
  scenario fields and the new route; new code requires no
  migration gate (table pre-exists).

## Documentation and handoff

Update on verified evidence only:
- `docs/implementation/ISSUES-AND-GAPS.md`: GAP-091 closure
  record (status, evidence, revision).
- 021A contract note (`tasks/NF-WF-021-simulation.md`): record
  that SimulationEntity persistence is now implemented, with the
  source-of-truth decision (JSON authoritative, entities
  materialized) and the forward-only data rule.
- `docs/14-progress/CURRENT.md` and test-matrix: verified scope.

**Explicit non-goals for the reviewer to check:** no
`computeTick` signature/semantics change; no entities-as-source-
of-truth; no canon writes; no 021C tick wiring; no backfill; no
new capabilities; no UI; no scope creep into what-if (027),
semantic merge (028), or recovery workstreams.

**Unknowns / risks:**
- The 021C civilization entity-reducer mapping (state fields →
  per-kind attributes per tick) is intentionally left to a
  follow-up; this contract only guarantees the seam. A reviewer
  should confirm the seam is sufficient for that follow-up
  (i.e., the reducer receives everything `tickCivilization`
  would need).
- Performance: per-tick entity writes add O(entities) writes per
  tick. Bounded by run size; the contract sets no new budget,
  but the implementer should note measured overhead in the
  handoff (evidence policy: measured, not claimed).

---

## Appendix A — 021C reference mapping (informative, non-normative)

`packages/story-simulation/irrigation-scenario.ts`
`createInitialEntities` creates one entity per F5 kind at tick 0
(settlement, population, grain resource, irrigation knowledge,
infrastructure). A future 021C-wiring contract would define a
reducer mapping `CivilizationState` fields to entity attributes
per tick (e.g., `population.count ← state.population`,
`grain.surplus ← state.grainSurplus`,
`infrastructure.level ← state.infrastructure`,
`irrigation-knowledge.{known,productionCapable} ←
state.{irrigationKnown,irrigationBuilt}`). This contract does not
normatively pin that mapping; it is shown here so the reviewer can
verify the seam carries enough information.
