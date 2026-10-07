# Task NF-WF-032: GAP-004 — Full Cross-Domain Recovery Contract

Project language: English for all authored/revised artifacts and generated
project content; UI uses English (`en`)/Bahasa Indonesia (`id`) locale keys
and resources with English fallback.
Model selection: author-selected at runtime; separate implementer/reviewer
actors, with requested aliases distinguished from runtime evidence.

Status: APPROVED (contract review 2026-10-07 — APPROVE_WITH_FINDINGS, 2P1+3P2+2P3 folded in; fix agent verified 93/93 models classified, zero typos)
Task ID: NF-WF-032
Milestone / capability IDs: M1 foundation closure (GAP-004); feeds the
release battery (NF-WF-023) as the acceptance evidence for cross-domain
recovery.
Implementer role / requested and resolved model: (to be assigned at dispatch)
Reviewer role / requested and resolved model: (to be assigned — separate
actor from contract author and implementer)
Readiness evidence / unresolved decisions / parent acceptance owner: GAP-004
is OPEN / P1. This contract; GAP-004 closure check; parent coordinator
acceptance. The acceptance itself remains self-verification, not independent
review — the independent review owed under GAP-013 is recorded as a
separate, still-open obligation (see Out of scope).
Frozen review manifest / exact artifact paths and identity: (set at
implementation dispatch)
Baseline revision / local changes to preserve: (set at dispatch — the
current main, post NF-WF-027/028)
Engram checkpoint topic key / last confirmed observation reference:
(coordinator-owned)

## Normative vs informative

Normative: Goal, Scope, Behavior and invariants, Acceptance and
verification, Migration and rollback. Informative: rationale, examples,
open questions, appendices.

## Goal and reason

GAP-004 (OPEN / P1): "Cross-domain revision/checkpoint not fully accepted."
The M1 foundation slice is accepted (revision, snapshot, checkpoint,
non-destructive restore, durable rebuild intent, tenant isolation —
verified by NF-WF-002F): the machinery rewinds rows. **Not accepted:**
whether the rewound rows form a *coherent story* across domains.

The gap entry states: "Supersede history alone is still not consistent
restore." The constitution (§9) states the same rule independently: "A
canon supersede chain or manuscript version alone does not prove
cross-domain recovery." Both point at the same defect: the revision
chain records *what changed per entity*; a restore replays a *combination
of rows across tables*. Nothing today asserts that the combination is
coherent — that every cross-table reference in the restored state
resolves, that identity joins still name the same entities, that evidence
pointers still cite existing versions, and that every table in the
database is deliberately classified as rewound, pinned, or
out-of-restore-scope rather than silently absent.

The observable result: after `applyRestore` commits, a single
`verifyCrossDomainCoherence` predicate holds over the restored novel, and
a classification test proves every Prisma model is deliberately placed in
exactly one restore-scope class. A restore that would leave the story
incoherent is surfaced (preview) or audit-logged (apply) — never silently
reconciled (constitution §5). Per the 020A precedent, the preview surfaces
conflicts; the user decides whether to proceed.

This is a design contract, not an implemented feature. No code changes
are authorized by this document; implementation requires a separate
reviewed dispatch.

## Required reading

- [Operating constitution](../../AGENTS.md) (§5 canon authority —
  conflicts surfaced, never silently reconciled; §9 versioning/recovery;
  §10 development rules; §12 multi-LLM orchestration protocol; §13
  evidence/issues).
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- GAP-004 in `docs/implementation/ISSUES-AND-GAPS.md` (GAP table, line
  ~71); GAP-011 (identity joins), GAP-013 (independent review owed),
  GAP-056 (event↔thread linkage deferred).
- `packages/story-versioning/snapshot.ts` (`COVERED_TABLES`,
  `COVERED_TABLE_NAMES`, the `restoreTarget` flag and its per-table
  rationale comments).
- `packages/story-versioning/dependency-edges.ts` (`SELECTIVE_DOMAINS`,
  `DOMAIN_UNMAPPED_TABLES`).
- `apps/api/src/services/revisions.ts` (`previewRestore`,
  `applyRestore`, `advanceForMutation`, `captureSnapshot`; the C-series
  rules in `docs/03-domain/STORY-VERSIONING.md` §C12).
- `apps/api/src/services/selective-restore.ts` (020A: dependency-conflict
  analysis `ORPHAN_REFERENCE` / `STALE_DEPENDENT`; surgical apply).
- `tasks/NF-WF-020-advanced-recovery-branches.md` (020A/020B/020C restore
  and branch semantics).
- `tasks/NF-WF-002F-foundation-acceptance.md` (what the M1 slice proved).
- `packages/database/prisma/schema.prisma` (the full model list — the
  classification input).

## Environment prerequisites

Follow [environment preflight](../../docs/11-deployment/ENVIRONMENT-PREFLIGHT.md).
Record actual OS/tool versions, service endpoints (redacted), scratch DB
ownership and required tools. Ubuntu installs missing native task
prerequisites without Docker; Windows reuses existing running Docker
services/data. List permission/network/credential blockers; never reset
working databases for tests. Use disposable scratch databases for all
restore fixture tests.

## Dependencies and evidence

- NF-WF-002F: IMPLEMENTED — the M1 foundation slice (revision, snapshot,
  checkpoint, non-destructive restore, durable rebuild intent, tenant
  isolation). This task does not re-prove the slice; it builds on it.
- NF-WF-020 (020A/020B/020C): IMPLEMENTED — branches, selective restore
  scopes, dependency-conflict analysis, merge. The FULL-restore path in
  `revisions.ts` and the selective path in `selective-restore.ts` are the
  behavior under test; this task must not weaken either.
- NF-WF-003: IMPLEMENTED — chapter context compiler (a cross-domain
  *reader*; proves the domains can be read coherently, not that restore
  writes them coherently).
- NF-WF-010: IMPLEMENTED — state assembly / policy integration (another
  cross-domain reader).
- NF-WF-009: IMPLEMENTED — memory projections are revision-pinned and
  rebuildable, never truth (the classification rationale for
  `memory_projections`).
- NF-WF-012: IMPLEMENTED — publications are lifecycle records, never
  rewound by restore (Invariant 8; the classification rationale for
  `publications`).
- Active issue: GAP-004 (OPEN / P1) — this task is its owner.
- Related: GAP-011 (identity-join semantics — the coherence predicate for
  `story_entity_id` / `story_event_id` builds on its "surfaced, never
  fabricated" rule), GAP-013 (independent review of the acceptance
  remains owed — out of scope here), GAP-056 (event↔thread linkage is
  schema-only; the coherence predicate must treat unlinked rows as
  honestly-unlinked, not as incoherent).

## Scope

### Allowed paths

- `packages/story-versioning/` — the domain classification
  (`RESTORE_SCOPE_CLASS` or equivalent: every Prisma model → exactly one
  of REWOUND / PINNED / OPERATIONAL / DERIVED / CONFIGURATION /
  SIMULATION / REFERENCE), and the `verifyCrossDomainCoherence` predicate
  (pure function over snapshot payload + live rows; no DB, no LLM).
- `apps/api/src/services/revisions.ts` — *only* to wire the coherence
  predicate as a post-commit advisory check in `applyRestore`
  (audit-logged, never blocking the commit) and to surface a
  cross-domain conflict report in `previewRestore` for FULL scope,
  mirroring 020A's `ORPHAN_REFERENCE` / `STALE_DEPENDENT` shape.
  No change to what gets rewound.
- Tests: new fixture file(s) asserting (a) per-domain rewind equality
  against snapshot payloads, (b) the six coherence predicates below,
  (c) preview/apply agreement on cross-domain diffs, (d) the
  classification completeness test (every `schema.prisma` model
  classified; an unclassified model fails the test).
- Docs: `docs/03-domain/STORY-VERSIONING.md` (record the classification
  and the "supersede ≠ consistent restore" rule with its mechanism);
  `docs/implementation/ISSUES-AND-GAPS.md` (GAP-004 closure record, on
  verified evidence only).

### Forbidden paths

- Changing *what* restore rewinds: no table moves between
  `restoreTarget: true/false`, no table added to or removed from
  `COVERED_TABLES`, no change to `SELECTIVE_DOMAINS`. Classification
  documents intent; it does not re-scope restore.
- Silently repairing incoherence: the predicate reports; it never
  mutates. A failed advisory check audit-logs; it never rolls back the
  committed restore (the restore itself is the recovery mechanism —
  rolling it back on a coherence finding would destroy the recovery).
- Fabricating identity joins: per GAP-011, a NULL `story_entity_id` /
  `story_event_id` is an honest "unlinked", never incoherence and never
  auto-linked.
- Rewinding operational, simulation, or configuration state (workflow
  runs, generations, notifications, audit log, novel settings, branches
  themselves). Restore is story-state scoped; the audit trail of what
  happened is never rewritten.
- New API routes, schema/migration changes, UI changes, LLM in the
  predicate or decision path.
- Touching what-if simulation (027), semantic merge (028), or the worker
  AI path (026).

### Inputs

- A checkpoint id (FULL scope) with its snapshot payload (the 36
  covered tables, captured atomically at one revision — C12.3 pinning).
- The live rows of the novel's covered tables after `applyRestore`
  commits (for the advisory check) or before it (for preview).
- `schema.prisma` model list (for the classification test).

### Outputs

- `RESTORE_SCOPE_CLASS`: every Prisma model → one class
  (REWOUND / PINNED / OPERATIONAL / DERIVED / CONFIGURATION /
  SIMULATION / REFERENCE), with a one-line rationale per class and per
  non-obvious member. Proposed initial classification is in Behavior;
  the contract pins the *classes and the completeness rule*, and the
  implementer records the final per-model table.
- `verifyCrossDomainCoherence(payload, live): CoherenceReport` — pure,
  deterministic; `CoherenceReport = { coherent: boolean; violations:
  CoherenceViolation[] }`, each violation naming the predicate, the
  tables, and the row ids.
- `previewRestore` (FULL scope) gains a `crossDomainConflicts` section
  mirroring 020A's dependency-conflict shape; `applyRestore` gains a
  post-commit advisory check that audit-logs the report.
- Test evidence: per-domain rewind tests, six predicate tests,
  preview/apply agreement tests, classification completeness test.

### Out of scope

- The independent review of the acceptance owed under GAP-013. This
  contract's acceptance is self-verification by separate actors (the
  standing protocol); GAP-013 stays open and the closure record must
  say so explicitly.
- UI for restore verification or coherence reporting (follow-up owner:
  writer-workspace UI track, if the author requests it).
- Re-scoping restore (see Forbidden paths).
- Load/performance evidence for large novels (NF-WF-023 territory).
- The endgame domain's final classification if it requires an author
  decision (see Open question Q1) — the contract classifies it
  provisionally as OPERATIONAL (decision records, never rewound) and
  the reviewer must confirm or escalate.
- Remediation of post-commit incoherence. The predicate reports; it
  never repairs. If the advisory check finds incoherence after a
  restore commits, recovery is manual and out of scope here: a further
  restore to a coherent checkpoint (the restore mechanism itself), or
  direct repair of the offending rows. The predicate must not roll
  back or rewrite the committed restore.

## Behavior and invariants

### What "full cross-domain recovery" means

A FULL `applyRestore` to checkpoint C (revision R) achieves
cross-domain recovery iff all of the following hold over the restored
novel state:

1. **Rewind fidelity.** Every REWOUND table's rows equal the snapshot
   payload captured at R (row-for-row, modulo the documented
   `excludeColumns`). Every PINNED table's rows are byte-identical to
   before the restore.
2. **Reference resolvability.** Every FK-valued column in the restored
   rows resolves to a row present in the restored state. (FK-dependency
   order already makes this likely; the predicate asserts it.)
3. **Identity-join coherence.** `characters.story_entity_id`, when
   non-NULL, points at a `story_entities` row present in the restored
   state; `timeline_events.story_event_id`, when non-NULL, points at a
   present `story_events` row. NULL is honest-unlinked (GAP-011), never
   a violation, never auto-linked.
4. **Evidence coherence.** Every `canon_fact_sources` row references an
   existing `chapter_versions` row or an existing `reference_versions`
   row (versions are never deleted — Invariant 4 — so this pins the
   invariant rather than assuming it).
5. **Manuscript coherence.** Every `chapter_versions` row references an
   existing `chapters` row; every `canon_applications` /
   `canon_application_items` row references existing proposal/fact
   rows.
6. **Derived-state honesty.** `memory_projections` rows pinned newer
   than R are absent (dropped, per the 009 rule); freshness of any
   surviving projection is derived against the new head, never
   asserted from the snapshot.

Predicates 3–5 are domain-specific specializations of predicate 2's
general FK-resolution principle: predicate 2 asserts every FK resolves;
predicates 3, 4, and 5 add semantic rules on top (honest-NULL identity
joins per GAP-011, version-pinned evidence, manuscript authorship
history). They are separate predicates because each carries
domain-specific acceptance and its own negative probe.

### Why supersede history alone is not consistent restore

The revision chain is a per-entity supersede history: it records *what
changed, in what order, per entity*. A restore replays a *combination*
of rows across 36 tables captured at one revision. Three things the
chain cannot supply, which the combination requires:

1. **Atomicity of the combination.** The chain orders mutations; only
   the snapshot's C12.3 pinning (explicit capture pins NEW, HIGH
   mutation capture pins PREVIOUS, checkpoint hangs off the capturing
   revision) makes the 36-table payload a single coherent image. The
   contract asserts this mechanism as the *reason* the payload is
   trustworthy — and the coherence predicate as the *check* that it
   was.
2. **Cross-table reference closure.** A supersede chain is per-table;
   it cannot see that rewinding `canon_facts` without rewinding
   `canon_fact_sources` (or vice versa) leaves dangling evidence.
   Only the predicate sees the combination.
3. **Classification closure.** The chain says nothing about the 57
   models outside `COVERED_TABLES`. Consistent restore requires a
   deliberate answer for every one of them — which is why the
   classification completeness test exists.

### Proposed domain classification (implementer records the final table)

- **REWOUND** (33 tables, `restoreTarget: true` — must match
  `COVERED_TABLES` exactly; the implementer verifies the list against
  the constant rather than this prose): story_entities, characters,
  antagonists, bonds, bond_members, bond_transitions, canon_facts,
  canon_fact_sources, canon_proposals, canon_applications,
  canon_application_items, story_events, causal_edges, character_arcs,
  character_arc_milestones, character_knowledge, character_states,
  meaningful_interactions, narrative_dna_profiles, narrative_policies,
  sagas, scenes, outline_nodes, outline_versions, planning_horizons,
  relationship_stances, story_promises, story_threads,
  story_thread_events, synopses, timeline_events, memory_projections
  (covered but never truth — dropped when pinned newer than R, per the
  009 rule), final_text_reviews (covered; receipts, never truth — a
  re-review regenerates any receipt, so rollback is always SAFE).
- **PINNED** (3 tables, `restoreTarget: false`): chapters,
  chapter_versions (manuscript — never deleted, never re-inserted, C7;
  restoring a chapter pointer would rewrite authorship history),
  publications (release lifecycle — restoring a pre-publish checkpoint
  must not unpublish; Invariant 8).
- **OPERATIONAL** (never snapshotted, never rewound): workflow_runs,
  workflow_step_runs, workflow_versions, workflow_approval_decisions,
  generations, generation_attempts, notifications,
  notification_preferences, audit_logs, restore_operations,
  retrieval_audits, sessions, comments, comment_reports, chapter_likes,
  bookmarks, novel_follows, author_follows, change_sets,
  change_set_items, derived_rebuild_intents, revisions, snapshots,
  checkpoints, reading_progress, endgame_ledger (provisional
  — Q1), endgame_gate_approval, endgame_legacies, endgame_callbacks.
  Rationale: the audit trail of what happened is never rewritten by a
  story-state restore. `revisions`, `snapshots`, `checkpoints` are the
  restore machinery itself — rewinding the machinery by a restore is
  self-referential; the mechanism is never its own target.
  `reading_progress` is per-user state, never story state (consistent
  with bookmarks / chapter_likes / novel_follows).
- **DERIVED** (rebuildable, never truth, not covered):
  embeddings, chunks. Rationale: RAG derivations are recomputed from
  truth; they are outside restore scope entirely (unlike
  memory_projections, which is covered with drop-if-newer semantics).
- **CONFIGURATION** (not versioned): novels, novel_settings,
  novel_modules, novel_branches (the head pointer itself — restore
  advances it like any other mutation), users, memberships, workspaces,
  ai_gateways, ai_models, model_profile_mappings, skills,
  skill_versions, agents, agent_versions, workflows.
  Rationale: `workflows` is the workflow *definition*, not the instance
  (consistent with skills / agents — the definition is configuration;
  the run is operational).
- **SIMULATION** (branch-isolated): simulation_runs, simulation_ticks,
  simulation_events, simulation_entities, simulation_scenarios,
  simulation_breakpoints, simulation_causal_links,
  simulation_proposals, whatif_comparisons. Rationale: simulation state
  lives on simulation branches (027); a story restore must not rewind
  it.
- **REFERENCE** (author-curated sources, never rewound): references,
  reference_versions. Rationale: sources are inputs to the story, not
  story state; evidence coherence (predicate 4) asserts pointers
  resolve, rather than rewinding the sources.

### Invariants

1. **Non-destructive restore** (constitution §9). Restoring a
   checkpoint creates a new revision based on that checkpoint; later
   history remains recoverable. The predicate never deletes.
2. **Tenant isolation.** Every read the predicate performs is scoped
   to (workspaceId, novelId); the classification test reads only the
   schema.
3. **PRE_MUTATION checkpoint** (Invariant 15). `applyRestore` keeps its
   existing pre-restore checkpoint; the advisory check runs after the
   commit and cannot weaken it.
4. **Audit logging.** The advisory report is written to the audit log
   with the restore operation id, whether coherent or not. A
   violation is surfaced, never silent (constitution §5).
5. **No silent reconciliation.** The predicate reports violations; it
   never repairs, backfills, or auto-links. Preview surfaces
   `crossDomainConflicts`; apply audit-logs them. Incoherence is
   never silently fixed.
6. **Deterministic.** Same payload + same live rows → same report
   (no LLM, no clock, no randomness in the predicate).
7. **Classification completeness.** The test fails if any
   `schema.prisma` model is unclassified. A future table cannot
   silently fall outside restore scope.

### Open questions

- **Q1 (RESOLVED — keep OPERATIONAL, no author escalation):**
  Endgame domain — `endgame_ledger`, `endgame_gate_approval`,
  `endgame_legacies`, `endgame_callbacks` (NF-WF-022). Provisionally
  classified as OPERATIONAL (decision records, never rewound), and
  that classification stands. Implementer caveat: during
  classification, verify that no endgame table holds story content
  that belongs in REWOUND; note any FK from endgame tables to REWOUND
  tables that a story restore could leave dangling, and surface it in
  the coherence predicate as a violation rather than silently
  ignoring it.
- **Q2 (DECIDED — no):** Should the advisory check also run on
  selective (020A) restores? No. Selective scopes already surface
  `ORPHAN_REFERENCE` / `STALE_DEPENDENT` in preview; FULL scope is
  the gap. No extension needed.

## Acceptance and verification

- [ ] **Classification completeness:** test enumerates every model in
  `schema.prisma` and asserts each appears in exactly one
  `RESTORE_SCOPE_CLASS`; removing a classification entry (mutation
  probe) fails the test.
- [ ] **Per-domain rewind fidelity:** for each REWOUND table, fixture
  with ≥2 rows → mutate (update + insert + delete) → FULL restore to
  the pre-mutation checkpoint → assert live rows equal the snapshot
  payload (field-by-field, honoring `excludeColumns`).
- [ ] **Pinned invariance:** chapters, chapter_versions, publications
  mutated between checkpoint and restore → FULL restore → assert
  byte-identical to pre-restore (including a published publication
  staying published and its pinned `chapterVersionId` resolving).
- [ ] **Predicate 2 — reference resolvability:** fixture with
  cross-table FKs (bond_members → bonds, canon_fact_sources →
  canon_facts, story_thread_events → story_threads) → restore →
  `verifyCrossDomainCoherence` returns `coherent: true`, zero
  violations.
- [ ] **Predicate 3 — identity joins:** character with
  `story_entity_id` set + character with NULL → restore →
  coherent; then a negative probe (direct DB write setting
  `story_entity_id` to a nonexistent id, bypassing the API) →
  predicate returns `coherent: false` with the violation naming the
  table, row id, and predicate. (The negative proves the predicate
  detects, not just passes.)
- [ ] **Predicate 4 — evidence coherence:** canon fact with a
  chapter_version source + a reference_version source → restore →
  coherent.
- [ ] **Predicate 5 — manuscript coherence:** chapter with ≥2 versions +
  a canon application with items pointing at its proposals/facts →
  restore → coherent. Then a negative probe (direct DB write setting a
  `canon_application_items` row to reference a deleted proposal id,
  bypassing the API) → predicate returns `coherent: false` with the
  violation naming the table (`canon_application_items`), the row id,
  and predicate 5. (The negative proves the predicate detects, not
  just passes.)
- [ ] **Predicate 6 — derived honesty:** memory projection pinned to
  head H, then new revision H+1, then restore to H's checkpoint →
  projection row absent; a fresh `deriveFreshness` against the new
  head reports STALE (not FRESH) — the re-derivation path from
  NF-WF-030 is the honest recovery.
- [ ] **Preview/apply agreement:** `previewRestore` (FULL) on a
  fixture with cross-domain mutations → `crossDomainConflicts`
  predicts the post-apply predicate outcome exactly (empty conflicts
  ⟺ coherent report); `applyRestore` → new revision; advisory
  audit-log row exists with the report.
- [ ] **Negative — incoherent snapshot surfaced at preview:** craft a
  checkpoint whose snapshot payload is internally incoherent
  (e.g. hand-edited payload dropping a referenced row — test-only
  fixture) → `previewRestore` surfaces it in `crossDomainConflicts`;
  it does not silently apply.
- [ ] **Negative — operational tables untouched:** workflow run +
  notification + generation created between checkpoint and restore →
  FULL restore → all three rows byte-identical (never rewound, never
  deleted).
- [ ] **Determinism:** run `verifyCrossDomainCoherence` twice on the
  same inputs → byte-identical report; static check: no AI/gateway
  imports in the predicate module.
- [ ] Commands: `pnpm --filter @novelforge/api exec vitest run` on
  the new test files; `npx tsc --noEmit` in `packages/story-versioning`
  and `apps/api`; `pnpm lint` clean. Prerequisites: disposable
  scratch DB per ENVIRONMENT-PREFLIGHT; `DATABASE_URL` exported.
- [ ] Separate review of the submitted contract by an actor other than
  the drafter; findings resolved before implementation dispatch.

Record actual results separately from expectations. Zero selected
tests or skipped integration checks do not pass this gate.

## Migration and rollback

No schema migration. No data migration. The change is code-only: one
classification constant, one pure predicate function, a
`crossDomainConflicts` section on the FULL preview shape, and a
post-commit advisory audit-log write in `applyRestore`. Baseline
revision: (set at dispatch). Deployment compatibility: old clients see
an additive preview field; the advisory check writes one audit row per
restore. Rollback: revert the commits; no database state to repair
(restores are versioned revisions; the predicate never mutates).

## Documentation and handoff

Update on verified evidence only:
- `docs/implementation/ISSUES-AND-GAPS.md`: GAP-004 closure record
  (status, evidence, revision) — coordinator-owned; this contract
  does not edit it.
- `docs/03-domain/STORY-VERSIONING.md`: record the classification, the
  six predicates, and the "supersede ≠ consistent restore" rule with
  its three-part mechanism (atomic combination, reference closure,
  classification closure).
- `docs/14-progress/CURRENT.md` and test-matrix: verified scope.

Use the Engram save/recovery protocol per the playbook; on failure
keep the compact handoff in the task record and log it in
ISSUES-AND-GAPS.md. Never claim an unconfirmed save.

**Explicit non-goals for the reviewer to check:** no re-scoping of
what restore rewinds; no silent repair in the predicate; no fabricated
identity joins; no new routes/migrations/UI; no LLM anywhere in the
path; the GAP-013 independent-review obligation stays open and is
stated as such in the closure record; no scope creep into
027/028/026.
