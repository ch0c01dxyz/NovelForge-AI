# Decision Log

## Runtime-neutral assignments and project-wide English — 2026-10-05

Author instruction: remove the previous named coding-model pairing from active
work context; the author will select another model. Use runtime-selected models
and separate implementer/reviewer actors, including the same model in separate
actors when appropriate. Requested aliases, serving-backend identity and actor
independence are separate evidence. Historical model attributions are preserved,
not silently relabeled; host settings/model routes were not modified.

Author instruction: all new/revised project-owned content and workflows are in
English, independent of model/provider. Apply this to prompts, generated project
content, documentation, code identifiers/comments, tests/fixtures,
handoffs and commit/PR text. Preserve verbatim source input and historical
provenance; record any explicit scoped author override. Conversation language
does not alter the project default. AGENTS.md and CLAUDE.md were changed together.

Author follow-up: UI text must support English and Bahasa Indonesia. This is an
explicit scoped bilingual exception: use locale keys/resources (`en`, `id`),
selected-locale behavior and English missing-key fallback. Keys/machine codes
remain English; translations/localization fixtures may be bilingual. Do not
silently translate story data. Implementation and both-locale/fallback tests
belong to the author/reader UI contracts, not this documentation repair.

Workflow audit identified GAP-026 in the still-PLANNED NF-WF-003 contract.
Repaired composition/test/doc scope, bounded internal readers, cast grouping,
empty/applicability states, source-head race handling and review identity text.
The issue register owns prioritized remedies for all currently unresolved gaps;
plans do not close runtime issues. Earlier CREATE INDEX idempotency assurance
is superseded by inspected transactional recovery/schema verification, without
editing any applied migration or touching live data. Separate full contract
approval remains required before dispatch; this documentation audit is not
NF-WF-003 implementation or a platform acceptance receipt.

## Model availability update — 2026-10-03

The author reports only `deepseek-v4.1-flash` active; `glm-5.3-flash` is
currently inactive. This supersedes the availability assumption in the earlier
owner assignment, not the separate-review requirement. Continue current-session
002D implementation and checks under the playbook's single-model continuation
rule. At submission, record REVIEW_PENDING until a separate reviewer actually
reviews the exact artifact. 002F and parent acceptance remain gated. No review
waiver, substitute dispatch or verified backend identity is claimed.

## Task contract corrections and acceptance owner — 2026-10-03

The author requested task analysis and workflow improvements and supplied
the waiting DeepSeek response. Execution owner is the current DeepSeek-selected
Claude session; one separate GLM reviewer is requested at submission. This
resolves the owner question without another implementation worker or permission
gate. Configured aliases and historical saves do not prove backend identity.
Preserve the
recorded HIGH-route/body/tri-state decision for 002D. Clarify its exact scope
for typed metadata at existing revision mismatch throw sites, authorized
proposal-to-novel resolution, empty-body compatibility and forced-race checks.
No head-CAS comparison or snapshot-ordering change is authorized here.

The earlier claim that locked rejection implies partially committed state is
withdrawn: all work in the rejecting transaction rolls back. Its advisory
pre-check still remains the chosen optimization. The rollback 400 claim was
unsupported by the non-strict route schemas; verify older behavior and disclose
loss of optional protection. Choosing HIGH routes does not mean a LOW head
assertion is inherently impossible: the existing chapter CAS remains unchanged
as the accepted compatibility choice, not because a pre-write head assertion
would be self-contradictory. Inventory coverage requires inspection/tests;
impactFor alone does not automatically modify HTTP schemas. The earlier
If-Match impossibility rationale is also narrowed: no equivalent tri-state
encoding is defined for that interface here, so the accepted body schema is
reused; universal inability is not claimed.

Add bounded 002F to own integrated foundation acceptance after reviewed D.
Revisit 002E at NF-WF-004 consumer design, keeping pending intent history intact
on rollback. This is task-scope/evidence clarification, not a new outbox design,
author waiver, runtime repair or closure of the remaining product capability.
The amended D artifact no longer has the earlier review hash: preserve that
receipt as historical and review affected changes at the next submission.


## NF-WF-002D mutation head expectation — 2026-10-03

Author decision, taken before dispatch because the task contract forbids
dispatch without it. GAP-022: no C3 mutation route accepts a client head
expectation, so C4's optimistic-concurrency guarantee is unreachable for
callers. This decides the request surface only; it does not itself implement
or claim any runtime behaviour.

**Outcome (2026-10-04).** Implemented 2026-10-03 and independently reviewed
2026-10-04: APPROVE on the production diff. The review found one MAJOR
test-fidelity defect (the locked-CAS probe's `waitForBlocked` matched any lock
waiter in the test database, not the request's), fixed by pinning the match to
the parking backend's pid via `pg_blocking_pids`. The decision below was not
reopened. Reviewer backend MODEL_UNVERIFIED (GAP-013).

**1. Which routes carry the expectation — the HIGH operations only, and the
set is derived, not curated.** The four routes that gain it are
`proposal.approve`, `outlineVersion.approve`, `outline.supersede` and
`chapters.import`. `restore.apply` and `checkpoint.create` already carry the
expectation and are unchanged. The set is computed from
`impactFor(operation) === "HIGH"` (`packages/story-versioning/impact.ts`), not
hand-listed, so it cannot drift from C3's own classification and a future HIGH
operation inherits the assertion without a second decision.

The criterion is not arbitrary: C3 calls an operation HIGH because its blast
radius spans multiple records, and that is exactly the property that makes a
stale-head apply dangerous — the payload encodes a decision *derived from a
read of the branch*, so it is wrong once the branch moved. Rejected: *all C3
mutations* — on a single-record write the assertion is not merely useless but
**harmful**, because "the head moved" says nothing about whether that one row's
write is still valid; a head assertion there refuses legitimate writes and
manufactures spurious 409s. `chapter.save` is the clearest case: the save *is*
the head move, so asserting the head against it is self-contradictory, and two
saves on different chapters would refuse the second for no reason. *plan-shaped
payloads only* — a hand-kept list that re-litigates itself every time a route is
added, and it draws a line the contract does not draw.

**2. Request shape — a body field, exactly the frozen tri-state.**
`expectedHeadRevisionId: uuid.nullable().optional()` in the JSON body,
identical to `revision-routes.ts:34` and `STORY-VERSIONING.md` §C12.1:
`undefined` asserts nothing, `null` asserts "no head exists yet", a uuid
compares. Rejected: *`If-Match` header* — HTTP-native but cannot spell the
`null` state, so it would silently break the tri-state the contract froze;
*both* — two code paths and two test sets for one assertion.

**3. Client recovery — re-read and abandon; the 409 body carries the head.**
This is what C4 already states ("the caller re-reads rather than silently
retrying"). It requires a scoped change outside the routes: `ConflictError`
(`services/platform.ts:26`) and the app-wide handler
(`platform-routes.ts:79`) currently emit a bare `{ error: "CONFLICT" }` and
drop the message, so the current head id cannot reach the client. The 409 body
gains `currentHeadRevisionId`. Rejected: *auto-retry* — a silent retry applies
a plan built on a stale head, which is the exact harm the expectation exists
to prevent; *merge UI* — no revision UI exists anywhere, and a front-end
deliverable does not belong in an API task.

**4. Compatibility — coexist; `chapter.save` stays out.**
`expectedVersion` guards one chapter's prose; the head expectation guards a
novel-wide plan. Different scopes with different correct answers, so neither
subsumes the other, and no existing `chapter.save` caller changes. Rejected:
*head subsumes chapter CAS* — an unrelated canon mutation would then block a
prose edit; *chapter CAS subsumes head* — leaves GAP-022 open on the chapter
path and misstates the scope of a per-chapter version.

The two-part mechanism in `applyRestore` is adopted whole, not half: the
unlocked pre-check before any write (cheap, useful 409, no partial work) **and**
the locked CAS inside `advanceHead` under `SELECT … FOR UPDATE` (authoritative).
A design with only the first is racy; only the second returns 409 after doing
partial work.

**Implementation receipt — 2026-10-03.** All four decisions are implemented as
recorded, no scope added: the four HIGH routes carry the field, the 409 body
gains `currentHeadRevisionId`, both halves of the mechanism are in place per
route, and `chapter.save`'s `expectedVersion` is untouched. Checks at this
boundary: targeted 145/145, story-versioning 17/17, full API 365/365, root
`pnpm test` 823 passed | 1 skipped, lint and typecheck clean. The locked CAS
was proven load-bearing by a falsified probe (a pre-check-only build returns
`201 {"created":1}`). GAP-022 is closed for implementation; the separate review
is **pending** and no runtime acceptance is claimed beyond the checks listed.

## NF-WF-002 bounded follow-up scope — 2026-10-02

The author requested Markdown changes for another DeepSeek/GLM model to
execute. NF-WF-002A explicitly permits fixture setup/cleanup changes in the
ten named existing API suites, preserving the reviewed C8 creation boundary,
production code and negative tests. NF-WF-002B follows passing fixture evidence
and review to clarify GAP-019 and review the integrated foundation. This is
an execution-scope amendment, not a new recovery architecture or approval of
current implementation choices. No runtime fix or gate success is implied.

Issues remain in ISSUES-AND-GAPS; earlier unanswered dispatch receipts remain
historical. Source inventory corrects the reported 13 helpers to 12 valid
fixture sites plus one intentional negative fixture. The current session
lacks runtime memory attribution (GAP-021); progress carries the fallback.


## Engram context checkpoints — 2026-10-01

The author requested mandatory Engram MCP working-context persistence because
the agent harness is frequently cleared. Use bounded task/worktree/role
checkpoints, proactive saves, a session summary before planned resets, and
scoped recovery verified against current Git/files. Memory is a continuation
aid, not canon, approval or fresh test evidence. Tool failure must be reported
and captured in the single issue register with a fallback handoff in existing
task/progress records. This is an execution convention, not a change to the
product's story-memory architecture or installation of a harness hook.

## Workflow delivery repair — 2026-09-30

The author approved applying the comparison recommendations and required
English documentation, explicit hallucination/evidence rules, correct phase
dependencies and one technical gap register. Accepted
[ADR-0013](../adr/ADR-0013-workflow-delivery-and-recovery-foundation.md)
pulls minimum revisions/checkpoints ahead of integrated mutation/memory and
advanced simulation. Phase numbering stays stable; delivery milestones own
execution order. DeepSeek v4.1 Flash and GLM 5.3 Flash are requested coding
implementer/reviewer identities, subject to runtime verification, not product
model constants or capability claims. No runtime completion follows from
this documentation decision.

All live problems/confusion/gaps are recorded in
[ISSUES-AND-GAPS](ISSUES-AND-GAPS.md); all consequential claims follow
[MODEL-EVIDENCE-POLICY](../06-ai/MODEL-EVIDENCE-POLICY.md).

> Quick log of significant architectural decisions. The full record —
> Context/Decision/Alternatives/Consequences — lives in the ADR files.

Canonical index: [docs/13-decisions/ADR-INDEX.md](../13-decisions/ADR-INDEX.md).
ADR files live in `docs/adr/`; new ADRs start from
[docs/adr/ADR-TEMPLATE.md](../adr/ADR-TEMPLATE.md) and follow the
numbering rule recorded in the index.

Pre-implementation baseline decisions (V2 handoff pack) are recorded as
ADR-001..ADR-012 in the index. Implementation-phase decisions are
recorded as ADR-NNNN files:

| ADR | Decision | Status |
| --- | -------- | ------ |
| [ADR-0001](../adr/ADR-0001-module-boundaries.md) | Module boundary conventions; `@novelforge/contracts` holds the typed boundary map and domain event names | Accepted |
| [ADR-0006](../adr/ADR-0006-agent-skill-workflow-platform.md) | Agent/skill/workflow platform: append-only versioned definitions, scoped catalog, fail-closed contracts, validated graphs, one AI path, structural determinism | Accepted |
| [ADR-0007](../adr/ADR-0007-knowledge-retrieval.md) | Knowledge & retrieval: append-only reference versions, citable chunk spans, exact vector search (no ANN index — Prisma 7 cannot declare one without permanent drift), RRF fusion over two legs, tenant+spoiler predicates in SQL, one audit row per search, embeddings through the Phase 3 AI path | Accepted |
| [ADR-0008](../adr/ADR-0008-canon-authority.md) | Canon authority & candidate pipeline: append-only `canon_facts` with a self-FK supersede chain; live-uniqueness enforced by a status-anchored partial unique index; four-statement supersede order; proposals as a status column with conflict as a flag; basis from evidence, never a proposer-authored claim kind; workspace-scoped canon capabilities | Accepted |

## Phase 6 (Story Intelligence Core)

- **2026-09-25 — Slice 1 scope.** Phase 6 ships canon + candidate canon +
  a deterministic Story Brain (FACT/STATE/RETRIEVAL). `story_events`,
  `causal_edges`, `story_threads`, `story_promises`, `timeline_events`,
  hierarchical-memory tables, LLM extraction and free-text dispatch are
  **slice 2/3**. The roadmap names eight concepts but gates the phase on
  one sentence ("Story Brain can answer core factual/continuity questions
  with evidence"), and that sentence is reachable without them. Recorded
  as a decision, not an oversight.
- **2026-09-25 — Continuity-proper is deferred.** Slice 1 answers factual
  questions and prose recall; `EVENT`/`CAUSAL`/`UNRESOLVED`/`PROMISES`
  return an explicit not-implemented marker. The roadmap's word
  "continuity" maps to exactly those deferred forms, so slice 1 narrows
  the gate sentence deliberately. See ADR-0008.
- **2026-09-25 — Chapter prose search deferred.** Chapters are not
  searchable (no tsvector, no chapter chunks) and slice 1 does not add
  it: nothing in slice 1 *queries* prose. Evidence for a canon fact
  resolves from a stored `(chapter_version_id, start, end)` span against
  an immutable version, which needs no index. Search is how an actor
  *finds* a span, and slice 1 has no search UI, no NL dispatch and no
  extraction. Add the tsvector + chapter retrieval leg with the first
  real consumer.
- **2026-09-25 — `domain_outbox` not built.** The blueprint names it; no
  producer exists repo-wide. Emitting without a durable outbox drops
  events on crash, so the intent is recorded here until a consumer lands.
- **2026-09-25 — RETRACT is not a one-way trap.** The live-uniqueness
  index is anchored on `status = 'ACTIVE'` rather than
  `superseded_by_id IS NULL`, so retracting a fact frees its slot and the
  same claim can be re-asserted. Verified against PostgreSQL. (Round 2: the
  state now has a writer — `retractFact` — and a test that pins the
  slot-freeing behaviour; before that the justification was untestable.)
- **2026-09-25 — Evidence FKs are RESTRICT, not CASCADE.** A citation is the
  only place a fact's span is stored, and `deleteChapter` hard-deletes
  non-PUBLISHED chapters, so CASCADE let a routine draft deletion strip a
  live fact's evidence silently. Deleting a cited chapter now fails loudly
  until the author unlinks it. The fact-owning FK stays CASCADE: losing the
  fact should take its citations with it.
- **2026-09-26 — A RESTRICT with no unlink path is not a fix.** The round above
  made the failure loud but left it unescapable: `deleteChapter` had no
  try/catch, so the FK violation was an unmapped 500, and the unlink route the
  migration comment promised did not exist. Refusing an operation is only
  correct if the caller can act on the refusal. Both halves now ship together
  — a mapped 409 naming the cause, and
  `DELETE .../canon/facts/:factId/sources/:sourceId` to release it.
- **2026-09-26 — A migration that has been committed is immutable.** The
  evidence-FK hardening (both `canon_fact_sources` version FKs to `RESTRICT`,
  plus the missing `canon_proposals.object_entity_id` FK and its index) was
  first written as edits in place to `20260929_phase6_story_intelligence`.
  That is safe only while unreleased. Prisma records a migration by CHECKSUM,
  so editing one that has run anywhere makes every deployed database disagree
  with the repository and `migrate deploy` refuses to proceed — the failure
  appears on someone else's machine, at deploy time, pointing at a migration
  they never touched. The changes now live in
  `20260930_phase6_evidence_fk_hardening`, which restores the Phase 6
  migration to its committed bytes and leaves an already-edited database only
  one migration behind — a normal deploy rather than a baseline reset. It is
  NOT re-runnable: replaying the file against a hardened database fails on
  `CREATE INDEX` (duplicate index), measured rather than assumed. The end
  state is the same however the change arrived; the file itself cannot be run
  twice. The statements were generated with `prisma migrate diff` rather than
  written by hand, so the drift check is the proof of agreement rather than a
  hope.
- **2026-09-26 — Supersede respects an authored validity window.** `closeAt`
  was computed only from the two start chapters, so superseding `black [1,9)`
  with a ch-20 claim rewrote it to `[1,20)` — filling a gap the author left
  and changing what held at chapters 10..19. A later claim may close an OPEN
  end; it may not re-date a bound the author set. (Round 2: the authored end
  caps the window from above, but the correction caps it too. A replacement
  starting INSIDE the span — ch 5 against `black [1,9)` — closed at 9 left
  the old row claiming black held at 5..8 while the ACTIVE row answered
  white there. So the close point is the earlier of the authored end and
  the start-derived close: a correction may SHORTEN an authored window,
  never lengthen one. `min` cannot dip below the old start — both operands
  are >= it — so the window-ordered CHECK keeps holding.)
- **2026-09-26 — A record of a fix is not a fix.** Round 4's progress entry
  asserted three fixes that had no diff, no test and no migration — a
  fabricated record, written in the same commit as the honest ones and
  carrying the same confidence. Two were real defects and are now actually
  fixed: an emptied window was still offered by `notYetTrue`, the approve
  transaction's `P2002` was mapped without checking which constraint fired,
  and the list routes are still unbounded, now recorded as open rather than
  claimed fixed. The rule this round ran on: every claimed fix names the
  test that fails without it.
- **2026-09-26 — The supersede is a compare-and-set, like its siblings.**
  `retractFact` and the proposal decision already predicate their writes on
  the status they read; the supersede's first statement did not. A retract
  committing RETRACTED between `priorLive`'s read and the write was then
  silently reversed to SUPERSEDED and left linked to the successor that
  replaced it — ADR-0008 §1's forbidden state, and a withdrawn value that
  every as-of query past the correction chapter kept answering. `updateMany`
  on `status: "ACTIVE"` with a zero-count throw, so the decision commits
  with its supersede or neither does.
- **2026-09-26 — `supersededById` is absent for a reader, not null.** The
  id names the replacement, and the replacement may sit behind a boundary
  the reader has not reached; an id is enough to confirm a future fact
  exists. That is the same existence oracle `withheldCount` and the FACT
  path's redaction already refuse, so the reader select omits the column and
  the field is optional in `FactListResult` — the shape `sources` already
  uses for exactly this reason.
- **2026-09-26 — Evidence spans are not shown to readers at all.** Neither
  `ChapterVersion` nor `ReferenceVersion` carries a spoiler boundary, so a
  source's `quote` cannot be classified from the row that references it. The
  reader-facing list omits `sources` entirely rather than gating text it
  cannot classify; the writer's visible row boundary is not a proxy for the
  quoted text's. `withheldCount` is likewise 0 for readers — it is an
  existence oracle, and the author-only drift signal it exists for does not
  need a reader to see it.

- **2026-09-25 — The approval gate re-classifies against current canon.**
  `proposeCandidate` classifies against the live fact *at propose time*, but
  competing proposals for one subject are legitimate and a live fact can
  appear between propose and approve. Without a re-check at the decision
  point, approving a now-identical claim supersedes a fact with a copy of
  itself — a phantom correction that shifts every as-of answer. Caught at
  approve, not by a second partial unique index on `canon_proposals`, which
  would have wrongly forbidden proposing alternatives.
- **2026-09-25 — Probed, not assumed.** The supersede order and the
  index's enforcement were proven against a real PostgreSQL database
  before the migration was written: both two-statement orders fail
  (`23503` / `23505`), the four-statement order commits with correct
  final rows, and a duplicate `ACTIVE` insert is refused.
- **2026-09-25 — A green first pass is not coverage.** Round 2's ten defects
  were all in code the first pass had tests for — the tests covered the
  primary path and missed the second path onto the same data (list and STATE
  vs FACT; optional `validFromChapter` vs supplied). The durable lesson is
  the refutation step, not the finder step: of eight findings that read as
  serious, two were wrong on the code and saying so prevented two bad
  "fixes".
- **2026-09-26 — Phase 5 audit fixes, each proven by a failing test.**
  Publish's status flip is a compare-and-set on `currentVersionId` (a
  version append racing the chunk count left an ACTIVE reference on a
  chunkless version, invisible to search). Ingest retries exactly the
  embeddings-FK violation a concurrent re-ingest produces (P2003/P2010/
  23503 — the driver adapter wraps the raw code) and re-reads chunk ids
  once. The skip guard's model resolution mirrors the router's candidate
  set and refuses to skip when two enabled models could both win the route.
  Provider faults (bad vector count/dimension/finiteness) surface as 502
  `BadGatewayError`, not 409. The SSE route wires the raw socket's close to
  an AbortController forwarded through the gateway (proven against a real
  socket — light-my-request cannot simulate a mid-stream disconnect). Fuse
  rejects an array `lists` and non-array legs as `FUSE_BAD_LISTS` instead of
  silently fusing empty or throwing on `forEach`. The mode/readerChapter
  rule is one shared `checkModePair` instead of two divergent copies. Body
  limits cover the bytes-vs-characters gap (CJK 3x) so the advertised
  character caps are reachable: references 24MB, manuscript save 3MB,
  import 15MB.

When a decision is made without a full ADR being warranted, record one
line here with date and rationale, and promote it to an ADR if it later
proves load-bearing.

## AI Orchestrator milestone (2026-10-03)

- **The orchestrator composes; it does not re-implement.** Definition
  resolution moved to a shared `services/definition-resolution.ts`
  consumed by both the workflow executor and the orchestrator, because
  two resolution implementations that drift would let a workflow run and
  a direct generation disagree about which agent version executed — a
  silent provenance divergence, which is exactly the class of bug the
  versioning rules exist to prevent.
- **Context is compiled with provenance, under a budget.** Facts and
  reference excerpts are injected as `- [fact:<id>] <predicate>:
  <statement>` and `[n] <title> (chars a-b)`, and the ids used are
  persisted to `Generation.contextSnapshot`. A generation can therefore
  be explained after the fact from what it actually saw, not
  reconstructed from what the retriever would return today. The hard
  budget (6 000 chars per block) is what keeps a 2 000-chapter novel from
  being silently sampled into a prompt.
- **Mode is fixed to AUTHOR.** The caller holds a workspace capability,
  so every caller is an author-side actor. Reader-facing generation needs
  its own validated contract (a reader must not be able to ask for
  future chapters), not a `mode` passthrough on this route.
- **A streamed response cannot be contract-validated after the fact.**
  Fail-closed validation is meaningless once the bytes have left, so a
  contracted agent is refused up front on the streaming route rather than
  streamed and then rejected.
- **Retrieved text is data, never system authority.** The `system` turn
  holds only instructions — the agent's and its granted skills'. Canon
  facts and reference excerpts are injected in the `user` turn inside a
  `<context>` fence. This is the documented posture (`SECURITY.md`:
  "references are data, not system authority") and the one the workflow
  executor already implemented; the orchestrator initially concatenated
  reference text into the system message, where a reference containing
  "## Established canon" or a directive was indistinguishable from the
  orchestrator's own instructions. The fence names the block as quoted
  material, so an instruction inside a reference reads as text the model
  was shown, not text the orchestrator endorsed.
- **A validated contract is a value, not just a gate.** `generate`
  returns the object `enforceContract` approved as `output`, and a prose
  agent returns no `output` key at all. Discarding the validated value
  and handing the caller the raw model string would make the contract a
  gate that every consumer then re-opens with its own parser —
  `AI-ORCHESTRATION.md` orders the lifecycle "schema validate" → "extract
  candidate changes", so the validated value IS the handoff to the next
  step. Caught in adversarial verification.
- **A refusal must not leave a success in the ledger.** Output rejected
  by the contract check settles the `Generation` row `FAILED` /
  `DETERMINISTIC`. Caught in adversarial verification: the transport had
  succeeded, so the row read `SUCCEEDED` while the caller received a 409 —
  the ledger claimed a generation that produced no usable result. The
  workflow executor already marked its run FAILED on the same rejection;
  this was the sibling path that did not.
- **Roadmap numbering is the authority for phase names.** The milestone
  was labelled "Phase 8" in `CURRENT.md`, but the roadmap's Phase 8 is
  Character & Relationship Intelligence. The work is scheduled across
  roadmap Phase 3 (AI infrastructure) and Phase 4 (agent/skill/workflow
  platform). `CURRENT.md` now calls it a milestone and the roadmap
  carries the precedence rule, so the two documents cannot drift into
  disagreement (CLAUDE.md Rule 3).

## Real 9Router deployment (2026-09-30)

- **The gateway adapter parses provider JSON; nothing downstream may.**
  9Router returns `capabilities` as an object, not the `string[]` the
  interface declared, and the cast at the `res.json()` boundary made the
  type a lie that the compiler could not catch. The same boundary also
  has to survive a body that is valid JSON plus a trailing `data:
  [DONE]`. Both are provider quirks normalized in `omniroute.ts` because
  it is the only place that speaks HTTP to a provider — a caller doing
  its own parsing would spread the quirk across every consumer.
- **An unparseable upstream body must not end a fallback chain.** The
  category is right (INTERNAL is not retryable *on the same target*),
  but the chain exists precisely because another model may answer. One
  upstream appending an SSE sentinel to a non-streaming body was enough
  to stop the loop before a healthy model two priorities down was tried,
  which defeats the feature the chain implements. Salvage the complete
  leading value; rethrow a genuinely truncated one.
- **A shipped start script that cannot start is a test-coverage
  question, not a syntax question.** `node src/server.ts` under
  strip-only type stripping rejected the codebase's parameter
  properties, so `pnpm start` never bound a port — and no gate caught
  it, because typecheck, lint and vitest all use different loaders.
  `--experimental-transform-types` in both entrypoints. Fixing the one
  reported constructor would have left the class intact for the next
  one; the flag fixes all of them in one line, which is why the
  constructor edits were reverted.
- **A real catalog is an order of magnitude larger than a fixture.**
  1 958 models exceeded Prisma's 5 s interactive-transaction default and
  the sync failed with an infrastructure error on an operator action. A
  two-model fake never approaches the limit. Explicit `timeout` at the
  call site, with the ceiling and the upgrade path recorded there.
- **The embedding route is left unmapped on purpose.** The retrieval leg
  degrades by design without it, and mapping a model whose vector width
  is unverified would fail at ingest against a dimension that is a
  schema constraint. Not mapping it is the correct state until the width
  is measured.

## Phase 8 — Character & Relationship Intelligence (2026-09-30)

- **The overlap refusals live in the database, and that is what makes
  the test matrix's claim true.** The domain packages already refuse
  overlapping windows (`validateStateHistory`, `validateStanceHistory`),
  but a validator only runs if a caller calls it. The failure mode is
  silent rather than loud: two rows claiming chapter 12 make "where was
  she in chapter 12" answerable two ways, and whichever the query happens
  to return becomes accidental canon. The three EXCLUDE constraints make
  the row unrepresentable. A service-guard test would have stayed green
  with them absent, so the suite that matters writes past every guard —
  and each constraint was confirmed to fail with it dropped, because a
  test that passes with the constraint present proves nothing about
  whether the constraint is what refuses it.
- **Bonds get no EXCLUDE on purpose.** Overlapping bonds are the author's
  business: a monogamy bond and a political marriage may run
  concurrently, and a harem is uncapped because "harem" describes a shape
  rather than an instruction that every character becomes a love
  interest. Only MONOGAMY is exclusive, and that rule needs the sibling
  *members* of a bond — which no CHECK can see — so it stays in
  `validateBondStructures` where the whole set is in hand. Refusing the
  rest would be the engine overruling the author (§2.13).
- **`characters` is standalone rather than a `StoryEntity` of kind
  CHARACTER.** Nothing in Phase 8 reads an entity link, and requiring
  every character to be a canon subject would force a row the author
  never asked for. This follows ADR-0008 §5's posture — wait for real
  data rather than guess a shape — and a link can be added when a
  consumer needs canon claims *about a character*.
- **`Bond` is the spec's "relationship groups" and "agreements" in one
  table.** The domain package models the whole shape as structure +
  members + window, so a separate groups table would be a second name for
  the same rows. The blueprint's other Phase 8 tables are deferred by
  name in the schema docstring; each earns a table when a consumer asks
  for one.
- **Enum vocabulary is pinned on both sides.** The domain packages declare
  enum-shaped unions locally as `as const` arrays with a test asserting
  the member set against a hardcoded literal, and the route modules
  validate bodies with `z.enum(MIRROR)` rather than the Prisma enum. A
  schema/vocabulary drift therefore fails a test instead of silently
  widening what a route accepts. This is the one guard that catches drift
  between the two representations.
- **A pre-existing defect must not block a correct write.** `validateArc`
  walks the milestone array in the order given, so appending a candidate
  and validating checks only the append case — a middle insert slips
  through. The service instead validates the whole set with and without
  the candidate and acts on the set difference. The first attempt
  identified the failing record by splitting an error message on spaces;
  that was replaced before it shipped, because a message format is not a
  contract.
- **`isExclusionViolation` is not `isUniqueViolation`.** An EXCLUDE
  violation is SQLSTATE **23P01**, not P2002. A caller that maps only
  unique violations surfaces an overlap as a 500 rather than a 409.

## Phase 6 slice 3 — the story write surface (2026-09-30)

- **A green gate can cover a product gap, and the gate is not evidence of
  the feature.** Slice 2 shipped five tables, nine pure rules and a Brain
  that read them, with zero production writes: repo-wide the only
  `storyThread.create` / `storyPromise.create` calls were in
  `canon.test.ts`. Every gate was green, because every gate asked whether
  the reads worked. The roadmap's exit criterion held in tests only. The
  discovery that found this was a single grep for writes, not a test run.
  When a phase claims a capability, grep for the path that populates it.
- **A pure rule with no production caller is a hypothesis, not a
  guarantee.** `canPromiseTransition`, `findCausalCycle` and
  `isChronological` were tested, documented, and called by nothing. A
  domain-first slice can pass its own suite completely while the rule never
  runs against real input. Counting callers of each exported rule is a
  cheap completeness check on a slice like this.
- **Three rules, two enforcement routes.** `canPromiseTransition` and
  `findCausalCycle` run in the service on the request that would violate
  them, with the migration CHECKs as the race backstop. `isChronological`
  is enforced by the `(novel_id, order)` unique index instead — the
  migration had already named the index as the rule's write-side twin.
  Where the schema can make a bad state unrepresentable, a service check
  for it is unreachable code. The rule still lives in the domain package
  under its own unit test; the enforcement simply moved to the constraint.
- **A test asserting an unreachable branch will fail, and the failure is
  the finding.** The first timeline test asserted a read-side
  `isChronological` throw and was rejected by the unique index before the
  read. Deleting the branch was the fix; keeping the branch and weakening
  the test would have preserved dead code behind a green check.
- **A nondeterministic test is worse than a documented gap.** The
  concurrent-append test could not force its interleaving (Prisma
  serialises injects on one connection) and passed as `[201, 201]`. It was
  deleted rather than kept, and the P2002 branch is marked as race defence
  with no covering test — recorded in `progress.md` and `CURRENT.md` so
  the absence is visible rather than implied by a green suite.
- **No delete routes on the story tables.** `causal_edges` cascade from
  `story_events`, so deleting an event silently takes its causal claims
  with it — the loss CLAUDE.md §9 forbids. A correction path needs a
  supersede chain of its own before a delete is safe. The surface is
  append-and-transition only, deliberately.
- **Approval is capability-gated, not confidence-flagged.**
  `INFERRED`/`SPECULATIVE` causal edges require `canon:approve` and store
  the approver; `EXPLICIT` needs only `canon:manage` and stores none. The
  CHECK refuses an AI-derived edge that arrives without an approver, so
  the rule holds at the table as well as at the route. An EDITOR is
  refused 403 — asserted explicitly, because the generic capability loops
  would not catch a future edit that granted it.

## NF-WF-002B contract clarifications (2026-10-02)

- **`checkpoint.create` is HIGH, and that is not a new architectural
  decision.** C12.2 corrects a misreading of C3, not a decision. C3's own
  sentence is "The impact class decides whether a checkpoint and snapshot are
  captured — it does not decide whether a revision is recorded." An operation
  whose entire purpose is to capture a snapshot is the clearest member of the
  capturing class; the earlier "LOW, with a checkpoint" reading argued from
  *invalidation* instead. The code already classified it HIGH
  (`packages/story-versioning/impact.ts`) and `story-versioning.test.ts` already
  asserted it, so no behavior changed. **No new ADR is raised**, because an ADR
  records a decision between alternatives and this is a correction of prose to
  match the frozen contract's own rule. Had the code been LOW, that would have
  been a decision and would have needed an ADR.
- **A nullable field proves nothing about emitted values.** C11 asserted
  `events.ts`'s `revisionId` "is currently always `null`". Nullability permits
  `null`; it does not observe it. Inspection showed no producer and no consumer
  at all, and the claim was withdrawn rather than restated (§C12.4, GAP-023).
  The general rule this is an instance of: an inference from a type is not
  evidence about runtime behavior, and a contract must not record one as though
  it were.
- **A green suite can be green because the assertion is about metadata.** The
  `PRE_MUTATION` snapshot defect (GAP-024) passed 338 API tests because the one
  assertion that touched a `PRE_MUTATION` checkpoint checked the pin, the
  snapshot's revision, its format version and that it was non-empty — all of
  which are *correct* while the payload is wrong. The pin being right is what
  made the defect invisible. The lesson recorded for future snapshot work: a
  recovery feature's test must assert the recovered **content**, not the
  feature's bookkeeping.
- **Contract questions are disposed of against source, not against the passing
  suite.** GAP-019's five items were each answered by reading the service,
  route, classifier and schema. Two of the five dispositions corrected the
  contract (C12.2's class, C12.4's withdrawn claim), one named a requirement
  nobody owned (GAP-022), and one was already consistent (test naming).
