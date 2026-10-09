# NovelForge Workflow Delivery Plan

Current integration (2026-10-09): the author authorized merging reviewed
[050B](../../tasks/NF-WF-050B-scale-review-and-author-decisions.md) through
`800cf37` with corrected documentary provenance. Implementation is accepted
for integration; complete frozen acceptance is still pending. Next execute
safe merged-revision regressions and the live localized author/publication
journey, then draft and separately review 050C's optional S3 contract.
GAP-039/GAP-119 stay open. Do not repeat integrated 050A/050B implementation
or closed NF048/049 work. Earlier dispatch paragraphs are historical.


Current execution (2026-10-09): NF-WF-050A S1 API/storage foundation is
IMPLEMENTED / REVIEWED and integrated through `843a263`. Next freeze and
separately review the bounded 050B contract before coding; 050C follows its
accepted dependencies. GAP-039 and author-workflow/release acceptance stay open.
Earlier 050A dispatch instructions below are superseded for execution.


S1 technical dispatch: [NF-WF-050A](../../tasks/NF-WF-050A-scale-evidence-foundation.md)
owns the frozen API/storage/authority/recovery contract and READY review gate.
Implement that bounded foundation before freezing 050B/050C. No SCALE runtime
or whole author-workflow completion is implied by the contract.

SCALE update (2026-10-08): ADR-0016 records the author-selected S1 foundation,
S2 follow-up and optional author-reviewed S3. NF-WF-050 owns planned stages:
structured evidence → deterministic review/author decisions → optional AI
proposals. GAP-039 remains OPEN until verified implementation, not a repeat
S1/S2/S3 selection. Child contracts require separate review before dispatch.
Author HARD amendment: incomplete SCALE assessment holds approval, with
missing-data explanations/examples and optional settings-enabled AI guidance.

Status: accepted execution sequence; runtime gates remain open.
Decision: [ADR-0013](../adr/ADR-0013-workflow-delivery-and-recovery-foundation.md).
Last revised: 2026-10-07. New implementation prose and handoffs use English.

2026-10-08 author decision: GAP-063 is usage analytics, not quota management.
The external gateway owns quota enforcement. ADR-0015 / NF-WF-049 supersede
the quota alternatives below; context-window, request-output and retry
safeguards remain. SCALE GAP-039, human GAP-051 and live release gates remain
independent. NF-WF-049 owns the aggregate/attempt evidence and migration gate.
NF-WF-049 is implemented/reviewed; GAP-063's revised local gate is CLOSED.
All older combined GAP-039/063 current/next-step instructions below are
historical and now apply only to still-open GAP-039. Do not redispatch quota
selection or analytics implementation. Working DB deployment remains pending.

## Goal and boundaries

Deliver a platform on which an author can plan, write, review, approve,
remember, recover and publish a coherent long novel, and a reader can access
the intended release safely. Reuse the modular monolith and existing services.
This plan covers the whole retained product scope; it is not a claim of
implementation or a prompt to build every subsystem in one turn.

The [roadmap](../12-roadmap/IMPLEMENTATION-ROADMAP.md) owns phase names/numbers.
This plan owns dependency order, capability completion and milestone gates.
[CURRENT](../14-progress/CURRENT.md) owns present evidence/gaps. The
[core workflows](../07-workflows/CORE-WORKFLOWS.md) own product behavior.
[Evidence policy](../06-ai/MODEL-EVIDENCE-POLICY.md) applies to every task.
All technical problems, confusion and live implementation gaps are owned by
the single [ISSUES-AND-GAPS](ISSUES-AND-GAPS.md) register. The capability
ledger and task queue below describe scope/dependencies; they reference issue
IDs rather than becoming competing issue logs.

## Current execution override — 2026-10-07

Implementations through NF-WF-034 and repairs NF-WF-035–037 are committed or
included with this update. NF-WF-036 closes GAP-110 scene mutation revisions;
NF-WF-037 closes GAP-083 page wiring and GAP-111/112 integration defects.
Bounded checks and separate reviews passed. NF-WF-038 fixes Windows template
line endings after a failed battery attempt; reviewed NF040 pins byte fixtures
and fixes save-race proof. NF039 is automated green at712cca6 (full API inventory
in54+3 runs, web, axe, typechecks/lint and additional Nuxt build).
The author accepted integration of `work/gap040-gap043` through `ad54faa`
on 2026-10-07: NF-WF-042/044/045 and hardening NF-WF-046 are implemented
and separately reviewed. The final code revision is `9265822`; later
branch commits change documentation only. CURRENT owns the local merge
verification receipt. Next: resolve author-owned GAP-039/063 product
decisions before dispatching dependent implementation.
The author authorized independent external follow-up via
[NF-WF-047](EXTERNAL-FOLLOW-UP-WORKFLOW.md). Execute the evidence audit first;
subsequent bounded children cover GAP-042, GAP-081/082 diagnosis, conditional
GAP-018 investigation and native release preparation. GAP-039/063 research
produces proposals only until local decisions are recorded. Child contracts
require separate review and verified readiness before coding.
Update 2026-10-08: external submission through `89d57f5` is accepted.
A/B/C and F's proposal are integrated; C source review APPROVE with scoped
32/32 local tests, API types and affected-file lint0. D still needs an
authorized sanitized dump or an explicit blocked receipt. E's historical
worker smoke consumed shared Redis jobs; GAP-117 requires isolated evidence
before counting that smoke as compliant. No full release acceptance follows.
Update 2026-10-08: isolated-smoke branch through `9fe1443` is accepted as
documentation and reported preparation evidence. D's receipt exists; E's
procedure corrections received separate review APPROVE. GAP-018 remains
BLOCKED and GAP-117 OPEN. Do not redispatch already integrated document work
or read this merge as runtime/release acceptance; CURRENT owns next evidence gates.
Subsequent local NF-WF-048 acceptance (2026-10-08) supersedes the preceding
GAP-018/117 statuses: reviewed scratch recovery and isolated worker evidence
close both bounded gates. See [receipt](048-local-gap-verification.md).
Original data/ledger and historical checksums were preserved; owned resources
were cleaned. No live repair, human acceptance or deployment is approved.
Continue author-owned GAP-039/063, human GAP-051 and live release gates.
NF041 resolves GAP-034 novel-scoped history/approval selection and GAP-116 stale
detail/cancel responses with scoped API67/web44 tests, lint/typechecks/build0 and
separate review. NF039's full battery is historical at712cca6; CURRENT
records fresh local API/web tests, lint and typechecks for the accepted
integration through `ad54faa`. Source decisions039/063 remain. Historical
queue rows preserve planning context; do not redispatch
completed implementations. GAP-098 stays closed by author scope decision;
human GAP-051 and live release acceptance remain open.

## Historical baseline

Existing code provides identity/tenancy, versioned manuscript, gateway/model
infrastructure, generic versioned workflows, references/retrieval, canon,
planning, character/relationship and rhythm slices. These are useful building
blocks. Integrated approval continuation, chapter context, extraction,
consolidation, cross-domain recovery, and public reader journeys are open.
Historical passing tests do not close the new acceptance gates below.

Do not overwrite or rebuild completed infrastructure. First verify the
specific caller and dependency used by the new task. Archived requirements
in docs_compare remain tracked here; they do not override V2 invariants.

## Delivery milestones and corrected phase dependencies

| Milestone | Phase slices | Prerequisites | Required observable result |
|---|---|---|---|
| M0 — Reconciled contracts | Documentation across phases | Comparison and source inspection | Active specs agree; scope, next task and open gates are explicit |
| M1 — Revision and context foundation | Minimum Phase 11 + integration of 3, 5–9 | M0 | Consistent baseline/checkpoint, safe source pins, bounded relevant chapter context |
| M2 — Complete author chapter loop | 2–4 with 6–9 consumers | M1 | Generate/review/approve/resume/apply through UI with durable execution and stale checks |
| M3 — Story learning and continuity | 5–9 | M2 | Accepted chapter produces approved changes and fresh memory used by the next chapter |
| M4 — Publishing preview | Publishing/reader slice of 13 | M3 and release-specific checks | Non-member readers access only explicitly published versions with spoiler safety |
| M5 — Complete author/admin tools | Remaining 2–9 + 13 administration | M3; may overlap M4 after contracts freeze | Rich editing, research/import/export and configuration/evaluation surfaces are usable |
| M6 — Advanced recovery and simulation | Remaining 11, then optional modules of 10 | M3 and recovery acceptance | Branch experiments and consequences preserve main state and history |
| M7 — Endgame | 12 | M3; M6 when active story modules require it | Conditions, debt, callbacks and closure guide an earned ending |
| M8 — Production release | Remaining 13 | M4–M7 for advertised scope | Restore drills, isolation, operations, accessibility, load and release evidence pass |
| M9 — Advanced intelligence | 14 | M8 plus measured need | What-if refinement, debugger, semantic merge and optimization have evaluations |

Phase 10 is no longer the automatic next task. Minimum Phase 11 is an early
dependency; full Phase 11 remains its own later scope. Simulation modules
are optional per novel, but the platform's promised module support must be
implemented/tested or explicitly removed from a release claim. Advanced
semantic merge may remain M9; M6 may refuse conflicting branch merges with
evidence rather than inventing a conflict resolution.

M0 documentation is established by this revision. All runtime milestones
M1–M9 are OPEN until their integrated evidence is recorded. Author preview
requires M1–M3. Publishing preview additionally requires M4. Production does
not follow merely from reaching a phase number.

## Capability ledger

“Partial” below is a starting assessment from inspected code/current records,
not a fresh execution result. Each row must acquire a receipt before VERIFIED.
Required scope may be changed only by an explicit author decision recorded
with an ADR/task update, not by omission.

| ID | Retained outcome and source | Current delivery gap | Owner milestone |
|---|---|---|---|
| CAP-01 | Auth, tenant isolation, audit, workspace/novel management; V2 phases 0–1 | Existing foundation; verify every new path and release tenancy | M1–M8 |
| CAP-02 | Immutable manuscript, scenes, rich editing, autosave, conflict handling; original editor + V2 phase 2 | Basic textarea/versioning exists; scene UI/API and rich editor incomplete | M2, M5 |
| CAP-03 | Revision, checkpoint, non-destructive restore; V2 recovery | Canon supersede is not cross-domain recovery | M1; advanced M6 |
| CAP-04 | Approved outline, Planning Horizon, current state, synopsis guardrail; both baselines | Data/services exist; chapter compiler integration missing | M1–M3 |
| CAP-05 | Versioned agents/skills/workflows, retry/fallback, generation history; both baselines | Approval resume, durable execution, shared context and usable configuration incomplete | M2, M5 |
| CAP-06 | Voice/style/continuity/lore/knowledge/rhythm review and finalization; original pipeline + V2 | End-to-end final-text review not established | M2–M3 |
| CAP-07 | Candidate extraction, decision, causal/event/thread/promise updates; both baselines | Manual canon exists; automated candidate lifecycle integration absent | M3 |
| CAP-08 | L0–L6 memory, chapter/history retrieval, revision-aware invalidation; both baselines | References searchable; chapter prose/memory and source revisions missing | M1, M3 |
| CAP-09 | Character knowledge, relationships/bonds, history and narrative preferences; V2 | Backend slices; UI/context and relevant final-text validation incomplete | M3, M5 |
| CAP-10 | Public novel/author pages, browse/search/genres, reader/navigation; original reader | No complete non-member reader journey | M4; discovery expansion M5 |
| CAP-11 | Review/schedule/publish/unpublish/archive, safe public versions; original publishing | Chapter publication state is not full release workflow | M4 |
| CAP-12 | Bookmark/follow/like/comment/notification/reading progress; original reader | Product surfaces remain open; moderation/access required | M5, M8 |
| CAP-13 | TXT/Markdown/PDF/DOCX import; TXT/Markdown/PDF/DOCX/EPUB export; original formats | Baseline text support is not all formats; normalization/approval required | M5 |
| CAP-14 | Gateway/model/profile, agent/skill/reference/workflow admin, audit/usage/evaluation; original admin | Backend configuration partly exists; operational UI/evaluation incomplete | M5, M8 |
| CAP-15 | World/research: entities, locations, factions, items, rules, provenance/spoilers; both baselines | Generic canon is not a complete authorable world/reference workspace | M3, M5 |
| CAP-16 | Branch/bulk rewrite/what-if/compatibility and safe merge; V2 | Open; refuse unsupported apply/merge | M6; advanced merge M9 |
| CAP-17 | Civilization/technology/economy/politics/diffusion/divergence/opponent consequences; V2 | Optional story modules not implemented | M6 |
| CAP-18 | Ending conditions/resolution ledger/callbacks/legacy/epilogue; V2 | Not implemented | M7 |
| CAP-19 | Durable jobs, failure recovery, backup, secrets, telemetry, retention; both baselines | Foundation exists; product jobs/operational release proof incomplete | M2, M8 |
| CAP-20 | 2,000–2,500+ chapter bounded retrieval, evaluations and evidence-backed health; both baselines | No integrated scale/quality proof in this revision | M3, M8–M9 |
| CAP-21 | Evidence discipline and prevention/containment of unsupported model output | Policy specified; runtime adversarial gates pending | All milestones |

## Current dispatch constraint — 2026-10-05

NF-WF-003 is still PLANNED: GAP-026 repairs composition scope, bounded state/
event reads, cast deduplication, empty-context outcomes and source-pin checks.
Review the refreshed exact contract blob before implementation. Runtime coding
models are selected by the author; past role/model receipts are historical.
The [issue register](ISSUES-AND-GAPS.md#prioritized-remedies--2026-10-05) records
remedies, dependencies and closure checks for every currently unresolved gap.
Do not substitute this solution plan for delivered runtime evidence.

## Task queue

Every row is a bounded delivery slice, not yet a fully dispatchable coding
contract. NF-WF-001 is the reviewed design contract; NF-WF-002 is
**IMPLEMENTED_WITH_GAPS, parent acceptance VERIFIED for the evidenced M1
foundation scope only** (002F, 2026-10-04) — full cross-domain recovery stays
OPEN under GAP-004. NF-WF-002A is REVIEWED/APPROVE; NF-WF-002B delivered the
GAP-019 clarification and found GAP-024, GAP-022 and GAP-023. NF-WF-002C
executed the GAP-024 production fix on 2026-10-02 (implementation and
two-direction proof complete; round-1 review CHANGES_REQUESTED (findings
resolved), round-2 re-review APPROVE with no findings — **GAP-024 is
CLOSED**). 002D is **IMPLEMENTED / REVIEWED** as of 2026-10-04: it implemented
the 2026-10-03 author decision and amended execution contract (GAP-022 closed
for implementation) and then passed an independent review of the frozen diff
(APPROVE on production code; one test-fidelity defect found, fixed and
re-reviewed). 002F ran the integrated acceptance against the tree on 2026-10-04
(all gates green, empty and populated upgrade exercised, GAP-018 corrected) and
returned **VERIFIED for the evidenced foundation scope only** — self-verification,
not the independent review that GAP-013 still requires.
002E remains PLANNED until an actual consumer is designed. At each predecessor's review, expand the
next row into [TASK-TEMPLATE](../../tasks/templates/TASK-TEMPLATE.md) with
exact inspected files/types/tests. Future tasks remain PLANNED until then;
do not invent distant API signatures now.

| ID | Deliverable | Dependency | Acceptance focus |
|---|---|---|---|
| NF-WF-001 | Consistent recovery/revision contract and migration design | M0 | Coverage, atomicity, baseline and worked restore example; separate design review |
| NF-WF-002 | Minimum revision/checkpoint/restore foundation | 001 | Populated upgrade, consistent cross-domain snapshot, expected-head conflict, failed checkpoint refusal, preserved history. **Parent acceptance VERIFIED 2026-10-04 for the evidenced M1 foundation scope only** (002F); full cross-domain recovery stays OPEN (GAP-004) |
| NF-WF-002D | Client head assertions on existing HIGH routes | Reviewed 002C; recorded author decision | Exact request/error scope, forced race and tenant/no-disclosure tests; separate review. **IMPLEMENTED / REVIEWED 2026-10-04** |
| NF-WF-002F | Integrated parent foundation acceptance | Reviewed 002A–D artifacts | Full diff coverage, current checks/migration evidence, scope-specific issue dispositions; parent G-01 verdict. **VERIFIED 2026-10-04 — evidenced foundation scope only; self-verification, not independent review** |
| NF-WF-002E | Domain event producer when a consumer is designed | NF-WF-004 consumer investigation; explicit contract/ADR where needed | PLANNED; no speculative producer/outbox, no event completion claim from G-01 |
| NF-WF-003 | Shared chapter context compiler and identity/source pins | 002 | Outline/state/time/knowledge/thread/DNA selection; no oldest-facts truncation; source/total budget proof |
| NF-WF-004 | Durable workflow execution using existing BullMQ/executor | 002 | Restart, duplicate delivery, cancellation, persisted step/source identity; no double commit |
| NF-WF-005 | Approval decision and safe continuation | 004 | Same-run approve/reject/resume, actor capability, stale state, repeated request |
| NF-WF-006 | One versioned chapter generation/review template | 003, 005 | Planner/writer/voice/style/final review; bounded correction; schema and evidence rejection |
| NF-WF-007 | Writer generate/review/diff/accept UI | 006 | Real backend, loading/error, concurrent autosave, stale apply, text/canon decisions separated |
| NF-WF-008 | Contracted extraction and canonical proposal application | 006, 007 | Source spans, conflict checks, approval, atomic state updates; unsupported claim blocked |
| NF-WF-009 | Revision-derived chapter/arc memory and historical retrieval | 008 | Durable rebuild, stale status, rejected fact excluded, N→N+1 continuity |
| NF-WF-010 | Character/relationship/rhythm/world/health integration | 009 | Real state consumers, evidence findings, temporal knowledge, soft policy; surface unresolved causal/time identity issues |
| NF-WF-011 | Author-preview E2E and bounded long-novel fixture | 010 | Full write-to-next-chapter loop and restore; measure queries/context; all M1–M3 gates |
| NF-WF-012 | Publication release contract and version-pinned lifecycle | 011 | Review/schedule/publish/unpublish/archive, capability checks, immutable public version |
| NF-WF-013 | Public reader/novel/author routes and UI | 012 | Non-member access, navigation, tenant separation, draft exclusion and spoiler boundary |
| NF-WF-014 | Browse/search/genre discovery and reading progress | 013 | Published-only results, stable reader boundary, accessible/responsive reader |
| NF-WF-015 | Rich editor and scene authoring completion | 007; final gate after 011 | Tiptap or explicitly approved equivalent, selection AI, autosave/version conflict, scene navigation |
| NF-WF-016 | Research/world/planning/character workspace completion | 010 | Authorable facts/state/references with evidence and approval; no API-only completion |
| NF-WF-017 | All retained import/export formats | 009, 015 | Per-format fixtures, source normalization, size/type validation, no automatic canon promotion |
| NF-WF-018 | AI Studio and administration/evaluation surfaces | 005, 010 | Safe secrets, definition versioning, graph/run/approval UI, profiles/routing, usage/failure/evaluation receipts |
| NF-WF-019 | Reader social features and moderation | 014 | Bookmark/follow/like/comment/notification permissions, rate limits, moderation, privacy and deduplication |
| NF-WF-020 | Advanced recovery, branches and bulk operations | 011 | Preview/selective dependency checks, branch isolation, conservative merge, non-destructive rollback |
| NF-WF-021 | Optional simulation module contracts and implementation | 010, 020 | Generic primitives, prerequisites, causal evidence, uncertainty as proposals, civilization validation scenario |
| NF-WF-022 | Endgame planning, debt and closure | 010; 021 for active simulation | MUST/SHOULD/MAY/OPEN/SEQUEL, callbacks and legacy; no forced chapter-count ending |
| NF-WF-023 | Production operations and release verification | 014–022 for promised scope | Backup/restore drill, migrations, isolation, accessibility, job recovery, resource/load budgets and full acceptance |
| NF-WF-024 | Advanced intelligence and measured optimization | 023 | Evaluated what-if/debugger/semantic merge/cost improvements without weaker invariants |

NF-WF-017, 018, 019, 021 and 023 span multiple independently reviewable
features. Their first contract must split them into child tasks (for example,
NF-WF-017A for import normalization) before coding; completion requires all
required children. Do not send a row's entire feature list to one worker.

## File ownership and contract sequence

| Concern | Inspect/reuse first | Contract before dependent changes |
|---|---|---|
| Revisions/data | packages/database/prisma/schema.prisma; existing services/transactions; story-versioning package | Snapshot membership, baseline/backfill, head/CAS, transaction and rebuild intent |
| Chapter context | apps/api/src/services/orchestrator.ts, canon.ts, planning/character/narrative services; retrieval package | Chapter position, stable entity identity, source/version manifest, budget/error types |
| Execution | apps/api/src/services/workflow-runs.ts, definition-routes.ts; packages/validation; apps/worker | Durable run/step identity, approval/rejection, cancel/resume and job idempotency |
| Writer UI | apps/web/app/pages/workspaces/[workspaceId]/novels/[novelId]/index.vue; manuscript API | Versioned generated artifact, review findings, accept/apply conflicts |
| Extraction/memory | canon services and source evidence, story-intelligence, retrieval and worker | Candidate contracts, canonical commit, revision-derived projections and invalidation |
| Reader | Manuscript/publication services, auth capabilities, retrieval spoiler predicates | Published-version access, anonymous/member access, scheduling and reader boundary |

Inspect actual filenames and exported symbols before finalizing a task.
Paths above identify ownership, not authorization to rewrite whole modules.
Database contracts precede services; API contracts precede UI; implementation
precedes independent review. New consumers establish a real need for omitted
schema fields; do not pre-create every table in the logical blueprint.

## Review focus and gate evidence

Every relevant task must cover concurrent edits, duplicate requests/jobs,
lost connections/restarts, stale or missing evidence, and cross-tenant access.
These are required failure classes, not optional future hardening.

Each capability receipt records source revision/diff, commands, selected
tests, actual result, environment, reviewer and limitations. Use statuses
PLANNED, PARTIAL, VERIFIED, BLOCKED, or DEFERRED_BY_AUTHOR_DECISION. A backend
may be verified while its workflow/UI remain partial; record those separately.

Use the concrete scenarios in [TESTING](../10-testing/TESTING.md). Existing
commands include `pnpm lint`, `pnpm typecheck`, `pnpm test`, and
`pnpm -r build`. Run targeted Vitest files first; verify selection instead
of relying on the root script's `--passWithNoTests`. Migration checks use
isolated test databases and the actual scripts in packages/database/package.json.
Never invent an E2E command: add a real runner when NF-WF-007/011 establishes it.

Minimum milestone proof:

- **M1:** current outline and temporally correct state reach the pinned context;
  required facts cannot be silently dropped; restore preserves history.
- **M2:** author generates, reviews and accepts through UI; approval can resume
  after restart without regenerating completed steps or duplicating writes.
- **M3:** accepted changes inform the next chapter; rejected claims do not;
  stale projections are detected; voice/knowledge/rhythm checks cite evidence.
- **M4:** an unauthenticated/non-member reader can read a published version;
  draft/future data remain inaccessible through pages, search and AI.
- **M5:** each retained tool, format and admin/social surface has a real consumer
  and acceptance evidence; no static mock screen counts as complete.
- **M6/M7:** scoped restore/branches/simulation and endgame scenarios preserve
  causality, author authority and history.
- **M8:** fresh Windows/Ubuntu deployment, populated migration, restore drill,
  production start smoke, secrets/tenant audit, worker failures, retention,
  accessibility and 2,500-chapter load evidence pass at declared budgets.

At M8 define and approve numeric latency, cost, data-loss/recovery and resource
budgets before executing load/drill evaluations; capture dataset and hardware.
Do not invent thresholds or claim scale from chapter count alone.

## Advancement and scope control

Current dispatch: [NF-WF-003](../../tasks/NF-WF-003-chapter-context-compiler.md)
is **PLANNED with a drafted contract** — the author scope decision is RESOLVED
(full tiered compiler: select across every §7 tier that has a backing store,
route both callers through one compiler, fix the measured §7/§2.16 defect) and
the contract must still be separately reviewed before any coding. It is not
dispatched.
[NF-WF-002F](../../tasks/NF-WF-002F-foundation-acceptance.md) returned
**VERIFIED 2026-10-04 for the evidenced M1 foundation scope only**; that is
self-verification, not the independent review GAP-013 still requires, and it
does not accept full cross-domain recovery (GAP-004 stays OPEN). Keep 002E
assigned to actual consumer design rather than blocking the queue merely
because its event field exists. Child status, issue closure, parent acceptance
and full milestone completion are distinct outcomes.


[NF-WF-002C](../../tasks/NF-WF-002C-premutation-ordering.md) (the GAP-024
production fix) is **complete** as of 2026-10-02: all four HIGH sites now
advance before their first covered-table write, each gained a payload-content
assertion, each was proven to fail against the old ordering and pass against
the new, and the independent re-review returned APPROVE with no findings.
**GAP-024 is CLOSED.** [NF-WF-002D](../../tasks/NF-WF-002D-mutation-head-expectation.md)
(GAP-022) is **IMPLEMENTED / REVIEWED** as of 2026-10-04: the four HIGH routes
carry the client head expectation, the 409 carries `currentHeadRevisionId`, both
the pre-check and the locked CAS are in place, and all required checks pass.
GAP-022 is closed for implementation with per-route negative receipts. An
independent review of the frozen diff (`glm-5.3-flash` via 9Router, 2026-10-04)
returned APPROVE on the production change and confirmed one MAJOR
test-fidelity defect in the lock-waiter probe, which was fixed and re-reviewed
to APPROVE. GAP-013 remains open because that reviewer's backend is
MODEL_UNVERIFIED.
[NF-WF-002F](../../tasks/NF-WF-002F-foundation-acceptance.md) is **VERIFIED as
of 2026-10-04 for the evidenced M1 foundation scope only**: it ran every gate
against the NF-WF-002 tree green (story-versioning 17/17, constraints 8/8,
targeted API 137/137, full API 365/365, root 823 passed | 1 skipped, lint,
typecheck, build), exercised the empty upgrade (all 20 migrations from empty)
and the populated upgrade, and corrected GAP-018 — a failed `migrate deploy` is
**partially applied** (its two leading `DROP CONSTRAINT`s commit before
`CREATE INDEX` fails), so the documented `migrate resolve --applied` workaround
is what strips the two `canon_fact_sources` RESTRICT FKs. That is
**self-verification by the implementing model, not an independent review**, so
it does not close GAP-013, and it accepts the foundation slice only — full
cross-domain recovery stays OPEN under GAP-004.
[NF-WF-002A](../../tasks/NF-WF-002A-fixture-compatibility.md)
(fixture-only repair) and [NF-WF-002B](../../tasks/NF-WF-002B-contract-clarification.md)
(contract clarification and implementation review) are complete. NF-WF-001's
reviewed design remains complete; NF-WF-002's parent acceptance returned
**VERIFIED 2026-10-04 for the evidenced M1 foundation scope only**, which
confirms GAP-022 and GAP-024 as closed but does not close GAP-004 or GAP-013.
These child tasks do not renumber roadmap
phases or waive parent acceptance. NF-WF-003/004 retain their NF-WF-002 dependency.
Update CURRENT with the next READY task and remaining gates after each
accepted handoff.
Do not advance a dependency because its test file exists or a model says done.

No new dependency/framework/provider is required by this plan. If an actual
format, rich-editor, or E2E requirement needs one, inspect installed options
and document the smallest justified addition. Remaining runtime integration is future work; the partial NF-WF-002 delivery
does not authorize publishing/deployment by itself.
