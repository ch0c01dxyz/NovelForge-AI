# NF-WF-022 — Endgame Planning, Debt and Closure

Status: IMPLEMENTED

## Normative vs informative

Normative: the contract sections (Goal, Scope, Behavior and invariants,
Child sections, Acceptance). Informative: rationale, examples, and
appendices.

## Goal and reason

Give authors a structured way to plan and track story closure. The
endgame module answers: which threads MUST close, which SHOULD, which
MAY, which stay OPEN, and which are SEQUEL hooks? Which setups have
unpaid callbacks? What legacy does the story leave? The ending is
condition-based (all MUST threads closed + author sign-off), never a
forced chapter-count.

This is M7. It builds on 010 (state threads/promises) and 021
(simulation for active endgame exploration, optional).

## Required reading

- `AGENTS.md` (constitution, especially §5 never silently resolve, §10
  language, §15 foundational design)
- `docs/06-ai/MODEL-EVIDENCE-POLICY.md`
- NF-WF-010 contract (state threads/promises — the endgame reads
  thread state)
- NF-WF-021 contract (simulation primitives — optional endgame
  simulation)
- `docs/design/writer-workspace/` + `DESIGN-TOKENS.md` (§15)

## Environment prerequisites

Standard: PostgreSQL 16 + pgvector, Redis 7, pnpm. See 021 contract
§Environment prerequisites. GAP-065 applies.

## Dependencies and evidence

- 010: IMPLEMENTED + PUSHED (state assembly, threads/promises)
- 021: IMPLEMENTED + PUSHED (simulation module, optional for 022C)

## Child split

Per the delivery-plan multi-child rule, NF-WF-022 splits into three
independently reviewable children. Each child has its own contract
section below, its own implementer, its own diff review, and its own
commit. Completion of NF-WF-022 requires all three.

| Child | Scope | Independent verifiability |
|---|---|---|
| **022A — Closure ledger (MUST/SHOULD/MAY/OPEN/SEQUEL)** | Thread closure statuses, closure requirements, the condition-based ending gate (no forced chapter-count) | Verifiable without callbacks or simulation: create ledger, set statuses, assert ending gate blocks/allows |
| **022B — Callbacks and legacy** | Setup/payoff callback tracking; legacy records (character/world/thematic) | Verifiable without the ledger: track a setup → payoff, assert unpaid callbacks listed; legacy recorded (via 022A's pinned shapes for the debt report, which lives in 022A) |
| **022C — Endgame simulation (optional, 021 integration)** | What-if endgame scenarios via 021 simulation; closure projection | Verifiable as integration: run simulation with endgame scenario, assert projection; skipped if 021 not enabled |

**Build order:** 022A first (foundation); 022B in parallel against
022A's pinned shapes, or after; 022C after (requires 021).

## Scope

### Allowed

- Closure ledger: per-thread status (MUST/SHOULD/MAY/OPEN/SEQUEL),
  closure criteria, evidence links
- Ending gate: condition-based (all MUST closed + author approval);
  explicit rejection of chapter-count forcing
- Callback tracking: setup events → payoff events; unpaid callback
  detection
- Legacy: character legacy, world legacy, thematic legacy records
- Debt report: aggregated view (unclosed MUSTs, unpaid callbacks,
  open threads)
- 021 integration (022C): endgame scenario via simulation primitives

### Forbidden

- Auto-closing threads (never silently resolve — §5)
- Forcing an ending at chapter N (the contract explicitly forbids)
- Writing to canon tables (read-only; endgame is planning, not canon
  mutation)
- New capabilities beyond the pinned set (§022A Capabilities)

### Inputs

- 010 thread state (reads `StoryThread` / `StoryPromise` /
  `StoryThreadEvent` via Prisma filtered by `novelId`, tenant-isolated
  per ADR-0007; read-only — no writes to these tables). Note:
  `StoryThread` uses `ThreadStatus` (ACTIVE/DORMANT/RESOLVED) and
  `StoryPromise` uses `PromiseStatus` (SETUP→PAID_OFF) — these are the
  *story* lifecycles, distinct from 022A's *closure-planning* statuses
  (MUST/SHOULD/MAY/OPEN/SEQUEL). Do not conflate them.
- Author decisions (closure statuses, approval)
- 021 simulation (optional, 022C)

### Outputs

- Closure ledger with statuses
- Ending gate verdict (BLOCKED/READY)
- Callback map (setup → payoff, unpaid list)
- Legacy records
- Debt report

### Out of scope (with follow-up owner)

- Actual chapter writing (author's work, not the module's)
- Canon mutation (remains 008's domain)

## Behavior and invariants

### Invariant 1 — Never auto-close
The module NEVER changes a thread's closure status automatically.
Status changes require explicit author action. (§5)

### Invariant 2 — No forced ending
The ending gate is condition-based. There is no "chapter N = ending"
logic anywhere. A test pins this: setting a chapter count does not
affect the gate.

### Invariant 3 — Read-only on canon
The endgame module reads thread/canon state but never writes to canon
tables. Planning only.

### Invariant 4 — MUST is blocking
The ending gate returns BLOCKED if any MUST thread is not CLOSED.
SHOULD/MAY/OPEN/SEQUEL do not block.

### Invariant 5 — Callbacks are explicit
A callback is a link from a setup event to a payoff event, created by
the author. Never auto-linked.

### Invariant 6 — Design, i18n, a11y
§15 foundational design; en+id parity; axe zero violations.

## Child 022A — Closure ledger

### Goal

The closure ledger: per-thread MUST/SHOULD/MAY/OPEN/SEQUEL statuses,
closure criteria, and the condition-based ending gate.

### Statuses (pinned)

- **MUST**: must close before the ending; blocks the gate if open
- **SHOULD**: should close; warned but not blocking
- **MAY**: may close; informational
- **OPEN**: intentionally left open (author decision, documented)
- **SEQUEL**: hook for a sequel; documented, not a debt

### Capabilities (pinned)

Following the 021 Q7 precedent (distinct domain → new capability pair
warranted):

- `endgame:read` — inspect ledger, gate, callbacks, debt report
- `endgame:manage` — create/update ledger entries, link callbacks,
  record legacy, approve the gate

**Role mapping (pinned):** OWNER/ADMIN/AUTHOR hold both; EDITOR holds
`endgame:read` only (may inspect the debt report, but closure decisions
are the author's act); VIEWER holds neither.

Rationale: Endgame is a distinct planning domain. Reusing
`canon:manage` would grant canon-authoring power; reusing
`simulation:manage` would grant simulation-running power. Neither is
semantically correct for closure planning.

### Routes (additive)

- `POST .../endgame/ledger` — create ledger entry (threadId, status,
  criteria, rationale)
- `PATCH .../endgame/ledger/:id` — update status (explicit author
  action; audit-logged)
- `GET .../endgame/ledger` — list with status filter
- `GET .../endgame/gate` — ending gate verdict (BLOCKED/READY +
  blocking items)
- `POST .../endgame/gate/approve` — author sign-off (required for READY;
  requires `endgame:manage`; the approver's identity is recorded)
- `GET .../endgame/debt-report` — aggregated debt report (pinned shape):
  `{ unclosedMusts: [{ ledgerId, threadId, status, criteria }], unpaidCallbacks: [{ callbackId, setupEventId, description }], openThreads: [{ threadId, title }], sequelHooks: [{ ledgerId, threadId, description }], generatedAt: string }`

### Web UI

Endgame panel: ledger list with status badges, gate status banner,
approve action. §15 design; en+id; axe.

### Migration (additive)

New tables: `endgame_ledger` (threadId, status enum, criteria,
rationale, timestamps), `endgame_gate_approval`. GAP-030 pattern.
`endgame_ledger.threadId` → `StoryThread` with `onDelete: Cascade`
(a ledger entry for a deleted thread is meaningless).

### Acceptance — 022A

- [ ] Ledger CRUD works; status changes audit-logged (via existing
  `audit_logs` / audit service; no new audit table).
- [ ] Gate returns BLOCKED with unclosed MUSTs; READY when all MUSTs
  closed + approved.
- [ ] Debt report aggregates correctly (pinned shape).
- [ ] No chapter-count logic exists (grep-verified).
- [ ] UI: ledger + gate banner + debt report; en+id; axe zero.
- [ ] No canon writes.

## Child 022B — Callbacks and legacy

### Goal

Track setup/payoff callbacks and record legacy. (The debt report lives
in 022A as a read-model over the ledger + callbacks.)

### Routes (additive)

- `POST .../endgame/callbacks` — link setup → payoff (explicit)
- `GET .../endgame/callbacks/unpaid` — setups without payoff
- `POST .../endgame/legacy` — record legacy (character/world/thematic)

### Web UI

Callbacks tab (setup → payoff graph, unpaid highlighted); Legacy tab;
Debt report view. §15; en+id; axe.

### Migration (additive)

`endgame_callback` (setupEventId, payoffEventId, status),
`endgame_legacy` (kind, subjectId, description). GAP-030.

### Acceptance — 022B

- [ ] Callback link created explicitly; unpaid query correct.
- [ ] Legacy recorded per kind.
- [ ] UI: callbacks + legacy; en+id; axe zero.
- [ ] No auto-linking (test pins).

## Child 022C — Endgame simulation (021 integration)

### Goal

Optional: use 021 simulation to project endgame scenarios ("what if
thread X stays OPEN?"). Only if 021 module is enabled.

### Behavior

- Endgame scenario defined via 021 primitives (SimulationRun with
  endgame injections)
- Projection: which MUSTs close under the scenario
- Read-only; does not mutate the ledger

### Routes

None new — uses 021A/021B routes. If 021 not enabled → 400
`MODULE_NOT_ENABLED` (021A's prerequisite).

### Web UI

Simulation tab in the endgame panel: run projection, view results.
§15; en+id; axe. (May reuse 021D Simulation Center components.)

### Acceptance — 022C

- [ ] Projection runs via 021; results displayed.
- [ ] 021 not enabled → clean 400 (not crash).
- [ ] UI: projection view; en+id; axe zero.
- [ ] No ledger mutation from simulation.

## Acceptance and verification (parent)

- [ ] All three children IMPLEMENTED with diff reviews.
- [ ] Full API suite green; web suite green; e2e BASELINE-OK.
- [ ] No forced chapter-count logic (grep).
- [ ] i18n en+id parity; axe zero.
- [ ] Backends MODEL_UNVERIFIED per GAP-013 (standing).
