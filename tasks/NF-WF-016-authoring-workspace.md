# Task NF-WF-016: Research/world/planning/character workspace completion

Project language: English for all authored/revised artifacts and generated
project content; UI uses English (`en`)/Bahasa Indonesia (`id`) locale keys
and resources with English fallback. Record any other explicit author override
and its scope.
Model selection: author-selected at runtime; separate implementer/reviewer
actors, with requested aliases distinguished from runtime evidence.

Status: IMPLEMENTED (diff-reviewed APPROVE_WITH_FINDINGS, round 2)
Milestone / capability IDs: M2 (author half); delivery-plan NF-WF-016
Implementer role / requested and resolved model: (separate actor; backend MODEL_UNVERIFIED per GAP-013)
Reviewer role / requested and resolved model: (separate actor; backend MODEL_UNVERIFIED per GAP-013)
Readiness evidence / unresolved decisions / parent acceptance owner: contract
review returned APPROVE_WITH_FINDINGS (round 1, 2026-10-06; 5 findings fixed
inline — see Review record). Q1–Q8 confirmed as decided, recorded in the
Review record; the §"Open questions" wording is the author's
recommendation and the CONFIRMED resolutions are the decisions of
record.
Frozen review manifest / exact artifact paths and identity: reviewed file is
tasks/NF-WF-016-authoring-workspace.md at this round's tree state (uncommitted
working tree on HEAD 8bc8a12); contract + ISSUES-AND-GAPS.md changes are the
reviewed delta.
Baseline revision / local changes to preserve: repo HEAD at review time
Engram checkpoint topic key / last confirmed observation reference: (n/a)

## Normative vs informative

Normative: the authorable entity scope (Invariant 1), the evidence and
approval rules (Invariant 2), the approval-separation rule (Invariant 3),
the backend-addition pin (Invariant 4), the GAP ownership pins
(Invariant 5), the no-regression pin (Invariant 6), the §15 design
conformance (Invariant 7), the i18n/a11y rules (Invariant 8), the
forbidden paths, and the acceptance checkboxes. Informative: rationale
paragraphs, design-mockup discussions, and the §"Open questions"
recommendations (the question labels are normative — the recommendations
are the author's, for the reviewer to confirm or flip).

## Goal and reason

Build the authoring UI for the story-knowledge domains that exist today
only as API: characters, relationships, world & lore, timeline, planning,
research/references, canon review, narrative DNA/policies, story health,
and memory status. NF-WF-008 built canon extraction/application (API +
review dialog) and NF-WF-010 built the state consumers (assembly,
reviewFinalText, evaluateHealth) — all observable only through HTTP.
The delivery-plan acceptance is explicit: "Authorable facts/state/
references with evidence and approval; no API-only completion". This
contract pins exactly which entities are authorable in 016, how evidence
and approval work per surface, the one additive backend addition the
evidence acceptance requires, and which gaps stay as follow-ups.

## Required reading

- [Operating constitution](../../AGENTS.md) (§2 invariants, §5 canon
  authority, §11 Definition of Done, §13 evidence/issues, §15 design
  system).
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- [Delivery plan](../../docs/implementation/DELIVERY-PLAN.md) (NF-WF-016
  row at `:150`; depends on 010).
- [NF-WF-007 contract](NF-WF-007-writer-ui.md) — the writer page this
  task extends.
- [NF-WF-008 contract](NF-WF-008-canonical-proposal-application.md) —
  the canon-application flow, evidence validation, approval separation.
- [NF-WF-009 contract](NF-WF-009-revision-derived-memory.md) — memory
  routes, the intent-lifecycle gap, F3 lineage follow-up, Q6 (memory
  status panel belongs with 010/016).
- [NF-WF-010 contract](NF-WF-010-state-consumer-integration.md) —
  `evaluateHealth`, `reviewFinalText`, the "Workspace UI for
  health/status → NF-WF-016" deferral.
- [NF-WF-015 contract](NF-WF-015-rich-editor-scenes.md) — the 015
  editor/page this task must not regress; Invariant 2's sanitized-HTML
  content pin (evidence quotes may contain HTML-bearing prose — the
  strip rule for quotes is pinned in Invariant 2).
- Foundational design: `docs/design/writer-workspace/index.html`
  (story-structure nav at `:655-663`: `nav-characters`, `nav-world`,
  `nav-timeline`, `nav-canon`; `outline-btn` header at `:601`;
  `scene-context` panel at `:718`; `continuity-guardian` at `:758`;
  `last-generation` at `:774`; footer "Canon in sync" at `:787`) and
  `docs/design/DESIGN-TOKENS.md` (orange restricted to AI affordances).
- Existing implementation: `apps/web/app/pages/workspaces/[workspaceId]/
  novels/[novelId]/index.vue` (the single writer page), the route
  files named in §Backend verification, `apps/api/src/services/
  canon.ts`, `canon-applications.ts`, `characters.ts`,
  `relationships.ts`, `planning.ts`, `story.ts`, `narrative.ts`,
  `story-health.ts`, `memory.ts`, `retrieval.ts`.

## Environment prerequisites

Follow [environment preflight](../../docs/11-deployment/ENVIRONMENT-PREFLIGHT.md).
Native PostgreSQL 16 + pgvector and Redis on localhost (no Docker, per
project policy). All test databases are scratch `novelforge_test_*` only.
No new infrastructure, no new services. No new npm dependencies expected
(UI-only over existing routes plus one additive API route).

## Dependencies and evidence

- NF-WF-008 (IMPLEMENTED): canon routes, applications, evidence-span
  validation, CanonApplicationReview dialog — the evidence/approval
  machinery this task surfaces.
- NF-WF-009 (IMPLEMENTED): memory routes (`status`/`rebuild`/`as-of`);
  Q6 assigns the memory status panel to 016.
- NF-WF-010 (IMPLEMENTED): `evaluateHealth` (GET `.../story-health`),
  unresolved-identities register, `reviewFinalText` receipts; the
  contract's out-of-scope line assigns the workspace UI to 016.
- NF-WF-007/015 (IMPLEMENTED): the writer page and editor — 016 must
  not regress them.
- NF-WF-011 (IMPLEMENTED): `pnpm e2e` — no-regression acceptance.
- Open gaps touching this task: GAP-013 (MODEL_UNVERIFIED, standing),
  GAP-039 (SCALE never FAILs — follow-up, not 016), GAP-040
  (cross-branch as-of — follow-up, not 016), GAP-052 (scenes
  structural-only — 015's, not 016's), GAP-053 (HTML downstream
  consumers — 017 orbit), GAP-054 (closed), GAP-055 (scene-delete
  409 — planning-owner, not 016), GAP-056 (StoryThreadEvent
  schema-only — Q3), GAP-057 (no add-source route — Q2), the
  NF-WF-009 intent-lifecycle gap (no DerivedRebuildIntent consumer —
  follow-up), NF-WF-009 F3 (full lineage — follow-up).

## Scope

### Allowed

- `apps/web/app/components/workspace/` (new): the 016 authoring
  components, grouped by domain:
  - Characters: `CharacterList.vue`, `CharacterSheet.vue` (name,
    key, summary, story-entity link), `CharacterStates.vue` (state
    spans), `CharacterKnowledge.vue` (fact stance + source),
    `CharacterArcs.vue` (+ milestones).
  - Relationships: `RelationshipStances.vue` (directional stance
    spans), `Bonds.vue` (+ members, transitions, interactions).
  - World & Lore: `EntityBrowser.vue` (kind-filtered:
    CHARACTER|LOCATION|ORGANIZATION|FACTION|ITEM|RESOURCE|CONCEPT),
    `FactList.vue` (authored facts with evidence), `FactEditor.vue`
    (create with evidence; retract; sources list).
  - Canon review: `CanonPanel.vue` (facts/proposals/applications
    tabs), `ProposalReview.vue` (per-proposal approve/reject with
    conflict surfacing), reuse of 008's `CanonApplicationReview`.
  - Timeline: `StoryEvents.vue`, `TimelineView.vue`,
    `ThreadsView.vue` (status), `PromisesView.vue` (transitions),
    `CausalEdges.vue`.
  - Planning: `PlanningPanel.vue` (synopses, sagas, outline nodes,
    outline versions + approve/supersede, horizon).
  - Research: `ReferenceLibrary.vue` (list/create/versions/publish),
    `ReferenceIngest.vue` (ingest trigger), `RetrievalSearch.vue`
    (search over the corpus).
  - Narrative: `DnaEditor.vue`, `PolicyList.vue` (+ drama window /
    cooldown / patterns / scale readouts), `Antagonists.vue`.
  - Health & memory: `HealthPanel.vue` (findings list, severity
    filter), `MemoryStatus.vue` (status/rebuild trigger), reuse of
    the 010 unresolved-identities register.
- `apps/web/app/pages/workspaces/[workspaceId]/novels/[novelId]/index.vue`:
  wire the story-structure nav (`nav-characters`, `nav-world`,
  `nav-timeline`, `nav-canon`) to open the corresponding panels;
  the header `outline-btn` opens the planning panel; the
  `scene-context` panel's Add/Edit/Remove character affordances link
  into the character workspace; the `continuity-guardian` panel
  renders `evaluateHealth` findings; the footer keeps "Canon in
  sync" bound to health state. Generation loop, ApplyBar,
  CanonApplicationReview trigger, publish(), chapter list, editor
  and footer are otherwise untouched.
- `apps/api/src/canon-routes.ts` + `apps/api/src/services/canon.ts`:
  ONE additive route — `POST .../canon/facts/:factId/sources`
  (GAP-057; Q2): attaches one evidence citation to an existing fact
  with the same span validation as `createFact`
  (`resolveSourceEvidence`), `canon:manage` capability, Zod →
  400 INVALID_INPUT, membership 404 gate, the app-wide error
  handler — never a second one. The existing routes are otherwise
  untouched.
- `apps/web/app/i18n/en.ts`, `id.ts`: locale keys for every new
  surface.
- Tests for all of the above (API route tests at the HTTP boundary +
  web vitest tests); docs updates (progress.md, CURRENT.md,
  test-matrix.md, ISSUES-AND-GAPS.md for deviations BEFORE
  workarounds).

### Forbidden

- New capabilities in `packages/auth/authorization.ts` — 016 reuses
  `canon:read`/`canon:manage`/`canon:approve`, `reference:read`/
  `reference:manage`, `novel:read` (the existing gate vocabulary;
  verified no planning/character/relationship-specific capability
  exists).
- Any schema change — 016 is migration-free. GAP-056's
  event↔thread linking gets no silent schema-free workaround that
  changes relation semantics.
- AI model calls anywhere in 016 (deterministic authoring only;
  selection-AI and generation loops are 007/015's).
- Auto-promoting references to canon: `Reference` rows are NEVER
  canon and never become canon by ingestion (schema comment at
  `schema.prisma:939-943`); the UI shows the non-canon boundary
  explicitly.
- Changing the 008 application flow, the 009 memory contract, the
  010 health/review semantics, the 005 approval semantics, the
  publication lifecycle, or the reader visibility rules.
- Simulations anywhere in this pipeline: 008 Invariant 8 and 009
  Invariant 8 stand — simulation-flagged sources are refused at the
  existing boundaries.
- A parallel canon store: everything lands in the existing canon
  tables.
- Superseding 007's or 015's editor/save/conflict contracts.

### Inputs

- The frozen API surface named in §Backend verification (canon,
  characters, relationships, planning, story, narrative,
  story-health, memory, retrieval, final-text-review routes).
- The author's direct edits (facts, entities, states, stances,
  arcs, threads, promises, events, outline nodes, references,
  DNA, policies) with per-entity evidence where the contract
  requires it.
- Health/review/memory read APIs for the observability panels.

### Outputs

- The nine workspace surfaces (characters, relationships, world &
  lore, canon review, timeline, planning, research, narrative,
  health & memory) as working authoring UI on the writer page,
  with evidence and approval flows per Invariant 2.
- The one additive API route (Q2) with its tests.
- en/id strings for every new label; a11y conformance per
  Invariant 8.

### Out of scope (with follow-up owner)

- Event↔thread linking API/UI → **follow-up** (GAP-056; Q3 decides
  016's route addition vs deferral — the UI does not invent a
  relation the API cannot store).
- DerivedRebuildIntent consumption → **follow-up** (009's
  intent-lifecycle gap; platform-wide worker design, not a
  workspace UI task).
- Full revision/simulation lineage → **follow-up** (009 F3; gated
  by 009 Invariant 6).
- SCALE assessment source → **follow-up** (GAP-039); the policies
  UI shows SCALE policy readouts but invents no assessment.
- Cross-branch as-of enforcement → **follow-up** (GAP-040); the UI
  offers no cross-branch revision selector that contradicts 009
  Invariant 7.
- HTML downstream consumers → **017 orbit** (GAP-053).
- Import/export formats → **NF-WF-017**; file upload for reference
  ingestion stays the minimal existing path (Q7).
- Simulation runs → **NF-WF-021**.

## Behavior and invariants

### Invariant 1 — Authorable entity scope (exactly this, no more)

Every surface below is UI over a FROZEN existing route (file:line in
§Backend verification), except where Q2/Q3 name the additive
addition. "Authorable" means the author can create/read/update the
entity in the UI with the pinned evidence/approval rules; read-only
surfaces say so. No surface invents an entity, route, or capability.

1. **Characters** (`character-routes.ts`): list/create/delete
   characters (`POST/GET .../characters`, `DELETE
   .../characters/:characterId` — there is no character UPDATE route:
   the platform is append-only here, so name/summary corrections go
   through delete + recreate; GAP-058); state spans (`.../states`,
   `.../states/at` read-only as-of); knowledge (`.../knowledge`,
   `.../knowledge/access` read-only); arcs (`.../arcs`,
   `.../arcs/:arcId/milestones`, `.../arcs/:arcId/progress`
   read-only). Gate: writes `canon:manage`, reads `canon:read`
   (`services/characters.ts`). Character↔StoryEntity linkage is
   migration-owned and READ-ONLY in 016's UI: `storyEntityId` is set
   only by the one-time backfill on exact `(novel_id, key)` match
   (010 Invariant 2; `20261006_m1_story_versioning/migration.sql:298`)
   and no route or service writes it — the UI displays the link and
   never fabricates or edits it.
2. **Relationships** (`relationship-routes.ts`): directional stance
   spans (`.../stances`, `.../stances/at`, `.../stances/since`
   read-only); bonds (`.../bonds`, `DELETE .../bonds/:bondId`),
   transitions (`.../bonds/:bondId/transitions`,
   `.../bonds/:bondId/stage` read-only), interactions
   (`.../interactions`), neglect readout
   (`.../neglect` read-only). Gate: writes `canon:manage`, reads
   `canon:read`.
3. **World & Lore**: `StoryEntity` browser filtered by kind
   (CHARACTER|LOCATION|ORGANIZATION|FACTION|ITEM|RESOURCE|CONCEPT)
   (`.../canon/entities`); canon facts per entity
   (`.../canon/facts` with `mode=AUTHOR` — the route defaults to
   READER, which withholds sources and redacts; the authoring UI
   must pass `mode=AUTHOR` explicitly to receive evidence
   citations); direct fact creation with evidence
   (`POST .../canon/facts`, Invariant 2); retract
   (`.../facts/:factId/retract`); source attach (Q2 route) /
   detach (`DELETE .../facts/:factId/sources/:sourceId`). World
   rules ARE canon facts (schema comment at `schema.prisma:1172` —
   "A world rule is a CanonFact"); there is no separate world-rule
   table, and the UI does not pretend otherwise.
4. **Canon review**: three tabs — Facts (above), Proposals, Applications.
   - Proposals: `GET .../canon/proposals` list (novel-scoped);
     per-proposal approve/reject at the workspace-scoped paths
     `POST /api/workspaces/:workspaceId/canon/proposals/
     :proposalId/approve|reject` (`canon:approve`) with the
     proposal's `conflictKind` surfaced and non-auto-approvable
     claims blocked (services/canon.ts header :1-21). This closes
     recon absence #10 (no per-proposal UI action) through the
     EXISTING routes.
   - Applications: the existing 008 flow and CanonApplicationReview
     dialog — 016 wires entry points (pending-application badges),
     not a rewrite.
5. **Timeline** (`story-routes.ts`): events (`.../story/events`),
   timeline entries (`.../story/timeline`), threads
   (`.../story/threads`, `.../threads/:threadId/status`), promises
   (`.../story/promises`, `.../promises/:promiseId/transition`),
   causal edges (`.../story/causal-edges`). Gate: writes
   `canon:manage`, reads `canon:read`. Event↔thread links are NOT
   authorable in 016 (GAP-056; Q3).
6. **Planning** (`planning-routes.ts`): synopses
   (`.../planning/synopses`, archive, delete); sagas
   (`.../planning/sagas`, delete); outline nodes
   (`.../planning/outline-nodes` create/list/delete — the GAP-055
   interplay: deleting a node that a scene references is the
   existing 015 path); outline versions (`.../planning/
   outline-versions` create/list, approve, supersede —
   `canon:approve`); horizon (`GET/PUT .../planning/horizon`).
   Gate: writes `canon:manage` except outline-version approval
   (`canon:approve`).
7. **Research** (`retrieval-routes.ts`): references
   (`POST/GET /api/workspaces/:workspaceId/references`,
   `GET /api/references/:referenceId`, versions, publish,
   ingest — `POST /api/reference-versions/:versionId/ingest`);
   retrieval search (`POST .../retrieval/search`); retrieval audit
   list (`GET .../retrievals` read-only). Gate: `reference:manage`/
   `reference:read`. References are NEVER canon (schema comment);
   the UI labels the non-canon boundary.
8. **Narrative** (`narrative-routes.ts`): DNA (`GET/PUT
   .../narrative/dna`); policies (`GET/PUT .../narrative/policies`,
   `DELETE .../narrative/policies/:kind`) — SCALE policy readouts
   are display-only (GAP-039; the UI invents no assessment);
   antagonists (`POST/GET .../narrative/antagonists`,
   `.../antagonists/:antagonistId/stage`). Drama-window / cooldown /
   patterns / scale readouts are read-only.
9. **Health & memory**: `evaluateHealth` findings list with
   severity filter and the EvidenceFinding evidence shown
   (`GET .../story-health`); unresolved-identities register
   (`GET .../story-health/unresolved` read-only); final-text
   review receipts per chapter version (read-only display of the
   010 receipts); memory status + rebuild trigger + as-of read
   (`GET/POST .../memory/...`, 009 Q6). All read-only except the
   memory rebuild trigger (`novel:update`).

### Invariant 2 — Evidence and approval

**Evidence.** Every canon fact minted through 016's UI carries at
least one validated evidence citation:

- Direct fact creation (`POST .../canon/facts`): the UI REQUIRES
  the `source` citation at creation time (server keeps it
  optional — the requirement is UI-level; Q8). The citation is
  validated server-side by `resolveSourceEvidence` (span must be a
  verbatim substring of an immutable chapter version or reference
  version; 015 note: chapter prose may be sanitized HTML — the
  quote is matched against the STORED content, so the UI offers a
  strip-aware quote picker and never invents offsets).
- Post-creation citations: the Q2 additive route (or its deferral,
  per Q2) — without it, a fact's evidence is fixed at creation.
- Evidence sources are exactly `CanonFactSource.sourceKind`
  ∈ {CHAPTER, REFERENCE} — never free text, never a generation
  (constitution §2.2: generated prose is not canon).

**Approval — proposals vs applications (disambiguated).** A
`CanonProposal` is ONE candidate claim under review (AI-extracted
or author-proposed); it becomes canon only via `canon:approve`
(approve mints one CanonFact idempotently). A `CanonApplication`
is the 008 contracted BATCH from one extraction run's `extract`
step (validated spans, verdicts, head pin, atomic apply). The UI
presents both honestly: proposals are single-claim decisions;
applications are batch decisions through the existing review
dialog. Neither is presented as the other.

**Approval separation.** Per 008 Invariant 5: approving a run's
text (005) never approves canon; 016's canon approve actions are
distinct decisions with `canon:approve`, recorded with actor,
timestamp, and (for applications) the head pin. Outline-version
approval likewise stays separate from chapter acceptance.

### Invariant 3 — Authorization is server-side; capabilities are fixed

Writes use the existing gates (`canon:manage` for authoring,
`canon:approve` for approvals, `reference:manage` for the research
corpus, `novel:update` for the memory rebuild). The UI never
decides permissibility — it renders affordances from the
membership role and handles 403/409 envelopes from the server.
No new capability, no new role.

### Invariant 4 — Backend additions: exactly one (pending Q2)

The only backend change 016 may make is the additive Q2 route:
`POST /api/workspaces/:workspaceId/novels/:novelId/canon/facts/
:factId/sources` in `canon-routes.ts` + `addSource` in
`services/canon.ts` (service-level gate `canon:manage`, Zod body
= `createFactBody`'s `source` shape, span validation via the
existing `resolveSourceEvidence`, audit `canon.fact-source-added`,
`advanceForMutation` tables `["canon_fact_sources"]`, 404 for
cross-tenant fact ids). Everything else is UI over frozen
routes. If Q2 resolves to deferral, 016 makes NO backend change
at all and GAP-057 stays open as the follow-up owner.

### Invariant 5 — GAP ownership pins (decisions of record)

- GAP-039 (SCALE never FAILs): NOT 016. The policies UI shows the
  SCALE payload and the read-side fail-open state; no assessment
  source is invented. Owner: follow-up task.
- GAP-040 (cross-branch as-of): NOT 016. 016's UI offers no
  revision picker that crosses branches (009 Invariant 7 stands:
  cross-branch as-of → 400). Owner: follow-up task.
- GAP-053 (HTML downstream consumers): NOT 016. Owner: 017 orbit.
- GAP-055 (scene-delete 409 cascade-vs-refuse): NOT 016. The
  planning UI uses the existing `deleteOutlineNode` path; the
  cascade/refuse decision stays with the planning owner.
- GAP-056 (StoryThreadEvent schema-only): 016 does not link
  events↔threads in the UI; Q3 resolved to **deferral** (review
  round 1, 2026-10-06). Owner: follow-up task under the
  story-model owner.
- GAP-057 (no add-source route): Q2 resolved to **016 adds the
  route** (review round 1, 2026-10-06); GAP-057 closes on
  implementation with span-validation tests.
- The NF-WF-009 intent-lifecycle gap (no DerivedRebuildIntent
  consumer): NOT 016. The memory status panel reads the existing
  `GET .../memory/status` only; it does not invent intent
  consumption. Owner: follow-up (platform-wide worker design or
  contract amendment).
- NF-WF-009 F3 (full lineage): NOT 016. Owner: follow-up gated by
  009 Invariant 6.
- GAP-052 (scene structural-only): 015's; 016's planning UI
  treats scenes as structural anchors and changes nothing.

### Invariant 6 — No-regression

016 changes no existing route, component, or contract except where
this contract says so (Q2). The 007 generation loop, ApplyBar,
ApprovalDialog, FindingsPanel, ProposalsPanel,
CanonApplicationReview, the 015 editor/save/conflict flow, the
012 publish gate, and the 013/014 reader/discovery pages keep
working. The writer page keeps its existing layout; 016 adds
panels wired to the story-structure nav and the header
`outline-btn`.

### Invariant 7 — Design: §15, no reinvention

`docs/design/writer-workspace` + `DESIGN-TOKENS.md` are the
foundational design (constitution §15). 016 inherits: the
story-nav `story-structure` section (Characters, World & Lore,
Timeline, Canon — `index.html:655-663`), the header `outline-btn`
(`:601`) for planning, the `scene-context` character cards
(`:718-756`) with their Edit/Remove/Add affordances, the
`continuity-guardian` panel (`:758-773`) for health findings, and
the footer's "Canon in sync" (`:787`). Two deliberate extensions
recorded here as author decisions (reviewer to confirm/flip):
(a) Research, Planning-detail, Narrative, and Health & Memory
get additional nav items in the same `story-structure` section —
the mockup shows four items but names the section "Story", and
016's acceptance requires these surfaces; (b) complex authoring
lists (facts, outline nodes, references) open as drawer panels
following the existing drawer conventions, not as new pages.
Any other departure is a documented author decision recorded
with its scope before implementation.

### Invariant 8 — i18n and accessibility

All new strings via `useLocale()` with `en` + `id` keys and
English fallback. Dialogs are Esc-dismissable with focus return;
lists are keyboard-navigable; evidence quotes render as text
(never raw HTML); destructive actions (delete entity, retract
fact, delete bond, archive novel-adjacent rows) require explicit
confirmation. New components get vitest-axe checks (the 014/015
`apps/web/a11y` precedent); the manual screen-reader pass follows
GAP-051's owner.

## Acceptance and verification

- [ ] Characters: create/delete a character (no update route
      exists — append-only platform pattern; GAP-058), add a state
      span (overlap refused by the DB EXCLUDE constraint → honest
      409), add knowledge with stance+source, add an arc with
      milestones, view the read-only story-entity link — all through
      the UI, persisted via the frozen routes.
- [ ] Relationships: set a directional stance span, create a bond
      with members, record a transition and an interaction —
      through the UI.
- [ ] World & Lore: browse entities by kind, author a canon fact
      on an entity WITH a validated evidence citation (UI refuses
      to submit without one — Q8), retract a fact, attach/detach
      a citation (Q2).
- [ ] Canon review: approve and reject a single proposal with a
      visible conflict surfaced; open a pending application in
      the existing review dialog from the Canon panel.
- [ ] Timeline: create an event, a timeline entry, a thread
      (status change), a promise (transition), a causal edge —
      through the UI. Thread↔event linking absent by design
      (GAP-056).
- [ ] Planning: create/archive/delete a synopsis, create/delete a
      saga, create/delete outline nodes, approve and supersede an
      outline version (canon:approve), read/update the horizon —
      through the UI; the outline-btn opens this panel.
- [ ] Research: create a reference, add a version, publish it,
      trigger ingest, search the corpus, view the retrieval audit —
      through the UI; the non-canon boundary is labelled.
- [ ] Narrative: edit DNA, manage policies (SCALE display-only),
      manage antagonists — through the UI.
- [ ] Health & memory: the continuity-guardian panel lists
      `evaluateHealth` findings with severity + evidence; the
      unresolved-identities register is visible; memory status
      shows and the rebuild trigger works.
- [ ] Evidence boundary: a reference can be attached as a fact
      citation, and the UI never presents it as canon.
- [ ] No API-only carve-out survives: every entity in Invariant 1
      is authorable in the UI to the extent the frozen routes
      allow (character update and story-entity-link editing are
      explicitly pinned out as read-only/absent per Invariant 1.1;
      any further exception is an explicit author-approved
      amendment recorded here, not a silent gap).
- [ ] No-regression: 007/015 writer flows, generation loop,
      ApplyBar, publish gate, reader/discovery pages all behave
      as before.
- [ ] i18n: en + id keys for every new string; missing-key
      fallback.
- [ ] Full suites green: web (incl. new component tests), API,
      `pnpm e2e` (011) green; lint + tsc + vue-tsc clean.
- [ ] Q1–Q8 decided (§"Open questions" after review).

Record actual results separately from expectations. Zero selected tests
or skipped integration checks do not pass a capability gate.

## Migration and rollback

None — no schema changes. If Q2 resolves to the additive route, it
adds rows to `canon_fact_sources` only; rollback is removing the
route (existing facts keep their creation-time citations). If Q2
resolves to deferral, the backend diff is empty and rollback is
removing the new components. Member-facing authoring behavior is
unchanged when 016 is absent (the APIs stay as they are).

## Documentation and handoff

Update `docs/implementation/progress.md`, `docs/14-progress/CURRENT.md`,
`docs/implementation/test-matrix.md` with verified scope; record
deviations in `docs/implementation/ISSUES-AND-GAPS.md` BEFORE any
workaround (standing rule). GAP-056 and GAP-057 close (or stay open as
follow-ups) per Q2/Q3 resolutions.

List unknowns, blocked checks, observed versus inferred findings,
risks, and the next dependency-ready task (NF-WF-017). Do not claim
full platform completion.

## Open questions

Genuinely open tradeoffs. The recommendations are the author's, for the
reviewer to confirm or flip before implementation.

- **Q1 — Drawer panels vs dedicated pages? (Recommendation:
  drawer panels.)** The writer page is the single authoring surface
  (007/015); the design mockup wires story-structure nav items to
  panels, not pages. Panels keep context (the editor stays
  visible); complex lists still fit the drawer conventions. A page
  per domain would fragment the workspace.
- **Q2 — Add the `POST .../facts/:factId/sources` route in 016?
  (Recommendation: yes.)** GAP-057: without it, evidence is frozen
  at fact creation — a fact created in haste can never be properly
  cited. The route is additive, small, reuses the existing span
  validation, and the acceptance says "with evidence". If flipped,
  GAP-057 stays open as an explicit follow-up.
- **Q3 — Add event↔thread link/unlink routes in 016?
  (Recommendation: no — defer.)** GAP-056: the relation exists in
  schema only. Adding the API is scope beyond authoring UI, and
  inventing link semantics (what a link means for the compiler)
  needs the story-model owner's design. 016 must not silently
  redefine it. Deferral keeps the relation out of the UI.
- **Q4 — Approval UX for proposals: modal per claim or bulk list?
  (Recommendation: bulk list with per-claim decision.)** Proposals
  are independent single claims (unlike applications, which are
  head-pinned batches); a list with per-row approve/reject and
  visible conflict surfacing matches the entity. Keep the
  application dialog for batches.
- **Q5 — Should outline-version approval live in the planning
  panel? (Recommendation: yes.)** It is `canon:approve` authority
  (not outline editing), and the planning panel is where the
  author sees versions; the approval is visually separated from
  node editing and labelled as an approval decision.
- **Q6 — Memory status: panel or footer? (Recommendation: panel.)**
  009 Q6 says "a memory status panel belongs with the 010/016
  workspace work" — a panel in Health & Memory, with the rebuild
  trigger and as-of read, not a footer badge.
- **Q7 — Reference ingestion UX depth? (Recommendation: CRUD +
  publish + ingest trigger only.)** File upload and format
  normalization belong to NF-WF-017's import orbit; 016 must not
  build a second ingestion path. Existing ingestion (ingest a
  version's text) is enough for the research workspace.
- **Q8 — Require ≥1 citation at direct fact creation in the UI?
  (Recommendation: yes.)** The server keeps `source` optional, but
  016's acceptance says "with evidence" — a fact without a
  citation is an unsupported claim entering canon, which
  contradicts 008's evidence discipline. The UI enforces it; the
  server contract is unchanged.

## Review record

(Reviewer: separate actor from the contract author and the future
implementer; backend MODEL_UNVERIFIED per GAP-013.)

### Round 1 — 2026-10-06 — verdict: APPROVE_WITH_FINDINGS

Reviewed `tasks/NF-WF-016-authoring-workspace.md` (DRAFT) against the
delivery-plan NF-WF-016 row, the constitution (AGENTS.md), the
task template, and the frozen 008/009/010 contracts. Backend claims
spot-checked independently against HEAD `8bc8a12` (~25 route/model/
service claims; the remainder trusted from the author's
recon + spot-checks). All 5 findings were fixed inline in this
round; no contract rewrite by the author was needed.

**Findings fixed inline (all in the contract file unless noted):**

- **F1 (P2) — "Edit a character" had no backend.** The acceptance
  said "create/edit/delete a character", but no PUT/PATCH character
  route and no `character.update` exist anywhere in app code
  (character-routes.ts:86-326 has only POST/GET/DELETE + sub-resource
  routes). The platform pattern is append-only. Fixed: acceptance now
  says create/delete; corrections go through delete + recreate; the
  absence is recorded as new **GAP-058** (ISSUES-AND-GAPS.md).
- **F2 (P2) — Character↔StoryEntity linkage is not authorable.**
  `Character.storyEntityId` is set only by the one-time migration
  backfill on exact `(novel_id, key)` match
  (`20261006_m1_story_versioning/migration.sql:298`; 010 Invariant
  2) — no route or service writes it. Fixed: Invariant 1.1 now pins
  the link as migration-owned and READ-ONLY in 016's UI (displayed,
  never fabricated or edited); the CharacterSheet component
  description follows.
- **F3 (P3) — GAP-056's evidence was wrong on the read side.**
  Claimed "zero app-code reads/writes" for `StoryThreadEvent`; the
  health check reads it (`services/story-health.ts:363`, the
  stale-thread query). Fixed: corrected the claim in both
  ISSUES-AND-GAPS.md and the contract's backend-verification note;
  the Q3 deferral decision is unaffected (no writes, no routes).
- **F4 (P3) — Proposal approve/reject scope was unpinned.** The
  routes are workspace-scoped
  (`POST /api/workspaces/:workspaceId/canon/proposals/:proposalId/
  approve|reject`, canon-routes.ts:427/:445), not novel-scoped like
  create/list. Fixed: exact paths pinned in Invariant 1.4 and the
  backend-verification section.
- **F5 (P3) — Facts-list `mode` was unpinned.** The route defaults
  to READER (withholds sources); the authoring UI must pass
  `mode=AUTHOR` to receive evidence citations. Fixed: pinned in
  Invariant 1.3.

**Q1–Q8 decisions of record (reviewer-confirmed):**

- Q1 — Drawer panels: **CONFIRMED**. The writer page is the single
  authoring surface (007/015); the design mockup wires
  story-structure nav to panels; §15 conformance.
- Q2 — Add `POST .../facts/:factId/sources` in 016: **CONFIRMED
  (yes)**. The acceptance checkbox requires attach/detach; detach
  exists without attach today (asymmetric). Additive, no schema
  change, reuses `resolveSourceEvidence` + the existing
  `advanceForMutation`/`canon.fact-*` conventions. GAP-057 stays
  open until implementation with span-validation tests.
- Q3 — Event↔thread link/unlink routes: **CONFIRMED (defer)**.
  Nothing writes the relation; inventing link semantics would
  silently redefine what a link means for the compiler. GAP-056
  updated to deferred-follow-up.
- Q4 — Proposal approval UX (bulk list, per-claim decision):
  **CONFIRMED**. Matches 008's "per-proposal by design".
- Q5 — Outline-version approval in the planning panel:
  **CONFIRMED**. `canon:approve` authority, visually separated from
  node editing, labelled as an approval decision.
- Q6 — Memory status panel: **CONFIRMED**. 009 Q6 assigned it here.
- Q7 — Ingestion UX (CRUD + publish + ingest trigger only):
  **CONFIRMED**. File upload/format normalization is 017's orbit.
- Q8 — UI requires ≥1 citation at direct fact creation:
  **CONFIRMED**. Acceptance says "with evidence"; UI-level
  enforcement leaves the frozen server contract unchanged.

**Independent verification summary (checked vs trusted):**
Checked: delivery-plan :150 row; 008/010 out-of-scope deferrals to
016; canon routes (entities :234/:250/:270, facts :291/:307/:345,
sources :370, proposals :392/:408/:427/:445, applications
:472-545); createFactBody source shape (:45-64, single optional
source, quote ≤ 20_000); character routes :86-326 (all 13); no
character update anywhere (no PUT/PATCH in any *-routes.ts; no
`db.character.update` in services); relationship routes :93-324;
story routes :111-302; planning routes :96-384 (approve :325,
supersede :350, horizon :372/:384); narrative routes :162-369;
retrieval routes :114-224; memory routes :61-90; story-health
routes :75-110; capabilities
(`canon:read/manage/approve` :56-58, `reference:read/manage`
:30-31, no character/planning-specific capability); proposal
semantics (`approveProposal` mints one CanonFact; services/canon.ts
header :1-21); `storyEntityId` never written by app code
(migration backfill :298); `StoryThreadEvent` read at
story-health.ts:363 only; ProposalsPanel exists
(components/generation/ProposalsPanel.vue) and is the only canon
UI besides CanonApplicationReview; design pins (outline-btn :601,
story-structure nav :655-663, scene-context :718, continuity-guardian
:758, footer canon state :787); GAP-056/GAP-057 recorded BEFORE the
contract pins them (constitution §13 satisfied). Trusted from the
author's verification: exact schema.prisma line numbers for models,
`resolveSourceEvidence` internals, spoiler-boundary mode details,
`EvidenceFinding` type location, 015 HTML strip-rule interplay.

### Round 2 (diff review) — 2026-10-06 — verdict: APPROVE_WITH_FINDINGS

Reviewed the exact submitted diff (working tree on HEAD `3e1165d`; 11
modified + 29 new files, 2320 insertions). Separate actor from the
contract author, contract reviewer, and implementer; backend
MODEL_UNVERIFIED per GAP-013. Findings fixed inline in this round; no
contract rewrite by the implementer was needed.

**Findings fixed inline:**

- **R1 (P2) — the "view the read-only story-entity link" acceptance
  checkbox was unsatisfiable.** `listCharacters`
  (`services/characters.ts`) mapped rows without `storyEntityId`,
  so the UI's `v-if="character.storyEntityId"` could never fire.
  Fixed: the read shape now returns `storyEntityId` (additive field,
  no schema change, still no writer — GAP-058's pin holds). One-line
  change in the response map; new API test asserts null for unlinked
  characters and the migration-set id after a backfill-style DB
  write. GAP-060 CLOSED on this.
- **R2 (P3) — no finding, but recorded:** GAP-059 (scene-context
  panel exists only in the mockup) and the Q3 deferral (no
  event↔thread linking anywhere — verified absent in UI and API)
  are correctly handled as honest open gaps, not silent omissions.

**Independent verification (checked vs trusted):**
Checked: the Q2 route + service against every Invariant 4 pin (path,
Zod schema byte-equal to `createFactBody.source`, `canon:manage`
gate, `resolveSourceEvidence`, audit `canon.fact-source-added`,
`advanceForMutation ["canon_fact_sources"]`, 409-on-retracted,
404-cross-tenant); no schema changes and no new capabilities in the
diff (packages/database, packages/auth untouched); no AI calls in any
workspace component; workspace-scoped proposal approve/reject paths
(F4); `mode=AUTHOR` in FactList and retrieval search (F5); no
character update route usage; storyEntityId never written by the UI;
GAP-059/GAP-060 evidence verified against source (GAP-060 claim
confirmed, then fixed); orange (`nf-accent`) usage conforms to
DESIGN-TOKENS.md (primary CTA + active nav state only);
DESIGN-TOKENS drawer conventions (Esc, focus return, role=dialog);
i18n workspace-subtree parity en↔id (752/752 key paths, all enum
`kind:` blocks byte-identical); no `@ts-ignore`/`@ts-expect-error`
in new files. Re-ran: canon.test.ts 60/60, character.test.ts 23/23,
full web suite 244/244 (37 files), API `tsc --noEmit` exit 0, web
`vue-tsc --noEmit` exit 0, `pnpm lint` exit 0. Trusted from the
implementer: full API suite 592/592 and `pnpm e2e` 20/20
BASELINE-OK (the targeted re-runs I did are consistent with both
claims; the UI is component-test-only, honestly noted in
test-matrix.md).

---

## Backend verification (contract author)

Every normative backend claim in this contract was verified against
source on 2026-10-06 (repo @ `8bc8a12`), in part by a separate
read-only recon actor and spot-checked by the author. File:line
references:

- Delivery plan: NF-WF-016 row at
  `docs/implementation/DELIVERY-PLAN.md:150` ("Research/world/
  planning/character workspace completion"; depends on 010;
  acceptance "Authorable facts/state/references with evidence and
  approval; no API-only completion").
- 010 deferral: "Workspace UI for health/status → NF-WF-016"
  (`tasks/NF-WF-010-state-consumer-integration.md` out-of-scope).
  008 deferral: "Character/relationship/world/health workspaces →
  NF-WF-010/016" (`tasks/NF-WF-008-canonical-proposal-application.md`
  out-of-scope). 009 Q6: "A memory status panel belongs with the
  010/016 workspace work"
  (`tasks/NF-WF-009-revision-derived-memory.md` open questions).
- Canon models: `StoryEntity` at
  `packages/database/prisma/schema.prisma:1226` (kinds
  CHARACTER|LOCATION|ORGANIZATION|FACTION|ITEM|RESOURCE|CONCEPT);
  "A world rule is a CanonFact" comment at `:1172`; `CanonFact`
  `:1267` (APPEND-ONLY comment); `CanonFactSource` `:1348`
  (sourceKind CHAPTER|REFERENCE; `quote` "exact
  `source.slice(start, end)`"); `CanonProposal` `:1389`;
  `CanonApplication` `:1472`; `CanonApplicationItem` `:1516`.
- Reference models: `Reference` `:945` (NOT canon comment
  `:939-943`; kinds NOTE|GUIDE|RESEARCH|STYLE|GLOSSARY|IMPORTED;
  status DRAFT|ACTIVE|ARCHIVED); `ReferenceVersion` `:985`;
  `Chunk` `:1019`; `Embedding` `:1062`; `RetrievalAudit` `:1106`.
- Planning models: `Synopsis` `:1565`; `Saga` `:1594`;
  `OutlineNode` `:1627` (CHECK "exactly one set when leaf" — the
  GAP-055 constraint); `OutlineVersion` `:1665`;
  `PlanningHorizon` `:1690`.
- Story models: `StoryEvent` `:1739`; `TimelineEvent` `:1778`;
  `StoryThread` `:1815`; `StoryThreadEvent` `:1852`
  (no app-code WRITES and no link/unlink route; the only read is the
  health check's stale-thread query at
  `services/story-health.ts:363`, plus the restore scope mapping in
  `services/revisions.ts:214`; GAP-056);
  `StoryPromise` `:1871`; `CausalEdge` `:1906`.
- Character/relationship models: `Character` `:2019`;
  `CharacterState` `:2066` (overlap refused by DB EXCLUDE);
  `CharacterKnowledge` `:2089`; `CharacterArc` `:2111`;
  `CharacterArcMilestone` `:2129`; `RelationshipStance` `:2148`;
  `Bond` `:2178`; `BondMember` `:2203`; `BondTransition` `:2221`;
  `MeaningfulInteraction` `:2241`; `Antagonist` `:2380`.
- Narrative/health/memory models: `NarrativeDnaProfile` `:2340`;
  `NarrativePolicy` `:2358`; `DerivedRebuildIntent` `:2667`
  (no route reads it — intent-lifecycle gap);
  `MemoryProjection` `:2699`; `FinalTextReview` `:2741`.
- Scene model: `Scene` `:325-344` (no content column — GAP-052).
- Routes: canon (`apps/api/src/canon-routes.ts`: entities
  :234/:250/:270, facts :291/:307/:345, sources :370,
  proposals create/list :392/:408 (novel-scoped) and
  approve/reject :427/:445 (workspace-scoped:
  `/api/workspaces/:workspaceId/canon/proposals/:proposalId/
  approve|reject`), applications
  :472/:491/:507/:523/:545, story-brain ask :564);
  `createFactBody` at `:45-64` (single optional `source`);
  facts list spoiler-boundary mode/REDACTED default at
  `:307-344`; `unlinkSource` service at
  `services/canon.ts:969`.
- `createFact` at `services/canon.ts:800` (one source max,
  validated by `resolveSourceEvidence`, 409 on live-slot
  conflict via P2002, `advanceForMutation` "fact.create"
  MANUAL origin, no checkpoint).
- Capabilities: `canon:read`/`canon:manage`/`canon:approve` at
  `packages/auth/authorization.ts:56-58`;
  `reference:read`/`reference:manage` (`:30-31`); no
  planning/character/relationship-specific capability exists
  (full list `:9-68`).
- Character/relationship/planning/story/narrative/memory/health
  routes and their service-level gates as listed in Invariant 1
  (`character-routes.ts:86-326`,
  `relationship-routes.ts:93-323`, `planning-routes.ts:96-384`,
  `story-routes.ts:111-301`, `narrative-routes.ts:162-368`,
  `memory-routes.ts:61-90`, `story-health-routes.ts:75-109`;
  outline-version approve/supersede gated `canon:approve` at
  `planning-routes.ts:324`/:349).
- Retrieval routes at `apps/api/src/retrieval-routes.ts:114-224`
  (`reference:manage`/`reference:read` via
  `services/retrieval.ts` gates).
- Proposal vs application semantics: `CanonProposal` = single
  claim under review, `canon:approve` mints one CanonFact
  (`services/canon.ts` header :1-21, `approveProposal` :1103);
  `CanonApplication` = contracted batch from one extraction
  run's extract-step outcome (008 contract + schema comment).
- Evidence model absence: no `Evidence` model; citations are
  `CanonFactSource` rows + `CanonApplicationItem.evidence` Json
  + the `EvidenceFinding` type
  (`services/evidence-findings.ts:14-58`).
- Design pins: story-structure nav `docs/design/writer-workspace/
  index.html:655-663`; `outline-btn` `:601`; `scene-context`
  `:718-756`; `continuity-guardian` `:758-773`;
  `last-generation` `:774`; footer canon state `:787`.
- Web UI absence: verified by recon grepping components/
  composables/pages/utils/i18n — no character, relationship,
  planning, research, timeline, narrative, health, or canon-fact
  authoring UI exists (ProposalsPanel + CanonApplicationReview
  are the only canon UI).

UNVERIFIED: exact `createFactBody.source` quote-size behavior at
the 20_000-char bound under sanitized-HTML content (implementer
exercises; reviewer verifies the strip-aware quote picker);
`ReferenceVersion.contentHash` consumers ("Nothing READS it
today" — schema comment :994; implementer does not rely on it);
the exact `story-health` query surface beyond `chapter`/
`revisionId`/`simulation` (implementer pins from the route).
