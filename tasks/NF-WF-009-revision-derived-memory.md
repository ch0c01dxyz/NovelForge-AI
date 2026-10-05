# Task NF-WF-009: Revision-derived chapter/arc memory and historical retrieval

Project language: English for all authored/revised artifacts and generated
project content; UI uses English (`en`)/Bahasa Indonesia (`id`) locale keys
and resources with English fallback.
Model selection: author-selected at runtime; separate implementer/reviewer
actors, with requested aliases distinguished from runtime evidence.

Status: DRAFT (contract not reviewed; implementation starts only after a
separate contract review returns APPROVE)
Milestone / capability IDs: M2 memory loop; DELIVERY-PLAN NF-WF-009
Implementer role / requested and resolved model: (to be assigned at dispatch)
Reviewer role / requested and resolved model: (separate actor; backend MODEL_UNVERIFIED per GAP-013)
Readiness evidence / unresolved decisions / parent acceptance owner: NF-WF-008
VERIFIED (contracted extraction application, derived-invalidation intent
written atomically with canon apply, `DerivedRebuildIntent` consumed by
this task); NF-WF-003 VERIFIED (context compiler declares tiers 7/8
RECENT_MEMORY/HISTORICAL_MEMORY `UNAVAILABLE` with reason "owned by
NF-WF-009"); NF-WF-006 VERIFIED (chapter generation template);
STORY-VERSIONING foundation VERIFIED (revisions, change sets, checkpoints,
`DerivedRebuildIntent` with `UNIQUE (projection, source_revision_id)`,
`TABLE_SCOPE`/`COVERED_TABLES`). GAP-028 remains OPEN and constrains
testing (see Scope).
Frozen review manifest / exact artifact paths and identity: (filled after contract review)
Baseline revision / local changes to preserve: main @ `ec70488` (NF-WF-008 pushed 2026-10-05)
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

Give the novel a durable, revision-pinned memory. Today the context
compiler (NF-WF-003) emits its memory tiers as `UNAVAILABLE` — "no
memory/summary store exists; hierarchical memory (L2–L5) is owned by
NF-WF-009" — and every generation starts without chapter/arc memory.
This task builds exactly that store: **derived memory** (chapter and
arc summaries, entity states, thread states) that is rebuilt
deterministically from revisions, carries explicit freshness, excludes
rejected/superseded claims, and guarantees N→N+1 continuity for the
next chapter's generation context. It also provides **historical
retrieval**: as-of queries (state at chapter N / revision R) with the
same provenance discipline as live reads.

Memory is a *projection*, not truth (constitution §2.2, §8): hard canon
is never replaced by summaries, and summaries describe accepted prose
with provenance. The invalidation half already exists — NF-WF-008's
apply writes `DerivedRebuildIntent` rows atomically with the canon
mutation, and the story-versioning package maps tables to the seven
projection names. This task is the rebuild half: it consumes those
intents and produces fresh, pinned, auditable memory.

This is a design contract. Implementation starts only after a separate
contract review returns APPROVE.

## Required reading

- [Operating constitution](../../AGENTS.md) (esp. §2 invariants 8, 11,
  13, 14 — derived data invalidated/rebuilt when its canonical source
  changes; §5 canon authority; §8 hierarchical memory L0–L6; §9
  versioning/recovery — a failed rebuild leaves an explicit
  stale/failed projection, never a false success; §11 Definition of
  Done — memory consolidation is a separate outcome from generation,
  text acceptance, and canon approval; §13 evidence).
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md) (§5
  product-AI boundaries: summaries describe accepted prose with
  provenance; rejected claims never elevated).
- [Story versioning](../../docs/03-domain/STORY-VERSIONING.md)
  (revision/change-set/snapshot/checkpoint/derived-state model;
  "Commit canonical state, revision and durable invalidation/rebuild
  intent atomically"; "Derived jobs carry source revision and stable
  deduplication").
- [Story intelligence](../../docs/03-domain/STORY-INTELLIGENCE.md)
  (§Hierarchical memory: L0–L6; "Materialize higher-level projections
  only when consumed; each has source revision/version dependencies
  and freshness status"; "Hard canon is never replaced by summaries").
- [NF-WF-003 contract](NF-WF-003-chapter-context-compiler.md) (tiers
  7/8, invariant 10 — the compiler CONSUMES this task's output; its
  selection policy is unchanged by this task).
- [NF-WF-008 contract](NF-WF-008-canonical-proposal-application.md)
  (Invariant 9 — the invalidation-intent handoff this task consumes;
  `invalidatedScopes`; `DerivedRebuildIntent` rows).
- Existing code: `packages/story-versioning/` (`impact.ts`
  projections vocabulary, `TABLE_SCOPE`, `COVERED_TABLES`),
  `packages/database/prisma/schema.prisma` (`DerivedRebuildIntent`,
  `RebuildStatus`, "no summary table" rationale),
  `apps/api/src/services/context-compiler.ts` (tier 7/8 UNAVAILABLE
  blocks), `packages/retrieval/` (chunk/fuse/spoiler helpers),
  `packages/story-intelligence/` (canon ACTIVE filter).
- [What-if simulation idea](../docs/ideas/what-if-outline-simulation.md)
  (simulations MUST NEVER feed memory — see Invariant 8).

## Environment prerequisites

Same as NF-WF-008: native PostgreSQL 16 + pgvector and Redis on
localhost per `docs/11-deployment/ENVIRONMENT-PREFLIGHT.md` (no Docker
on this host); pnpm 12, Node 24; dedicated disposable
`novelforge_test_*` databases for mutation tests. Record actual
readiness; never claim another host's checks.

## Dependencies

- NF-WF-008 (derived-invalidation intent rows; `invalidatedScopes`;
  the canon-apply transaction this task's rebuilds follow).
- NF-WF-003 (context compiler — the primary consumer; tiers 7/8).
- NF-WF-002 / story-versioning foundation (revisions, change sets,
  `DerivedRebuildIntent`, projection vocabulary, `TABLE_SCOPE`).
- NF-WF-006 (chapter generation — the N→N+1 consumer of continuity).
- Existing canon backend (ACTIVE-fact filter; supersede chains).

## Scope

### Allowed

- A **memory projection store**: durable rows keyed by
  `(novelId, scope, sourceRevisionId)` where scope is
  `chapter:{chapterId}` (L1/L2) or `arc:{arcId}` (L3/L4). Each row
  carries: the derived content (see below), `sourceRevisionId`,
  `freshness` (derived, not stored — see Invariant 2), build
  metadata (builder version, and for model-assisted summaries the
  model profile + prompt version), and creation audit.
- **Structural memory (deterministic, no model calls)**: per-scope
  entity states, thread states, promise states, and the ACTIVE canon
  fact set as of the source revision — computed purely from canon
  tables and revision change sets. This is the normative core, and
  the whole of 009's shipped scope (Q1 decision: structural-only
  first).
- **Rebuild lifecycle**: consume `DerivedRebuildIntent` rows →
  mark affected scopes stale → bounded async rebuild → fresh;
  explicit `FAILED` with `lastError`, never a false success.
- **Historical retrieval (as-of)**: state at chapter N or revision
  R, served from revision-pinned projections (greatest source
  revision *number* ≤ R's number, same branch — Invariant 7) or
  reconstructed from change sets; same evidence/provenance
  discipline as live reads.
- **N→N+1 continuity proof**: the compiler's memory blocks carry
  `sourceRevisionId` + chapter coverage so chapter N+1's context
  provably includes chapter N's settled state.
- New Prisma model(s) + migration (reviewed artifact) for memory
  projections; registration in the revision `TABLE_SCOPE` /
  `COVERED_TABLES` maps (GAP-035 lesson).
- A thin observability surface: memory status per novel/chapter,
  rebuild trigger, as-of reads (routes below).
- Tests: API-level against the real backend with the test driver
  (fake gateway, GAP-028); fault-injection tests for stale/failed
  paths; no production AI path.

### Forbidden

- Treating memory as truth: no write path from memory back into
  canon; summaries never override, supersede, or silently correct
  canon facts.
- Rejected/superseded/unsupported claims entering memory (see
  Invariant 3).
- Simulation runs feeding memory: any derivation whose source
  revision descends from a `simulation: true` run is refused
  (Invariant 8).
- Model calls inside the deterministic rebuild path (structural
  memory). Model-assisted summaries are allowed ONLY under
  Invariant 6.
- Changing canon semantics, the 006 template, the 003 compiler's
  selection policy, or existing revision machinery.
- A parallel memory store outside the revision system: every memory
  row is pinned to a source revision and invalidated through the
  existing intent machinery.

### Inputs

- `DerivedRebuildIntent` rows (projection, sourceRevisionId,
  status) — written by NF-WF-008 applies and any other covered
  mutation.
- Chapter settle events: chapter N's manuscript application +
  canon approvals, identified by revision id (the continuity
  boundary).
- As-of queries: `{ novelId, chapter?: number, revisionId?: uuid }`.

### Outputs

- Memory projection rows (durable, revision-pinned).
- Context-compiler tier 7/8 blocks transitioning from `UNAVAILABLE`
  to `PRESENT` (with freshness metadata) — the 003 handoff.
- As-of read results with provenance (source revision, chapter
  coverage, freshness).
- Rebuild observability: per-scope status, last error, attempts.

### Out of scope (with follow-up owner)

- Narrative (model-assisted) summaries → **scoped follow-up** gated
  by Invariant 6 (Q1 review decision; 009 ships structural-only).
- Character/relationship/world/health integration (real state
  consumers, temporal knowledge, soft policy) → **NF-WF-010**.
- The what-if simulation feature itself →
  `docs/ideas/what-if-outline-simulation.md` (draft only; its
  outputs never enter memory).
- Embedding/vector-index management for memory content → existing
  retrieval package patterns; a dedicated vector rebuild is a
  follow-up if needed.
- Projection-row retention horizon → **follow-up** (009 keeps all
  rows; Q5 review decision).
- Changing the 003 compiler's tier selection/budget policy (009
  only guarantees what the compiler can rely on).
- Publication/reader visibility of memory.

## Behavior and invariants

### Invariant 1 — Memory is a revision-pinned projection, never truth

Every memory row is keyed by `(novelId, scope, sourceRevisionId)`
and is a pure derivation of the canonical state at that revision.
Rebuilding the same scope from the same source revision MUST yield
the same structural content (deterministic rebuild). Memory rows are
never read as canon, never written back into canon tables, and never
presented without their source revision. (Constitution §2.2, §8;
STORY-INTELLIGENCE.md: "Hard canon is never replaced by summaries.")

### Invariant 2 — Freshness is explicit and derived from the source revision

The reference head for live reads is the novel's **main branch**
head (`NovelBranch.name = "main"`; branches are first-class, but
freshness is always computed against main unless an as-of query
names another branch via its `revisionId` — see Invariant 7).

Each scope's freshness is computed, not asserted, from the stored
build outcomes. `MemoryProjection` stores one row per build attempt:
`(novelId, scope, sourceRevisionId)` with `buildStatus` (`OK` |
`FAILED`), `lastError` (nullable), and `attempts`. The derivation,
for a scope on the novel's main branch (F9):
- Let `H` = the main branch head revision number, and `r` = the
  scope's newest row by source revision number (resolving each
  `sourceRevisionId` to its number).
- No rows → `MISSING`.
- `r.buildStatus = FAILED` → `FAILED` (surfacing `r.lastError`,
  `r.attempts`).
- `r.buildStatus = OK` and `r`'s number `= H` → `FRESH`.
- `r.buildStatus = OK` and `r`'s number `< H` → `STALE` (a newer
  revision exists that the projection does not reflect).

Consumers (the context compiler, the status API) MUST branch on this
value: a `STALE` or `FAILED` projection is surfaced with its
staleness metadata, never silently served as fresh. A failed rebuild
leaves an explicit `FAILED` row — never a false `FRESH`
(constitution §9). The `DerivedRebuildIntent.status` enum
(`PENDING/RUNNING/FRESH/FAILED/STALE`) is the intent-level mirror;
scope freshness is derived from projection rows vs the head, not
from intent rows.

### Invariant 3 — Rejected, superseded, and unsupported claims never enter memory

Rebuilds read canon exclusively through the ACTIVE-fact filter
(the `canon.ts` ACTIVE semantics: live facts only). REJECTED
proposals, `UNSUPPORTED` application items, superseded facts
(outside their validity window), and any claim that failed evidence
validation are invisible to the rebuild. Summaries describe accepted
prose with provenance (STORY-INTELLIGENCE.md) — provenance is
preserved per included fact (fact id, source revision, evidence
spans where available). A test MUST demonstrate that a rejected
proposal's text and a superseded fact's old value are absent from
rebuilt memory.

### Invariant 4 — Invalidation flows through intents; rebuilds are bounded and idempotent

- Any covered mutation (canon apply per NF-WF-008, manuscript
  chapter application, planning changes) writes
  `DerivedRebuildIntent` rows atomically with the mutation (existing
  machinery). Memory scopes subscribe to projection invalidations:
  a `canon` or `manuscript` or `story_intelligence` intent for
  revision R marks every memory scope whose `sourceRevisionId < R`
  as `STALE` (logically — via the freshness derivation, no
  mass-update required).
- Rebuilds are consumed asynchronously by a bounded worker on the
  BullMQ `memory-rebuild` queue (the repo's established durable
  transport per NF-WF-004 — not in-process, not in-request). The
  worker moves intents `PENDING → RUNNING → FRESH`/`FAILED`
  (intent-level mirror of the outcome); bounds are named constants:
  `MEMORY_REBUILD_MAX_ATTEMPTS = 5`,
  `MEMORY_REBUILD_RETRY_BASE_MS = 1000` (exponential backoff).
  Idempotency via the `UNIQUE (projection, sourceRevisionId)` dedup
  key — a replayed dispatch for the same source revision is a
  no-op, not a second rebuild (schema comment, C6).
- Rebuilds never hold a database transaction across a model call.
  Structural rebuilds are pure functions of the source revision;
  model-assisted summaries (Invariant 6) run outside transactions
  and are written atomically on success.

### Invariant 5 — N→N+1 continuity is provable at the revision boundary

Chapter N is *settled* at a **settle revision** identified
deterministically from existing data (no new marker column):
- `manuscriptRev(N)` — the greatest revision number on the novel's
  main branch whose change set touches the manuscript chapter-version
  row for chapter N (manuscript mutations go through
  `advanceForMutation`, so such a revision exists iff chapter N's
  text was applied).
- `canonApplyRev(N)` — the greatest revision number on the main
  branch whose change set contains a `CanonApplication` status
  transition to `APPLIED` for an application whose run has
  `input.chapterNumber = N`. Absent when no canon application was
  ever created for chapter N, or every such application ended
  `REJECTED` — that absence IS the data meaning of "explicitly
  declined".
- `settleRev(N) = max(manuscriptRev(N), canonApplyRev(N))` over the
  present terms. If `manuscriptRev(N)` is absent, chapter N is NOT
  settled.

The memory scope for chapter N is built from that settle revision.
Chapter N+1's generation context (via the 003 compiler) MUST include
chapter N's settled state: the compiler's tier 7/8 blocks carry
`sourceRevisionId` and `chapterCoverage`, and a continuity check
asserts that for chapter N+1, the memory covers chapter N at a
revision ≥ chapter N's settle revision. If the check fails, the block
is emitted `PRESENT` with explicit staleness metadata and reason
(`TierStatus` has no `STALE` value — see F8) — never silently
incomplete. (Delivery-plan acceptance: "N→N+1 continuity".)

### Invariant 6 — Model-assisted summaries: gate for the follow-up (not shipped in 009)

Per the Q1 review decision, 009 ships structural memory only
(Invariant 1's deterministic core) and MUST NOT depend on model
output. Narrative summaries are a scoped follow-up, allowed ONLY
under ALL of the following (this invariant is the gate that
follow-up must satisfy):
- The model call happens outside any database transaction.
- The output is validated against a fixed schema (sections,
  covered fact ids, no new entities) before storage; invalid
  output → the summary is omitted and the scope keeps its
  structural memory with an explicit `summaryStatus: "FAILED"`.
- The stored row records the model profile id and prompt version.
- Summary text is a cached artifact keyed by
  `(scope, sourceRevisionId, summarizerVersion)` — it is *stable*,
  not claimed byte-deterministic; the *structural* content and the
  *coverage* (which facts/chapters are included) ARE deterministic.
- GAP-028: tests use the fake gateway/test driver; never a
  production AI path.

### Invariant 7 — Historical retrieval honors the same discipline as live reads

Revision ids are UUIDs — `≤` is meaningless on them. As-of queries
(`chapter N` or `revisionId R`) are therefore ordered by
**`Revision.number` within a branch**: resolve the requested
`revisionId` to its `(branchId, number)`; return the projection row
with the greatest source-revision number `≤ R.number` **within the
same branch** (or reconstruct from change sets where no row exists).
A `revisionId` from a different branch than the query context →
400 `INVALID_INPUT` (cross-branch as-of is rejected, not defined).
`chapter N` resolves within the novel's main branch to that
chapter's settle revision (Invariant 5). Responses carry identical
provenance and freshness metadata as live reads and state the exact
revision reflected. As-of reads MUST NOT return data from a
revision newer than requested, and MUST apply the same ACTIVE-fact
filter at that revision (superseded-then facts appear only with
their validity windows, per the existing `stateAt` patterns).

### Invariant 8 — Simulations never feed memory (enforceable scope)

Canon-derived memory is safe by construction: NF-WF-008 refuses
simulation extractions at the canon boundary (400
`SIMULATION_REFUSED`), so canon tables never contain
simulation-descended facts.

Manuscript-prose-derived scopes have NO detectable lineage today:
there is no revision→run link, `RevisionOrigin` has no `SIMULATION`
value, and `ChapterVersion` carries no source-run field — so
"resolve the revision lineage and skip simulation-descended
revisions" is not implementable in 009. Full lineage is DEFERRED
until simulation runs exist as a product feature (the what-if idea
is still a draft); the implementer records the follow-up in
ISSUES-AND-GAPS.md.

Enforceable in 009: a rebuild request that explicitly asserts a
simulation source (body `simulation: true`) is refused with 400
`SIMULATION_SOURCE_REFUSED` and no memory row is written.

### Invariant 9 — Materialize only when consumed; scopes are explicit

Per STORY-INTELLIGENCE.md, higher-level projections are materialized
only when consumed. Scopes: `chapter:{chapterId}` (L1/L2) and
`arc:{arcId}` (L3/L4), where arcs are the planning sagas (the
contract does not invent a new arc taxonomy). L0 stays a run
artifact; L5 (global novel) is the union read of arc scopes, not a
separate stored projection; L6 (historical archive) is served by
Invariant 7's as-of reads. A scope with no consumer stays
`MISSING` — that is a valid state, not an error.

### Invariant 10 — No scope creep at the memory gate

The memory endpoints do not start runs, edit drafts, approve text
or canon, manage outlines, or change the 003 compiler's selection
policy. They store, rebuild, and serve revision-pinned derived
memory — nothing else.

### Invariant 11 — Authorization is enforced server-side

Memory reads require `novel:read`; rebuild triggers require
`novel:update` (there is no `novel:manage` capability —
`authorization.ts` defines
`novel:create/read/update/delete/archive`). Tenant scope resolves
from stored rows (404 for cross-tenant ids, never 403-disclosure).

## Outputs

### Service API (primary — consumed by the context compiler in-process)

```ts
// packages/<memory>/ or apps/api/src/services/memory.ts (implementer places per module boundaries)
interface MemoryScopeStatus {
  scope: string;                 // "chapter:<uuid>" | "arc:<uuid>"
  freshness: "FRESH" | "STALE" | "FAILED" | "MISSING";
  sourceRevisionId: string | null;
  headRevisionId: string;
  chapterCoverage: number[];      // chapters whose settled state is included
  lastError: string | null;
  attempts: number;
}

interface MemoryBlock {
  scope: string;
  freshness: Exclude<MemoryScopeStatus["freshness"], "MISSING">;
  sourceRevisionId: string;
  chapterCoverage: number[];
  structural: {                  // deterministic core
    facts: Array<{ factId: string; entityId: string; predicate: string; object: string; validFromChapter: number | null }>;
    threads: Array<{ threadId: string; status: string }>;
    promises: Array<{ promiseId: string; status: string }>;
  };
  summary: null;                 // 009 is structural-only (Q1);
  summaryStatus: "SKIPPED";      // the follow-up populates these under Invariant 6
  provenance: { revisionId: string; builtAt: string };
}

recallNovel(novelId, { chapter, revisionId?, recentChapters = MEMORY_RECENT_CHAPTERS_DEFAULT }): Promise<{
  chapterMemory: MemoryBlock | null;   // chapter:{chapterId} for the requested chapter
  recentMemory: MemoryBlock[];         // L2: up to `recentChapters` preceding chapters' scopes
  arcMemory: MemoryBlock | null;       // L3/L4: the chapter's arc scope
  asOf: { revisionId: string; chapter: number | null };
}>
```

`MEMORY_RECENT_CHAPTERS_DEFAULT = 10` — the L2 window is bounded
(the 003 contract's budget invariants forbid unbounded reads on a
2,000+ chapter novel); callers may pass a smaller window, never a
larger one without a named override.

The 003 compiler's tiers 7/8 consume `recallNovel`: `UNAVAILABLE`
becomes `PRESENT` only when the corresponding block exists and is
`FRESH`; `STALE`/`FAILED` blocks are emitted `PRESENT` with explicit
staleness metadata in the block (never hidden), or `UNAVAILABLE`
with reason when `MISSING` — the compiler's invariant 10
("never an empty PRESENT block") is preserved.

### HTTP routes (thin; observability + on-demand)

| Method & path | Auth | Body | Success | Errors |
|---|---|---|---|---|
| `GET /api/workspaces/:workspaceId/novels/:novelId/memory/status` | `novel:read` | — | 200 `{ scopes: MemoryScopeStatus[] }` | 401/403/404 |
| `POST /api/workspaces/:workspaceId/novels/:novelId/memory/rebuild` | `novel:update` | `{ scope?: string; revisionId?: uuid }` (default: all stale scopes at head) | 202 `{ accepted: true, scopes: string[] }` (async; idempotent per dedup key) | 400 `INVALID_INPUT`; 401/403/404 |
| `GET /api/workspaces/:workspaceId/novels/:novelId/memory/as-of` | `novel:read` | query `chapter?: int`, `revisionId?: uuid` (one required) | 200 `recallNovel` result as JSON | 400 `INVALID_INPUT`; 401/403/404 `REVISION_NOT_FOUND` |

Notes:
- The rebuild route enqueues bounded work; it does not block on
  model calls. Synchronous rebuild-in-request is forbidden.
- `as-of` with both params: `revisionId` wins; `chapter` resolves to
  that chapter's settle revision.

### Data model (new Prisma model(s); migration is a reviewed artifact)

- `MemoryProjection { id, workspaceId, novelId, scope, sourceRevisionId,
  buildStatus: OK|FAILED, lastError: String?, attempts: Int,
  structural: Json, chapterCoverage: Int[],
  builtAt, createdAt }`
  `@@unique([novelId, scope, sourceRevisionId])` — the dedup key
  mirroring `DerivedRebuildIntent`'s. (Structural-only in 009 per the
  Q1 decision — no summary columns; the follow-up adds them under
  Invariant 6's gate.)
- One row per build attempt; `FAILED` rows keep `lastError` and are
  never auto-deleted. Freshness (`FRESH`/`STALE`/`FAILED`/`MISSING`)
  is derived per Invariant 2, not stored.
- Register the new table(s) in the revision `TABLE_SCOPE` and
  `COVERED_TABLES` maps (GAP-035 lesson); memory tables are
  projections — restore covers them as rebuildable, not as truth.

## Acceptance and verification

Testable; API-level tests use the test driver (fake gateway, GAP-028).
Fault injection (not wall-clock) forces stale/failed paths.

- [ ] **Durable rebuild.** Build memory for a chapter, delete all
  `MemoryProjection` rows, rebuild from revisions → structural
  content byte-identical; `summary` null / `summaryStatus: "SKIPPED"`
  (structural-only, Q1); coverage complete.
- [ ] **Forced stale.** Write a canon fact (new revision) after a
  FRESH projection → `memory/status` shows the scope `STALE` with
  the old `sourceRevisionId`; `recallNovel` returns the block with
  explicit staleness metadata (not silently fresh).
- [ ] **Forced failed rebuild.** Fault-inject a rebuild failure
  (e.g. failing summarizer / DB fault) → scope shows `FAILED`
  with `lastError`; no `FRESH` row is written; a subsequent
  successful rebuild recovers to `FRESH`.
- [ ] **Rejected fact excluded.** Reject a canon proposal and
  supersede a live fact, then rebuild → neither the rejected text
  nor the superseded old value appears anywhere in structural
  memory or summaries; provenance lists only ACTIVE facts.
- [ ] **N→N+1 continuity.** Settle chapter N (manuscript applied +
  canon `APPLIED`), build chapter N+1's compiler context → the
  tier 7/8 blocks are `PRESENT`, `sourceRevisionId ≥` chapter N's
  settle revision, and `chapterCoverage` includes N. Then move the
  head without rebuilding → the blocks carry explicit staleness
  instead of silent incompleteness.
- [ ] **As-of retrieval.** Query `as-of?chapter=N` → returns state
  at chapter N's settle revision (not newer); a fact superseded in
  chapter N+1 shows its old value with its validity window.
- [ ] **Simulation refused.** Attempt a rebuild pinned to a
  simulation-descended revision → 400 `SIMULATION_SOURCE_REFUSED`;
  no memory row is written.
- [ ] **Idempotent rebuild.** Enqueue two rebuilds for the same
  (scope, sourceRevision) → one projection row; the second is a
  no-op (dedup key).
- [ ] **003 handoff.** The compiler's tier 7/8 blocks: `PRESENT`
  when FRESH (with `sourceRevisionId` + coverage in metadata),
  staleness-surfaced when STALE/FAILED, `UNAVAILABLE` with reason
  when MISSING — never an empty PRESENT block (003 invariant 10).
- [ ] **Authorization.** Cross-novel scope id → 404; reader without
  manage → 403 on rebuild trigger.
- [ ] **No-regression.** Full API suite green; `pnpm lint`,
  typechecks, and `nuxt build` clean; existing revision/canon
  tests untouched and passing.

## Migration and rollback

- One additive Prisma migration: `MemoryProjection` (+ indexes on
  `(novelId, scope)`, unique `(novelId, scope, sourceRevisionId)`).
  Reviewed artifact; idempotent-safe per the GAP-030 DO-block
  convention.
- Rollback: drop the table. SAFE always — memory is a rebuildable
  projection; dropping loses no truth (schema comment §Knowledge
  invariant). No changes to existing tables.
- Register the new table in `TABLE_SCOPE`/`COVERED_TABLES`
  (projection mapping) as part of the implementation.

## Documentation and handoff

- `docs/implementation/ISSUES-AND-GAPS.md`: new GAP entries for any
  deviation BEFORE workarounds (standing rule).
- `docs/implementation/progress.md` + `docs/14-progress/CURRENT.md`
  + `docs/implementation/test-matrix.md`: NF-WF-009 section on
  completion.
- The contract file stays frozen after review; deviations get GAP
  numbers, not silent edits.
- Update the 003 compiler's tier 7/8 `UNAVAILABLE` reason text when
  the store exists (it currently says "owned by NF-WF-009") — the
  reason must describe the actual state (e.g. "no projection built
  yet for this scope").

## Open questions

1. **Model-assisted summaries — RESOLVED at review (structural-only
   first).** 009 ships the fully deterministic structural core;
   narrative summaries are a scoped follow-up gated by Invariant 6.
   All M2 acceptance is satisfiable structurally.
2. **Projection vocabulary — RESOLVED at review (no eighth
   projection).** The seven C1 coverage groups are the established
   taxonomy; memory subscribes to existing projections.
3. **Rebuild trigger — RESOLVED at review (async worker + manual
   rebuild route).** Lazy on-read would put heavy derivation in the
   compiler's request path. Revisit only if worker lag proves
   problematic.
4. **Arc taxonomy — RESOLVED at review (`MISSING` acceptable).** No
   implicit arcs; the compiler handles `MISSING` via `UNAVAILABLE`.
5. **Retention — RESOLVED at review (keep all rows in 009).**
   Complete as-of history; a pruning horizon is a follow-up (see
   Out of scope).
6. **UI surface — RESOLVED at review (no dedicated UI).** The
   compiler is the M2 consumer; the three HTTP routes are the
   observability surface. A memory status panel belongs with the
   010/016 workspace work.

## Review record

(Reviewer: separate contract-reviewer actor, Muse Spark model family,
backend MODEL_UNVERIFIED per GAP-013. Contract SHA
`f8394979617569664043ae5cc0708d53297d2bcf` reviewed against HEAD
`ec70488a4c42780f76114a8d3750d69b0a209f3d`.)

- **Verdict: CHANGES_REQUESTED** (no P1; 4 P2 normative findings
  F1–F4 + 5 P3 F5–F9, all applied in the text above: F1 — stored
  build outcome (`buildStatus`/`lastError`/`attempts`) vs derived
  freshness pinned in Invariant 2 + data model; F2 — settle revision
  identified deterministically via change-set search
  (`manuscriptRev(N)`, `canonApplyRev(N)`, "explicitly declined" as
  data) in Invariant 5; F3 — Invariant 8 narrowed to the enforceable
  scope (canon safe by 008 boundary; explicit simulation-tagged
  rebuilds refused; full lineage deferred to a follow-up); F4 —
  as-of ordered by `Revision.number` within a branch, cross-branch
  rejected (Invariant 7); F5 — exact capabilities `novel:read` /
  `novel:update` (Invariant 11 + routes); F6 — BullMQ
  `memory-rebuild` queue + `MEMORY_REBUILD_MAX_ATTEMPTS` /
  `MEMORY_REBUILD_RETRY_BASE_MS` + intent lifecycle (Invariant 4);
  F7 — `MEMORY_RECENT_CHAPTERS_DEFAULT = 10` bound on
  `recentMemory`; F8 — Invariant 5 wording aligned with
  `TierStatus` (no `STALE` value); F9 — main branch head pinned as
  the live-read reference.)
- **Backend fidelity verified strong**: tiers 7/8 `UNAVAILABLE`
  blocks, `DerivedRebuildIntent` unique key + `RebuildStatus`
  enum, seven projection names, `TABLE_SCOPE`/`COVERED_TABLES`,
  planning sagas, ACTIVE filter, per-(novel, branch) head,
  `Revision.number` ordering, 008 Invariant 9 handoff — all
  confirmed against source.
- **Open questions adjudicated**: Q1 structural-only first
  (Invariant 6 gates the follow-up); Q2 no eighth projection; Q3
  async worker + manual rebuild route; Q4 `MISSING` acceptable, no
  implicit arcs; Q5 keep all rows, horizon is a follow-up; Q6 no
  dedicated UI in 009.
- **Status after review**: contract DRAFT-frozen with findings
  applied; implementation may proceed. Reviewed 2026-10-05.
