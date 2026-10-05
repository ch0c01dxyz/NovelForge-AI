# Current Project State

Architecture baseline: V2 with workflow delivery repair accepted in ADR-0013.
Implementation status: **backend/infrastructure slices across phases 0–9
exist; integrated product delivery remains PARTIAL**. Historical phase/test
results below describe their original scope, not completion of all retained
requirements. The AI Orchestrator is a milestone within Phase 3/4.

## Active dispatch snapshot — 2026-10-05

| Task | Current scope/status | Next action |
|---|---|---|
| NF-WF-001 | Reviewed design | Preserve contract and historical receipts |
| NF-WF-002A/B/C | Recorded fixture/clarification/ordering reviews | Reopen only changed or refuted evidence |
| NF-WF-002D | **IMPLEMENTED / REVIEWED** (GAP-022 closed for implementation and review) | Done; accepted by 002F |
| NF-WF-002F | **VERIFIED 2026-10-04 — evidenced M1 foundation scope only** (self-verification, not independent review) | Done; full cross-domain recovery stays OPEN under GAP-004 |
| NF-WF-002E | PLANNED; actual consumer absent (GAP-023) | Revisit under NF-WF-004 consumer design |
| NF-WF-003 | **IMPLEMENTED 2026-10-05 — pending separate review** (uncommitted working tree; 197 tests green, lint + typecheck clean; 5 review findings fixed) | Separate reviewer judges the exact diff |
| NF-WF-004 | **IMPLEMENTED 2026-10-05 — review findings fixed, ready to commit** (contract APPROVE round 3; independent diff review APPROVE_WITH_FINDINGS: one P2 fixed (`@types/pg` added, all typechecks now verified clean), two P3 observations for the author; 49 API + 15 orchestrator + 14 package + 10 worker tests green, lint clean) | Commit + push |
| NF-WF-005 | **IMPLEMENTED + PUSHED 2026-10-05** (contract APPROVE round 3; independent diff review APPROVE, no findings; 15 API + 4 executor + 2 auth tests new/green, full API 423/423, lint + all typechecks clean; migration verified from-empty/re-apply/drift-clean; GAP-003 closed with acceptance evidence; GAP-030 recorded) | Done |
| NF-WF-006 | **IMPLEMENTED + PUSHED 2026-10-05** (contract APPROVE_WITH_FINDINGS round 2, round-2 P3s applied; independent diff review CHANGES_REQUESTED on F1 (input charset+binding) → fixed (GAP-033) + focused re-review APPROVE; full API 436/436, validation 61/61, executor 20/20, template 9/9, lint + typechecks clean; GAP-031/032/033 recorded) | Done |
| NF-WF-007 | **IMPLEMENTED + REVIEWED 2026-10-05** (contract APPROVE_WITH_FINDINGS; independent diff review APPROVE_WITH_FINDINGS, F1–F3 applied: dead `pollRun` pruned, outline start restricted to APPROVED only per author decision, newline restored; web 41/41, API 447/447, lint + vue-tsc + nuxt build clean; GAP-034 open for the server-side runs filter follow-up; no backend changes) | Done |
| NF-WF-008 | **IMPLEMENTED + REVIEWED 2026-10-05** (contract `8d28995` reviewed CHANGES_REQUESTED, F1–F6 applied; independent diff review APPROVE_WITH_FINDINGS, F1–F3 applied: STALE documented as detected-not-persisted, verdict union fixed, error table completed; API 462/462, web 48/48, story-versioning 17/17, lint clean, nuxt build succeeds; GAP-035/GAP-036 recorded) | Done |
| NF-WF-009 | **IMPLEMENTED 2026-10-05, awaiting independent diff review** (contract `f18600f` reviewed CHANGES_REQUESTED, F1–F9 applied, Q1–Q6 adjudicated; implementer actor separate from author/reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; new `@novelforge/memory` package, Prisma `MemoryProjection` + migration `20261006_nf_wf_009_memory_projections`, 3 routes, BullMQ `memory-rebuild` queue + worker, 003 compiler tiers 7/8 PRESENT-with-freshness/UNAVAILABLE-with-reason; API 477/477, worker 21 passed/1 skipped, lint + typechecks clean; GAP-037 recorded; F3 full-lineage follow-up OPEN) | Review |
| NF-WF-011 | **IMPLEMENTED 2026-10-05, awaiting independent diff re-review** (contract APPROVE_WITH_FINDINGS; implementer actor separate from author/reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; author-preview E2E loop (8-step UI sequence) + bounded long-novel fixture (300ch/60char/3000facts/300 outline nodes, ~4.5k revisions) + G1-G10 gates + measurements + `pnpm e2e`; diff review round 1 CHANGES_REQUESTED (P1-1 measurements acceptance, P2-1 G1 as specified, P2-2 restore capability negative, P2-3 G10 reviewFinalText half, P2-4 progress.md accuracy, P3-1..3) — all fixed and re-verified: e2e **20/20** (loop 3/3, gates 10/10, measurements 7/7, incl. no-regression vs committed baseline), lint+typecheck clean, full API suite 530/530 on fresh VM (GAP-044 flake did not manifest; passes 11/11 alone); GAP-041/042/043/044 recorded; GAP-010 partially closes) | Review |
| NF-WF-013 | **IMPLEMENTED 2026-10-06, awaiting independent diff review** (contract `tasks/NF-WF-013-public-reader-routes-ui.md` reviewed APPROVE round 2 (round 1 APPROVE_WITH_FINDINGS: wordCount empty-guard, 007 line refs, P2-1 novel-first chapter resolution, P3-1 GAP-049 additive extensions); implementer actor separate from author/reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; 3 anonymous public routes (`GET /api/public/novels/:slug`, `/chapters/:number`, `/authors/:authorId`) with the 012 shapes verbatim + GAP-049 extensions (author byline, prev/next, author route); novel-first chapter resolution via additive `resolvePublicChapterNovelFirst` (frozen 012 `resolvePublicChapter` untouched); novel page = PUBLISHED-only list, chapter page = pinned content + PUBLISHED-only nav, author page = displayName + published novels; identical `404 {error:"NOT_FOUND"}` for all 9 invisible cases; no auth object on `/api/public/*`; no `/api/public/search`; GAP-046 migrated (007 `publish()` → `POST .../publication/publish` + 409 REVIEW_STALE/HARD_POLICY_VIOLATION en/id messages, 403 preserved); 3 Nuxt reader pages + `ReaderChapterNav` (noindex, semantic HTML, focus-visible, responsive) + en/id `reader` keys; public-routes API tests **14/14**, web reader tests **10/10** (9 files **58/58**), full API suite **561/561** (27 files), `pnpm e2e` **20/20** BASELINE-OK, lint + tsc + vue-tsc clean; GAP-046 CLOSED; GAP-049 recorded) | Review |
| NF-WF-012 | **IMPLEMENTED 2026-10-05, awaiting independent diff review** (contract APPROVE round 3, Q1–Q6 decided; implementer actor separate from author/reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; `Publication` model + migration `20261006_nf_wf_012_publications` (idempotent enum DO-block, pre-existing PUBLISHED backfill), 7 publication routes + novel archive/unarchive (real capabilities `chapter:publish`/`chapter:update`/`novel:archive`, typed 409s ALREADY_PUBLISHED/NOT_SCHEDULED/NOVEL_ARCHIVED), BullMQ `publication` queue + worker fire (fire-time Invariant-3 recheck; deterministic refusal → UNPUBLISHED) + startup reconciliation (missing/failed → remove-first + re-enqueue; live jobs left alone), 013 handoff shapes `isPubliclyVisible`/`resolvePublicChapter` (no public routes), COVERED_TABLES `{publications, restoreTarget: false}` (Invariant 8); API **17/17**, worker **11/11**, backfill **8/8**, lint + all typechecks clean; full API suite **547/547** green; `pnpm e2e` **20/20** no-regression green (BASELINE-OK); GAP-045/046/047/048 recorded) | Review |
| NF-WF-010 | **IMPLEMENTED 2026-10-05, awaiting independent diff review** (contract `d309c52` reviewed CHANGES_REQUESTED, P1/P2/P3 applied, Q1+Q3 decided; implementer actor separate from author/reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; state assembly (memory-vs-live corroboration), `reviewFinalText` + receipts + `setStatus` gate (author-decided behavior change), `evaluateHealth` all 7 categories, 3 routes, SCALE schema on write (GAP-012), typed `PolicyError` → 409, 003 compiler tiers 4/6 integration; 32/32 new tests, full API 510/510, story-versioning 17/17, lint + typechecks clean; GAP-038 fixed, GAP-039 open) | Review |

Current sequence: [DELIVERY-PLAN](../implementation/DELIVERY-PLAN.md).
Current assignment policy (author, 2026-10-05): model-neutral. Use the model
chosen by the author at runtime with a separate reviewer actor; prior model
names below attribute historical receipts only. No new reviewer was dispatched.
NF-WF-003 remains PLANNED after GAP-026 contract repairs; the refreshed review
manifest replaces the old round-3 artifact. Review before coding.
Current Engram hook has no authoritative registered session identity (GAP-021).
Reads are available; attributed saves are blocked. Progress holds the fallback.
Fresh bounded checks are recorded in the 2026-10-05 progress/test-matrix entry;
counts below are historical, not new full-platform verification.
[002D](../../tasks/NF-WF-002D-mutation-head-expectation.md) is now
**IMPLEMENTED / REVIEWED**: the four HIGH mutation routes
(`proposal.approve`, `outlineVersion.approve`, `outline.supersede`,
`chapters.import`) accept the optional `expectedHeadRevisionId` with the §C12.1
tri-state, a mismatch is a 409 carrying `currentHeadRevisionId`, and both the
unlocked pre-check and the locked CAS are in place. Checks rerun at this
boundary against the scratch DB: targeted 145/145, story-versioning 17/17, full
API 365/365, root `pnpm test` 823 passed | 1 skipped, lint and typecheck clean.
The four per-route locked-CAS probes were falsified against a pre-check-only
build (200/200/204/201 with the locked comparison disabled) and pass restored.
The independent `glm-5.3-flash` review returned **APPROVE** on the production
diff — authorization precedes every head disclosure, generic 409s stay bare, the
tri-state is not collapsed — and one **MAJOR** test-fidelity defect: the probe's
`waitForBlocked` matched any lock waiter in the test database, so a foreign
waiter could release the probe before the request had parked. Fixed by pinning
the match to the parking backend's pid via `pg_blocking_pids`, re-falsified on
all four routes, and re-reviewed **APPROVE**. Reviewer backend is
MODEL_UNVERIFIED, so GAP-013 stays open.
[002F](../../tasks/NF-WF-002F-foundation-acceptance.md)
ran the parent gate and returned **VERIFIED 2026-10-04 for the evidenced M1
foundation scope only**. It reran every gate against the NF-WF-002 tree green
(story-versioning 17/17, constraints 8/8, targeted API 137/137, full API
365/365, root 823 passed | 1 skipped, lint, typecheck, build), exercised the
empty upgrade (all 20 migrations from empty) and the populated upgrade, and
corrected GAP-018: a failed `migrate deploy` is **partially applied** — its two
leading `DROP CONSTRAINT`s commit before `CREATE INDEX` fails, so the
documented `migrate resolve --applied` workaround is what strips the two
`canon_fact_sources` RESTRICT FKs, and a `DELETE FROM chapter_versions` for a
cited version then succeeds and orphans the citation. Accepted: revision,
snapshot, checkpoint, non-destructive restore, rebuild intent, tenant
isolation, the C3 `PRE_MUTATION` payload at all four HIGH sites, the 002D
tri-state with authorization before head disclosure, and atomicity. **Not**
accepted: full cross-domain recovery (GAP-004 stays OPEN at P1). GAP-017 and
GAP-025 closed; GAP-013 stays OPEN because **this verdict is
self-verification by the implementing model, not an independent review** — the
only independent verdict remains 002D's `glm-5.3-flash` APPROVE on a
MODEL_UNVERIFIED backend. NF-WF-003 (shared chapter context compiler) is the
next queue row and has **no contract file yet**; authoring and reviewing that
bounded contract is the next action.
This boundary's SessionStart hook confirmed an authoritative Engram identity
(`fae4b412-db3a-4ddc-a052-cfda214cfa9d`), distinct from the `0238856e…` binding
recorded at the 002D boundary; GAP-021 remains a per-boundary observation, not a
standing state.

**Reviewer transport note (2026-10-04).** `POST /v1/messages` with
`"model":"bansosmontera/glm-5.3-flash"` succeeded, but several attempts returned
`upstream_error` after emitting reasoning and before any content. A silent empty
answer from this gateway means "retry", not "no findings". The
`glm-cn/glm-5.3-flash` and `cl/z-ai/glm-5.3-flash` routes both returned HTTP 503
`429 ... balance/credit exhausted`, so only the `bansosmontera` route is usable.

## Attributed foundation implementation narrative

[NF-WF-002 revision foundation](../../tasks/NF-WF-002-revision-foundation.md)
is **IMPLEMENTED_WITH_GAPS** (2026-10-02, baseline `5b5f139`): the M1
migration, `@novelforge/story-versioning`, the revision service/routes and
the head CAS across all C3 mutations are delivered; own suites are green
(package 17, HTTP 25, constraints 8) and lint/typecheck/build pass. Its one
red gate — 123 pre-existing API tests failing because the new C8 head CAS
refused seeds that created a novel with no `novel_branches` row
(**GAP-017**) — is now repaired by
[NF-WF-002A](../../tasks/NF-WF-002A-fixture-compatibility.md), which converted
all 12 valid-fixture creation sites across the ten affected suites to the
production `createNovel` path. Actual reruns on the preserved diff: targeted
ten suites `288 passed (288)`, `revision.test.ts` `25 passed (25)`, full API
`338 passed (338)`, root `pnpm test` `796 passed | 1 skipped (797)`, lint and
typecheck clean (receipts in `test-matrix.md` G-01). The independent
exact-diff review returned **APPROVE** from two separate reviewer workers; its
two non-blocking findings were fixed in `narrative.test.ts` (final diff
`sha256 d775ad1f…`, 439 lines). GAP-017 therefore stays VERIFY_PENDING only on
NF-WF-002 / G-01 parent acceptance; no
production service was changed. Lazy baseline initialization remains
forbidden. Contract questions **GAP-019** are now disposed by
[NF-WF-002B](../../tasks/NF-WF-002B-contract-clarification.md) in
`STORY-VERSIONING.md` §C12, and that clarification is now **reviewed and
APPROVED** — receipt is the three reviewed artifacts
(`docs/03-domain/STORY-VERSIONING.md` `sha256 73e3c9f5…`,
`tasks/NF-WF-002C-premutation-ordering.md` `sha256 8fd083eb…`,
`tasks/NF-WF-002D-mutation-head-expectation.md` `sha256 640f9698…`), not a
combined-diff hash (those are milestones, and a register row cannot cite one
that includes itself); the reviewer's backend is MODEL_UNVERIFIED, so GAP-013
stays open. That review found a real recovery
defect rather than only clarifying prose: four HIGH call sites capture their
`PRE_MUTATION` snapshot *after* the mutation's writes, so the checkpoint an
author restores from holds the post-mutation image and the "step back from this
decision" operation is a no-op (**GAP-024**, measured by probe, P1). The same
review named two previously unowned requirements: no mutation route accepts a
client head expectation, so C4's optimistic-concurrency guarantee is unreachable
for callers (**GAP-022**), and `domainEventSchema.revisionId` has no producer or
consumer at all (**GAP-023**). The three have bounded owners —
[002C](../../tasks/NF-WF-002C-premutation-ordering.md) (**complete** 2026-10-02 —
round-1 review CHANGES_REQUESTED, dispositions recorded; round-2 re-review APPROVE, no findings),
[002D](../../tasks/NF-WF-002D-mutation-head-expectation.md) and
[002E](../../tasks/NF-WF-002E-domain-event-producer.md) (both PLANNED, blocked on
a decision rather than on capacity — **002D's decision landed 2026-10-03** and
it is now READY, with the four-route scope, tri-state body field and
409-body recovery recorded in `decisions.md`; 002E remains blocked on a consumer
design). **002C's production fix is in place**: all
four HIGH sites now call `advanceForMutation` before their first covered-table
write, each gained the payload-content assertion C12.6 asked for, and each was
proven to fail against the old ordering and pass against the new (four receipts
in `progress.md`). **GAP-024 is CLOSED.** Next execution is **002D** — not a
restart of 001, and not 003: G-01 acceptance must first close or explicitly
accept GAP-022 (GAP-024 is now closed).
**GAP-018/020** require
verified isolated test prerequisites; **GAP-021** records the missing Engram
runtime attribution handling — re-observed at the 002A, 002B, 002C-preparation
and 002C-execution boundaries, so each boundary's checkpoint is the fallback
handoff in `progress.md`, not an MCP write.
Its predecessor [NF-WF-001](../../tasks/NF-WF-001-revision-contract.md) is
DESIGN_COMPLETE / **VERIFIED**: three independent reviews ran
(`ctx_c4dcc5969164`, `ctx_db14a16c6968`, `ctx_a28a8bb47dc7`); rounds 1–2
returned CHANGES_REQUESTED, round 3 returned VERIFIED with all five round-2
corrections confirmed and every regression check passing. The contract is
frozen and NF-WF-002 is unblocked. The reviewer role never resolved to a
proven `glm-5.3-flash`: rounds 1–2 self-reported harness tier aliases, and
round 3 correctly returned `MODEL_UNVERIFIED` despite being dispatched with
the explicit id (GAP-013). M1–M9 runtime
gates are OPEN. This documentation repair implements
no runtime features. Record all live technical issues, uncertainty and gaps in
[ISSUES-AND-GAPS](../implementation/ISSUES-AND-GAPS.md). The sections below
are the detailed baseline snapshot, not a competing issue queue.

Historical entries include October-dated claims relative to the 2026-09-30
review. Preserve dates pending receipt/commit attribution (GAP-014); they do
not prove that checks were newly executed.

- **Phase 0** — monorepo, Docker Compose (Postgres+pgvector, Redis),
  shared config, module boundaries, CI skeleton, Nuxt web shell, Fastify
  API health, worker + BullMQ bootstrap.
- **Phase 1** — auth, workspaces, memberships, novels, capability-based
  permissions (ADR-0004), audit log.
- **Phase 2** — chapters, immutable versions, autosave, editor shell,
  import/export.
- **Phase 3** — AIGateway/OmniRoute adapter, gateway + model registry,
  model profiles, logical requests/attempts, bounded retry/fallback,
  error classification, generation history, platform-admin authorization.
- **Phase 4** — versioned agents, skills, workflows; fail-closed
  structured-output contracts; validated acyclic graphs; deterministic
  multi-agent execution; run history.
- **Phase 5** — references with append-only versions, citable chunk spans,
  pgvector embeddings, hybrid lexical+vector retrieval (RRF), tenant and
  spoiler predicates in SQL, per-search provenance, `RETRIEVAL` workflow
  steps.
- **Phase 6** — canon facts with a DB-enforced one-live-value constraint,
  non-destructive supersede chain, candidate canon that cannot be silently
  committed, citable evidence spans; Story Brain answering FACT, STATE,
  EVENT, CAUSAL, UNRESOLVED, PROMISES with evidence; reader spoiler
  boundary on every read path. Independent adversarial audits found and
  fixed ten defects behind a green gate (details in `progress.md`).
  Slice 3 (2026-09-30) added the **write surface** the Brain had been
  reading without: events, timeline, threads, promises and causal edges are
  now authorable through the API, and the three pure rules that had no
  production caller (`canPromiseTransition`, `findCausalCycle`,
  `isChronological`) are enforced — two on the request, the third by the
  `(novel, order)` unique index.
- **Phase 7** — planning: synopses, sagas, outline nodes, outline versions,
  planning horizon; delete routes (planning entities, novels, canon
  entities, workflows) with FK hardening so refusals are legible 409s and
  canon/run history is never silently destroyed.
- **Phase 8** — character state, knowledge boundary, arcs, relationship
  stances, bonds (groups/agreements), transitions, meaningful
  interactions. Overlap is refused by three `btree_gist` EXCLUDE
  constraints, not only by the domain validators — each confirmed
  load-bearing by dropping it and retrying the refused statement. The
  roadmap exit criterion (monogamy/harem/polygamy and enemy-to-ally)
  is tested at the HTTP boundary in `apps/api/src/character.test.ts`.
- **Phase 9** — narrative DNA, drama windows, cooldown, antagonist
  lifecycle, pattern detection, scale appropriateness. The five rules are
  pure (`packages/narrative-rhythm`); persistence is three tables
  (migrations `20261004_phase9_narrative_dna` + `20261005_phase9_blank_reason_fix`);
  the surface is 12 routes in
  `apps/api/src/narrative-routes.ts`. Only the cooldown is HARD; the rest
  advise. Both roadmap exit halves are asserted at the HTTP boundary, and
  "non-mechanical" is asserted at the **word** level — a guidance string
  containing an imperative fails, because a state-only assertion would
  stay green while the soft preference became a schedule. The three
  hand-written CHECKs were each confirmed load-bearing by a drop-and-retry
  probe. A deep adversarial audit of this surface (2026-09-30, four rounds)
  found thirteen defects behind a green gate — six logic defects, three in the
  cooldown path — plus a missing `bodyLimit` on two routes, a JSONB `null`
  band and an unguarded `access` list that each threw a 500 where a 409
  was owed, and a check-then-act race in the stage advance — with seven
  coverage holes, all fixed with a regression
  test each; three further findings were confirmed as already-recorded
  accepted deviations rather than defects. Round four re-verified round
  three's refutations and found two of them wrong, which is recorded in
  `progress.md` rather than quietly dropped. Details in `progress.md`.
- **AI Orchestrator (milestone, 2026-10-03)** — one `ai.generate`
  lifecycle entry point that resolves the agent/skill definitions the
  workflow executor also resolves (shared `definition-resolution.ts`),
  compiles context under a char budget with persisted provenance ids,
  assembles the prompt, and runs the generation through the SAME Phase 3
  path a direct request uses — plus fail-closed structured-output
  contracts and an SSE route whose refusals are real status codes, not
  error events.

Historical reported gate (not rerun by this documentation repair): lint 0;
typecheck clean in every workspace (including
`apps/web`); `pnpm test` 35 files, 746 passed / 1 skipped on vitest
5.0.2; 18 migrations applying from empty (both test databases, 0 failed or
rolled back);
`pnpm -r build` green. Phase 8's eight new constraints and Phase 9's three
CHECKs were each confirmed load-bearing by a drop-and-retry probe, and
Phase 6 slice 3's six CHECKs were confirmed the same way. Two of Phase 9's
CHECKs had been probed only with spaces while being *named*
"whitespace-only"; `20261005_phase9_blank_reason_fix` replaced the
space-only `btrim(x) <> ''` test with a POSIX class over the full blank set
and both suites now probe all 19 shapes.

First run against a **real 9Router deployment** (2026-09-30) is recorded in
`progress.md` Round 9: gateway stored through the CRUD API (credential
encrypted at rest), 1 957 models synced, and the three-model chain
(`cbai/deepseek-v4.1-flash` → `…/DeepSeek-V4-Flash-0731` →
`…/MiniMax-M2.7`) verified end to end by disabling each tier in turn. It
found four defects the fixture-based suite could not: a start script that
could not run the app, a capability map hitting a `String[]` column, a
model sync outliving Prisma's transaction default, and an upstream SSE
sentinel on a non-streaming body stopping the fallback chain.

See `docs/implementation/progress.md` (round-by-round record),
`docs/implementation/test-matrix.md`, `docs/implementation/decisions.md`,
and `docs/adr/`.

## Next milestone

**M1 — Revision and context foundation**, followed by M2 (complete author
chapter loop) and M3 (state/memory for the next chapter). Pull forward the
minimum Phase 11 slice before expanding optional Phase 10 simulation.
The simulation validation scenario remains required for that later capability.

An earlier version of this file named "Phase 9 — Reader Platform". That
matched no phase in this repo's roadmap — it came from a different
numbering scheme — and has been corrected. Reader-facing access is tracked
under Phase 13/M4–M5 below; its runtime gap remains open.

Contracted extraction application is implemented (NF-WF-008, pending
separate diff review): the 006 template's extraction feeds a
contract-then-validate-then-approve canon application flow with
deterministic evidence validation, head pinning, and atomic apply.

## Known gaps carried forward

### Character & relationship (Phase 8)

- **The blueprint's other tables are deferred by name**, in the schema
  docstring: `character_state_events`, `character_beliefs`,
  `relationship_events`, `relationship_groups`,
  `relationship_group_members`, `relationship_agreements`,
  `relationship_arcs`, and structured reputation / possessions /
  development-milestone columns. Each earns a table when a consumer asks
  for one (ADR-0008 §5's posture).
- **`characters` is standalone**, not a `StoryEntity` of kind CHARACTER.
  A link can be added when a consumer needs canon claims *about a
  character*; nothing in Phase 8 reads one.
- **No character UI.** The Phase 8 surface is API-only; the writer
  workspace still does not show character or relationship state.
- **The overlap EXCLUDEs are per-table, not global.** A `character_states`
  row and a `relationship_stances` row may name the same chapters — the
  constraints govern each table's own windows.
- **Stances are directional and unpaired.** `A→B ENEMY` with `B→A
  FRIENDLY` is representable and correct; nothing derives a "mutual"
  reading, because the one-sided feud is the case the direction exists
  for.
- **No retention or pruning** on any Phase 8 table; `meaningful_interactions`
  grows per recorded scene.

### Narrative DNA & rhythm (Phase 9)

- **`NarrativeDnaProfile.dna` has no field inventory.** The schema comment
  says the shape is validated in `packages/narrative-rhythm`; that is true
  of the POLICY payloads and aspirational for DNA. No rule consumes a DNA
  field yet, so `putDna` accepts any JSON object. Pinning a list now would
  make the service a second, drift-prone schema (ADR-0009).
- **A `SCALE` policy is stored unvalidated.** `assessScaleAppropriateness`
  takes the protagonist's standing, not the novel's preference, so no rule
  can probe a scale payload. `DRAMA_GAP` and `COOLDOWN` are probed on write.
- **No narrative UI.** The Phase 9 surface is API-only; the writer
  workspace shows no DNA, policy, or antagonist state.
- **`density` is validated but has no behaviour.** A value outside
  `DRAMA_DENSITIES` is refused, but no rule varies its bands by density —
  the author's `typicalGap` / `extendedGap` numbers are the whole policy.
  Deliberate: a density→band mapping would be the universal default ladder
  the spec's Principle forbids.
- **`hardness` gates writes but no rule branches on it.** HARD without a
  reason is refused (ADR-009), so the column is load-bearing, but nothing
  yet reads it to decide whether a finding refuses or advises. The one rule
  that hard-refuses (`checkCooldown`) does so unconditionally.
- **`Antagonist` has no delete or correction path.** Append-and-advance
  only, as Phase 6 slice 3's five tables are. (Policies do have one:
  `DELETE .../policies/:kind`.)
- **`Antagonist.workspaceId` is denormalised** as the tenant boundary,
  alongside `novelId`. Nothing enforces the two agree; the service derives
  both from the stored novel, so a mismatch would take a direct DB write.
- **`advanceAntagonistStage` reconstructs the progression as
  `[current, next]`.** The row keeps only the current stage, so there is no
  stored history of how an antagonist got there — the pair is the honest
  reconstruction, and a full lifecycle log would need its own table.
- **The drama-window assessment is stateless.** `chaptersSinceDrama` is
  supplied by the caller; nothing derives it from chapters or beats, so a
  caller can pass any number.
- **The stage advance refuses a lost race rather than retrying it.** Two
  concurrent advances are resolved by a `stage` predicate on the write; the
  loser gets a 409 and must re-read. A retry-on-conflict loop was not added —
  nothing drives this route concurrently yet, and a silent retry would hide
  the fact that the caller's plan was built on a stale stage.
- **`access` and the drama bands are guarded, not validated.** A `null` or
  non-array `access` and a `null` band now produce a verdict instead of a
  `TypeError`, but nothing pins the *shape* of a `SCALE` payload the way
  `DRAMA_GAP` and `COOLDOWN` are pinned on write — see the `SCALE` entry
  above. The guards keep the failure a 409/verdict instead of a 500; they do
  not make an unvalidated payload valid.

### Canon / knowledge

- **Canon has no `revision_id` column, but its C3 mutations now participate in
  the revision/checkpoint model**: `proposal.approve` advances a revision and
  captures a `PRE_MUTATION` snapshot covering `canon_facts` and
  `canon_proposals` (NF-WF-002, accepted 002F 2026-10-04 for that scope).
  Non-destructive correction still relies on the supersede chain alone, and
  full cross-domain recovery is not accepted (GAP-004). ADR-0013 supersedes
  ADR-0008 §4's scheduling deferral.
- A canon fact's chapter citation is a historical pin — resolvable forever,
  but not "the current version" once the chapter is saved again.
- **LLM fact extraction is not implemented.** Canon is author-authored only;
  extraction would be candidate canon needing approval (§2.13).
- Chapter prose is not searchable (no chapter tsvector, no chapter chunks),
  so prose recall reaches reference material only.
- `available_from_chapter` is a chapter number, so a chapter reorder must
  recompute authored boundaries or the spoiler filter drifts.
- **No ANN index on embeddings.** Exact scan over a workspace's vectors;
  revisit with a raw-SQL migration when measurably slow (ADR-0007 §2).
- Retrieval quality is bounded by the chunker's paragraph/line/sentence
  heuristics.
- Ingestion is synchronous within the request; embeddings should move to
  the worker queue when documents are large enough to time out (CLAUDE.md
  §24).
- Only text ingestion exists; PDF/DOCX/TXT/Markdown extraction is not
  implemented (§32). `ReferenceKind.IMPORTED` is reserved for it.

### Reader-facing access (Phase 13, M4/M5; runtime gap remains)

- **Phase 13 now owns reader-facing delivery.** `READER_MODE` and the
  spoiler boundary exist (Phases 5/6) and are enforced on every read path,
  but reader-facing publishing, chapter access control for non-members and
  a reader UI still require implementation. An earlier
  `CURRENT.md` called this "Phase 9 — Reader Platform"; the roadmap's
  Phase 9 is Narrative DNA & Rhythm. The capability is real and partial —
  completion is assigned to NF-WF-012–014 and NF-WF-019.
- `Chapter` has a publication state, but there is no route that serves a
  published chapter to an unauthenticated reader, and no reader-facing UI.

### Story intelligence (Phase 6 slice 3)

- **Hierarchical memory (L0–L6) is not materialised**, among the remaining
  Phase 6 integration deliverables. ADR-0008 originally rejected it for this
  phase by name: summaries are rebuildable projections (§2.2), and
  materialising them without a `built_from_revision` FK was the original
  reason for deferral — a projection with no recorded source revision cannot be
  invalidated when its canon changes (§2.14). The rule lives in
  `docs/03-domain/STORY-INTELLIGENCE.md`. ADR-0013 moves the revision
  foundation to M1 and consolidation to M3; do not pre-create seven tables.
- **No delete routes on any of the five tables.** `causal_edges` cascade
  from `story_events`, so deleting an event would silently take its causal
  claims with it (CLAUDE.md §9). A correction path needs a supersede chain
  before a delete is safe; the surface is append-and-transition only.
- **`story_thread_events` has no API.** The thread↔event join is
  schema-present and unused; it earns a route when something needs to
  render a thread's event history.
- **No timeline reorder.** `appendTimelineEvent` assigns the next slot and
  there is no way to move an entry — renumbering a timeline the reader has
  already seen is a deliberate non-goal, but insert-in-the-middle will need
  a design (likely explicit gaps, not renumbering).
- **The concurrent-append 409 has no covering test.** Prisma serialises
  injects on one connection, so the race cannot be forced deterministically;
  the branch is documented race defence.
- **No story-intelligence UI.** Events, threads, promises and causal edges
  are API-only; the writer workspace still shows none of them.
- **Timeline and story events are separate tables with no link.** A
  `timeline_events` row carries no `chapter_id` and no relation to a
  `story_event`; in-story time and reading order are not yet reconciled.
- **The Brain's EVENT/CAUSAL legs are unbounded lists** (the audit row caps
  provenance at 100). Pagination arrives when a novel's event count makes
  it matter.

### Delete semantics (settled 2026-10-02, migrations 20261002 / 20261002b)

- `canon_facts.entity_id`, `canon_facts.object_entity_id` and
  `canon_facts.novel_id` are `ON DELETE RESTRICT`: a canon fact is the
  record and survives every parent delete; the refusing route (entity or
  novel delete) answers 409. The block is PERMANENT — retraction withdraws
  a claim but keeps the row, so only unreferenced entities (and fact-free
  novels) delete.
- `workflow_runs.workflow_id` / `.workflow_version_id` are RESTRICT: run
  history is the execution audit trail; a workflow with runs (or a novel
  that has any) refuses with 409.
- `canon_proposals` FKs stay CASCADE — proposals are uncommitted candidate
  canon and die with their subject.
- Delete routes live for planning entities, novels, canon entities, and
  workflows; a novel-delete route test pins both refusal paths.

### Workflows

- A `RETRIEVAL` workflow step always searches in AUTHOR mode; the step
  contract has no `mode`/`readerChapter` field.
- Workflow runs execute synchronously within the request. Durable execution
  is now NF-WF-004/M2 work, not a late Phase 13 deferral.
- An `AWAITING_APPROVAL` run stops but cannot yet be resumed. Its
  `completedAt` is deliberately null so a resume path can distinguish it
  from a finished run.
- Routing strategy is deployment-wide (`AI_ROUTING_STRATEGY`); no
  per-workspace override and no operator UI.

### Ops / editor

- **No retention or pruning on the audit tables.** `retrieval_audits`
  (now wider — one row per Brain ask too) and `Generation` rows grow
  unbounded. Needs a TTL, partition, or archive job before the tables are
  large — Phase 13 concern.
- Scene CRUD is schema-only; no API until the editor needs scene editing.
- Chapter creation uses `prompt()`; replace with inline UI in a later
  editor chrome pass.
- No automated E2E runner; browser flows are verified manually and
  recorded in `test-matrix.md`.

## Phase 0 task sequence (completed)

1.  NF-0001 Initialize monorepo/workspaces.
2.  NF-0002 Add Docker Compose baseline for PostgreSQL+pgvector and Redis.
3.  NF-0003 Establish shared config/env validation.
4.  NF-0004 Create module-boundary conventions and contract package.
5.  NF-0005 Add CI lint/typecheck/test skeleton.
6.  NF-0006 Implement first ADR/test documentation workflow.
7.  NF-0007 Bootstrap Nuxt/Tailwind web shell.
8.  NF-0008 Bootstrap Fastify API health/readiness.
9.  NF-0009 Bootstrap worker health and BullMQ connection.
10. NF-0010 Cross-platform clean-clone verification on Windows and Ubuntu.
