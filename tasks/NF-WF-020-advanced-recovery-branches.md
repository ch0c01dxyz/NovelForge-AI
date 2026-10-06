# Task NF-WF-020: Advanced recovery, branches and bulk operations

Project language: English for all authored/revised artifacts and generated
project content; UI uses English (`en`)/Bahasa Indonesia (`id`) locale keys
and resources with English fallback. Record any other explicit author override
and its scope.
Model selection: author-selected at runtime; separate implementer/reviewer
actors, with requested aliases distinguished from runtime evidence.

Status: PLANNED
Milestone / capability IDs: M6 (Advanced recovery and simulation);
CAP-03 (Revision, checkpoint, non-destructive restore — advanced M6);
delivery-plan NF-WF-020 (row `:154`).
Implementer role / requested and resolved model: (one separate actor per
child — 020A, 020B, 020C; each a separate actor from the contract author,
the contract reviewer, and the other children's implementers; backend
MODEL_UNVERIFIED per GAP-013)
Reviewer role / requested and resolved model: (one separate actor per child
diff review, separate from the contract author and all implementers; backend
MODEL_UNVERIFIED per GAP-013)
Readiness evidence / unresolved decisions / parent acceptance owner: (filled
after contract review; Q1 and Q3 are DECIDED by Klein — see
§"Open questions")
Frozen review manifest / exact artifact paths and identity: (filled at
review)
Baseline revision / local changes to preserve: repo HEAD `8a6ff26`
(2026-10-06) — NF-WF-019 pushed.
Engram checkpoint topic key / last confirmed observation reference:
Engram unavailable on this host (GAP-021); checkpoints go to
docs/implementation/progress.md.

## Normative vs informative

Normative: the child split (020A/020B/020C) and each child's scope, the
invariants (§"Behavior and invariants"), the exact route signatures and
response shapes per child, the selective-scope vocabulary, the merge
conflict taxonomy, the branch model (Invariant 5), the additive migration
contents, the acceptance checkboxes, and the question labels in §"Open
questions" (the recommendations are the author's, for the reviewer to
confirm or flip; Q1/Q3 are DECIDED by Klein — recorded as decided, not
re-decided by the reviewer). Informative: rationale
paragraphs, examples, and the recommendations for the still-open
questions.

## Goal and reason

NF-WF-002 built the minimum recovery foundation: checkpoints, FULL
restore preview/apply, non-destructive restore (new revision,
`origin = RESTORE`). Three deliberately-deferred pieces remain, and the
delivery plan assigns all three to NF-WF-020 (row `:154`):

1. **Selective recovery.** `DOMAIN`/`ENTITY`/`SELECTIVE` restore scopes
   are refused by name today (`ConflictError("selective restore is not
   implemented")`, `apps/api/src/services/revisions.ts:1006`). The
   story-versioning contract (C7) says "NF-WF-020 owns the rest."
   Restoring one domain (e.g. canon) without touching the rest requires
   dependency analysis first — otherwise the restore orphans references
   (a `character_knowledge` row pointing at a rewound `canon_facts`
   row).
2. **Branches.** `NovelBranch` exists in the schema with
   `parentBranchId` ("Alternate lineage (branch merge is NF-WF-020)"),
   but no route creates, lists, switches, or merges branches — only
   `main` is ever used. The M6 acceptance is "branch experiments and
   consequences preserve main state and history."
3. **Conservative merge + bulk recovery.** The delivery plan (`:57`)
   explicitly scopes M6: "Advanced semantic merge may remain M9; M6
   may refuse conflicting branch merges with evidence rather than
   inventing a conflict resolution." Bulk operations (bulk outline
   rewrite, bulk AI rewrite, branch merge, `importChapters`) already
   take mandatory pre-operation checkpoints (C3 HIGH); 020 makes
   rolling one back a first-class, one-action operation.

This is a design contract. Implementation starts only after a separate
contract review returns APPROVE.

## Required reading

- [Operating constitution](../../AGENTS.md) (esp. §2 invariants 9
  (canon never destructively overwritten), 11 (every meaningful
  mutation versioned), 12 (rollback non-destructive), 14 (derived
  data invalidated on source change), 15 (pre-change checkpoint for
  high-impact mutations); §5 canon authority — conflicts surfaced,
  never silently reconciled; §9 versioning/recovery; §10, §12, §13).
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- [Delivery plan](../../docs/implementation/DELIVERY-PLAN.md) (row
  `:154`; M6 `:48`; the `:57` merge-scope sentence; the `:160`
  multi-child rule).
- [Story-versioning contract](../../docs/03-domain/STORY-VERSIONING.md)
  (C1 coverage set, C4 head CAS, C5 failure mapping, C6 rebuild
  intents, C7 restore, C12 clarifications — the frozen semantics
  020 extends, never rewrites).
- [NF-WF-011 contract](NF-WF-011-author-preview-e2e.md) (the restore
  flow 011 proves: checkpoint → preview → apply, non-destructive).
- [NF-WF-009 contract](NF-WF-009-revision-derived-memory.md)
  (DerivedRebuildIntent, as-of semantics — 020B closes GAP-040).
- [NF-WF-010 contract](NF-WF-010-state-consumer-integration.md)
  (state assembly consumers of revision pins).
- Existing code: `apps/api/src/services/revisions.ts`
  (`previewRestore`, `applyRestore`, `RestorePreview`),
  `apps/api/src/revision-routes.ts` (the six existing routes),
  `packages/story-versioning/` (`impact.ts`, `snapshot.ts`,
  FK-dependency order assertions),
  `packages/auth/authorization.ts` (`revision:read`,
  `revision:manage` — already exist).

## Environment prerequisites

Follow [environment preflight](../../docs/11-deployment/ENVIRONMENT-PREFLIGHT.md).
Native PostgreSQL 16 + pgvector and Redis on localhost (no Docker on
this host); pnpm 12, Node 24; dedicated disposable
`novelforge_test_*` databases for all mutation tests. Record actual
readiness; never claim another host's checks. GAP-065 (host env
re-application) and GAP-077 (container replacement) apply.

## Dependencies and evidence

- **NF-WF-011** (contract blob
  `3d66851028673001745e2591eb0f76bc352f785d`) — the restore
  flow 020 extends: checkpoint → `restores/preview` →
  `restores/:id/apply`, non-destructive (`origin = RESTORE`).
  Status: IMPLEMENTED + PUSHED.
- **Story-versioning contract**
  (`docs/03-domain/STORY-VERSIONING.md`, blob
  `3e8fe3e09c0b2edd9d872fa44d33314be21f675d`) — C1–C12 are the
  frozen semantics. 020 adds scopes, branches, and merge; it does
  not amend C1–C12. Any contradiction found during implementation
  needs an explicit author decision, not a silent edit.
- **NF-WF-009** (blob `ee469b784a3a7be0e29bdab0f7f4be0c70e1dd45`)
  — `DerivedRebuildIntent` (020C's merge/rollback write intents);
  as-of semantics (020B closes GAP-040).
- **NF-WF-010** (blob `e4a2db25eace32fda1de1e7bc922bed8991705d3`)
  — state assembly consumers of revision pins.
- Open gaps touching this task: **GAP-040** (cross-branch as-of —
  020B closes it, Q6), **GAP-013** (standing: backends
  MODEL_UNVERIFIED), **GAP-028** (worker AI wiring — untouched by
  020).
- A PLANNED dependency does not make this task READY: all four
  dependencies above are IMPLEMENTED.

## Child split

Per the delivery-plan multi-child rule (`:160`, the 017/018/019
pattern), NF-WF-020 splits into three independently reviewable
children. Each child has its own contract section below, its own
implementer, its own diff review, and its own commit. Completion of
NF-WF-020 requires all three.

| Child | Scope | Independent verifiability |
|---|---|---|
| **020A — Selective restore** | `DOMAIN`/`ENTITY`/`SELECTIVE` restore scopes: dependency analysis in preview (what breaks outside the selection), selective apply (only selected tables/entities rewound), the existing `"selective restore is not implemented"` refusal removed for these scopes | Verifiable without branches or merge: selective preview on a fixture novel, dependency conflicts reported, selective apply rewinds only the selection, FULL behavior unchanged |
| **020B — Branch isolation** | Branch lifecycle: create/list/switch; branch-scoped revision/checkpoint/restore history; the branch model (Invariant 5); branch-aware as-of (closes GAP-040) | Verifiable without merge: branch create from a checkpoint, isolated lineage (mutations on B never touch main), switch as restore-to-head, per-branch timelines |
| **020C — Conservative merge + bulk recovery** | Merge preview with conflict taxonomy; apply iff zero conflicts (refuse-with-evidence otherwise, per delivery-plan `:57`); one-action rollback of bulk operations via their pre-op checkpoints | Verifiable without selective restore: merge preview on diverged branches, clean merge applies as one revision, conflicting merge 409s with evidence, bulk rollback rewinds to the pre-op checkpoint |

**Justification.** 020A is pure restore-scope extension — its review
focus is the dependency analysis (no orphaned references) and that
FULL restore behavior is unchanged. It needs no branch machinery:
selective scopes operate on the current branch. 020B is the lineage
surface — its review focus is isolation (Invariant 5) and the
branch-aware as-of; it needs 020A only conceptually (selective
restore works per-branch once both exist), so it parallelizes.
020C consumes branches (merge needs two lineages) but its preview
and conflict taxonomy are specified against pinned shapes, so it
can be implemented against 020B's pinned route signatures without
waiting for 020B's code. Each child's acceptance checkboxes are
checkable in isolation.

**Build order recommendation:** 020A and 020B in parallel; 020C
after (or in parallel against 020B's pinned branch routes). The
parent decides the dispatch order at implementation time.

## Scope

### Allowed

- `apps/api/src/services/revisions.ts` — selective preview/apply,
  branch operations, merge preview/apply, bulk rollback (additive
  functions; existing FULL paths untouched in behavior).
- `apps/api/src/revision-routes.ts` — new branch/merge/rollback
  routes (additive; existing six routes untouched).
- `packages/story-versioning/` — dependency-edge table for 020A
  (additive; the FK-order assertions stay green).
- `packages/database/prisma/schema.prisma` + one additive
  migration per child (see per-child §"Migration").
- `apps/web/app/` — Recovery Center surface (new page +
  components under the novel workspace): selective-restore
  preview, branch list/switch/create, merge preview, bulk
  rollback. §15 foundational design; en+id; a11y.
- `docs/implementation/progress.md`,
  `docs/14-progress/CURRENT.md`,
  `docs/implementation/test-matrix.md`,
  `docs/implementation/ISSUES-AND-GAPS.md` — receipts and GAPs
  (deviations recorded BEFORE workarounds, standing rule).

### Forbidden

- Rewriting C1–C12 semantics (coverage set, head CAS, failure
  mapping, rebuild intents, FULL restore). 020 extends; it does
  not amend the frozen contract.
- Destructive operations: deleting revisions, checkpoints,
  snapshots, or rewriting history (Invariant 4).
- `branchId` on covered tables (canon_facts, characters, …) —
  the 020B branch model (Invariant 5) deliberately avoids it;
  per-branch live tables are a follow-up, not 020 (Q1 —
  DECIDED by Klein: temporal).
- New capabilities in `packages/auth/authorization.ts` —
  `revision:read` / `revision:manage` cover everything (Invariant
  6).
- Semantic (LLM-judged) merge — stays M9 per delivery-plan `:57`;
  020C refuses conflicting merges with evidence instead.
- Touching 021 (simulation) — 021 consumes 020B's branches; 020
  does not build simulation.

### Inputs

- Existing: `previewRestore` / `applyRestore`
  (`apps/api/src/services/revisions.ts:830/1046`),
  `RestorePreview` (`:590`), `impactFor`
  (`packages/story-versioning/impact.ts`), the C1 coverage set
  (36 tables), `revision:read` / `revision:manage`.
- New per child: selective scope + selection shapes (020A),
  branch identity (020B), merge base + conflict taxonomy (020C).

### Outputs

- 020A: `DOMAIN`/`ENTITY`/`SELECTIVE` preview + apply; the
  dependency-conflict report shape; FULL unchanged.
- 020B: branch CRUD + switch; branch-scoped history;
  branch-aware as-of (GAP-040 closed).
- 020C: merge preview + conditional apply; bulk-operation
  one-action rollback; `RevisionOrigin.MERGE` /
  `BRANCH_SWITCH` (additive enum values).
- Recovery Center UI (per-child surfaces, §15, en+id, a11y).
- Docs: progress/CURRENT/test-matrix/ISSUES-AND-GAPS updates.

### Out of scope (with follow-up owner)

- Per-branch live tables → **follow-up** (Q1 DECIDED by Klein:
  temporal for 020; concurrent live editing on two branches of
  one novel is not a supported shape).
- Semantic merge → **M9** (delivery-plan `:57`).
- Publishing from a branch → **DECIDED by Klein: NO.**
  Publication stays on `main` only; a branch's chapters must
  merge to `main` before they can publish (Invariant 9 —
  020B acceptance pins the refusal behavior).
- Real-time collaborative editing conflicts → not 020 (the head
  CAS already serializes writers).
- 021 simulation — consumes 020B; not built here.

## Behavior and invariants

### Invariant 1 — Preview is read-only and never mutates

Every preview path (`restores/preview`, selective preview, merge
preview) computes and stores only its preview row. It MUST NOT
write revisions, checkpoints, snapshots, or covered-table rows.
The existing `RestorePreview` guarantees extend to the new
previews: changed/added/removed counts, orphan references,
affected chapters, rebuild projections, outside-scope list.

### Invariant 2 — Merge never silently reconciles conflicts

Per constitution §5 (conflicts must be surfaced, not silently
reconciled) and delivery-plan `:57`: a merge with any conflict
(as pinned in 020C's taxonomy) MUST NOT apply. It returns 409
`MERGE_CONFLICTS` with the evidence payload (both versions of
each conflicting entity, the base version, the dependency edges
involved). No partial merge, no auto-pick, no silent drop.

### Invariant 3 — Bulk operations require pre-operation checkpoints

Constitution Invariant 15 + C3 HIGH: bulk outline rewrite, bulk
AI rewrite, branch merge, `importChapters` each capture a
mandatory pre-operation checkpoint in the same transaction.
020C's one-action rollback targets exactly these checkpoints.

### Invariant 4 — Recovery creates revisions; history is never rewritten

Restore, selective restore, branch switch, merge, and bulk
rollback each create exactly one new revision (`origin` =
`RESTORE` / `BRANCH_SWITCH` / `MERGE` as pinned). No revision,
checkpoint, snapshot, or change-set row is ever deleted or
updated. Canon is never destructively overwritten
(constitution Invariant 9); rollback is non-destructive (§9).

### Invariant 5 — The 020 branch model (temporal isolation)

A branch is a named revision lineage plus a mutable head pointer
(`NovelBranch`: `name` UNIQUE per novel, `parentBranchId`,
`headRevisionId`). The novel's live covered tables always
reflect exactly one branch's head — the *checked-out* branch.
**The checked-out branch is tracked by `Novel.currentBranchId`**
(nullable FK to `novel_branches`, `ON DELETE SET NULL`;
backfilled in the 020B migration to each novel's `main` branch
id; NULL reads as `main` for pre-020 novels). The switch route
updates it in the same transaction as the restore-to-head. The
publish guard (Invariant 9) reads it. After a successful merge
apply (020C), it is set to the target branch — the live tables
then reflect the target's merged head.
**Switching branches is a restore-to-head operation**: it
reconstructs the target branch head's state into the live tables
(reusing the C7 apply machinery), creates one new revision
(`origin = BRANCH_SWITCH`) on the *target* branch, and is fully
audited. Consequences, pinned:

- Operations naming branch B advance only B's lineage; B's
  revisions/checkpoints/snapshots/restores are invisible to
  main's history views and vice versa (isolation at the lineage
  level).
- Live covered tables carry no `branchId` in 020 — concurrent
  live mutation on two branches of one novel is not a supported
  shape (Q1 records the follow-up).
- Switching with un-checkpointed live changes relative to the
  current branch head is refused by name (`DIRTY_SWITCH`) unless
  the caller passes `autoCheckpoint: true`, which captures a
  `MANUAL` checkpoint first. Dirty is detected by comparing the
  live covered-table rows against the current branch head's
  pinned state (the same row-level comparison the C7 preview
  uses); any added/removed/changed covered-table row = dirty.
  Non-covered tables never count as dirty. The implementer
  chooses the efficient comparison; the acceptance
  (mutate → 409) is the conformance test.

### Invariant 6 — No new capabilities

`revision:read` (read revision/checkpoint/restore/branch
history) and `revision:manage` (create checkpoint/branch,
apply restore/selective/switch/merge/rollback) cover all 020
operations. `packages/auth/authorization.ts` is untouched.
Server enforces; UI gating is progressive enhancement only.

### Invariant 7 — Additive migrations only

One additive idempotent migration per child (GAP-030 DO-block
pattern). Enum additions (`BRANCH_SWITCH`, `MERGE`) are
additive values on `RevisionOrigin`. No existing table is
altered destructively; no row is rewritten.

### Invariant 8 — Design, i18n, a11y

All 020 UI follows the §15 foundational design
(`docs/design/writer-workspace` + `DESIGN-TOKENS.md`). Every
new string ships en+id (programmatic parity check before any
"complete" claim). Interactive surfaces get vitest-axe checks
(wcag2aa + wcag22aa, zero violations).

### Invariant 9 — No publishing from a non-`main` branch (DECIDED by Klein, Q3)

Publication stays on `main` only. Attempting to publish,
schedule, or immediate-publish a chapter while a non-`main`
branch is checked out — or naming a non-`main` branch in a
publish call — is refused with a typed 409
`NOT_ON_MAIN_BRANCH`, with no writes. A branch's chapters
reach publication only by merging to `main` (020C) and
publishing from there. This adds a guard to the existing
publish path; it introduces no new capability
(`chapter:publish` from NF-WF-012 still gates the operation).

## Child 020A — Selective restore: preview + dependency checks

### Goal

Lift the `DOMAIN`/`ENTITY`/`SELECTIVE` refusal: an author can
preview and apply a restore scoped to part of the story, with
dependency analysis that names everything outside the selection
that would break. FULL restore behavior is unchanged.

### Selective scope vocabulary (pinned)

`POST .../restores/preview` and the apply route accept
`scope` + `selection`:

| Scope | `selection` shape | Meaning |
|---|---|---|
| `DOMAIN` | `{ domain: "canon" \| "planning" \| "intelligence" \| "character" \| "relationship" \| "narrative" \| "manuscript" }` | The C1 table group (e.g. `"canon"` = `story_entities`, `canon_facts`, `canon_fact_sources`, `canon_proposals`, `canon_applications`, `canon_application_items`) |
| `ENTITY` | `{ entityType: <covered table>, entityId: string }` | One entity plus its dependency closure (below) |
| `SELECTIVE` | `{ tables: [<covered table>...], entityIds: [<id>...] }` | Explicit table/entity set; empty `entityIds` with non-empty `tables` = whole tables |

`scope: "FULL"` ignores `selection` (existing behavior, unchanged).

#### Domain → tables (pinned)

| Domain | Tables |
|---|---|
| `canon` | `story_entities`, `canon_facts`, `canon_fact_sources`, `canon_proposals`, `canon_applications`, `canon_application_items` |
| `character` | `characters`, `character_states`, `character_knowledge`, `character_arcs`, `character_arc_milestones` |
| `relationship` | `relationship_stances`, `bonds`, `bond_members`, `bond_transitions`, `meaningful_interactions` |
| `narrative` | `narrative_dna_profiles`, `narrative_policies`, `antagonists` |
| `planning` | `synopses`, `sagas`, `outline_nodes`, `outline_versions`, `planning_horizons`, `scenes` |
| `intelligence` | `story_promises`, `story_threads`, `story_thread_events`, `timeline_events`, `story_events`, `causal_edges` |
| `manuscript` | `chapters`, `chapter_versions` |

Three covered tables belong to no domain and are never rewound
by `DOMAIN` scope: `memory_projections` (derived, rebuildable —
C6), `final_text_reviews` (audit receipts), `publications`
(not story state, 012 Invariant 8). They are also excluded from
the dependency-conflict analysis as dependents (a `DOMAIN`
restore writes `DerivedRebuildIntent` rows for affected
projections instead of reporting them as conflicts).

#### ENTITY closure semantics (pinned)

`ENTITY` scope rewinds the named entity **plus its dependency
closure** (step 1 below), by definition — the closure members
are part of the selection S, not orphans. The conflict report
lists the closure members as the informational blast radius
(their kinds describe the dependency relationship). `SELECTIVE`
scope rewinds exactly the named tables/entities; dependents
outside the set are reported as conflicts and apply requires
explicit acknowledgment — an acknowledged apply orphans with
consent, and the acknowledgment is recorded in the new
revision's change set (no silent orphans, Invariant 1).

### Dependency analysis (the 020A core)

For a selection S at checkpoint C, preview computes:

1. **Dependency closure** — entities outside S that reference
   entities inside S, via (a) FK edges from the Prisma schema
   (the story-versioning package's FK-dependency order is the
   machine-readable edge list; 020A adds a `dependency-edges.ts`
   table derived from it, additive), and (b) pinned semantic
   edges: `character_knowledge → canon_facts`,
   `canon_fact_sources → canon_facts`,
   `canon_proposals → canon_facts`,
   `canon_application_items → canon_facts`,
   `outline_nodes → chapters`, `story_thread_events →
   story_threads`, `bond_members → bonds`, `bond_transitions →
   bonds`, `timeline_events → story_events`.
2. **Conflict report** — per dependent entity: `{ entityType,
   entityId, kind: "ORPHAN_REFERENCE" | "STALE_DEPENDENT",
   detail }`. `ORPHAN_REFERENCE`: the dependent's referenced row
   is removed/rewound by the restore. `STALE_DEPENDENT`: the
   dependent survives but was created against a newer version of
   the rewound entity.
3. **Chapter impact** — chapters whose `currentVersionId` would
   move (same C7 step-4 rule, scoped to the selection) +
   PUBLISHED pointer conflicts (never moved, surfaced).
4. **Rebuild projections** — `DerivedRebuildIntent` set for the
   affected projections (C6), scoped to the selection.

Apply rewinds ONLY the selected tables/entities (delete in
reverse FK order + re-insert in FK order, scoped), leaves every
other covered table untouched, and creates one new revision
(`origin = RESTORE`) whose change set records the selective
scope. The existing apply refusal rules hold: moved head →
refuse; payload chapter id absent live → refuse by name (C5);
`DOMAIN`/`ENTITY`/`SELECTIVE` with an empty selection → 400
`INVALID_INPUT`.

### Routes (additive)

- `POST /api/workspaces/:workspaceId/novels/:novelId/restores/preview`
  — extended body: `{ checkpointId, scope, selection?,
  branchId? }`. Response: `{ restoreOperationId, preview }`
  where `preview` extends `RestorePreview` with
  `dependencyConflicts: [...]` (empty for FULL).
- `POST /api/workspaces/:workspaceId/novels/:novelId/restores/:restoreOperationId/apply`
  — unchanged shape; accepts operations created with any scope.
  Requires `revision:manage` (existing gate).

### Web UI

Recovery Center: scope picker (Full / Domain / Entity /
Selective) on the restore preview; the dependency-conflict list
rendered as blocking warnings (each names the entity and the
kind); apply disabled until the author acknowledges the
conflicts (explicit checkbox — no silent apply over orphans).
§15 design; en+id; axe.

### Migration (additive)

None expected: selective restore uses existing tables. If the
implementer finds a genuine need, it follows the GAP-030
pattern and gets its own review — the contract expects none.

### Acceptance — 020A

- [ ] Selective preview on a fixture novel: `DOMAIN: "canon"`
  preview names every out-of-domain dependent (at least one
  `character_knowledge → canon_facts` ORPHAN_REFERENCE is
  forced by fixture content).
- [ ] `ENTITY` preview: single fact + closure; dependents
  listed with kinds.
- [ ] Selective apply rewinds ONLY the selection: row counts
  for non-selected covered tables unchanged; selected tables
  match the checkpoint pin; one new revision, `origin =
  "RESTORE"`.
- [ ] Moved head between preview and apply → 409, no writes.
- [ ] Empty selection → 400 `INVALID_INPUT`.
- [ ] FULL preview/apply byte-identical behavior to pre-020
  (existing 002/011 tests green, unchanged).
- [ ] Preview is read-only: revision/checkpoint/snapshot/row
  counts unchanged after preview (Invariant 1).
- [ ] UI: conflict acknowledgment required before apply; en+id
  parity; axe zero violations.
- [ ] `revision:manage` enforced (VIEWER → 403); no new
  capabilities.

## Child 020B — Branch isolation

### Goal

Branches become usable: create, list, switch, and operate
(checkpoint / preview / restore) per branch, with the lineage
isolation M6 requires ("branch experiments and consequences
preserve main state and history"). 020B also closes GAP-040
(branch-aware as-of).

### Branch model (Invariant 5 — normative)

See Invariant 5. Operationally:

- `POST .../branches { name, fromRevisionId? |
  fromCheckpointId?, branchId? }` — creates the branch;
  `parentBranchId` = the source branch; new additive column
  `NovelBranch.sourceRevisionId` (nullable) records the fork
  point (needed for 020C's merge base). Name UNIQUE per novel
  (existing constraint); `name: "main"` reserved → 400.
  Requires `revision:manage`.
- `GET .../branches` — `{ branches: [{ id, name,
  parentBranchId, sourceRevisionId, headRevisionId,
  headNumber, createdAt }] }`. Requires `revision:read`.
- `POST .../branches/:branchId/switch { autoCheckpoint? }` —
  restore-to-head of the target branch (C7 machinery), one new
  revision `origin = BRANCH_SWITCH` on the target branch.
  Refuses `DIRTY_SWITCH` (409) when live state differs from the
  current branch head and `autoCheckpoint` is not true.
- Existing routes accept `branchId?` (default: the
  checked-out branch, `Novel.currentBranchId`, NULL → `main`;
  backward-compatible — pre-020 novels are always on `main`):
  `GET .../revisions`, `GET .../checkpoints`,
  `POST .../checkpoints`, `POST .../restores/preview`,
  `POST .../restores/:id/apply`. History views filter by
  branch — main's views never show B's rows.
- **Isolation rule:** a mutation naming branch B runs the C4
  CAS against B's head row only; B's checkpoints/snapshots are
  keyed to B's revisions. Nothing in 020B mutates another
  branch's lineage.

### Branch-aware as-of (closes GAP-040)

`asOfRevisionId` (009 memory, 010 health/assembly) becomes
branch-aware: the revision MUST belong to the novel's
*current* branch (the checked-out branch); a revision from
another branch → 400 `INVALID_INPUT` ("cross-branch as-of is
rejected, not defined" — the 009 semantics GAP-040 names).
`memory.ts`'s 009 as-of path is the reference implementation.

### Web UI

Recovery Center: branch list (name, head number, fork point,
updated), create dialog (name + source revision/checkpoint
picker), switch action (with dirty-state warning +
auto-checkpoint option), per-branch timeline (revisions +
checkpoints filtered by branch). §15 design; en+id; axe.

### Migration (additive)

- `NovelBranch.sourceRevisionId` — nullable UUID, no backfill
  (NULL = fork point unknown for pre-020 branches; only `main`
  exists pre-020, whose source is itself).
- `Novel.currentBranchId` — nullable UUID FK to
  `novel_branches(id)` (`ON DELETE SET NULL`); backfilled in
  the migration to each novel's `main` branch id; NULL reads
  as `main`. Updated by the switch route in the same
  transaction as the restore-to-head; read by the publish
  guard (Invariant 9).
- `RevisionOrigin` += `BRANCH_SWITCH` (additive enum value).
- GAP-030 DO-block pattern; idempotent.

### Acceptance — 020B

- [ ] Create branch from a checkpoint: new `NovelBranch` row,
  `parentBranchId` + `sourceRevisionId` set; head = the
  checkpoint's revision.
- [ ] Mutations on B advance only B: B's head number +1,
  main's head unchanged; main's `GET .../revisions` shows no
  B rows and vice versa.
- [ ] Switch main → B → main: each switch creates one
  `BRANCH_SWITCH` revision on the *target* branch; live state
  matches each branch head after its switch; all prior
  revisions readable; `Novel.currentBranchId` tracks the
  target after each switch.
- [ ] Dirty switch refused: mutate on main without
  checkpoint, switch → 409 `DIRTY_SWITCH`; with
  `autoCheckpoint: true` → switch succeeds and a MANUAL
  checkpoint exists.
- [ ] Duplicate branch name → 400; `name: "main"` → 400;
  unknown branch → 404; VIEWER create/switch → 403.
- [ ] GAP-040: cross-branch `asOfRevisionId` → 400
  `INVALID_INPUT` in memory as-of and health/assembly paths;
  same-branch as-of unchanged.
- [ ] UI: branch list/switch/create + per-branch timeline;
  en+id parity; axe zero violations.
- [ ] Invariant 9 (Q3): publish/schedule while a non-`main`
  branch is checked out → 409 `NOT_ON_MAIN_BRANCH`, no
  writes; after merging the branch to `main` (020C),
  publishing the same chapter from `main` succeeds. No new
  capability.
- [ ] No new capabilities; `revision:read`/`revision:manage`
  enforced on every new route.

## Child 020C — Conservative merge + bulk-operation recovery

### Goal

Bring branch work back safely: merge preview names every
divergence; apply merges only when there is nothing to fight
over (delivery-plan `:57` — conflicting merges are refused
with evidence, never auto-resolved; semantic merge stays M9).
Bulk operations get one-action rollback via their mandatory
pre-operation checkpoints.

### Merge base and conflict taxonomy (pinned)

- **Base**: `sourceBranch.sourceRevisionId` (020B). Changes
  since base are computed per covered entity from the change
  sets on each branch (change_set_items record WHAT changed,
  C2).
- **Taxonomy** (per entity, three-way base/source/target):
  - `CLEAN` — changed on one side only (or identically on
    both): auto-mergable.
  - `CONFLICT` — changed on both sides differently:
    refused with evidence.
  - `DELETED_MODIFIED` — deleted on one side, changed on the
    other: `CONFLICT`.
  - `ORPHAN_RISK` — a CLEAN change whose dependents (020A's
    edge table) diverge on the other side: surfaced as a
    warning; merge still applies (the author acknowledged it
    in preview).
- **Preview** `POST .../branches/:branchId/merge/preview {
  targetBranchId? }` (default main): `{ baseRevisionId,
  changes: { clean: [...], conflicts: [...], warnings: [...]
  } }` — read-only (Invariant 1). Each conflict carries both
  versions + the base version + the dependency edges.
- **Apply** `POST .../branches/:branchId/merge/apply {
  targetBranchId?, expectedHeadRevisionId? }`: applies ONLY
  when `conflicts` is empty. Creates one new revision on the
  target (`origin = MERGE`, additive enum value) whose change
  set records the merged entity list; writes
  `DerivedRebuildIntent` rows (C6). Any conflict → 409
  `MERGE_CONFLICTS` with the evidence payload; no partial
  merge, no writes (Invariant 2). Requires `revision:manage`.

### Bulk-operation recovery

- `POST .../checkpoints/:checkpointId/rollback` — one-action
  rollback for bulk-operation checkpoints: computes the FULL
  preview, then applies it in the same authorized call
  (response includes the preview counts). Restricted to
  checkpoints of kind `PRE_MUTATION` / `PRE_IMPORT` /
  `PRE_GENERATION` (the bulk-operation checkpoint kinds);
  other kinds → 400 `INVALID_INPUT` ("use the preview/apply
  flow"). Head CAS + moved-head refusal identical to apply.
  The checkpoint's branch must be the checked-out branch;
  otherwise → 409 `NOT_ON_CHECKED_OUT_BRANCH` (no cross-branch
  rollback). Requires `revision:manage`.
- Which bulk operations qualify (Q4): bulk outline rewrite,
  bulk AI rewrite, branch merge, `importChapters` — the C3
  HIGH bulk list. The UI's "recoverable operations" list shows
  exactly these checkpoints (kind-filtered, newest first).

### Web UI

Recovery Center: merge preview (clean/conflict/warning lists;
conflicts show both versions + base); merge apply button
disabled unless zero conflicts; "recoverable operations" list
with one-action rollback (preview counts shown before
confirm). §15 design; en+id; axe.

### Migration (additive)

- `RevisionOrigin` += `MERGE` (additive enum value).
- No new tables. GAP-030 pattern; idempotent.

### Acceptance — 020C

- [ ] Merge preview on diverged branches: forced fixture
  divergence yields ≥1 `CONFLICT` (same fact changed both
  sides), ≥1 `CLEAN` (changed one side), ≥1 warning
  (`ORPHAN_RISK`); each conflict carries both versions + base.
- [ ] Conflicting merge apply → 409 `MERGE_CONFLICTS` with
  evidence; zero writes (revision count unchanged).
- [ ] Clean merge apply → one new revision on target,
  `origin = MERGE`; merged entities match source; change set
  records the merge; rebuild intents written.
- [ ] Merge preview is read-only (counts unchanged).
- [ ] Bulk rollback: `PRE_MUTATION` checkpoint → one call
  rewinds to the pin (new `RESTORE` revision); non-bulk
  checkpoint kind → 400; checkpoint on a non-checked-out
  branch → 409 `NOT_ON_CHECKED_OUT_BRANCH`.
- [ ] Moved head between merge preview and apply → 409.
- [ ] UI: merge preview + gated apply + recoverable-operations
  list; en+id parity; axe zero violations.
- [ ] No new capabilities; no semantic/LLM merge anywhere
  (grep-verified).

## Acceptance and verification (parent)

- [ ] All three children implemented, diff-reviewed
  (APPROVE or APPROVE_WITH_FINDINGS with fixes applied),
  committed separately.
- [ ] FULL restore behavior unchanged: the 002/011 restore
  tests green without modification.
- [ ] No new capabilities; `authorization.ts` diff empty.
- [ ] Migrations: one additive idempotent migration per
  child (020A: none expected); `RevisionOrigin` gains only
  `BRANCH_SWITCH` + `MERGE`; `NovelBranch` gains only
  `sourceRevisionId` (nullable); `Novel` gains only
  `currentBranchId` (nullable FK, backfilled to `main`).
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
  (GAP-030 DO-blocks). 020A expects none. 020B adds a
  nullable column + one enum value; 020C adds one enum
  value. Enum additions are backward-compatible for
  readers; writers on the old binary never emit the new
  values (deploy order: migrate → deploy → use).
- Rollback of the task = revert the three child commits;
  no production state is at risk (new routes/tables only;
  existing restore paths untouched in behavior).
- Existing data: pre-020 novels have only the `main`
  branch with `sourceRevisionId = NULL` (honest: fork
  point unknown, and `main` was never forked). No
  backfill invents lineage.

## Documentation and handoff

- `docs/implementation/ISSUES-AND-GAPS.md`: every
  deviation, confusion, and unsupported claim recorded
  with a GAP number BEFORE any workaround (standing
  rule). New GAPs expected: none planned — record as
  found.
- `docs/implementation/progress.md`,
  `docs/14-progress/CURRENT.md`,
  `docs/implementation/test-matrix.md`: per-child
  sections with evidence counts.
- `docs/03-domain/STORY-VERSIONING.md`: NOT edited by
  020 (frozen). If 020 discovers a C1–C12 contradiction,
  it is recorded as a GAP and needs an explicit author
  decision — never a silent edit.
- Per-child handoff evidence (§10/§13): complete
  evidence reports with actually-executed test counts;
  no re-claiming another actor's numbers; shared-file
  lists; UNVERIFIED/honest-gap items named.

## Open questions

- **Q1 — Branch live-state model. DECIDED by Klein
  (2026-10-06): TEMPORAL.** The 020B model in Invariant 5
  (temporal isolation — live tables reflect one branch
  head; switching is restore-to-head) is the decided model.
  The per-branch live tables alternative (`branchId` on every
  covered table) is recorded as a follow-up, not 020. The
  reviewer does not re-decide this.
- **Q2 — Merge conflict auto-resolution scope.**
  Recommendation: only strictly non-overlapping changes
  auto-merge; any same-entity divergence (CONFLICT,
  DELETED_MODIFIED) → 409 with evidence, per
  delivery-plan `:57`. Semantic merge stays M9. Reviewer
  confirms.
- **Q3 — Publishing from a branch. DECIDED by Klein
  (2026-10-06): NO.** Publication stays on `main` only; a
  branch's chapters merge to `main` (020C) before they can
  publish (Invariant 9; 020B acceptance pins the 409
  `NOT_ON_MAIN_BRANCH` refusal). The reviewer does not
  re-decide this.
- **Q4 — Bulk-operation scope for 020C rollback.**
  Recommendation: the C3 HIGH bulk operations —
  `importChapters`, bulk outline rewrite, branch merge, bulk
  AI rewrite — via their `PRE_MUTATION` checkpoints
  (`PRE_IMPORT`/`PRE_GENERATION` have no producers yet; the
  rollback route accepts them for forward compatibility).
  Reviewer confirms.
- **Q5 — Selective scope vocabulary.** Recommendation:
  implement all three (`DOMAIN`, `ENTITY`, `SELECTIVE`)
  as pinned above; the dependency edge table is the
  machine-readable contract. Reviewer confirms.
- **Q6 — GAP-040 closure in 020B.** Recommendation: yes —
  020B makes as-of branch-aware (same-branch enforced,
  400 on cross-branch mismatch, mirroring 009's as-of
  path); GAP-040 closes on the 020B diff review's test
  evidence. Reviewer confirms.

## Review record

### Round 1 — contract review (2026-10-06)

- **Reviewer:** separate contract-reviewer actor (depth 1/2),
  separate from the contract author, the amendment author, all
  future implementers, and all prior reviewers. Backends
  MODEL_UNVERIFIED per GAP-013.
- **Verdict: APPROVE_WITH_FINDINGS** — 1 P2 + 5 P3 findings,
  all fixed inline in the contract file. Nothing committed.
- **Findings fixed inline:**
  - **F1 (P2) — no checked-out-branch tracking mechanism.**
    Invariant 5, Invariant 9, and the 020B acceptance all rely
    on "the checked-out branch", but the schema has no such
    pointer and the 020B migration did not add one — the
    publish guard (Invariant 9) was unimplementable. Fixed:
    `Novel.currentBranchId` (nullable FK to `novel_branches`,
    backfilled to `main`) added to the 020B migration;
    Invariant 5 now pins the tracking (switch updates it in
    the same transaction; publish guard reads it; merge apply
    sets it to the target); 020B acceptance pins the
    tracking; parent acceptance lists the migration item.
  - **F2 (P3) — DOMAIN vocabulary mapping incomplete.**
    Only `"canon"` was exemplified; the other six domains had
    no pinned table mapping, and three covered tables
    (`memory_projections`, `final_text_reviews`,
    `publications`) fit no domain. Fixed: full
    domain→tables table pinned in 020A (33 tables mapped;
    the 3 unmapped tables are never rewound by `DOMAIN`
    scope — derived/audit/non-story-state).
  - **F3 (P3) — Q4 named a non-existent operation.**
    "bulk canon import" is not in C3 HIGH and has no
    producer; C3 names `importChapters`. Fixed: all three
    occurrences replaced; Q4 clarified that
    `PRE_IMPORT`/`PRE_GENERATION` have no producers yet
    (accepted for forward compatibility).
  - **F4 (P3) — ENTITY/SELECTIVE closure semantics
    ambiguous.** Unclear whether the dependency closure is
    included in the rewind or orphaned. Fixed: `ENTITY`
    includes the closure by definition (conflict report is
    the informational blast radius); `SELECTIVE` rewinds
    exactly the named set — acknowledged apply orphans with
    consent, recorded in the change set.
  - **F5 (P3) — `branchId?` default incoherent.**
    Defaulting to hardcoded `main` breaks the temporal
    model (a checkpoint on checked-out B would attribute to
    main's lineage). Fixed: default is the checked-out
    branch (`Novel.currentBranchId`, NULL → `main`) —
    backward-compatible and coherent.
  - **F6 (P3) — DIRTY_SWITCH detection unnamed + rollback
    branch rule missing.** Fixed: dirty = live covered
    tables differ from the branch head's pinned state (C7
    comparison; non-covered tables never count); bulk
    rollback on a non-checked-out branch's checkpoint →
    409 `NOT_ON_CHECKED_OUT_BRANCH` (pinned in 020C route
    + acceptance).
- **Q1–Q6 dispositions:**
  - Q1 (temporal model): DECIDED by Klein — not re-decided;
    faithfully reflected in Invariant 5.
  - Q2 (merge auto-resolution): CONFIRMED as recommended —
    matches delivery-plan `:57`.
  - Q3 (no publishing from branches): DECIDED by Klein — not
    re-decided; faithfully reflected in Invariant 9;
    `NOT_ON_MAIN_BRANCH` matches 012's `PublicationError`
    SCREAMING_SNAKE 409 convention.
  - Q4 (bulk scope): CONFIRMED with F3 terminology fix.
  - Q5 (selective vocabulary): CONFIRMED with F2 mapping
    fix.
  - Q6 (GAP-040 in 020B): CONFIRMED — matches GAP-040's
    pinned 400 expectation.
- **Backend verification (independent re-verification):**
  `revision:read`/`revision:manage` exist
  (`packages/auth/authorization.ts:63/64`); selective
  refusal exists (`revisions.ts:1009` — contract cited
  `:1006`, off by 3, corrected); `NovelBranch` has
  `@@unique([novelId, name])` and no branch routes exist;
  `RevisionOrigin` values match the contract's list; all 9
  pinned semantic edges verified as real FK relations in
  `schema.prisma`; `memory.ts` as-of already takes
  `{ branchId, number }`; publish path has no branch
  awareness today (the 020B guard is genuinely new).
- **Status after review:** contract frozen pending
  implementation dispatch.

(Reviewer: separate contract-reviewer actor, backend
MODEL_UNVERIFIED per GAP-013. Fill at review.)

- Verdict: (APPROVE / APPROVE_WITH_FINDINGS / CHANGES_REQUESTED)
- Findings: (list with severity; fixes applied inline or required)
- Q1–Q6 dispositions: (confirmed / flipped / decided by Klein)
- Backend verification: (independent re-verification of the
  author's claims below)
- Status after review: (contract frozen / changes requested)

## Backend verification (contract author)

Every normative backend claim verified against source on
2026-10-06 (repo @ `8a6ff26`):

- Restore routes: `GET .../revisions`, `GET .../checkpoints`,
  `POST .../checkpoints`, `POST .../restores/preview`,
  `GET .../checkpoints/:checkpointId`,
  `POST .../restores/:restoreOperationId/apply`
  (`apps/api/src/revision-routes.ts:71/84/99/125/144/166`).
- Selective refused: `ConflictError("selective restore is not
  implemented")` (`apps/api/src/services/revisions.ts:1006`).
- `RestorePreview` shape: `headRevisionId`, per-table
  `counts{added,removed,retained}`, `absentChapterIds`,
  `chapterNumberReuse`, `retainedPostBoundaryChapterIds`,
  `pointerChanges`, `publishedPointerConflicts`,
  `projections`, `outsideScope`
  (`apps/api/src/services/revisions.ts:590`).
- No branch routes exist: `revision-routes.ts` has zero
  branch paths (grep-verified); `NovelBranch` is written
  only by `createNovel` and read by the head CAS
  (`services/revisions.ts:140/375/385/441/457/884/1018`,
  `services/platform.ts`).
- `NovelBranch` schema: `name` UNIQUE per novel,
  `parentBranchId` nullable ("Alternate lineage (branch
  merge is NF-WF-020)"), `headRevisionId` mutable FK
  (`packages/database/prisma/schema.prisma:2526`).
- `RevisionOrigin` values: MANUAL, AUTO, PRE_MUTATION,
  PRE_GENERATION, PRE_IMPORT, PRE_MIGRATION, MILESTONE,
  BASELINE, RESTORE (schema.prisma; STORY-VERSIONING.md
  C2).
- Capabilities: `revision:read` (`:63`) and
  `revision:manage` (`:64`) exist in
  `packages/auth/authorization.ts`; no new capability
  needed for any 020 operation.
- `DerivedRebuildIntent`: written with the mutation in one
  transaction (C6); `UNIQUE (projection,
  source_revision_id)` dedup.
- Delivery-plan `:57`: "Advanced semantic merge may
  remain M9; M6 may refuse conflicting branch merges
  with evidence rather than inventing a conflict
  resolution."
- M6 acceptance (`:48`): "Branch experiments and
  consequences preserve main state and history."
- No recovery/checkpoint UI pages exist under
  `apps/web/app/pages/` or `components/` (grep-verified) —
  the Recovery Center is a new surface.
- Dependency blobs: 011
  `3d66851028673001745e2591eb0f76bc352f785d`; 009
  `ee469b784a3a7be0e29bdab0f7f4be0c70e1dd45`; 010
  `e4a2db25eace32fda1de1e7bc922bed8991705d3`;
  STORY-VERSIONING.md
  `3e8fe3e09c0b2edd9d872fa44d33314be21f675d`.

UNVERIFIED / explicitly non-normative:

- Absolute performance of selective preview at scale is
  unmeasured — 020A measures and records; no ceilings are
  pinned in this contract (unlike 011's pre-measurement
  ceilings, the dependency-closure cost has no baseline).
- The 020B branch model's adequacy for 021's what-if
  simulation is a design judgment (Q1) — 021's contract
  will confirm or redirect.
- Whether any covered writer outside `revisions.ts`
  hardcodes the `main` branch was spot-checked
  (`memory.ts`, `platform.ts` reference `novelBranch`);
  the implementer must grep-verify all head-CAS call
  sites take `branchId` through.
