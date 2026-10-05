# Task NF-WF-010: Character/relationship/rhythm/world/health integration

Project language: English for all authored/revised artifacts and generated
project content; UI uses English (`en`)/Bahasa Indonesia (`id`) locale keys
and resources with English fallback.
Model selection: author-selected at runtime; separate implementer/reviewer
actors, with requested aliases distinguished from runtime evidence.

Status: DRAFT (contract not reviewed; implementation starts only after a
separate contract review returns APPROVE)
Milestone / capability IDs: M2 state consumers; DELIVERY-PLAN NF-WF-010
(depends on NF-WF-009); feeds NF-WF-011, NF-WF-016, NF-WF-018, CAP-06
Implementer role / requested and resolved model: (to be assigned at dispatch)
Reviewer role / requested and resolved model: (separate actor; backend MODEL_UNVERIFIED per GAP-013)
Readiness evidence / unresolved decisions / parent acceptance owner: NF-WF-009
VERIFIED (`1d0a718` — `@novelforge/memory` structural-only; `recallNovel`
with `chapterMemory`/`recentMemory`/`arcMemory`; freshness derivation;
settle-revision continuity; committed and pushed 2026-10-05). NF-WF-003
VERIFIED (context compiler tiers 1–10). NF-WF-008 VERIFIED (canon
apply + invalidation intents). GAP-028 remains OPEN and constrains
testing (see Scope).
Frozen review manifest / exact artifact paths and identity: (filled after contract review)
Baseline revision / local changes to preserve: main @ `1d0a718` (NF-WF-009 pushed 2026-10-05)
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

NF-WF-009 built a memory store with no real consumers: the compiler
emits the tiers, but nothing assembles character state, tracks
relationships, applies rhythm preferences, checks world/lore
consistency, or evaluates story health against that memory. This task
builds the **consumers** — the parts of the platform that read
009-memory and live canon tables to answer, with evidence:
"who is this character now?", "how do these two regard each other?",
"does this text respect the author's policies?", "is this story
healthy?". It resolves GAP-011's identity semantics (what a null
linkage means — surfaced, never fabricated) and GAP-012's policy
semantics (validated fields, hard vs soft, malformed handling, policy
evaluation connected to final-text review). Every check cites
evidence; every unresolved identity is named as unresolved rather
than guessed.

This is a design contract. Implementation starts only after a separate
contract review returns APPROVE.

## Required reading

- [Operating constitution](../../AGENTS.md) (esp. §2 invariants 7, 8,
  11, 13, 14, 17, 18 — DNA uses soft constraints unless explicitly
  configured otherwise; §4 planning authority; §5 canon authority;
  §7 context rules — every retrieved fact retains provenance; §8 —
  never summarize away hard canon; §11 — revalidate the final edited
  text, any later edit invalidates approvals/reviews).
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md) (§5
  product-AI boundaries).
- [Story intelligence](../../docs/03-domain/STORY-INTELLIGENCE.md)
  (Story Health §: "findings are evidence-backed issues, not vibes";
  finding = rule, severity, evidence, affected entities, status,
  remediation proposal; "Story Event, timeline and
  character/canon identities require explicit stable links and
  temporal semantics before context/consolidation joins them. Never
  infer identity from a matching name.").
- [Narrative rhythm](../../docs/03-domain/NARRATIVE-RHYTHM.md)
  (ADR-009: rhythm preferences are SOFT — "drama every N chapters"
  as a cron-like rule is forbidden; `assessDramaWindow` returns an
  observation plus the author's numbers, never an instruction;
  ADR-012: findings carry the concrete ids/chapters that produced
  them).
- [NF-WF-009 contract](NF-WF-009-revision-derived-memory.md)
  (the memory this task consumes: structural-only MemoryBlocks,
  freshness derivation, settle revisions, as-of semantics).
- [NF-WF-003 contract](NF-WF-003-chapter-context-compiler.md)
  (tiers 4/6/9 the consumers extend; compiler invariants).
- [NF-WF-008 contract](NF-WF-008-canonical-proposal-application.md)
  (canon authority; rejection paths).
- Existing code: `apps/api/src/services/characters.ts`,
  `relationships.ts`, `narrative.ts` (`putPolicy` validation
  posture, `HARD_ANTAGONIST_PROBLEMS`, `isValidCooldownPayload`),
  `story.ts` (events, timeline, causal edges),
  `context-compiler.ts` (tiers 4/6/9), `memory.ts`
  (`recallNovel`), `packages/character-intelligence/`,
  `packages/relationship-intelligence/`,
  `packages/narrative-rhythm/` (rhythm.ts, scale.ts, vocabulary.ts),
  `packages/auth/authorization.ts` (capability vocabulary).

## Environment prerequisites

Same as NF-WF-009: native PostgreSQL 16 + pgvector and Redis on
localhost per `docs/11-deployment/ENVIRONMENT-PREFLIGHT.md` (no Docker
on this host); pnpm 12, Node 24; dedicated disposable
`novelforge_test_*` databases for mutation tests. Record actual
readiness; never claim another host's checks.

## Dependencies

- NF-WF-009 (009-memory: `recallNovel`, `MemoryBlock`, freshness,
  settle revisions, as-of retrieval).
- NF-WF-003 (context compiler — consumer #1's assembly point;
  tiers 4/6/9).
- NF-WF-006/007 (chapter generation; the enforcement point is
  `manuscript.setStatus` out of `DRAFT` — consumer #2's gate,
  pinned in Invariant 4).
- NF-WF-008 (canon truth + ACTIVE filter; rejection paths).
- Existing story-intelligence backend: Character/CharacterState/
  CharacterKnowledge/CharacterArc(-Milestone)/RelationshipStance/
  Bond(-Member)/Antagonist, StoryEvent/TimelineEvent/CausalEdge,
  StoryThread/StoryPromise, NarrativePolicy (DRAMA_GAP/COOLDOWN/
  SCALE), NarrativeDnaProfile, `character-intelligence`,
  `relationship-intelligence`, `narrative-rhythm` domain packages.

## Scope

### Allowed

- **Consumer 1 — chapter-generation context assembly**: extend the
  compiler's tier 4 (states) and tier 6 (timeline) with a defined
  memory-vs-live sourcing rule (Invariant 1); character-state
  assembly (`assembleCharacterState`), relationship tracking
  (`assembleRelationships`), timeline-with-linkage assembly
  (`assembleTimeline`) as services the compiler calls.
- **Consumer 2 — final-text review**: a new
  `reviewFinalText(novelId, { chapterVersionId })` service that
  evaluates an immutable chapter version against validated HARD
  and SOFT policies; stored review receipts (`FinalTextReview`
  table); wiring into the 007 manuscript **accept** flow so a FAIL
  verdict blocks acceptance (Invariant 4).
- **Consumer 3 — health/consistency evaluation**:
  `evaluateHealth(novelId, { chapter?, revisionId? })` implementing
  the STORY-INTELLIGENCE.md health categories as evidence-backed
  findings (Invariant 5); an observability route (no dedicated UI —
  016 owns workspace UI).
- **Identity semantics (GAP-011)**: normative null-linkage rules
  for `characters.story_entity_id` and
  `timeline_events.story_event_id` (Invariant 2); an explicit
  `UNRESOLVED` surfacing mechanism for causal/time identity
  (Invariant 6).
- **Policy semantics (GAP-012)**: payload validation for all three
  `NarrativePolicyKind`s on write (incl. the currently-unvalidated
  SCALE), HARD vs SOFT enforcement paths, malformed-on-read
  fail-open rule, `putDna` minimal shape validation; connect policy
  evaluation to final-text review.
- **Evidence findings schema**: normative `EvidenceFinding` shape
  (rule, severity, status, evidence, affectedEntities, remediation,
  sourceRevisionId).
- New Prisma model(s) + migration (reviewed artifact; GAP-030
  idempotent DO-block convention); registration of any new tables
  in `TABLE_SCOPE`/`COVERED_TABLES` (GAP-035 lesson).
- Tests: API-level with the test driver (fake gateway, GAP-028);
  fault injection where model calls are involved.

### Forbidden

- Fabricating identity: any join keyed on name similarity, any
  guessed `story_entity_id` / `story_event_id`, any backfill of
  `timeline_events.story_event_id`.
- Treating memory as truth: 009 memory NEVER overrides live canon
  tables; a conflict between memory and live tables is a finding,
  not a silent correction of either side.
- Soft preferences forcing plot/drama: no SOFT policy output may
  contain plot instructions (Invariant 3 — shape-enforced).
- Changing canon semantics, `setStatus`'s contract beyond the
  new refusal codes, the 003 compiler's tier selection/budget
  policy, or existing revision machinery.
- A parallel identity store: no new "resolved links" table —
  linkage stays exactly the existing nullable FKs.

### Inputs

- 009 `recallNovel` blocks (chapter/recent/arc) + live tables:
  characters (+states/knowledge/arcs/milestones), stances, bonds,
  antagonists, story events, timeline events, causal edges,
  threads, promises, NarrativePolicy rows, NarrativeDnaProfile,
  Chapter/ChapterVersion (immutable text artifact).
- Review request: `{ novelId, chapterVersionId }`.
- Health request: `{ novelId, chapter?, revisionId? }`.

### Outputs

- Assembled generation context blocks (tiers 4/6) with explicit
  provenance per row (memory vs live, source revision).
- Final-text review verdicts + stored receipts; accept-time
  refusal on HARD violations.
- Health findings with the normative evidence schema.
- An "unresolved identity" register surfaced through findings and
  a status route.

### Out of scope (with follow-up owner)

- Workspace UI for health/status → **NF-WF-016** (009 out-of-scope
  line moves here: the compiler/API are the M2 consumers).
- Summary narrative generation from 009 Invariant 6 →
  **scoped follow-up** (unchanged from 009).
- Simulation runs → **NF-WF-021** (simulations never feed these
  consumers: a review/health input pinned to a simulation
  revision → 400 `SIMULATION_SOURCE_REFUSED`, per 009 Invariant 8
  precedent).
- Full causal-lineage resolution (revision→run links) → follow-up
  (same deferral as 009 F3).
- Review/retention horizon policy for `FinalTextReview` rows →
  **follow-up** (010 keeps all rows, same as 009 Q5).
- Public/reader visibility of health or review state.

## Behavior and invariants

### Invariant 1 — Consumers declare their source: memory vs live

Each consumer MUST state, per row, whether the row came from 009
memory (a revision-pinned projection) or a live table — and when
both exist and disagree, the LIVE table wins for truth while the
disagreement becomes an `OPEN` finding (`MEMORY_LIVE_DIVERGENCE`),
never a silent correction.

- **Tier 4 (states) assembly**: rows for the cast window are read
  from live `character_states` / `relationship_stances` /
  `bond` (+members) tables — the compiler's current behavior is
  unchanged. When the novel has a FRESH 009 projection for the
  requested scope, the assembly additionally cites the memory
  block's structural facts as corroboration (provenance per row);
  when memory is STALE/FAILED/MISSING, the assembly proceeds on
  live tables alone with an explicit `memory: {status}` note in
  block provenance. Memory rows are NEVER presented as the
  authoritative state. **Corroboration is defined**: for each live
  row, the assembler checks whether the 009 structural facts for
  the same scope contain the same `(entityId, predicate, object)`
  triple as of the projection's `sourceRevisionId`; a match →
  `source: "MEMORY_FRESH"` on the row's provenance, a mismatch →
  live row stands and the mismatch is recorded as
  `MEMORY_LIVE_DIVERGENCE` (OPEN) — never a silent correction.
- **Tier 6 (timeline) assembly**: live `timeline_events` +
  `causal_edges`, with per-row `linkedEventId` (the raw
  `story_event_id`, possibly null — Invariant 2). 009 memory
  contributes nothing to tier 6 in 010: timeline entries are
  authored prose-position records, not canon derivations, and the
  009 structural core does not model them.
- **Health evaluation**: reads live tables and, where the 009
  contract gives it a revision-pinned view, 009 memory — always
  with `sourceRevisionId` recorded on the finding.

### Invariant 2 — Null linkage contributes no ID, never a name match (GAP-011)

The nullable FKs are the ENTIRE identity contract. A NULL linkage
is the honest answer to "which entity/event is this?", and every
consumer MUST treat it as absence, not as an invitation to infer:

- `characters.story_entity_id IS NULL` → the character has NO
  canon entity. Consumers MUST NOT pass a guessed entity id to
  canon joins, MUST NOT match `characters.name` against
  `story_entities.name`, and MUST NOT include canon facts for an
  inferred entity in the character's assembled state. Canon facts
  for the character's EXACT-KEY entity (the one the migration
  backfills on `(novel_id, key)` match) are joined ONLY through
  the non-null FK.
- `timeline_events.story_event_id IS NULL` → the timeline entry
  records an in-story-time position with NO structured event.
  Causal-edge traversal MUST skip such entries (they contribute
  no event id to cause/effect joins); the entry still appears in
  timeline order by its `order` slot, flagged
  `linkedEventId: null`.
- When a consumer NEEDS a link that is null (e.g. a causal query
  whose path crosses an unlinked timeline entry, or a character
  whose arc milestone references canon), it emits an
  `UNRESOLVED` finding (Invariant 6) — never a fabricated id.
- Backfill rule restated (existing migration behavior, binding
  here): `characters.story_entity_id` backfills ONLY on exact
  `(novel_id, key)` match with `kind = 'CHARACTER'`; `timeline_
  events.story_event_id` gets NO backfill — any automatic link
  would be fabricated provenance.

### Invariant 3 — Temporal knowledge: two clocks, explicitly distinguished

010 reasons over TWO time axes, and every consumer MUST say which
it is using:

- **Story time** — the in-story chronology: chapter numbers
  (`Chapter.number`), in-story slots (`TimelineEvent.order`),
  and validity windows: `CharacterState[fromChapter, toChapter)`,
  `CharacterKnowledge[fromChapter, toChapter)`,
  `CanonFact.validFromChapter/validUntilChapter`,
  `RelationshipStance[fromChapter, toChapter)`,
  `Antagonist[fromChapter, toChapter]` (inclusive). "As of story
  time N" = the set of rows whose window contains N.
- **Revision time** — the mutation history: `Revision.number` on
  the novel's main branch. "As of revision R" = the 009 as-of
  semantics (009 Invariant 7) applied to live reads of covered
  tables where the revision machinery records change sets.

Rules:
- A consumer query MUST name its clock (`asOfChapter` and/or
  `asOfRevisionId`); omitting both means "now" on both clocks.
- When a finding cites state, its evidence carries BOTH the
  story-time window (chapter(s)) and the revision-time pin
  (`sourceRevisionId`), so a later reader can tell whether the
  claim is about what was true in-story vs what was true in the
  record at R.
- Story time and revision time can disagree (a timeline slot
  authored at revision 50 describing in-story chapter 3). A
  contradiction between the two clocks is an `OPEN` finding
  (`CLOCK_CONTRADICTION`), never a silent reconciliation.
- Temporal-negative test: a health/review evaluation with
  `asOfRevisionId = R` MUST NOT cite any row, revision, or
  chapter version created at a revision newer than R.

### Invariant 4 — Hard refuses, soft advises; soft never forces plot (GAP-012)

Narrative policy evaluation follows the existing
`HARD_ANTAGONIST_PROBLEMS` precedent (refuse vs report), extended
to all three policy kinds and to final-text review:

- **Hardness levels** (existing `PolicyHardness` enum): `SOFT` =
  advisory, reported as findings; `HARD` = enforced, refuses the
  gated operation. HARD requires `hardReason` (existing CHECK +
  boundary rule in `narrative.ts`).
- **The gate** (enforcement point pinned — author decision at
  review, P1-2): `reviewFinalText` evaluates the immutable text
  of a `ChapterVersion` against the novel's validated policies.
  The enforcement point is **`manuscript.setStatus`** — any
  transition that moves a chapter OUT of `DRAFT` (to `IN_REVIEW`
  or `PUBLISHED`). It is NOT `runs.decideRun` (NF-WF-005's
  run-approve): 005's approval is about workflow-run continuation
  and carries no `chapterVersionId`, and gating it would entangle
  005's snapshot semantics. At `setStatus` time the accepted
  `ChapterVersion` exists (apply created it), so no run→version
  mapping is needed — the gate works on `chapter.currentVersionId`
  and the LATEST receipt for it:
  - No receipt for `(chapterId, currentVersionId)` → 409
    `REVIEW_STALE` (the version has not been reviewed).
  - Latest receipt is `FAIL` → 409 `HARD_POLICY_VIOLATION`,
    naming the failing rule and citing evidence.
  - Latest receipt is `PASS` but
    `receipt.chapterVersionId != chapter.currentVersionId` →
    409 `REVIEW_STALE` — the verdict is invalidated by the edit,
    per constitution §11.
  - Latest receipt `PASS` for `currentVersionId` → gate passes.
  - HARD violation → verdict `FAIL`, stored receipt.
  - SOFT observation → verdict `PASS` with `advisory` findings.
    The gate MUST NOT read advisory findings as a refusal.
  This IS an explicit product behavior change owned by 010: a
  chapter cannot leave `DRAFT` without a `PASS` final-text review
  receipt for its current version. The review route is
  synchronous and deterministic (policy checks are rule-based
  over stored policies and the version text — no model calls),
  so the author flow is: review → fix → review → setStatus.
- **"Soft preference never forces plot/drama"** is shape-enforced:
  the review's `advisory` items carry `{ rule, observation,
  evidence, suggestion }` where `suggestion` is variation-guidance
  (per the `RhythmFinding.suggestion` discipline — "Variation, not
  a ban") and the schema has NO instruction/plotting fields. The
  service MUST NOT emit imperatives ("add a scene", "must
  confront"); a test pins this against a fixture list of
  imperative patterns.
- **Revalidation** (folded into the setStatus gate above): the
  gate compares the chapter's `currentVersionId` with the latest
  receipt's `chapterVersionId`; a mismatch (the author edited
  after review) → 409 `REVIEW_STALE` — the verdict is invalidated
  by the edit, per constitution §11.

### Invariant 5 — Policy validation: malformed is refused on write, fail-open on read (GAP-012)

Building on `putPolicy`'s existing probe-on-write posture
(`narrative.ts` — DRAMA_GAP probed via `assessDramaWindow`,
COOLDOWN via `isValidCooldownPayload`, HARD requires reason):

- **All three kinds validated on write.** 010 ADDS the missing
  SCALE payload schema: `{ standing: { scale: NarrativeScale,
  access: NarrativeScale[], reputation: number } }` where every
  scale is a member of `NARRATIVE_SCALES` (pinned by the
  domain-package test), `access` is non-empty, `reputation` is an
  integer 0–100. Malformed → the write is refused with 409
  `MALFORMED_POLICY` via a new typed `PolicyError` (NOT the
  generic `ConflictError` path, which can only emit `CONFLICT` —
  see the error-envelope pinning below). The existing
  DRAMA_GAP/COOLDOWN refusals keep their `ConflictError`
  behavior (unchanged); only the new 010 refusals ride
  `PolicyError`.
- **DNA minimal shape.** `putDna`'s current check (non-null,
  non-array object) stands; 010 pins it as the whole of the
  write-time contract and records that the schema comment's
  claim — "Shape validated in packages/narrative-rhythm" — is
  NOT true (verified absent; see Backend verification). DNA
  remains advisory preferences; consumers read named fields
  defensively (missing field = "not configured", never an error).
- **Malformed on read = fail-open with an explicit finding.**
  Rows that reached the table unvalidated (SCALE stored before
  010; anything written outside `putPolicy`) MUST NOT read as
  configured: the check treats them as "no policy configured"
  and emits a `MALFORMED_POLICY` finding with status
  `UNRESOLVED` naming the row. This is the existing COOLDOWN
  posture ("a bad window reads as 'no cooldown configured'") made
  explicit and observable — never a silent pass, never a silent
  refusal.

### Invariant 6 — Unresolved causal/time identity is surfaced, never fabricated

Any identity the data cannot resolve is named, not guessed. The
`EvidenceFinding.status` value `UNRESOLVED` exists for exactly
this (distinct from `OPEN`, which has a remediation proposal):

- `UNRESOLVED_IDENTITY` findings name: what is unlinked (e.g.
  `timeline_event <id>` with null `story_event_id` crossed by a
  causal query; `character <id>` with null `story_entity_id`
  whose arc milestone references canon), what the consumer
  needed it for, and what would resolve it (an author-authored
  link — never an automatic one).
- The health status surface exposes a dedicated
  `unresolved: EvidenceFinding[]` list so the author sees the
  identity debt at a glance (this is the delivery-plan acceptance
  "surface unresolved causal/time identity issues").
- `UNRESOLVED` findings carry `remediation: null` — there is no
  machine proposal when the machine must not decide.

### Invariant 7 — Evidence findings: every check cites its sources

Every finding from 010's consumers conforms to the normative
schema (mirroring STORY-INTELLIGENCE.md's health finding):

```ts
interface EvidenceFinding {
  rule: string;              // e.g. "KNOWLEDGE_BOUNDARY_VIOLATION", "HARD_POLICY_VIOLATION",
                             // "TIMELINE_CONFLICT", "UNRESOLVED_IDENTITY", "MALFORMED_POLICY",
                             // "MEMORY_LIVE_DIVERGENCE", "CLOCK_CONTRADICTION"
  severity: "INFO" | "WARNING" | "CRITICAL";
  status: "OPEN" | "RESOLVED" | "UNRESOLVED";
  evidence: Array<{           // never a bare score or a bare claim
    kind: "fact" | "revision" | "chapterVersion" | "timelineEvent" | "storyEvent"
        | "character" | "stance" | "policy" | "span";
    id?: string; chapter?: number; order?: number; revisionId?: string;
    detail?: string;          // e.g. validity window "ch 5–12", gap size
  }>;
  affectedEntities: Array<{ type: "character" | "entity" | "event" | "thread" | "promise"; id: string }>;
  remediation: string | null; // a proposal; null when UNRESOLVED
  sourceRevisionId: string;   // the revision the evaluation ran against
  evaluatedAt: string;        // ISO timestamp
}
```

- A finding with empty `evidence` is invalid — the service MUST
  NOT emit it (mirrors the `RhythmFinding` discipline: "Every
  beat id and chapter of every match — never a bare score").
- Severity assignment is rule-local and documented per rule;
  no global severity model is invented here.
- Rejected proposals, superseded facts, and UNSUPPORTED items
  are invisible to consumers (008/009 discipline carries over).

### Invariant 8 — Authorization is enforced server-side

- Health evaluation, final-text review, and state assembly read
  story truth: they require `canon:read` (the existing
  convention of `characters.ts`, `narrative.ts`, `story.ts` —
  verified). There is no `novel:manage` capability
  (`authorization.ts` defines
  `novel:create/read/update/delete/archive`).
- Policy authoring (`putPolicy`, `putDna`) keeps its existing
  `canon:manage` gate (unchanged).
- `setStatus`'s capability gate is unchanged by 010 (existing
  `chapter:publish`/`chapter:update` selection in
  `manuscript.ts`); the new 409 `HARD_POLICY_VIOLATION` /
  `REVIEW_STALE` codes are returned inside the existing
  authorized command via the typed `PolicyError`.
- Tenant scope resolves from stored rows (404 for cross-tenant
  ids, never 403-disclosure — the ADR-0004 convention used by
  every existing service).

### Error envelope pinning (P1-1, author decision at review)

010 defines a typed **`PolicyError extends Error { code:
"MALFORMED_POLICY" | "HARD_POLICY_VIOLATION" | "REVIEW_STALE";
statusCode: 409 }`** following the NF-WF-008 `CanonApplicationError`
and NF-WF-009 `MemoryError` precedent. The platform error handler
maps `instanceof PolicyError` → `409 { error: error.code }`,
checked BEFORE the generic `ConflictError` branch (same position
as `CanonApplicationError`/`MemoryError`). The generic
`ConflictError` path stays `CONFLICT`-only and is NOT used for
these codes — this resolves the reviewer's finding that the
claimed `ConflictError` path could not emit the pinned codes.

400-vs-409 resolution: malformed policy on WRITE
(`putPolicy`/`putDna`) → 409 `MALFORMED_POLICY` via
`PolicyError`; malformed policy encountered on READ (evaluation
hits a stored policy that fails validation — e.g. a row written
before 010) → fail-open + an `UNRESOLVED` `MALFORMED_POLICY`
finding, NEVER an HTTP error. The final-text-review route does
not list `MALFORMED_POLICY` as an HTTP error.

### Invariant 9 — Simulations never feed these consumers

Canon is safe by 008's boundary; review/health consumers work
from canon tables and explicit `simulation: true` requests are
refused with 400 `SIMULATION_SOURCE_REFUSED` (the 009 Invariant 8
precedent), and no receipt is written. There is no
revision→simulation-run lineage to resolve in 010 — the narrowed
enforceable scope is the explicit-tag refusal; full lineage
remains the deferred follow-up (see 009 Invariant 8).
`simulation: true` requests.

### Invariant 10 — No scope creep at the consumer gate

The 010 endpoints do not start runs, edit drafts, approve text or
canon, manage outlines, or change the 003 compiler's selection
policy. They assemble, review, and evaluate — read paths with one
gated write (review receipts).

## Outputs

### Service API (primary)

```ts
// --- Consumer 1: assembly (extends context-compiler tier 4/6 inputs) ---
interface AssembledRow {
  id: string;
  source: "LIVE" | "MEMORY_FRESH";       // never MEMORY_STALE/MEMORY_FAILED
  sourceRevisionId: string | null;       // revision pin; null for live-only rows
  row: unknown;                          // the domain row (state/stance/timeline)
}

assembleCharacterState(novelId, { chapter, asOfRevisionId? }): Promise<{
  characterId: string; key: string; name: string;
  identity: { storyEntityId: string | null };   // null = UNLINKED (Invariant 2)
  currentState: { summary: string; fromChapter: number } | null;
  knowledge: Array<{ factId: string; stance: KnowledgeStance; window: [number, number | null] }>;
  arcs: Array<{ id: string; status: ArcStatus; milestones: number[] }>;
}[]>   // temporal read: windows containing `chapter` (story time)

assembleRelationships(novelId, { chapter }): Promise<{
  pairs: Array<{ fromCharacterId: string; toCharacterId: string;
                 stance: RelationshipStanceKind; window: [number, number | null] }>;
  bonds: BondView[];                     // existing shape from relationships.ts
}>

assembleTimeline(novelId, { asOfRevisionId? }): Promise<Array<{
  id: string; order: number; description: string;
  linkedEventId: string | null;          // raw story_event_id; null flagged, never inferred
  availableFromChapter: number | null;
}>>
// `asOfRevisionId` applies to LIVE reads via change sets (timeline
// entries are authored records, not canon derivations — 009 memory
// contributes nothing to tier 6 per Invariant 1); rows created at
// revisions newer than the as-of revision are excluded.

// --- Consumer 2: final-text review ---
interface ReviewAdvisory { rule: string; observation: string;
  evidence: EvidenceFinding["evidence"]; suggestion: string; }  // suggestion: variation-guidance only
interface ReviewVerdict {
  chapterVersionId: string; novelId: string;
  verdict: "PASS" | "FAIL";
  hardViolations: EvidenceFinding[];     // empty when PASS
  advisory: ReviewAdvisory[];            // SOFT policies; schema has no instruction fields
  evaluatedPolicies: Array<{ kind: NarrativePolicyKind; hardness: PolicyHardness; configured: boolean }>;
  sourceRevisionId: string;
}

reviewFinalText(novelId, { chapterVersionId }): Promise<ReviewVerdict>
// - evaluates the IMMUTABLE text artifact of the chapter version
// - HARD policies enforced via their domain rules
//   (DRAMA_GAP → assessDramaWindow with story beats; COOLDOWN → checkCooldown;
//    SCALE → assessScaleAppropriateness against the validated standing)
// - SOFT policies → advisory only (Invariant 4)
// - verdict stored as a FinalTextReview receipt (additive table)

// --- Consumer 3: health ---
evaluateHealth(novelId, { chapter?, asOfRevisionId? }): Promise<{
  findings: EvidenceFinding[];
  unresolved: EvidenceFinding[];        // status === "UNRESOLVED", surfaced separately
  sourceRevisionId: string;
}>
// implements the STORY-INTELLIGENCE.md categories: timeline conflict, stale
// major thread, neglected relationship, knowledge-boundary violation,
// repeated narrative pattern, impossible technology prerequisite,
// unresolved critical endgame condition — each as an evidence-backed rule
// BOUNDED (per the 003 budget discipline, 009 F7 precedent):
// `HEALTH_MAX_FINDINGS = 200`, stale-thread/neglected-relationship
// windows bounded to `HEALTH_HISTORY_CHAPTERS = 50`; per-rule caps
// named as constants.
```

### HTTP routes

| Method & path | Auth | Body/query | Success | Errors |
|---|---|---|---|---|
| `GET /api/workspaces/:workspaceId/novels/:novelId/story-health` | `canon:read` | query `chapter?: int`, `revisionId?: uuid` | 200 `{ findings, unresolved, sourceRevisionId }` | 401/403/404; 400 `INVALID_INPUT` / `SIMULATION_SOURCE_REFUSED` |
| `POST /api/workspaces/:workspaceId/novels/:novelId/chapters/:chapterId/final-text-review` | `canon:read` | `{ chapterVersionId: uuid }` — the version MUST belong to `chapterId`, else 400 `INVALID_INPUT` | 200 `ReviewVerdict` (+ receipt id) | 400 `INVALID_INPUT`; 401/403/404 (409 `REVIEW_STALE` only if review becomes async per Q3; not emitted under the synchronous default) |
| `GET /api/workspaces/:workspaceId/novels/:novelId/story-health/unresolved` | `canon:read` | — | 200 `{ unresolved: EvidenceFinding[] }` | 401/403/404 |

`manuscript.setStatus` (the gate pinned in Invariant 4 —
transitions out of `DRAFT`) additionally returns
409 `HARD_POLICY_VIOLATION` (with the failing rule + evidence) when
the latest receipt for the chapter's `currentVersionId` is `FAIL`,
and 409 `REVIEW_STALE` when no receipt exists for the current
version or the receipt's version mismatches. These codes ride the
existing `{error: CODE}` envelope via the typed `PolicyError`
(see the error-envelope pinning); the setStatus contract is
otherwise unchanged.

### Data model (new Prisma model(s); migration is a reviewed artifact)

- `FinalTextReview { id, workspaceId, novelId, chapterVersionId,
  revisionId, verdict: PASS|FAIL, hardViolations: Json,
  advisory: Json, evaluatedPolicies: Json, createdAt }`
  `@@unique([chapterVersionId])` — one receipt per immutable
  version; a re-review of the same version REPLACES the row
  (versions are immutable, so replacement is not a history loss).
  No new "link" tables — identity stays the existing nullable FKs
  (Invariant 2 / Forbidden).
- Migration follows the GAP-030 idempotent DO-block convention.
- Register the new table in the revision `TABLE_SCOPE` and
  `COVERED_TABLES` maps (GAP-035 lesson); receipts are
  projections-adjacent audit — restore covers them as rebuildable,
  not as truth.

## Acceptance and verification

Testable; API-level tests use the test driver (fake gateway, GAP-028).
Fault injection (not wall-clock) forces stale/failed paths.

- [ ] **Real state consumers.** `assembleCharacterState` returns a
  character's current state + knowledge window + arcs for a
  chapter, citing live rows; `assembleRelationships` returns
  directional stances + bonds; `assembleTimeline` returns ordered
  entries with `linkedEventId` flags. The compiler's tier 4/6
  blocks consume these with per-row provenance.
- [ ] **Memory-vs-live sourcing.** With a FRESH 009 projection,
  tier-4 rows cite `source: "MEMORY_FRESH"` corroboration;
  STALE/FAILED/MISSING → live-only with explicit `memory:
  {status}` note. A forced memory/live divergence surfaces
  `MEMORY_LIVE_DIVERGENCE` as OPEN — neither side silently
  corrected.
- [ ] **Null linkage contributes no ID.** A character with NULL
  `story_entity_id`: assembled state contains NO canon-entity
  facts; `identity.storyEntityId` is null; a canon join keyed on
  the character's name would have returned facts — the test
  asserts it does not. A timeline event with NULL
  `story_event_id`: causal traversal skips it; it still appears
  in order with `linkedEventId: null`.
- [ ] **Temporal knowledge.** "As of story time N" returns
  exactly the rows whose windows contain N (character state,
  knowledge, stances, fact validity); superseded-then facts
  appear only with their validity windows. "As of revision R"
  never cites a row/revision newer than R (temporal-negative —
  mechanism: `ChangeSetItem` CREATE lookup via
  `ChangeSet → Revision` pins each row's birth revision; rows
  whose birth revision number > R.number are excluded).
- [ ] **Clock contradiction.** A timeline slot authored at a
  revision whose in-story position conflicts with chapter
  numbering → `CLOCK_CONTRADICTION` OPEN finding with both pins.
- [ ] **Malformed policy.** A DRAMA_GAP/COOLDOWN/SCALE payload
  that fails validation → 409 `MALFORMED_POLICY` on write.
  A SCALE row written malformed before 010 → read treats it as
  unconfigured + an `UNRESOLVED` `MALFORMED_POLICY` finding
  naming the row (fail-open, never silent).
- [ ] **Hard-rule rejection.** A HARD policy violated by the
  chapter version → `reviewFinalText` verdict FAIL; the
  `setStatus` gate returns 409 `HARD_POLICY_VIOLATION` naming the
  rule with evidence. No receipt / FAIL receipt blocks the
  transition out of DRAFT.
- [ ] **Soft never forces.** Advisory items contain no plot
  instructions (pinned against the imperative-pattern fixture);
  a SOFT policy violation does NOT block setStatus (verdict PASS
  with advisory).
- [ ] **Changed-version invalidation.** Review chapter version V1
  (PASS), save V2, attempt setStatus out of DRAFT → 409
  `REVIEW_STALE`.
- [ ] **Knowledge-boundary violation.** A chapter version that
  has a character act on a fact whose knowledge row is absent or
  `UNKNOWN` for that character in the relevant window →
  `KNOWLEDGE_BOUNDARY_VIOLATION` finding with fact + knowledge
  evidence. (Detection is heuristic/bounded — the contract pins
  the finding shape and the negative test, not recall.)
- [ ] **Timeline conflict.** Two entries whose in-story positions
  overlap inconsistently → `TIMELINE_CONFLICT` finding with both
  entries' evidence.
- [ ] **Stale major thread.** A major thread with no canon touch
  for N chapters (bounded window, named constant) →
  `STALE_MAJOR_THREAD` finding.
- [ ] **Neglected relationship.** A relationship stance with no
  movement or mention across a bounded window →
  `NEGLECTED_RELATIONSHIP` finding (advisory/OPEN, never a
  refusal).
- [ ] **Repeated narrative pattern.** The same rhythm finding
  class firing across consecutive chapters →
  `REPEATED_NARRATIVE_PATTERN` finding.
- [ ] **Impossible technology prerequisite.** A canon fact
  requiring a technology/prerequisite the world state does not
  contain → `IMPOSSIBLE_PREREQUISITE` finding.
- [ ] **Unresolved critical endgame condition.** An endgame
  condition with no causal path from current state →
  `UNRESOLVED_ENDGAME` finding with `remediation: null`.
- [ ] **Unresolved identity surfaced.** A causal query crossing an
  unlinked timeline entry → `UNRESOLVED_IDENTITY` finding with
  `remediation: null`, listed under `/unresolved`.
- [ ] **Authorization.** Cross-novel ids → 404; a VIEWER calling
  `putPolicy` → 403 (existing `canon:manage` gate); health routes
  require `canon:read`.
- [ ] **No-regression.** Full API suite green; `pnpm lint`,
  typechecks, and `nuxt build` clean; existing character /
  narrative / story / compiler tests untouched and passing.

## Migration and rollback

- One additive Prisma migration: `FinalTextReview` (+ unique
  `(chapterVersionId)`), GAP-030 DO-block convention, reviewed
  artifact. No changes to existing tables; the SCALE payload
  validation is code, not schema.
- Rollback: drop the table. SAFE always — receipts are
  rebuildable audit; dropping loses no truth (a re-review
  regenerates any receipt).
- Register the new table in `TABLE_SCOPE`/`COVERED_TABLES` as
  part of the implementation.

## Documentation and handoff

- `docs/implementation/ISSUES-AND-GAPS.md`: new GAP entries for
  any deviation BEFORE workarounds (standing rule); GAP-011 and
  GAP-012 closure checks live here (see below).
- `docs/implementation/progress.md` + `docs/14-progress/CURRENT.md`
  + `docs/implementation/test-matrix.md`: NF-WF-010 section on
  completion.
- The contract file stays frozen after review; deviations get GAP
  numbers, not silent edits.
- GAP-011 closure requires: identity-join tests (null-linkage,
  no-name-match) + the `/unresolved` surface + temporal tests.
  GAP-012 closure requires: all-three-kinds validated on write,
  hard/soft enforcement tests, malformed-on-read fail-open test,
  final-text review wired to the setStatus gate, soft-never-forces test.
- Correct the `NarrativeDnaProfile.dna` schema comment ("Shape
  validated in packages/narrative-rhythm") — verified absent; the
  comment must state the real contract (minimal shape check in
  `putDna`; named fields read defensively).

## Open questions

1. **Health rule set for M2 — DECIDED at review (full seven).**
  The contract implements all seven STORY-INTELLIGENCE.md
  categories; the acceptance checklist pins a test per category.
  M2 ships the full set.
2. **Accept-gate strictness.** Should a HARD violation block
  setStatus unconditionally, or should an author with
  `canon:manage` be able to override with a recorded reason
  (the HARD policy already requires `hardReason` — should the
  override too)?
3. **Review compute cost — DECIDED at review (synchronous default
  for 010).** 010's policy checks are rule-based over stored
  policies and the version text (no model calls), so review is
  synchronous; `REVIEW_STALE` on the review route itself is not
  emitted under this default. An async (BullMQ) review worker is
  a follow-up if review latency proves problematic.
4. **Character-state write path.** Assembly is read-only here.
  Do character states/knowledge get an authoring write surface in
  010, or does 016 own all state authoring?
5. **SCALE standing source.** The SCALE payload holds the
  protagonist's standing. Should standing be author-maintained
  (payload) or derived from canon (e.g. reputation facts), and
  what happens when the two disagree?

## Review record

(Reviewer: separate contract-reviewer actor, Muse Spark model family,
backend MODEL_UNVERIFIED per GAP-013. Contract reviewed against HEAD
`1d0a718`. The reviewer made no inline edits; all fixes applied by
the coordinator in a post-review revision pass.)

- **Verdict: CHANGES_REQUESTED** — 2 P1 (both fixed below), 2 P2,
  8 P3.
- **P1-1 — Pinned 409 machine codes unimplementable via the claimed
  path; 400/409 contradiction.** `ConflictError` maps to
  `409 {error: "CONFLICT"}` — it cannot emit `MALFORMED_POLICY`;
  the route table pinned 400 and 409 for the same event. **Fixed:**
  typed `PolicyError { code: MALFORMED_POLICY |
  HARD_POLICY_VIOLATION | REVIEW_STALE; statusCode: 409 }` mapped
  before the generic `ConflictError` branch (CanonApplicationError/
  MemoryError precedent); 400-vs-409 resolved (write → 409,
  read → fail-open + UNRESOLVED finding); route table corrected.
- **P1-2 — Accept-flow gate not specified to an implementable
  level; deadlock reading.** The only server-side accept
  (`runs.decideRun`) carries no `chapterVersionId`, and at approve
  time the ChapterVersion does not exist. **Fixed (author
  decision):** the gate is pinned at `manuscript.setStatus` —
  any transition out of `DRAFT`; works on `chapter.currentVersionId`
  vs the latest receipt (no run→version mapping needed); NOT
  `runs.decideRun` (005's snapshot semantics untouched). Explicit
  product behavior change owned by 010: chapters cannot leave
  DRAFT without a PASS receipt for the current version.
- **P2-1 — Q1 not genuinely open.** **Fixed:** M2 = full seven
  health categories; acceptance checkboxes added for the five
  previously untested categories.
- **P2-2 — Invariant 9 reintroduced the unenforceable lineage
  promise.** **Fixed:** narrowed to the explicit-`simulation: true`
  refusal; full lineage stays the deferred follow-up.
- **P3 (8 observations, all addressed):** line-ref drift noted;
  `assembleTimeline`'s `asOfRevisionId` pinned to live reads via
  change sets; chapterId/chapterVersionId consistency pinned
  (400); REVIEW_STALE-on-review-route scoped to async-only;
  `HEALTH_MAX_FINDINGS`/`HEALTH_HISTORY_CHAPTERS` bounds added;
  temporal-negative mechanism named (ChangeSetItem CREATE
  lookup); "corroboration" defined as triple-match with
  `MEMORY_LIVE_DIVERGENCE` on mismatch; `isChronological`
  resolved (`story-intelligence/events.ts:259`).
- **Backend verification (reviewer, independent):** all author
  claims confirmed with file:line (capabilities, FKs + backfill,
  half-open windows, StoryEntity/CanonFact, events/timeline,
  CausalEdge, policy kinds/hardness, putPolicy posture, tenant
  gate, rhythm evidence, compiler tiers, 009 exports, TABLE_SCOPE
  projections, chapter status machine). Author's DNA-comment claim
  CONFIRMED TRUE (the "Shape validated in
  packages/narrative-rhythm" comment is false — comment
  correction stays in the contract). No invented fields or
  migrations found.
- **Q2, Q4, Q5 remain genuinely open** (HARD-override, state write
  surface, SCALE standing source). **Q1 decided** (full seven),
  **Q3 decided** (synchronous default for 010; async is a
  follow-up).
- **Status after review:** contract DRAFT-frozen with findings
  applied; implementation may proceed. Reviewed 2026-10-05.
  are listed below in "Backend verification (contract author)";
  the reviewer must independently re-verify normative claims
  against source before APPROVE.

## Backend verification (contract author)

Every normative claim above was checked against source on
2026-10-05 (HEAD `1d0a718`). Claims I could not verify are marked
UNVERIFIED.

- Capability vocabulary: `packages/auth/authorization.ts:17-21`
  (`novel:create/read/update/delete/archive`), `:38-45`
  (`canon:read/manage/approve`), `:53-54`
  (`revision:read/manage`). **No `novel:manage` exists.**
- `Character.storyEntityId` nullable FK + exact-key backfill
  semantics: `packages/database/prisma/schema.prisma:2002-2040`
  (comments: "stays NULL ... never on a name match"; partial
  unique index in migration, NOT `@@unique`).
- `CharacterState` half-open windows: `schema.prisma:2035-2053`;
  `CharacterKnowledge` stance/source/windows + RESTRICT:
  `schema.prisma:2054-2076`; `CharacterArc`/`Milestone`:
  `schema.prisma:2077-2130`; `RelationshipStance` directional +
  windows: `schema.prisma:2131-2148`.
- `StoryEntity` key contract: `schema.prisma:1209-1238`;
  `CanonFact` append-only + validity windows + availableFromChapter:
  `schema.prisma:1250-1330`.
- `StoryEvent` (chapterId RESTRICT): `schema.prisma:1722-1760`;
  `TimelineEvent` nullable `story_event_id` "Authored, never
  derived": `schema.prisma:1761-1803`; `CausalEdge`:
  `schema.prisma:1889-1912`.
- `NarrativePolicy` (kind/hardness/hardReason CHECK/payload):
  `schema.prisma:2337-2354`; `NarrativePolicyKind`
  `{DRAMA_GAP, COOLDOWN, SCALE}` + `PolicyHardness`
  `{SOFT, HARD}`: `schema.prisma:2256-2272`.
- `putPolicy` validation posture: `apps/api/src/services/narrative.ts:347-398`
  (HARD requires reason → ConflictError; DRAMA_GAP probed via
  `assessDramaWindow`; COOLDOWN via `isValidCooldownPayload`;
  SCALE stored unvalidated — file comment).
- `HARD_ANTAGONIST_PROBLEMS` + splitFindings (refuse vs report):
  `narrative.ts:183-188`, `:249-256`.
- Tenant gate (membership + novel → NotFoundError, 404):
  `narrative.ts:199-218`; cross-tenant → 404 convention:
  `apps/api/src/character-routes.ts` header comment.
- `RhythmFinding` evidence-backed (beat ids + chapters):
  `packages/narrative-rhythm/rhythm.ts:374-383`;
  `assessDramaWindow` returns observation + guidance, never an
  instruction: `rhythm.ts:102-160`;
  `DramaWindowProblem = "MALFORMED_POLICY"`: `rhythm.ts:67`.
- Story Health finding shape + categories:
  `docs/03-domain/STORY-INTELLIGENCE.md:60-78`.
- `NARRATIVE_SCALES` + rank (SCALE validation basis):
  `packages/narrative-rhythm/vocabulary.ts:103-118`;
  `assessScaleAppropriateness`: `packages/narrative-rhythm/scale.ts`.
- Compiler tiers 1–10 (4 STATES, 6 TIMELINE, 9 DNA):
  `apps/api/src/services/context-compiler.ts:66-75`;
  tier 4/6 live-table assembly: `:740-783`.
- 009 memory exports: `packages/memory/src/index.ts`
  (constants/settle/freshness/rebuild); `recallNovel`:
  `apps/api/src/services/memory.ts:151`.
- `TABLE_SCOPE` covers characters/story_events/timeline_events/
  character_*/narrative_policies/narrative_dna_profiles/relationship_stances:
  `apps/api/src/services/revisions.ts:185-216`; projections
  ("character", "narrative", "story_intelligence"):
  `packages/story-versioning/impact.ts:155-172`.
- `Chapter.number` unique per novel; `ChapterStatus`
  DRAFT/IN_REVIEW/PUBLISHED: `schema.prisma:247-270`.
- 009 simulation refusal precedent (400
  `SIMULATION_SOURCE_REFUSED`): 009 contract Invariant 8.
- GAP-028 (fake gateway/test driver), GAP-030 (DO-block),
  GAP-035 (COVERED_TABLES) conventions: from prior tasks.

UNVERIFIED / does not exist (010 defines these as new):
- No final-text review service, module, or route exists
  (searched `apps/api/src/services/`, `manuscript.ts`).
- No story-health model, table, or beats table exists.
- `NarrativeDnaProfile.dna` "Shape validated in
  packages/narrative-rhythm" — the schema comment's claim is
  FALSE (no DNA validation exists in that package; `putDna`
  checks only non-null non-array object:
  `apps/api/src/services/narrative.ts:292-322`).
- `TimelineEvent.order` semantics beyond the unique index and
  `isChronological` (`packages/story-intelligence/events.ts:259`,
  resolved at review).
- (Resolved at review: the enforcement point is
  `manuscript.setStatus` out of `DRAFT`, pinned in Invariant 4 —
  NOT `runs.decideRun`.)
