# Task NF-WF-052: Global novel memory (L5) — union read of arc scopes

Project language: English for all authored/revised artifacts and generated
project content; UI uses English (`en`)/Bahasa Indonesia (`id`) locale keys
and resources with English fallback. Record any other explicit author override
and its scope.
Model selection: author-selected at runtime; separate implementer/reviewer
actors, with requested aliases distinguished from runtime evidence.

Status: PLANNED
Milestone / capability IDs: NF-WF-009 F3 follow-up, slice (a); capability
"memory L5 union read".
Implementer role / requested and resolved model: TBD at dispatch.
Reviewer role / requested and resolved model: separate contract-reviewer
actor, distinct from implementer, per standing review rule.
Readiness evidence / unresolved decisions / parent acceptance owner:
READY only after the author decisions below are recorded; parent
acceptance owner: NF-WF-009 contract owner (author).
Frozen review manifest / exact artifact paths and identity: this file;
manifest hashes pinned at review; manifest does not hash itself.
Baseline revision / local changes to preserve: record HEAD at dispatch;
preserve author WIP per standing integration rules.
Engram checkpoint topic key / last confirmed observation reference:
architecture/nf-wf-052-l5-union-read-contract-drafted (checkpoint #272,
2026-10-14).

## Goal and reason

Observable result: GET /api/workspaces/:workspaceId/novels/:novelId/memory/global
returns the L5 global-novel memory as a deterministic union read of the
novel's arc:{sagaId} MemoryProjection scopes — no new storage, no model
calls, no schema change. Each composed fact carries per-arc provenance
(scope, sourceRevisionId, sourceRevisionNumber, builtAt) tracing to
chapter-scoped blocks, and the response is freshness-aware: stale or failed
arc scopes are flagged, never silently served as current.

User need: closes the L5 half of the NF-WF-009 F3 deferral
(ISSUES-AND-GAPS.md "NF-WF-009 F3 follow-up", OPEN) without model calls.
Slice (b) — Invariant-6-gated model-assisted narrative summaries — is an
explicit NON-GOAL with its own future task reference: NF-WF-053 (to be
drafted separately under Invariant 6's full gate; this contract must not be
cited as authorizing any model-assisted summary).

This is a design contract dispatching a small implementation; the contract
is frozen after review.

## Required reading

- [Operating constitution](../../AGENTS.md) (§5 canon authority — summaries
  are projections, never truth; §8 hierarchical memory; invariant 14 —
  derived data invalidated/rebuilt when source changes).
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- [NF-WF-009 contract](NF-WF-009-revision-derived-memory.md) — Invariants
  1-11 (esp. Invariant 2 freshness, Invariant 6 the summary gate, Invariant
  9 "L5 is the union read of arc scopes, not a separate stored projection",
  Invariant 11 server-side authorization), F3 finding, Q1 adjudication
  (:562-565), the three routes and error-mapping conventions.
- [ADR-0017](../../docs/adr/ADR-0017-derived-rebuild-intent-end-state.md) —
  PROPOSED, not accepted; this contract neither consumes nor amends it.
- Existing implementation: packages/ai-services/src/memory.ts (recallNovel,
  readBlock, readAsOf, getMemoryStatus), packages/memory/src/freshness.ts,
  packages/memory/src/types.ts, packages/memory/src/constants.ts,
  apps/api/src/memory-routes.ts, apps/api/src/services/memory-queue.ts.
- [NF-WF-030](NF-WF-030-gap095-memory-reconciliation.md) and
  [NF-WF-051](NF-WF-051-memory-reconciliation-sweeper.md) — reconciliation
  receipts (dependency evidence below).

## Environment prerequisites

Follow [environment preflight](../../docs/11-deployment/ENVIRONMENT-PREFLIGHT.md).
Record actual OS/tool versions and scratch DB ownership; never reset working
databases for tests. No new services, queues or env vars are required.

## Dependencies and evidence

| Dependency | Evidence required | Status at draft |
|---|---|---|
| NF-WF-009 | Frozen contract + implemented structural memory: MemoryBlock structural-only (packages/memory/src/types.ts:66-67 summary:null/SKIPPED); freshness derivation (packages/memory/src/freshness.ts:108 deriveFreshness, :36 deriveAsOfFreshness); rebuild pipeline persisting FAILED rows, never auto-OK (packages/memory/src/rebuild.ts:186 processRebuild) | MERGED (main tree) |
| NF-WF-030 | Memory reconciliation at worker startup (apps/worker/src/memory-jobs.ts reconciliation pass re-enqueues stale/failed scopes) | MERGED (main tree) |
| NF-WF-051 | Interval sweeper integrated in main working tree: MEMORY_RECONCILE_INTERVAL_MS = 60_000 (packages/memory/src/constants.ts:24), DI default (apps/worker/src/memory-jobs.ts:76), tests (apps/worker/src/memory-sweeper.test.ts:230-234) | MERGED (main tree, per checkpoint #269) |
| ADR-0017 | PROPOSED only; memory excluded from its seven named intent projections (ISSUES-AND-GAPS.md:1309-1314) | NOT a blocker; untouched |

A PLANNED dependency does not make this task READY. Dispatch blockers: the
author decisions in "Open decisions" below.

Active issues touched: the NF-WF-009 F3 entry in
[ISSUES-AND-GAPS](../../docs/implementation/ISSUES-AND-GAPS.md) (closes its
L5 half on verified completion; the summaries/L6-enrichment half stays OPEN
under NF-WF-053). Record any new problem there before working around it.

## Scope

Allowed paths:
- packages/ai-services/src/memory.ts — add readGlobalMemory (L5 union) to
  createMemoryServices; extend nothing else.
- packages/memory/src/types.ts — add GlobalMemoryResult (+ per-arc entry
  shape) as NEW exported types; do not alter MemoryBlock,
  RecallNovelResult, or MemoryScopeStatus in this slice.
- packages/memory/src/constants.ts — add MEMORY_ARC_SCOPES_MAX (default
  20, see Open decisions) — a bound, not configuration plumbing.
- apps/api/src/memory-routes.ts — add the single GET route.
- Tests: a new focused suite beside the existing memory tests
  (apps/api/src/memory.test.ts pattern) covering the acceptance scenarios.

Forbidden paths: everything else. Specifically forbidden:
- Any Prisma schema change, migration, or new stored projection (reverses
  Invariant 9's "L5 ... not a separate stored projection").
- Any model/LLM call, gateway use, or summary generation (Invariant 6 gate;
  slice (b)/NF-WF-053 territory). No outbox, no new queue, no worker change
  (no producer without consumer; reconciliation already owns rebuilds).
- Changing recallNovel, readAsOf, freshness derivation, the rebuild
  pipeline, the 003 compiler's selection policy or its ports, canon
  semantics, or ADR-0017.
- Treating union output as canon input anywhere (constitution §5; AGENTS.md
  invariants 2/13: derived views and summaries never become canon without
  author-authored approval — a union READ grants no write authority).

Inputs: workspaceId, novelId (path, UUID); optional asOfRevisionId query
(UUID) reusing the exact as-of resolution semantics of the existing as-of
route (cross-branch revision → 400 INVALID_INPUT, per NF-WF-009 Invariant 7
and F4; same-branch resolution by Revision.number).

Outputs:
- 200 { global: { scopes: ArcMemoryEntry[], excluded: ExcludedScope[],
  asOf: { revisionId, chapter: null }, arcScopesMax: number } } where each
  ArcMemoryEntry = { arcScope, sagaId, freshness: FRESH|STALE|FAILED,
  sourceRevisionId, sourceRevisionNumber, chapterCoverage, structural,
  provenance: { revisionId, builtAt } } — structural content exactly the
  stored row's structural payload (no re-derivation, no reshaping that
  could lose fact ids); and each ExcludedScope = { arcScope, sagaId,
  reason: "MISSING"|"OVER_CAP"|"UNRESOLVABLE_SOURCE" }.
- 400 INVALID_INPUT (bad params / cross-branch asOfRevisionId); 404 when
  the novel (or membership) does not exist; 401 unauthenticated — identical
  envelope semantics to the three existing memory routes.
- Consumer: HTTP author tooling / observability. NOT wired into the context
  compiler in this slice (Open decision 3).

Out of scope (retained requirements with owners):
- Invariant-6-gated narrative summaries and any L6 as-of enrichment →
  NF-WF-053 (not yet drafted; owner: coordinator/author).
- Compiler adoption of L5 (new tier wiring) → follow-up if the author
  decides the compiler should consume it.
- ADR-0017 intent end-state → ADR-0017 owner (author), unchanged.

## Behavior and invariants

Happy path: resolve the novel's arc scopes = every Saga of the novel that
has at least one MemoryProjection row with scope = arc:{sagaId} (distinct-
by-scope query over memoryProjection filtered to the arc: prefix — the same
distinct-scope pattern as getMemoryStatus, memory.ts:241-246 — intersected
with the novel's sagas for tenant isolation). For each scope within the cap,
read the block via the existing readBlock path (live head or as-of mode);
emit it with its derived freshness and full provenance.

Invariants (inherited from NF-WF-009 unless noted):
1. No storage, no model calls. The route is a pure read composition;
   rebuilding stays exclusively with the existing rebuild pipeline
   (Invariant 4) and reconciliation (NF-WF-030/051).
2. Freshness-aware union (Invariant 2). Every included arc entry carries
   its derived freshness. The response distinguishes FRESH entries from
   STALE/FAILED ones; it MUST NOT silently present stale or failed arc
   content as current. An arc scope whose newest row is FAILED appears with
   freshness FAILED, its freshness-derived FAILED status only (lastError is not surfaced by the readBlock composition path; diagnostics stay in getMemoryStatus), and
   is NOT dropped silently. An arc scope with no rows is excluded with
   reason MISSING (MISSING is a valid state, Invariant 9).
3. Provenance (Invariant 3 + this task's addition). Every composed fact
   traces to its arc scope and the scope's stored row: fact ids preserved
   verbatim from structural, plus sourceRevisionId,
   sourceRevisionNumber, and builtAt per entry. Composing L5 MUST NOT
   launder provenance: no entry without a resolvable source revision; a row
   whose source revision is missing from the DB is excluded and surfaced as
   an internal inconsistency — never silently merged.
4. Bounded, deterministic retrieval. Total arc scopes considered ≤
   MEMORY_ARC_SCOPES_MAX (default 20). Selection over the cap is
   deterministic by the author-chosen ordering (Open decision 2); scopes
   beyond the cap appear in excluded with reason OVER_CAP — never silent
   truncation, never an unbounded scan. All sub-queries are the existing
   indexed per-scope reads; no N+1 beyond one readBlock per included scope.
5. As-of discipline (Invariant 7). With asOfRevisionId: resolve to
   (branchId, number); cross-branch → 400 INVALID_INPUT; no entry may
   reflect a revision newer than requested. Without it: main-branch head
   (F9); a novel with no head returns 200 with scopes: [] (matching
   recallNovel's no-head behavior).
6. Authorization (Invariant 11). novel:read capability, server-side,
   identical gate pattern to recallNovel/status. Read-only: an L5 consumer
   may READ composed structural views and nothing else — no write, no
   rebuild trigger, no canon implication. Union output is a projection of
   projections; it never creates, updates, approves, or supersedes anything.
7. No canon mutation / no summary authority. Nothing in this slice writes
   MemoryProjection rows, DerivedRebuildIntent rows, or canon tables;
   summary remains null / summaryStatus: "SKIPPED" on every returned block
   (structural-only, Q1). Any future population of summaries happens only
   under Invariant 6 via NF-WF-053.

Failure handling / partial degradation: the union degrades EXPLICITLY, never
silently. FAILED arc scopes are included but flagged FAILED; STALE flagged
STALE; MISSING/OVER_CAP listed in excluded with reasons. A database error
on one scope's read fails the request (500 via the platform error handler)
— no partial HTTP 200 fabricated from a half-read state, no cached fallback.
Concurrency: read-only; no locks; safe under concurrent rebuilds (a row is
a complete committed row or absent — single-row Prisma reads).
Cancellation: N/A (synchronous read).

## Acceptance and verification

- [ ] Real caller: GET .../memory/global returns 200 with the union over
      seeded arc scopes through the registered Fastify routes (not a unit
      shim).
- [ ] Negative scenarios, each with a named test:
  - Stale flagging: an arc scope whose newest row's source revision number
    < head appears with freshness STALE and correct source revision
    metadata (not silently merged as current).
  - FAILED surfacing: an arc scope whose newest row is FAILED appears with
    freshness FAILED — never dropped, never rendered as FRESH.
  - Cap enforcement: more than MEMORY_ARC_SCOPES_MAX arc scopes → exactly
    the capped set included, remainder in excluded with OVER_CAP, same
    ordering on repeated calls (determinism check).
  - Provenance absence → error, not silent degradation: a projection row
    whose sourceRevisionId no longer resolves must surface as an excluded/
    internal-inconsistency outcome per the contract text above — the test
    asserts the response does NOT contain an unattributable entry.
  - Cross-branch asOfRevisionId → 400 INVALID_INPUT.
  - Authorization: no session → 401; member without novel:read →
    capability refusal; novel outside workspace → 404.
  - MISSING arc (saga without rows) → excluded with MISSING.
  - No-head novel → 200 with empty scopes (no 500).
- [ ] Commands that exist: repo test runner over the new suite + the
      existing memory suites (apps/api/src/memory.test.ts) green;
      typecheck/lint per repo conventions. Prerequisites: running Postgres
      per preflight; no Redis needed (no queue use).
- [ ] Contract checks: diff review confirms zero schema changes (no new
      migration), zero model calls (no gateway import), and that
      summary/summaryStatus remain null/SKIPPED on all returned blocks.
- [ ] Separate review of the submitted revision; findings resolved.

Record actual results separately from expectations.

## Migration and rollback

None: no schema change, no new table, no queue, no env var, no worker
change. Rollback = revert the source diff; the route disappears and no data
is affected (the endpoint owns no state). Populated and empty databases
behave identically (empty → empty union).

## Documentation and handoff

Use the playbook's Engram save/recovery protocol; save at meaningful
boundaries and before handoff. On verified completion: update the
NF-WF-009 F3 entry in ISSUES-AND-GAPS.md (L5 half CLOSED, summaries half
remains OPEN under NF-WF-053), progress.md, docs/14-progress/CURRENT.md,
test-matrix.md. The contract stays frozen after review; deviations get GAP
numbers, not silent edits.

## Open decisions (author; recorded before READY — this contract does not
resolve them)

1. Arc ordering policy for cap selection: Saga has no number column
   (schema.prisma:1749-1772). Options: (createdAt, id) lexicographic vs
   outline-node-derived chapter-position ordering. Default if unrecorded:
   (createdAt, id) — boring, deterministic.
2. MEMORY_ARC_SCOPES_MAX value (default 20 proposed).
3. Compiler adoption: expose L5 to the NF-WF-003 compiler now (new tier
   wiring, touches 003) or routes-only in this slice (default:
   routes-only; adoption changes generation context, so it is its own
   decision).
4. ADR-0017 remains deferred. This contract neither assumes nor preempts
   option A/B; it adds no intent consumption. Any future proposal to STORE
   L5 or wire summaries reverses frozen decisions and requires an explicit
   author/ADR action — not implied by this task.
