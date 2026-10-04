# Task NF-WF-003: shared chapter context compiler and identity/source pins

Status: **PLANNED** — not dispatchable. One author scope decision is open (see
"Open decision"). Do not start coding from this file until it is resolved and
this contract is separately reviewed.
Milestone / capability IDs: M1 / G-02 (chapter context), per
[DELIVERY-PLAN](../docs/implementation/DELIVERY-PLAN.md).
Implementer role / requested and resolved model: unassigned. Author-selected
coding models are `deepseek-v4.1-flash` and `glm-5.3-flash`; the resolved
model must be recorded at dispatch, not assumed.
Reviewer role / requested and resolved model: unassigned; a separate reviewer
must read the exact submitted diff. Reviewer backend identity is UNVERIFIED
(GAP-013).
Readiness evidence / unresolved decisions / parent acceptance owner: NF-WF-002F
returned VERIFIED for the evidenced M1 foundation scope only (2026-10-04);
NF-WF-003 depends on NF-WF-002 and inherits nothing else from it.
Frozen review manifest / exact artifact paths and identity: none yet. The
manifest is frozen at submission and must not hash itself.
Baseline revision / local changes to preserve: the NF-WF-002 tree at HEAD
`811e7e6` plus its uncommitted changes (42 modified, 14 untracked paths) must
be preserved; this task must not stash, reset or revert them.
Engram checkpoint topic key / last confirmed observation reference: written
under the runtime-bound identity confirmed at this boundary
(`fae4b412-db3a-4ddc-a052-cfda214cfa9d`). GAP-021 remains per-boundary.

## Goal and reason

One context compiler, shared by every path that builds a generation prompt,
that selects by the constitution's priority order and never drops mandatory
context to satisfy a budget.

**The measured problem.** Two divergent context paths exist today:

1. `compile()` in `apps/api/src/services/orchestrator.ts:135` — a closure
   inside `createOrchestratorServices` (`:101`), not exported, called only by
   `generate` (`:294`) and `generateStream` (`:349`) in the same file. It reads
   **only** `canon.listFacts` (`:156`) and `retrieval.search` (`:180`). No
   outline, no chapter, no story position, no planning horizon, no Narrative
   DNA, no character/relationship/timeline read, and no revision or source pin.
2. The workflow `RETRIEVAL` step in
   `apps/api/src/services/workflow-runs.ts:460`, which calls
   `retrieval.search` with its own `limit: 10` (`:468`) and no budget at all,
   then hands the rendered text to a later `AGENT` step.

CLAUDE.md §7 requires "Direct chapter generation and chapter workflow steps must
use the same context rules." Today they do not — this is a second-path
divergence of the kind that has already produced four real defects in this
repository.

**And the truncation is backwards — and the read behind it is unbounded.**
`canon.listFacts` (`apps/api/src/services/canon.ts:1415`) issues
`db.canonFact.findMany({ where, orderBy: { createdAt: "asc" }, select })`
(`:1445-1449` AUTHOR, repeated `:1475` READER) with **no `take` and no `limit`
anywhere in the file** — verified, `canon.ts` contains no `take:`/`limit:` at
all. So it returns *every* ACTIVE fact for the novel, and `compile` walks that
full list with `break` on budget (`orchestrator.ts:165-171`) under a fixed
`FACT_BUDGET_CHARS = 6_000` (`:28`). Two violations in one path:

1. **The unbounded read itself** — CLAUDE.md §2.16 ("No routine generation
   request may scan or inject the entire manuscript") and §7 ("Fetch bounded
   relevant records").
2. **The order decides what survives** — because the read is `createdAt asc` and
   the walk `break`s, the budget **keeps the oldest facts and discards the
   newest**, i.e. the facts most relevant to the chapter being written. §7
   states the requirement directly: "Fetch bounded relevant records; do not
   fetch all facts and truncate by creation order."

The fix is therefore not only "change the sort" — a bounded, relevance-ordered
selection replaces the unbounded read *and* the post-hoc `break`. A test that
merely reverses the sort would still fetch every fact and would still pass with
the §2.16 violation intact.

## Required reading

- [Operating constitution](../AGENTS.md) (equivalent `CLAUDE.md`) — §7 (context rules), §2.16 (no
  full-manuscript scan), §8 (long-form consistency), §11 (definition of done).
- [Evidence policy](../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- `docs/03-domain/STORY-VERSIONING.md` §C12 — the tri-state head expectation
  this task must pin against.
- ADR-0013 (workflow delivery/recovery), ADR-0014 (revision/checkpoint model).
- Source to read before designing anything: `apps/api/src/services/orchestrator.ts`
  (whole file — it is ~400 lines), `apps/api/src/services/workflow-runs.ts`
  around the `RETRIEVAL` step, `apps/api/src/services/canon.ts` `listFacts`
  (`:1415`), `apps/api/src/services/retrieval.ts` `search` (`:847`),
  `apps/api/src/services/planning.ts` (`approveOutlineVersion` `:575`,
  `supersedeApprovedOutline` `:667`, `planningHorizon.findUnique` `:707`),
  `apps/api/src/services/revisions.ts` (exports only),
  `packages/planning/planning.ts` `horizonFor` (`:202`).
- Existing tests: `apps/api/src/orchestrator.test.ts`, `retrieval.test.ts`,
  `canon.test.ts`, `planning.test.ts`.

## Dependencies and evidence

- **NF-WF-002 / G-01** — accepted 2026-10-04 for the evidenced foundation scope
  only. The revision/source-pin primitives this task consumes are the ones that
  verification covered: `readHeadRevisionId` (`:135`), `assertHeadExpectation`
  (`:159`), `captureSnapshot` (`:269`), `advanceHead` (`:307`, the locked CAS
  via `SELECT … FOR UPDATE`), `advanceForMutation` (`:482`) and
  `createWithRevision` (`:516`) in `apps/api/src/services/revisions.ts`, plus
  `novel_branches.head_revision_id`.
- **NF-WF-002F** — `tasks/NF-WF-002F-foundation-acceptance.md`; its "Next"
  section authorizes preparing this contract and forbids dispatching it as-is.
- Active issues this task must respect, from
  [ISSUES-AND-GAPS](../docs/implementation/ISSUES-AND-GAPS.md):
  - **GAP-004** (cross-domain recovery, OPEN/P1) — this task must not claim to
    close it.
  - **GAP-011** (timeline/event and character/canon identity joins, OPEN/P1) —
    **this task is the owner of the character/canon half.** Any join it adds
    must be an explicit, named relation, never a name match. Nullable-FK
    existence is not a join.
  - **GAP-013** (OPEN/P2) — no review claim may rest on an unverified backend.
  - **GAP-018** (OPEN/P2) — a failed `migrate deploy` is partially applied; if
    this task adds a migration, its `CREATE INDEX` must be re-runnable.
  - **GAP-023** (OPEN) — do not build a domain-event producer or outbox here.

## Open decision (blocking)

**Does NF-WF-003 include the orchestrator/workflow wiring and the truncation
fix, or only the compiler module behind the existing behaviour?**

- *Option A (recommended):* extract the compiler as a module, wire **both**
  existing callers to it, and fix the truncation. Smallest change that actually
  satisfies §7, and it is the only option that removes the second path.
- *Option B:* build the compiler module only, leave both callers untouched.

Option B leaves the divergence in place and would let a green test suite
coexist with the §7 violation, which is the exact failure mode this repository
has already recorded. The author must choose; this contract does not choose on
the author's behalf. Everything below is written for Option A and marks where
Option B would differ.

## Scope

Allowed paths (proposed; confirm at review):

- `apps/api/src/services/context-compiler.ts` — **one new module**, holding the
  shared tiered selection and budget policy as pure functions over
  already-fetched rows. Not a new package: both callers live in `apps/api/src`,
  so a package boundary buys nothing here. The module must not import HTTP or a
  provider (CLAUDE.md §10), which keeps it testable without a server.
- `apps/api/src/services/orchestrator.ts` — replace the inline loop in
  `compile` (`:135`) with a call to the compiler.
- `apps/api/src/services/workflow-runs.ts` — the `RETRIEVAL` step (`:460`) must
  route through the same compiler.
- `apps/api/src/services/planning.ts` — add the approved-outline resolver
  (none exists; see "Known unknowns").
- `apps/api/src/services/canon.ts` — only if the fix is a bounded-selection
  query rather than a post-hoc `break`.
- `apps/api/src/orchestrator.test.ts`, `apps/api/src/retrieval.test.ts`, and
  one new `apps/api/src/context-compiler.test.ts`.

Forbidden paths: everything else — in particular any schema change, any
migration, `packages/story-versioning/*`, `packages/auth/*`, and any file
outside the list above.

Inputs: the existing reader ports already declared in `orchestrator.ts:33`
(`CanonReader`) and `:44` (`ReferenceSearcher`) — reuse them rather than
inventing a parallel interface. New reads must go through the existing
services, not new raw queries, so their tenant and spoiler gates are inherited.

Outputs: a compiled context value carrying, per block, the selected rows **and
their provenance** (ids, versions, and the reason each was selected), so a
later step can be checked. `compile` currently persists only
`contextSnapshot.facts` (ids) and `.references`
(`referenceId`/`referenceVersionId`/`chunkId`) — that shape is the floor, not
the ceiling.

Out of scope, each with its own owner: chapter generation as a feature (no such
entry point exists — see below); domain events (**GAP-023** / NF-WF-002E);
character/timeline joins beyond the canon half of **GAP-011**; durable workflow
execution (NF-WF-004); any UI (NF-WF-007).

## Behavior and invariants

1. **Priority order is the constitution's**, and it is ordered, not a set:
   author instruction → current outline/scene → hard canon → current states →
   active threads/promises → timeline → relevant recent memory → relevant
   historical memory → Narrative DNA/style → external references
   (CLAUDE.md §7).
2. **Mandatory context never disappears silently.** When the budget is
   exhausted, the compiler must either (a) surface an explicit, typed overflow
   result naming what was dropped and why, or (b) fail closed. Silently
   dropping a mandatory block is the defect this task exists to remove.
   CLAUDE.md §7: "Mandatory task constraints must never disappear silently to
   satisfy a context budget."
3. **Selection is bounded and relevance-ordered, never oldest-first.** No
   `orderBy: { createdAt: "asc" }` may decide what survives a budget.
   Tie-breaking must be deterministic and stated.
4. **Provenance is retained** for every selected fact and reference, with the
   source revision recorded.
5. **Identity and source pins are resolved server-side, before the first model
   attempt**, per CLAUDE.md §7: the approved outline, the story position, and
   the source revision. The pin read already exists — `readHeadRevisionId`
   (`apps/api/src/services/revisions.ts:135`, reading
   `novelBranch.headRevisionId` via the `novelId_name` compound key) — so use
   it rather than a new query. The caller may supply an expectation
   (`expectedHeadRevisionId` tri-state, §C12.1) but must never be the authority
   for what is pinned.
6. **One compiler, two callers.** After this task, `orchestrator.ts` and the
   workflow `RETRIEVAL` step must not each own a selection loop. If they still
   do, the task is not done.
7. **Tenant and spoiler boundaries are inherited from the services**, applied
   in the query (the `listFacts` READER branch at `canon.ts:1475` is the
   precedent: filtering after the read means the forbidden rows were already
   read). A non-member must get a 404, not a 403.
8. **No model call or human wait inside a database transaction** (CLAUDE.md §9).
9. **No full-manuscript scan** (§2.16). No query may be unbounded: every new
   read states its bound.

## Acceptance and verification

- [ ] Observable result through the real caller: a generation through
      `POST /api/workspaces/:workspaceId/generate`
      (`orchestrator-routes.ts:55`) and a workflow `RETRIEVAL` step
      (`workflow-runs.ts:460`) both produce context through the one compiler.
- [ ] **Negative test — bounded read, not just reordered.** Assert the fact
      query itself carries a bound (`take`), so the selection no longer fetches
      every ACTIVE fact. A test that only reverses the sort still passes with
      the unbounded read and the §2.16 violation intact, and must not count.
- [ ] **Negative test — the truncation fix.** With more facts than
      `FACT_BUDGET_CHARS` allows, assert the *newest relevant* facts are
      selected and the oldest are the ones dropped. This test must fail against
      the current `createdAt asc` + `break` behaviour. A test that passes
      against the old code proves nothing.
- [ ] **Negative test — mandatory overflow.** With mandatory context exceeding
      the budget, assert an explicit overflow result (or a fail-closed error)
      naming the dropped block. Assert no silent success.
- [ ] **Negative test — tenant boundary.** A non-member requesting context for
      a foreign novel gets a 404 and learns nothing; an unauthorized caller is
      never shown a revision id.
- [ ] **Negative test — spoiler boundary.** A READER-mode compile does not
      admit a fact behind the reader's chapter position.
- [ ] **Divergence test.** A test that would fail if the two callers' selection
      logic drifted apart again.
- [ ] Named commands, prerequisites, and expected outcome recorded with actual
      results, separately from expectations. Zero selected tests do not pass a
      gate.
- [ ] Separate review of the submitted revision; findings resolved.

## Migration and rollback

**None expected.** No schema change and no migration is authorized by this
contract. If one becomes necessary, stop and return for a new contract: a
migration is a reviewed artifact, and per GAP-018 its index creation must be
re-runnable so a failed deploy cannot leave a half-applied database. This task
must not reset, restore or destructively roll back any database.

## Documentation and handoff

Update `docs/14-progress/CURRENT.md`, `docs/implementation/progress.md` and
`docs/implementation/test-matrix.md` with verified scope only, and record
failures, uncertainty and any unsupported claim in
`ISSUES-AND-GAPS.md` **before** any workaround. Save an Engram checkpoint under
the runtime-confirmed identity at each boundary; if Engram is unavailable,
preserve the handoff in this file and progress, and log it as a GAP. Never
claim an unconfirmed save.

## Known unknowns (state these at dispatch, do not guess)

- **There is no chapter generation entry point.** No `generateChapter`,
  `draftChapter` or equivalent symbol exists anywhere in the repository, and
  `manuscript.ts` has no generation function. The only generation routes are
  the generic `/generate`, `/generate/stream`, `/generations` and
  `/generations/stream`, whose body (`orchestrator-routes.ts:22`) carries no
  chapter, scene, outline or revision identity. So "chapter context" has no
  chapter-shaped caller yet. Resolving whether this task introduces that
  identity, or only compiles for the generic path, is part of the open
  decision above.
- **There is no resolver for "the current approved outline."** No
  `getApprovedOutline`/`resolveOutline`/`currentOutline` exists. Approval is a
  CAS to `APPROVED` with the previous holder moved to `SUPERSEDED`
  (`planning.ts:620-629`, `:688-691`), and one-APPROVED-per-novel is enforced
  by a partial unique index. Reading "the approved outline" is therefore a new
  read this task must define, not one it can reuse.
- **There is no story-position model.** No `StoryState`/`StoryPosition` table
  exists. Position must be derived from `chapters` (`number`, `status`;
  `@@unique([novelId, number])`) and stated explicitly. Note the distance
  `horizonFor` needs is chapters-ahead-of-the-writing-edge, and the writing
  edge itself is a derived value this task must define.
- **Planning Horizon and Narrative DNA are per-novel singletons** keyed by
  `novel_id` (`schema.prisma:1485`, `:2135`), both holding untyped `Json` whose
  shape is validated in code (`horizonFor` at `packages/planning/planning.ts:202`,
  which returns a `problem` rather than inventing a default) and not by the
  database. A compiler that reads them must handle a malformed or absent policy
  loudly, matching `horizonFor`'s own failure contract. The detail levels are
  `HORIZON_DETAILS = ["FULL", "BEATS", "SKETCH", "VAGUE"]`
  (`packages/planning/planning.ts:160`).
- **Story state tables exist but nothing composes them:** `Character` (`:1814`),
  `CharacterState` (`:1861`), `RelationshipStance` (`:1943`), `Scene` (`:301`),
  `StoryEvent` (`:1534`), `TimelineEvent` (`:1573`). Which of these the
  compiler may read, and under what bound, is part of the open decision —
  reading all of them is the full-manuscript scan §2.16 forbids.
- `retrieval.search` clamps `limit` to 1..100 (`retrieval.ts:857`), ranks by
  relevance rather than creation time (SQL lexical leg `ORDER BY score DESC,
  c.id` + `LIMIT candidates`; vector leg ordered by similarity; RRF fusion
  `:1031`), and each caller passes its own value (`orchestrator.ts:186` uses 8,
  `workflow-runs.ts:468` uses 10). Unifying callers means choosing one bound
  and justifying it — do not silently inherit either. The retrieval path is
  **not** the truncation problem; only the canon-fact path is.
- **No memory/summary service exists.** No `recall`, `searchFacts`,
  `relevantFacts` or `similarity` symbol anywhere, and no L2–L5 hierarchical
  memory store. Retrieval is reference-chunk search only. So the §7 tiers
  "current states", "active threads/promises", "relevant recent memory" and
  "relevant historical memory" have **no backing service** today — the contract
  must say what it does about each rather than imply they exist. Building them
  is out of scope (NF-WF-009).
- The pure retrieval helpers live in `packages/retrieval/` (flat, no `src/`):
  `chunk.ts`, `fuse.ts`, `spoiler.ts`, `index.ts` — the precedent for where a
  pure, testable helper belongs if the compiler needs one.

## Next action

Resolve the open decision, then submit this contract for separate review before
any coding. Queue rows are not test receipts.
