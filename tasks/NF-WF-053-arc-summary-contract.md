# Task NF-WF-053 (CONSOLIDATED): Model-assisted narrative summaries for arc scopes — single effective contract

> **AUTHOR APPROVED / IMPLEMENT NOW — 2026-10-16.** The author explicitly
> approved the complete 11-column additive proposal in §7.1 and selected
> `LONG_CONTEXT_REVIEWER` for D1. The author additionally directs, from now
> on, real implementation and acceptance through the actual configured
> gateway using real story data and persistently generated results. Do not
> delay implementation for new mocks, mockups, speculative redesign, or
> another contract-only review cycle. Fix observed failures in the real flow.
> This instruction OVERRIDES all earlier fake-only/no-live-test restrictions
> and pending-author-decision wording in this file and its historical chain,
> including NF-WF-009 Invariant 6's old GAP-028 test-mode sentence. Existing
> deterministic regressions may be retained; no new mock infrastructure is
> a delivery prerequisite. §15.0 defines the required real acceptance.
> The separately reviewed baseline `02ec0bd8…10ff1` is preserved in
> `.nf-batch-worktrees/nf053-contract-author-approved-baseline-2026-10-16.md`.

> **Consolidated effective contract — 2026-10-16.** This file is the ONE
> standalone, self-contained contract for NF-WF-053. It consolidates and
> supersedes the entire frozen amendment chain — base draft
> `.nf-batch-worktrees/nf053-contract-draft.md` (sha256
> `e2e33eb68fae4cc930dc304cd0b6790c8a0f39ff4650eba89fc96c908c3e8159`, 547
> lines), corrected draft
> `.nf-batch-worktrees/nf053-contract-corrected-2026-10-15.md` (sha256
> `4fc689a395ec3037769e5db17d322234b87a94f9e49f08a8b01501a7a7a7bf95`, 607
> lines), successor-1
> `.nf-batch-worktrees/nf053-contract-successor-2026-10-16.md` (sha256
> `b1e5a68d5b356ae8d6eeb1e9f3097f6c77f6d658aa6f648fda65b00a98208bde`, 399
> lines), and successor-2
> `.nf-batch-worktrees/nf053-contract-successor-2-2026-10-16.md` (sha256
> `af8ac1efd4b0a117bc6a5e76cfa5b880f4287a8d57b0cbdb80b8c30947d1d441`, 343
> lines; hash verified on host 2026-10-16) — into one text. An implementer
> MUST NOT need to read or resolve the amendment chain. All four frozen
> artifacts are byte-preserved history, never modified by this file. Where
> this text differs from ANY frozen artifact, THIS text is normative.
>
> **Corrections consolidated here beyond the frozen chain** (from the
> GAP-028/NF053 coordinator assessment of 2026-10-16,
> `docs/implementation/ISSUES-AND-GAPS.md`): (1) forced-retry replay after
> intervening intents (I fails, J fails, old I redelivered) is CLOSED by an
> append-only row-local consumed-intent set replacing successor-2's
> single last-intent column (§8); (2) execute-time authorization refusal
> is ZERO gateway attempts and zero durable rows platform-wide (§11);
> all `attempts`-counter exactness/monotonicity promises are removed
> (§11.4); claim/result/usage provenance is mapped to ACTUAL durable
> fields with one explicitly proposed additive column (§12); the M-bound
> ownership is stated (§11.5).
>
> **Second correction round — 2026-10-16 (same coordinator assessment,
> remaining findings; this file only, no new amendment artifact):**
> (5) forced-retry TRANSPORT identity: the deterministic unforced
> `memoryRebuildJobId` collides with retained completed/failed jobs
> (BullMQ 5.81.5 duplicate-job suppression), so a forced intent could be
> accepted without ever being dispatched; forced jobs now carry a
> force-specific transport identity and forced scope selection is
> defined (§8.1a); (6) A-T7 concurrency acceptance is made consistent
> with §9.2's structural-upsert-before-claim ordering and uses explicit
> test barriers to separate live-claim exclusion from sequential
> authorized retries (§8.4 A-T7, §15.1); (7) T-first-row-fail's
> delete-the-Revision fixture is invalid (the projection's
> `sourceRevision` FK is `onDelete: Cascade`) and is replaced by a
> reproducible build failure with valid references, with the
> missing-source outcome stated separately (§15.2); (8) §12.3 now
> states that `summaryGenerationId` is a CURRENT-selection pointer:
> historical ACCEPTED/DISCARDED classification of superseded
> generations is UNKNOWN after replacement, usage is fully retained, no
> new machinery is added (§12.1, §12.3). A full independent review of the
> intermediate corrected hash `5110bbcc223752af5bb01195502e34de41c2ae61fdcad1aeed838c8840498bd4`
> returned APPROVE (confidence 0.9) with 3 MINOR findings, all applied:
> citation corrections (`ai.ts:227-229`/`:261-263`; `memory-jobs.ts:31-62`
> with DI spread `:93`; forced-job validation pointer §8.2(1)/A-T4) and
> §9.4 expiry-CAS hygiene clearing prior-version summary bytes (pinned by
> T-expiry-no-model).

Project language: English for all authored/revised artifacts and generated
project content; UI uses English (`en`)/Bahasa Indonesia (`id`) locale keys
and resources with English fallback (`AGENTS.md` §10). Summary output
language follows this standing policy — NOT an open decision.
Model selection: author-selected at runtime; separate implementer/reviewer
actors; requested aliases distinguished from runtime evidence.

Status: AUTHORIZED FOR IMPLEMENTATION, not implemented or verified yet.
The reviewed baseline and explicit author decisions satisfy the dispatch
prerequisites. Proceed with source implementation, reviewed additive migration,
and real acceptance; separately review the exact implemented diff. No new
contract-only approval cycle is required for applying these author decisions.
No human acceptance may ever be inferred from database actor IDs.
Milestone / capability IDs: M2 memory loop follow-up; DELIVERY-PLAN
NF-WF-053.
Implementer role / requested and resolved model: (assigned at dispatch)
Reviewer role / requested and resolved model: (separate actor, never the
implementing session)
Readiness evidence / unresolved decisions / parent acceptance owner:
NF-WF-009 VERIFIED (structural-only per Q1; Invariant 6 is this task's
gate); NF-WF-052 INTEGRATED AND PUSHED at main `4227594f8349b175648cc47b8b8019133935af05`
(hosted CI green run 38717181655: lint, typecheck, 2562 tests / 212 files —
retained baseline evidence). D1 and §7.1 are author-approved. Run relevant
regressions after implementation; historical CI is not proof of new code.
Frozen review manifest / exact artifact paths and identity: the four
frozen artifacts named above (hashes verified 2026-10-16) + their recorded
review receipts in `docs/14-progress/CURRENT.md` and
`docs/implementation/ISSUES-AND-GAPS.md`. This file's own hash is recorded
outside this file at review time; a review manifest never hashes itself.
Baseline revision / local changes to preserve: main @ `4227594f8349b175648cc47b8b8019133935af05`
(HEAD verified on host 2026-10-16); documentation WIP, untracked
`.nf-batch-worktrees/`, `.harness-memory/`, `output.txt`, and stash
`nf050b-acceptance-wip` are preserved; nothing may be reset.
Engram checkpoint topic key / last confirmed observation reference:
`novelforge-ai/nf-wf-053-contract`.

## 1. Goal and reason

Arc-scope memory blocks (`arc:{sagaId}`) carry `summary: null` /
`summaryStatus: "SKIPPED"` today, hardcoded at the read sites
(`packages/ai-services/src/memory.ts:159-160` and `:701-702`) and baked
into the API types (`packages/memory/src/types.ts:66-67`, `:124-125`).
NF-WF-009 shipped structural-only by review decision Q1 and pinned this
follow-up behind Invariant 6
(`tasks/NF-WF-009-revision-derived-memory.md:322-341`).

This task adds **model-assisted narrative summaries for arc scopes only**,
produced inside the existing rebuild pipeline, stored on the existing
`MemoryProjection` row, and served through the existing read surfaces —
under ALL Invariant-6 conditions (§6). Chapter-scope summaries, L6 as-of
enrichment, new storage, and compiler adoption are OUT OF SLICE (§5.5).

Observable result: after a rebuild of an `arc:{sagaId}` scope, the scope's
memory block and the L5 global union read carry a narrative summary derived
only from that scope's structural facts, with persisted covered-fact
provenance and attribution, asserted end-to-end through the REAL `generate`
service with a FAKE gateway. When the model path fails, returns invalid
output, or the acting user lacks `generation:create` at execution time, the
structural memory is unchanged and available and the scope reports an
explicit FAILED summary status. Summary failure never degrades structural
availability (Invariant 6; settled, not a gate).

This is a design contract. It authors no implementation, no migration, and
makes no model calls. All §8–§12 mechanics are DESIGN; no test named in §15
has been run.

## 2. Required reading

- `AGENTS.md` — §2 invariants 6/14/17/18; §6 gateway rules (bounded retry;
  never retry auth/validation errors); §7 context; §10 language; §12;
  §14 (Engram context persistence).
- `tasks/NF-WF-009-revision-derived-memory.md` — Invariants 2/4/6/7/9/11;
  Q1; F3 (Invariant 6 quoted at `:322-341`).
- `tasks/templates/TASK-TEMPLATE.md` (this file follows it).
- `docs/06-ai/MULTI-LLM-ORCHESTRATION.md` (dispatch/review/handoff protocol).
- `docs/06-ai/MODEL-EVIDENCE-POLICY.md` (evidence classes; §5 product-AI
  boundaries: fact text is DATA, never instruction).
- `docs/adr/ADR-0015-generation-usage-analytics.md` (usage analytics
  ownership; the external gateway owns quotas).
- Frozen chain (history only; no implementer action required): the four
  `.nf-batch-worktrees/nf053-*` artifacts named in the header.

## 3. Environment prerequisites

Unchanged from the frozen chain: native PostgreSQL 16 + Redis on localhost
per `docs/11-deployment/ENVIRONMENT-PREFLIGHT.md`; pnpm 12, Node 24;
disposable `novelforge_test_*` databases for the mutation suites. Windows
hosts reuse the author's running Docker services/data; no stack reset. **No
live/production model calls anywhere** — all proof via the seams in §15.1.

## 4. Dependencies and evidence

- NF-WF-009 (VERIFIED): the `MemoryProjection` store, `memory-rebuild`
  BullMQ queue, rebuild/reconciliation worker, read surfaces — extended,
  never rewritten.
- NF-WF-052 (INTEGRATED AND PUSHED at main `4227594`): owns the L5 route
  shape. This task changes only the entry/block fields enumerated in §13.2;
  canonical ordering, cap20, `excluded[]`, `overflow`, `anomalies` shapes
  and counting are untouched.
- GAP-028 CLOSED (worker AI wiring via NF-WF-026); the `apps/api/src`
  import ban for the worker stands (`apps/worker/src/workflow-jobs.ts:12`).
- ADR-0017 stays PROPOSED — not a gate; compiler adoption out of slice.
- Active issue register for new problems:
  `docs/implementation/ISSUES-AND-GAPS.md` (single register; GAP-028/NF053
  entries document this consolidation's origin).

## 5. Scope

### 5.1 Slice rule and justification

Smallest bounded slice satisfying the Invariant-6 gate end-to-end for ONE
scope family: **arc scopes only (`arc:{sagaId}`)**, produced by the
EXISTING rebuild flow (`processRebuild`,
`packages/memory/src/rebuild.ts:186-248`), stored on the EXISTING
`MemoryProjection` row (no new tables), served by the EXISTING read
surfaces (`recallNovel`, `readGlobalMemory`, `getMemoryStatus`). Arc-first
because L5's only consumers today are arc blocks (`ArcMemoryEntry`,
`packages/memory/src/types.ts:116-127`; NF052's global route) — a chapter
summary has no consumer yet (Invariant 9: materialize only when consumed).

**Verified precondition (standing).** `MemoryProjection` has NO summary
columns today (`schema.prisma:2884-2913`; schema comment `:2877`
states it explicitly), and the only status enum,
`MemoryBuildStatus { OK, FAILED }` (`schema.prisma:2910-2912`), cannot
express summary state. An additive migration is REQUIRED; §7.1 is a
PROPOSAL requiring its own explicit author approval; this contract authors
no migration. No claim/CAS/summary machinery exists in code today
(observed: `rebuild.ts` is findUnique → build → upsert with no CAS).

### 5.2 Allowed paths

- `packages/memory/` — summary types + deterministic response validation
  (pure, no AI imports); `SUMMARIZER_VERSION`, `MEMORY_SUMMARY_MAX_ATTEMPTS`,
  `MEMORY_SUMMARY_CLAIM_TTL_MS`, `MEMORY_SUMMARY_MAX_CHARS` constants and
  the forced transport identity helper (`memoryForcedRebuildJobId`, §8.1a)
  in `src/constants.ts`; the optional summarizer port parameter in
  `src/rebuild.ts`; additive fields on `MemoryBlock`/`ArcMemoryEntry`/
  `MemoryScopeStatus` in `src/types.ts`; additive fields
  (`force?`, `retryIntentId?`, `actorUserId?`) on `MemoryRebuildJobData`
  (`src/types.ts:79-84`).
- `packages/ai-services/` — new summarizer module (prompt assembly from
  structural memory + `generate` call); updating the hardcoded read sites
  `src/memory.ts:159-160` and `:701-702` to read stored columns;
  `triggerRebuild` (`src/memory.ts:287-370`) gains `force` pass-through +
  one `randomUUID()` retry intent per accepted forced request + actor
  stamping; forced jobs are enqueued under the §8.1a forced transport
  identity, and `force: true` requires an explicit `scope` (§8.1a).
- `packages/ai-services/src/ai.ts` — TWO additive optional input fields on
  the workspace `generate` input, both optional so all existing callers
  compile unchanged: `promptVersion?: string` (written through to the
  `Generation` row, §7.2) and `maxAttempts?: number` (passed through to
  `manager.generate` so the summary path can set the M-bound, §7.2/§11.5).
  No other `generate` change: `task`, `component`, `artifactId` already
  exist on the input and are persisted (`ai.ts:227-229` on the first
  `generate` declaration, `:261-263` on the second; `:839-849`).
- `packages/database/prisma/schema.prisma` + ONE additive migration — ONLY
  after §7.1 approval, exactly the columns named there (reviewed artifact).
- `apps/worker/` — inject the summarizer port into `MemoryWorkerDeps`
  (`src/memory-jobs.ts:31-62`; DI spread at `:93` is additive); forced-job
  validation (§8.2(1), pinned by A-T4); reconciliation sweeper expiry rule
  (§9.4).
- `apps/api/src/memory-routes.ts` — MINIMAL additive change to the
  EXISTING `POST /memory/rebuild` body schema (`:36-40`) to accept
  `force?: boolean` and pass it through, including the §8.1a rule that
  `force: true` without an explicit `scope` is a 400 `INVALID_INPUT`
  refusal at the route. NO new route, no new capability (this is an
  explicit allowed-path extension the frozen chain implied via §R2.2 but
  did not list).
- Focused tests (named in §15) and their fixtures.
- Docs: `docs/implementation/ISSUES-AND-GAPS.md` (F3 narrowing update),
  `progress.md`, `docs/14-progress/CURRENT.md`,
  `docs/implementation/test-matrix.md` on completion, per standing rules.

### 5.3 Forbidden paths

- `packages/ai-services/src/context-compiler.ts` and all NF-WF-003 compiler
  wiring (tiers 7/8 keep consuming blocks unchanged; ADR-0017 stays
  PROPOSED, non-gate).
- NF052 policy code: canonical ordering, cap20, `excluded[]`, `overflow`,
  `anomalies` shapes and counting; `GET /memory/global` route logic beyond
  the §13.2 entry fields.
- Canon tables/semantics, proposal/application flows, supersede chains.
- UI (`apps/web` or equivalent), reader/publication paths.
- New HTTP routes; new capabilities. The existing routes are the whole
  surface: `POST /memory/rebuild` (`apps/api/src/memory-routes.ts:81`),
  `GET /memory/status` (`:68`), `GET /memory/as-of` (`:97`),
  `GET /memory/global` (`:113`).
- Any model call inside `buildStructuralMemory` (`rebuild.ts:76-183`) or
  inside any database transaction (§6.1).
- Chapter-scope summaries; L6 as-of enrichment; retention/pruning; new
  tables; vector/embedding work (§5.5).
- `apps/api/src` imports from `apps/worker` or vice versa
  (NF-WF-004/NF-WF-026 `no-restricted-imports`).
- Unattributed/direct provider calls bypassing the configured gateway,
  leaked credentials, and unapproved canon/publication mutations. Real calls
  through the normal configured gateway are authorized and REQUIRED (§15.0).
- Changes to `Generation`/`GenerationAttempt` schema (§12 uses existing
  fields only).
- Staging, committing, pushing, merging, deploying from the contract work.

### 5.4 Inputs

- `MemoryRebuildJobData` — today `{ workspaceId, novelId, scope,
  sourceRevisionId }` (`packages/memory/src/types.ts:79-84`) on the
  existing `memory-rebuild` queue; this task additively gains `force?`,
  `retryIntentId?`, `actorUserId?` (§8.2, §14).
- The scope's built `StructuralMemory` (`src/types.ts:31-44`) — facts,
  threads, promises — as the summary's ONLY source material. No author
  input, no run, no proposal enters a summary.

### 5.5 Out of scope (with follow-up owner)

- Chapter-scope (`chapter:{chapterId}`) summaries → NF-WF-053 successor /
  author (no consumer today, Invariant 9).
- L6 as-of enrichment (summaries of historical states) → follow-up; L6
  stays served by Invariant-7 as-of reads.
- Retention horizon for summary text (rows already kept per Q5) →
  follow-up (NF-WF-009 Q5 owner).
- Compiler tier-7/8 wording/behavior changes → separate compiler task.
- ADR-0017 intent end-state adoption → ADR owner (stays PROPOSED).
- Lease-extension/claim-renewal mechanism (would tighten §11.3) → not
  requested; if the author wants it, it is a new decision, never a silent
  extension.

### 5.6 Outputs

- `MemoryProjection` arc-scope rows additionally carry the §7.1 columns.
- `MemoryBlock` / `ArcMemoryEntry` with populated summary fields +
  `summaryProvenance` (§13.2).
- `MemoryScopeStatus` gains `summaryStatus` (+ `summaryError`) observable
  via `getMemoryStatus` only (`packages/ai-services/src/memory.ts:256-262`).
- One `Generation` audit row per logical summary call with per-attempt
  `GenerationAttempt` rows (§12) — usage analytics and attribution stay
  automatic; no second accounting.
- No new routes, no new queues, no new workers.

## 6. Invariant-6 compliance, item by item

| # | Requirement (NF-WF-009 `:322-341`) | Contract |
|---|---|---|
| 1 | Model call outside any DB transaction | Summarizer port invoked in `processRebuild` AFTER `buildStructuralMemory` returns and BEFORE the final row write; the claim write (§9.2) is also outside any transaction. No `$transaction` may span a model call. Verified: none exists in `rebuild.ts` today. |
| 2 | Fixed machine-validated schema before storage; invalid → omitted + FAILED | §13: validation proves SHAPE and referential closure, NOT semantic truth — residual risk stated, adversarial tests T2a–T2d named. |
| 3 | Failed summaries omitted; structural memory stays available | Row keeps `buildStatus: "OK"`; freshness branches on `buildStatus` ONLY (`packages/memory/src/freshness.ts:78`, `:144`), so a FAILED summary can never flip FRESH→FAILED. Settled contract term, not an author gate. |
| 4 | Explicit FAILED status | `MemorySummaryStatus.FAILED` (§7.1), written by the implementation, never inferred at read time. State model §9.1. |
| 5 | Row records model profile id + prompt version (+ actor) | §7.1 columns + §14: `summarizerModelProfile`, `summarizerPromptVersion`, acting userId persisted on the row AND on the `Generation` row (`ai.ts:842-848`). |
| 6 | Cached artifact keyed by (scope, sourceRevisionId, summarizerVersion) — stable, not byte-deterministic | Row identity `@@unique([novelId, scope, sourceRevisionId])` (`schema.prisma:2904`) + `summarizerVersion`; dedup (§10) and version-bump (§9.5) specified. Structural content and coverage stay deterministic; only summary text is stable-not-byte-deterministic. |
| 7 | Author-directed real integrated acceptance | §15.0: actual configured gateway, real story data, normal API/worker persistence and read-back. Historical fake-only GAP-028 restriction is superseded; existing regressions remain supporting evidence. |

## 7. Schema and code-level prerequisites

### 7.1 Additive migration specification (AUTHOR APPROVED — 2026-10-16)

On the EXISTING `memory_projections` table, ONE additive forward-only
migration (reviewed artifact; rollback §16). COMPLETE column list — this
supersedes every earlier partial list; nothing else is added anywhere:

| Column | Type | Note |
|---|---|---|
| `summary` | `TEXT NULL` | validated summary text |
| `summary_status` | `MemorySummaryStatus NOT NULL DEFAULT 'SKIPPED'` | new enum `{ SKIPPED, SUMMARIZING, FAILED, OK }` (the existing `MemoryBuildStatus` cannot carry summary semantics) |
| `summary_error` | `TEXT NULL` | summary diagnostics; structural `lastError` stays reserved for structural failures |
| `summary_covered_fact_ids` | `TEXT[] NULL` | persisted per-fact provenance (§13.1) |
| `summarizer_version` | `TEXT NULL` | cache key component |
| `summarizer_model_profile` | `ModelProfile NULL` | enum exists (`schema.prisma:503-511`) |
| `summarizer_prompt_version` | `TEXT NULL` | via §7.2 |
| `summary_claimed_at` | `TIMESTAMP(3) NULL` | claim timestamp for §9.4 crash recovery |
| `summary_claim_id` | `TEXT NULL` | per-claim identity token (§9.2) |
| `summary_retry_ids` | `TEXT[] NOT NULL DEFAULT '{}'` | append-only consumed forced-retry intents (§8); successor-2's scalar `summary_retry_id TEXT NULL` is REPLACED by this set — a single last-intent field admits the I/J/I delayed-replay counterexample (§8.1) |
| `summary_generation_id` | `UUID NULL` | id of the `Generation` row of the CURRENT accepted logical call (§12.3); NEW in this consolidation, explicitly proposed — without it the CURRENT selection is not derivable when multiple summary calls hit one row. A current-selection pointer, never a historical outcome ledger |

Justification for `summary_retry_ids` and `summary_generation_id` is in
§8.1 and §12.2 respectively. The author approved this complete specification
on 2026-10-16. Implement and verify the additive migration; do not silently
broaden it or ask again for the already approved columns.

### 7.2 Code-level additions (no schema change)

`generate` gains TWO optional inputs, mirroring existing precedents:

1. `promptVersion?: string`, written through to the `Generation` row —
   mirroring the existing API-side write precedent `stampProvenance`
   (`apps/api/src/services/orchestrator.ts:223-232`).
   `Generation.promptVersion` exists (`schema.prisma:626-627`) but the
   `generate` input has no such field today (verified: zero matches in
   `packages/ai-services/src/ai.ts`).
2. `maxAttempts?: number`, passed through to `manager.generate` at the
   existing call site so the summarizer path can set the M-bound.
   `GenerateOptions.maxAttempts` already exists and is consumed
   (`packages/ai-core/manager.ts:120`, defaulting `DEFAULT_MAX_ATTEMPTS`
   when unset and capping the attempt plan at `:306`); `generate` simply
   does not expose it today. The summarizer passes
   `maxAttempts: MEMORY_SUMMARY_MAX_ATTEMPTS`; every existing caller
   (field unset) keeps today's default behavior.

The `generate` input ALREADY carries `task: string`, `component?`, and
`artifactId?: string`, persisted on the `Generation` row
(`ai.ts:227-229` input; `:839-849` create). The summarizer uses them as
durable provenance WITHOUT any schema change (§12.1): `task` pinned to the
exact string `"MEMORY_ARC_SUMMARY"`, `artifactId` set to the
`MemoryProjection` row id, `component` left at its default `OTHER` unless
an exact matching `GenerationComponent` value already exists at
implementation time (name it in the diff; do not invent enum values).

## 8. Forced-retry intent idempotency (corrects successor-2 §A)

### 8.1 Defect being corrected (contract-model counterexample, not a runtime failure)

Successor-2 §A stored a single last intent (`summary_retry_id`) and made
the forced claim arm `{ summaryStatus: "FAILED", summaryRetryId:
{ not: intent } }`. A single last-intent field is NOT a consumed-intent
history: forced intent I ends FAILED (stamps `I`); new intent J claims
(stored `I` ≠ `J`), ends FAILED (replaces with `J`); the old job I is
redelivered — the classification (`retryId === I`) does not match, and the
force arm (`stored ≠ I`) DOES match, so I claims again: one manual request
from the past re-arms a fresh retry budget. Predicate evaluation confirms
this at contract level; no production service was executed. A duplicate
delivery of ONE manual retry request must NEVER authorize new attempts,
no matter how many LATER intents intervened.

### 8.1a Forced-retry transport identity, redelivery, and forced scope selection (second correction round)

Observed transport facts (this host, 2026-10-16):

- Rebuild job identity is deterministic over the triple ONLY:
  `memoryRebuildJobId(novelId, scope, sourceRevisionId)` =
  `memory-rebuild-<sha256(JSON([novelId, scope, sourceRevisionId]))>`
  (`packages/memory/src/constants.ts:56-58`), used by BOTH the API
  (`packages/ai-services/src/memory.ts:358`) and reconciliation
  (`apps/worker/src/memory-reconciliation.ts:140`).
- Both queue constructors retain recent jobs:
  `removeOnComplete: 100` / `removeOnFail: 100`
  (`apps/api/src/services/memory-queue.ts:42-43`; identical options in the
  worker's `createMemoryReconQueue`, `memory-reconciliation.ts:71-79`).
- Installed BullMQ is 5.81.5: `addStandardJob-9.lua:89-93` checks
  `EXISTS jobIdKey` for a caller-supplied `jobId` and returns
  `handleDuplicatedJob` — `queue.add` RESOLVES to the existing job, emits
  a `duplicated` event, and NEVER dispatches the new payload.

**Defect:** a forced retry of a terminal-FAILED row whose producing job is
still retained (same novel/scope/revision triple — within the 100-job
retention window or still pending BullMQ-level retries) reuses the SAME
jobId → the add resolves as duplicated → the HTTP request is ACCEPTED
(§8.2(1) mints an intent, stamps the actor) but the payload is NEVER
dispatched: no `processRebuild`, no §8 classification, no claim, no model
call. The intent would exist on paper without transport. (Unforced manual
rebuilds share this latent silent no-op — pre-existing, out of slice.
Reconciliation already compensates for ITS OWN identity by removing
retained failed/completed/unknown jobs before re-adding — P2-6,
`memory-reconciliation.ts:146-158` — which is reconciliation-internal and
NOT a license for forced retries to remove anything.)

Normative rules:

1. **Force-specific transport identity.** A forced job MUST be enqueued
   under a distinct identity that includes the intent:
   `memoryForcedRebuildJobId(novelId, scope, sourceRevisionId, retryIntentId)`
   — the same sha256-over-JSON construction over the 4-tuple with a
   distinct prefix (`memory-rebuild-forced-…`), exported from
   `packages/memory/src/constants.ts` beside `memoryRebuildJobId`. A fresh
   intent ⇒ a fresh jobId ⇒ the retained-job duplicate check can never
   suppress a NEW forced request. BullMQ job-level redelivery (the
   `attempts: MEMORY_REBUILD_MAX_ATTEMPTS` defaultJobOptions) re-presents
   the SAME job — hence the SAME forced jobId and intent — so
   transport-level at-least-once delivery still funnels into the §8.2(4)
   classification that consumes duplicates. Unforced identity and
   reconciliation's P2-6 remove-before-requeue behavior are byte-unchanged.
2. **No removal, no reset.** Forced retry MUST NOT remove queued/retained
   jobs and MUST NOT reset or flush Redis. Retained unforced jobs are
   untouched.
3. **Forced scope selection.** `force: true` REQUIRES an explicit
   `scope`; the route refuses `force` without `scope` with 400
   `INVALID_INPUT` (`apps/api/src/memory-routes.ts` body validation;
   `triggerRebuild` re-checks). Rationale (observed): with omitted scope,
   `triggerRebuild` selects ONLY scopes whose derived freshness is `STALE`
   (`memory.ts:341-353`, `if (f && f.freshness === "STALE")`), while the
   typical forced-retry target is a structurally FRESH row
   (`buildStatus: "OK"` at head) whose `summaryStatus` is FAILED — exactly
   the rows the omitted-scope selection cannot see. Requiring an explicit
   scope keeps the forced target deterministic (one accepted request =
   one scope = one intent = one job, matching §8.2(1)); broadening the
   omitted-scope selection to FAILED-summary rows would silently change
   shared selection semantics for an inherently targeted human action —
   multi-scope force, if ever wanted, is a NEW author decision (§5.5
   pattern), never a silent extension. `revisionId` keeps today's default
   (head revision when omitted, `memory.ts:331-335`), which is the row a
   current-version FAILED retry addresses. A forced request MAY target a
   STALE row explicitly; §9.2 ordering handles it (structural rebuild
   first, then claim).

Acceptance: A-T9 (retained-job window) and A-T10 (force without scope
refused) in §8.4 pin these transport rules.

### 8.2 Durable consumed-precondition (normative mechanism)

The retry intent is made durable as an append-only row-local SET and
membership — not recency — decides consumption:

1. **Job data:** `MemoryRebuildJobData` gains `force?: boolean` and
   `retryIntentId?: string` — `retryIntentId` is REQUIRED whenever
   `force: true`. The manual route (`POST /memory/rebuild`, `novel:update`
   gate at `packages/ai-services/src/memory.ts:293`) or an author-directed
   reconciliation run that forces generates ONE fresh `randomUUID()` per
   accepted HTTP request: **one accepted manual request = exactly one
   retry intent = exactly one UUID.** The job is enqueued under the §8.1a
   forced transport identity (`memoryForcedRebuildJobId`), and `force`
   additionally requires the explicit scope of §8.1a(3). BullMQ
   job-level redelivery
   re-presents the SAME job, hence the SAME `retryIntentId`, by
   construction. No automatic mechanism (sweeper, re-enqueue, BullMQ
   internals) may set `force` or generate `retryIntentId`. A forced job
   arriving without `retryIntentId` is INVALID JOB DATA: deterministic
   refusal — no structural work, no claim, no model call, no `attempts`
   change; a diagnostic is logged.
2. **Claim CAS force arm (replaces successor-2 §A.2(3))** — inside the
   §9.2 claim predicate, the forced arm becomes:

```ts
...(force ? [{
      summaryStatus: "FAILED",
      NOT: { summaryRetryIds: { has: job.retryIntentId } },  // intent never consumed
   }] : []),
```

   With `summary_retry_ids` `NOT NULL DEFAULT '{}'`, the `NOT has`
   predicate is well-defined two-valued SQL
   (`summary_status='FAILED' AND NOT (intent = ANY(summary_retry_ids))`);
   an empty set (never forced before, or unforced-terminal FAILED) is
   claimable. Case A-T3 pins this. If `claim.count === 0`, the intent is
   already consumed or no claimable state exists: skip the model call
   entirely.
3. **Terminal write appends the intent (consumes it atomically):** in a
   forced run, BOTH arms of the §9.3 identity-fenced result write — the
   validated-summary `OK` arm and the `FAILED` arm — additionally apply
   `summaryRetryIds: { push: job.retryIntentId }` in the SAME single
   `updateMany` statement. Append-in-terminal-write is atomic row-locally:
   the intent becomes consumed exactly when the outcome becomes durable.
   Unforced runs NEVER read, set, or clear `summaryRetryIds`. The set
   grows by at most one UUID per forced terminal outcome over the row's
   life (forced retries are discrete human actions — bounded, honest
   growth).
4. **Mandatory consumed-intent dedup classification (BEFORE any structural
   work):** when `force === true` AND the row is current-version `FAILED`
   AND `summaryRetryIds` CONTAINS `job.retryIntentId`, return
   `{ deduped: true, ok: false }` immediately — no structural rebuild, no
   structural upsert, no `attempts` increment, no row-byte change, no
   claim CAS, no gateway call. NOT optional: without it a consumed
   duplicate would run the structural upsert (incrementing `attempts`)
   before the claim CAS refused, violating §11 and case A-T1.
5. **Expiry interplay (§9.4 unchanged):** if a forced claim expires before
   its terminal write, the row returns to `SKIPPED` with `summaryRetryIds`
   UNCHANGED (the append happens only at the terminal write). The budget
   was consumed by the claim itself (one logical call spent, §11.3
   honesty); the forced arm cannot re-run it because the row is no longer
   `FAILED`. If the SAME forced job is redelivered post-expiry, it
   recovers through the ORDINARY `SKIPPED` arm — the same at-least-once
   recovery any claimant gets, NOT a new forced budget — bounded per
   claim by TTL/M exactly like unforced recovery; recurring expiry is
   covered by §11.3's cumulative honesty.

### 8.3 The three situations that must never be conflated

| Situation | Distinguishing fact | Required behavior |
|---|---|---|
| (i) Duplicate delivery of ONE manual retry request | same job, same `retryIntentId`; row current-version `FAILED` with intent ∈ `summaryRetryIds` | §8.2(4) classification: `{ deduped: true, ok: false }` before any structural work; forced claim arm matches 0; 0 gateway calls; `attempts` unchanged |
| (ii) Genuinely NEW authorized retry request | new manual request → fresh `retryIntentId` ∉ set, enqueued under a fresh forced jobId (§8.1a) | claim wins; exactly 1 logical generation call (§11.2); `attempts` +1 (best-effort, §11.4); terminal write appends the new intent |
| (iii) Unforced duplicate delivery of terminal FAILED | job not forced | §10 case 4 unchanged: `{ deduped: true, ok: false }`, independent of `summaryRetryIds` |

Version invalidation (§9.5) never consults `summaryRetryIds`.

### 8.4 Deterministic acceptance cases (extend §15; fake gateway, zero production model calls)

| ID | Case | Deterministic assertions |
|----|------|--------------------------|
| A-T1 | Same-intent replay consumed immediately | Forced run, intent I, ends `FAILED` (set `{I}`). Redeliver SAME job: §8.2(4) returns `{deduped:true, ok:false}`; forced arm matches 0 rows; gateway-call count unchanged; `attempts` unchanged; row bytes unchanged |
| A-T2 | New intent retries | Same row; NEW manual request (intent II): claim count 1; exactly 1 logical call; `attempts` +1; terminal write appends II (set `{I, II}`) |
| A-T3 | Empty-set forced claim | Current-version `FAILED` row with `summaryRetryIds = {}` (e.g. unforced-terminal FAILED): forced intent claims (count 1) — pins two-valued `NOT has` semantics |
| A-T4 | Force without intent refused | `force: true`, `retryIntentId` absent: deterministic refusal; no claim; 0 gateway calls; `attempts` unchanged |
| A-T5 | Forced-claim expiry recovery | Forced claim expires pre-terminal: row → `SKIPPED`, set unchanged, `attempts` unchanged by expiry. Redeliver SAME forced job: claims via the ORDINARY `SKIPPED` arm (count 1), never via the forced arm; recovery bounded per claim by TTL/M like unforced recovery |
| A-T6 | Delayed replay after intervening intent (I/J/I) — THE corrected counterexample | Forced I ends `FAILED` (set `{I}`); forced J (new request) ends `FAILED` (set `{I, J}`); redeliver OLD job I: §8.2(4) returns `{deduped:true, ok:false}` (set contains I); forced arm `NOT has(I)` matches 0 rows; 0 gateway calls; `attempts` unchanged; row bytes unchanged |
| A-T7 | Concurrent manual requests — live-claim exclusion vs sequential valid retry, barrier-separated | Row current-version `FAILED`; forced intents K and L. **Phase 1 (exclusion):** K's delivery claims (count 1) and K's gateway call is HELD in flight by an explicit test barrier (§15.1 deferred fake-gateway promise) BEFORE L's delivery reaches its claim CAS; L's claim count 0, L makes 0 gateway calls, L writes NO summary columns (L's REQUIRED §9.2 structural upsert before its own claim attempt is expected and permitted — deterministic payload, content-identical; `attempts` per §11.4, not asserted exactly); while the barrier holds, exactly one `SUMMARIZING` exists. **Phase 2 (sequential authorized retry):** release the barrier; K ends terminal `FAILED` (appends K); L is (re)delivered — same forced jobId/intent — and claims (count 1) via the forced arm, L ∉ `{K}`: an AUTHORIZED new retry (A-T2 semantics), NOT an exclusion leak. `Promise.all` delivery alone proves NEITHER phase: without a held barrier, a fast K terminal-FAILED completion makes L's claim a VALID sequential retry, indistinguishable from a broken exclusion — which is why the barrier MUST hold L's claim CAS evaluation inside K's live claim (§15.1) |
| A-T8 | Forced success then replay | Forced intent ends `OK` (set `{…, M}`): replay of the SAME job is the §10 case-3 cache hit `{deduped:true, ok:true}` — 0 calls, `attempts` unchanged (the summary is served; no budget exists to consume) |
| A-T9 | Forced delivery inside the retained-job window (§8.1a) | Terminal-FAILED row whose producing UNFORCED job (same triple) is still retained (`failed` or `completed`) within `removeOnComplete/Fail: 100`. New forced request, intent N: enqueued under `memoryForcedRebuildJobId` — a fresh key, so BullMQ does NOT resolve it as duplicated (the retained unforced jobId is irrelevant); the forced handler RUNS: §8.2(4) sees N unconsumed → claim count 1, exactly 1 logical call. NO job removed (the retained job still exists afterward); no Redis reset; the unforced identity is untouched |
| A-T10 | Force without explicit scope refused (§8.1a(3)) | `POST /memory/rebuild` with `force: true` and no `scope` → 400 `INVALID_INPUT` at the route; no intent minted, NO job enqueued under either identity, no row/byte change, 0 gateway calls |

## 9. State model and claim lifecycle (consolidates corrected §7–§8 + successor-1 §R1)

### 9.1 `MemorySummaryStatus` semantics

| Status | Meaning | Set by |
|---|---|---|
| `SKIPPED` | No valid summary stored — CLAIMABLE: fresh rows, pre-migration rows, absent-port rows, chapter rows, AND expired claims (carrying the `"claim expired"` diagnostic until reclaimed) | migration default; `processRebuild` when port absent; expiry CAS |
| `SUMMARIZING` | Claim held; logical call in flight (§9.2). Transient; never a terminal state; reads render an in-flight claim as `summary: null` + `SUMMARIZING` | claim CAS |
| `FAILED` | Terminal for (scope, sourceRevisionId, summarizerVersion): deterministic validation failure, execute-time authorization refusal, gateway terminal class, or attempt-plan exhaustion (§11.1). `summary` null, `summaryError` set. Cleared only by a later successful rebuild of the scope (§9.5) or a forced retry (§8) | result CAS FAILED arm |
| `OK` | Validated summary + provenance stored | result CAS OK arm |

### 9.2 Structural row persistence BEFORE claiming + claim CAS

`rebuild.ts` creates the row only at the final upsert (`:210-248`
create arms), so a naive claim CAS would match ZERO rows on first build.
Therefore, inside `processRebuild`, in order:

1. Build structural memory (`buildStructuralMemory`, unchanged,
   deterministic).
2. **Structural upsert (first-row creation):** upsert keyed by the unique
   triple with `buildStatus: "OK"`, `attempts` per §11.4 (brand-new row:
   1), summary fields untouched (`summaryStatus` at migration default
   `SKIPPED`). Structural-only write — MUST NOT set, clear, or depend on
   any summary column beyond leaving the default in place. Race-safety:
   the upsert is keyed by the unique dedup triple
   (`schema.prisma:2904`), so concurrent first builds converge on one
   row; the deterministic structural payload makes either writer's
   content identical; only one can win step 3.
3. **Claim CAS** — attempted only after step 2 committed:

```ts
const claimId = randomUUID();
const claim = await db.memoryProjection.updateMany({
  where: { novelId, scope, sourceRevisionId,
           OR: [
             { summaryStatus: "SKIPPED" },                       // fresh or expired-claim, any version
             { summaryStatus: { in: ["FAILED", "OK"] },          // version invalidation (§9.5)
               summarizerVersion: { not: SUMMARIZER_VERSION } },
             ...(force ? [{ summaryStatus: "FAILED",             // forced arm (§8.2(2))
                           NOT: { summaryRetryIds: { has: retryIntentId } } }] : []),
           ] },
  data: { summaryStatus: "SUMMARIZING", summarizerVersion: SUMMARIZER_VERSION,
          summaryClaimedAt: new Date(), summaryClaimId: claimId,
          summaryError: null },
});
if (claim.count === 0) → lost the race / no claimable state / intent
   already consumed: skip the model call entirely.
```

   Predicate semantics: `SKIPPED` is claimable at ANY stored version
   (expiry does not clear `summarizerVersion`); `FAILED`/`OK` are
   claimable only at a STALE version; current-version `FAILED` is
   claimable ONLY via the forced arm with an unconsumed intent — that is
   what makes FAILED terminal against duplicate delivery. A current
   `OK` is NEVER claimable by force (retry exists for terminal FAILED
   only). The claim write stamps the CURRENT version onto the row.
   `force` is job data set ONLY by the explicit manual path (§8.2(1)).
   Status-only fencing is PROHIBITED: `summaryStatus: "SUMMARIZING"`
   alone cannot distinguish claim holders.

### 9.3 Result CAS (identity-fenced; both arms)

BOTH outcomes are `updateMany` fenced on the exact claim identity and
version:

```ts
const result = await db.memoryProjection.updateMany({
  where: { novelId, scope, sourceRevisionId,
           summaryStatus: "SUMMARIZING",
           summaryClaimId: claimId,
           summarizerVersion: SUMMARIZER_VERSION },
  data: { /* OK arm: summary, summaryStatus "OK", summaryError null,
             summaryCoveredFactIds, summarizerModelProfile,
             summarizerPromptVersion, summaryGenerationId <generation.id>,
             summaryClaimId null,
             ...(force ? { summaryRetryIds: { push: retryIntentId } } : {}) */
         /* FAILED arm: summaryStatus "FAILED", summary null,
             summaryCoveredFactIds [], summaryError set,
             summaryGenerationId null, summaryClaimId null,
             ...(force ? { summaryRetryIds: { push: retryIntentId } } : {}) */ },
});
if (result.count === 0) → claim lost/expired/replaced: DISCARD the
   result. No overwrite, no error surfaced as success, no accounting
   credit. The losing claimant's attempt records remain retained as
   DISCARDED (§12.3).
```

A stale claimant's write affects ZERO rows, never persists, and never
clears or overwrites a successor claim's state (pinned by
T-claim-interleave, §15.2).

### 9.4 Expiry transition (crashed-claimant recovery)

The reconciliation sweeper
(`apps/worker/src/memory-reconciliation.ts:89-91`, `:138-141`, `:173` —
walks only STALE/FAILED-freshness scopes and re-derives them at HEAD)
gains one rule: a row at `SUMMARIZING` whose `summaryClaimedAt` is older
than `MEMORY_SUMMARY_CLAIM_TTL_MS` (new named constant, proposed default
10 minutes — sized at implementation against the worst bounded summary
duration, §18) is a crashed claimant:

```ts
const expired = await db.memoryProjection.updateMany({
  where: { summaryStatus: "SUMMARIZING",
           summaryClaimedAt: { lt: cutoff /* now - MEMORY_SUMMARY_CLAIM_TTL_MS */ } },
  data: { summaryStatus: "SKIPPED", summaryError: "claim expired",
          summary: null, summaryCoveredFactIds: [],
          summaryGenerationId: null,
          summaryClaimId: null, summaryClaimedAt: null },
});
```

The three cleared content fields are REQUIRED hygiene (review finding
MINOR-3, 2026-10-16): the §9.2 stale-version claim arm can pick up a row
that still carries a PRIOR version's `summary`, `summaryCoveredFactIds`,
and non-null `summaryGenerationId`; without clearing them here, an expiry
would strand those bytes under `SKIPPED` — contradicting §9.1's SKIPPED
definition ("No valid summary stored") and the §12.3 pointer framing.
This mirrors the §9.3 FAILED-arm clearing exactly; in the fresh-row and
forced-FAILED-expiry arms the clears are no-ops (fields already null).
The cleared prior-version summary was already invalidated by the version
bump (§9.5) — nothing valid is lost.

The expired row returns to CLAIMABLE `SKIPPED` with `"claim expired"` as a
diagnostic until the next claim clears it — a terminal `FAILED` would
strand the summary until a forced retry, and terminal `FAILED` is reserved
for deterministic outcomes. The sweeper never consults or preserves the
expiring claimant's in-flight result; once the expiry CAS commits, the old
claimant's result write can no longer match. The sweeper never invokes any
model, never sets `force`/`retryIntentId`, and never re-enqueues
FAILED-summary rows (T5).

### 9.5 Version-bump semantics (supersede-on-next-rebuild)

A `SUMMARIZER_VERSION` bump invalidates the CACHED SUMMARY, nothing else:
dedup (§10) stops matching rows at older versions, so the scope's NEXT
rebuild (new source revision → STALE→job, or a manual
`POST /memory/rebuild`) re-summarizes and REPLACES the summary on that
row (the claim write stamps the new current version). Rows of OTHER scopes
and older source-revision rows of the same scope RETAIN their
older-version summaries until their own rebuild reaches them. No mass
re-enqueue, no backfill, no content migration; reconciliation does not
chase summaries (T5). Terminal-FAILED at an OLD version never blocks a
new-version attempt, and version invalidation never consults
`summaryRetryIds`.

## 10. Dedup rules (complete; replaces `rebuild.ts:199-201` and corrected §8.4)

Dedup no-op **iff** `buildStatus === "OK"` **AND** one of:

1. scope is NOT an arc scope (chapter/non-arc — structural slice out of
   scope entirely) → `{ deduped: true, ok: true }`;
2. the summarizer port is ABSENT for this execution (structural-only DI
   default — no claim, no failure, `summaryStatus` untouched) → `{ deduped: true, ok: true }`;
3. arc scope AND `summaryStatus === "OK"` AND
   `summarizerVersion === SUMMARIZER_VERSION` (cache hit; `force` does NOT
   re-summarize a good summary) → `{ deduped: true, ok: true }`;
4. arc scope AND `summaryStatus === "FAILED"` AND current version AND job
   NOT forced (terminal-FAILED duplicate delivery) → `{ deduped: true, ok: false }`;
5. arc scope AND current-version `FAILED` AND forced AND
   `summaryRetryIds` contains `job.retryIntentId` (consumed intent,
   §8.2(4)) → `{ deduped: true, ok: false }` — evaluated BEFORE any
   structural work.

Cases 1, 2, 4, 5 leave `attempts` unchanged and are row-byte-identical.
Cases 1–2 preserve today's `rebuild.ts:199-201` behavior byte-compatibly.
Anything else on an arc scope with a present port proceeds to structural
rebuild + claim per §9 (SKIPPED at any version; FAILED/OK at a stale
version; current-version FAILED when forced with an unconsumed intent).

## 11. Guarantees, accounting, and bounds (corrects successor-2 §B)

### 11.1 Four-term vocabulary (normative for every quantitative claim)

| Term | Definition | Guarantee |
|---|---|---|
| **Claim holder** | the process whose `summaryClaimId` is currently live on the row | at most ONE live claim per row at any instant (CAS-enforced, §9.2) |
| **Logical generation call** | one `generate` invocation that PASSED the execute-time gate and created its `Generation` row (`ai.ts:827-849`) | at most ONE per won claim, made only by the claim holder; ZERO if the claim is lost/expired/replaced before the call; ZERO on execute-time authorization refusal (§14.2 — the gate throws before the Generation row exists) |
| **Gateway attempt** | one HTTP request to the gateway within a logical call, recorded as a `GenerationAttempt` row (`packages/ai-services/src/ai-registry.ts:71-90`; `packages/ai-core/manager.ts:322`, `:348`) | per logical call, with M = `MEMORY_SUMMARY_MAX_ATTEMPTS` passed as `maxAttempts` (§7.2): total attempts are bounded by M (`planAttempts` caps the attempt plan, `manager.ts:306`) AND by the candidate-plan length. Classification (`packages/ai-core/router.ts:196-208`): INVALID_REQUEST and DETERMINISTIC stop after EXACTLY 1 attempt; §13 validation failures happen after the call returns and trigger no further attempt; AUTH and UNSUPPORTED are gateway/model-SPECIFIC — the router tries the next candidate, costing 1..(plan length ≤ M) attempts; TRANSIENT/RATE_LIMIT retry within the plan, 1..M total (§15.2 T6). The handler never retries internally in-run; BullMQ job-level retries are at-least-once REDELIVERY, not gateway retries (§11.5) |
| **Accepted result** | a result persisted through the §9.3 identity-fenced result CAS | at most ONE per claim identity; a stale claimant's result is DISCARDED (0 rows), never persisted, never overwrites a successor claim's state |

Successor-1's "exactly zero or one model call per claim attempt" is
RETRACTED (it contradicted T6's 1..M transient attempts). Successor-2's
inclusion of "gate refusals" in the exactly-1 terminal class is CORRECTED:
an execute-time authorization refusal happens BEFORE the `Generation` row
is created (`ai.ts:826-834` gate and novel-membership check run before
`db.generation.create` at `:839` and before `manager.generate` at
`:854-861`) — ZERO logical calls, ZERO gateway attempts, and ZERO durable
rows platform-wide (refusal throws `NotFoundError`/`ForbiddenError`; no
Generation, GenerationAttempt, or usage row is written). The summary row
itself is written FAILED by `processRebuild` — that row-local FAILED is
the ONLY durable trace of a refusal. Distinguish this from a
gateway-side AUTH error, which occurs after row creation and is never
retried on the SAME candidate; with multiple configured candidates the
router may try elsewhere (`router.ts:196-208`), costing 1..(plan length
≤ M) retained attempts before the logical call fails terminally.

### 11.2 Quantitative summary

At most one logical generation call per won claim, comprising at most M
gateway attempts (bounded by `maxAttempts` and the candidate plan;
class-exact counts in §11.1; T6 pins exact counts on a single-candidate
fake registry). At most one accepted result per claim identity. No
quantity here depends on `attempts`.

### 11.3 TTL honesty (cumulative, not per-row-constant)

`MEMORY_SUMMARY_CLAIM_TTL_MS` bounds a claim's AGE — the duplicate-call
window of ONE claim. It does NOT bound the cumulative number of gateway
calls across recurring expiry/reclaim cycles: each expiry can strand at
most one in-flight logical call (≤M attempts), and expiry/reclaim recurs
whenever deliveries recur or claimants keep stalling. Honest statement:
cumulative gateway calls = Σ(per-claim bound) over the number of won
claims. Unforced duplicate deliveries of terminal outcomes are no-ops
(§10) and create NO claims, so claim count is bounded by the number of
genuine deliveries/requests over the row's life — not a fixed constant.
This is priced, stated overhead of at-least-once delivery; a
lease-extension mechanism could tighten it and is out of scope (§5.5).

### 11.4 `attempts` semantics (all exactness and monotonicity promises removed)

`attempts` RETAINS its existing mechanics — one increment per non-dedup
run, computed as read-plus-assignment at the structural write
(`const attempts = (existing?.attempts ?? 0) + 1;`, `rebuild.ts:202`;
last-writer-wins upsert; the claim CAS adds no second increment). Under
concurrent runs the read-modify-write MAY lose increments (two concurrent
runs from 5 can both finalize 6) and a stale run MAY regress the value.
Its intended semantics is a BEST-EFFORT diagnostic counter of non-dedup
runs. **NO correctness property, bound, control-flow decision, or test
assertion in this contract may depend on its value or its exactness or
its monotonicity** — the claim CAS never reads `attempts`, dedup never
reads `attempts`, expiry never touches it, and no test asserts it never
decreases (successor-2 §B.6's monotonicity assertion is WITHDRAWN).
Exact per-run accounting is provided by §12 usage records, not this
column. Exact values are asserted ONLY in serialized-driver tests
(T-claim-interleave step 6, `attempts === 2`, deterministic solely
because the driver serializes the structural read-modify-write windows).

### 11.5 Retry ownership and M-bound enforceability

The M-bound (`MEMORY_SUMMARY_MAX_ATTEMPTS`) bounds the gateway attempts
of ONE logical call: the summarizer passes it as `generate`'s
`maxAttempts` (§7.2), which flows to `manager.generate`
(`GenerateOptions.maxAttempts`, `packages/ai-core/manager.ts:120`,
consumed `:306`) and caps the attempt plan; classification-exact counts
are in §11.1. It is enforceable because:
(i) only the claim holder reaches the port (claim CAS §9.2);
(ii) the counter is local to that single invocation — no other path can
inject attempts into the same logical call;
(iii) BullMQ job-level retries — `attempts: MEMORY_REBUILD_MAX_ATTEMPTS`
(= 5) with exponential backoff (`MEMORY_REBUILD_RETRY_BASE_MS` = 1000)
configured on the queue's `defaultJobOptions`
(`apps/worker/src/memory-reconciliation.ts:74-79`; the `memory-jobs.ts:212`
line merely logs it) — are at-least-once REDELIVERY of the same job data,
each redelivery re-gated by the §10 dedup classification and the §9.2
claim CAS, never an additional gateway-retry mechanism (in practice the
handler only throws on programmer errors — malformed data, unknown scope,
revision deleted mid-flight — since `processRebuild` persists build
failures as FAILED rows and returns normally);
(iv) a forced retry is a NEW human-authorized intent (§8) with its own
fresh M budget, bounded by discrete human actions;
(v) terminal writes are identity-fenced, so a stale claimant cannot
inject further attempts into the row's lifecycle.

## 12. Provenance and usage mapping to ACTUAL durable fields (corrects successor-2 §B.4)

### 12.1 Durable fields used (NO `Generation`/`GenerationAttempt` schema change)

| Contract concept | Actual durable field(s) (verbatim, `schema.prisma`) |
|---|---|
| Logical generation call identity | `Generation.id` (one row per logical call; created post-gate, `ai.ts:839-849`) |
| "This Generation is a summary call for row R" | `Generation.task` pinned to `"MEMORY_ARC_SUMMARY"` + `Generation.artifactId` = the `MemoryProjection` row id (input fields exist today, `ai.ts:227-229`/`:261-263`) |
| Attribution (who/what/how) | `Generation.userId`, `.modelProfile`, `.promptVersion` (§7.2), `.component`; row columns `summarizerModelProfile`, `summarizerPromptVersion` |
| Gateway attempt | `GenerationAttempt` row: `generationId`, `attemptNumber` (`@@unique([generationId, attemptNumber])`), `gatewayId`, `requestedModelId`, `reportedModelId`, `inputTokens`, `outputTokens`, `status` (`AttemptStatus`: SUCCEEDED/FAILED/TIMEOUT/RATE_LIMITED), `errorCategory` (`ErrorCategory`), `errorMessage`, `latencyMs`, `startedAt`, `endedAt` |
| Claim identity (row-local) | `MemoryProjection.summaryClaimId` + `.summaryClaimedAt` during flight; consumed intents in `summaryRetryIds` |
| CURRENT accepted logical call linkage | `MemoryProjection.summaryGenerationId` (§7.1 proposal) — a current-selection pointer (§12.3), NOT a historical outcome ledger |

### 12.2 Why `summary_generation_id` is required (explicit proposal item)

Without it, when multiple summary logical calls have hit one row (e.g.
T-claim-interleave: A discarded, B accepted — both Generations carry the
same `task`+`artifactId`), the CURRENT accepted call is not derivable from
existing fields alone. The single nullable UUID on the row (§7.1) closes
this: the OK terminal CAS writes it; the FAILED terminal arm NULLs it.
It identifies the CURRENT selection only; the historical outcomes of
superseded generations remain §12.3 UNKNOWNs — deliberately not
recoverable from this pointer. It is included in the SAME single §7.1
migration and the SAME author gate — listed here explicitly, never added
silently.

### 12.3 Outcome semantics: CURRENT selection vs historical knowledge (ADR-0015; second correction round)

`summaryGenerationId` is a **CURRENT-selection pointer**, not a history:
it names the Generation row selected by the MOST RECENT OK terminal CAS
on the row and is nulled by the FAILED terminal arm (§9.3). Every version
replacement (§9.5) and every later accepted rebuild MOVES the pointer.
From durable state alone, at any instant:

- **CURRENT-ACCEPTED (always derivable):** while `summaryStatus === "OK"`,
  `R.summaryGenerationId` identifies the ONE accepted logical call; its
  `GenerationAttempt` rows are the accepted usage. At most one such call
  exists per row (none while the pointer is null).
- **DISCARDED (derivable, unambiguous forever):** a `Generation` with
  `task = "MEMORY_ARC_SUMMARY"` and `artifactId = R.id` whose logical call
  terminally failed (attempt-plan exhaustion, transport/validation
  terminal — `Generation.status` FAILED/INCOMPLETE) was never selected
  and can never be retro-accepted: its outcome is DISCARDED regardless of
  pointer movement. A transport-succeeded generation whose §9.3 result
  CAS lost (count 0) is likewise discarded-on-arrival — it never held the
  row. A transport-succeeded-but-discarded Generation keeps
  `status: "SUCCEEDED"` with its tokens; its usage is real and retained.
- **UNKNOWN (stated, never guessed):** once the pointer MOVES, an EARLIER
  transport-succeeded generation that is no longer selected can NO LONGER
  be classified from durable state — it was either discarded-on-arrival
  (raced) or previously-accepted-then-superseded, and the schema
  deliberately keeps no history that distinguishes them. Historical
  ACCEPTED/DISCARDED classification of superseded generations is
  therefore UNKNOWN; no consumer may derive it from the CURRENT pointer,
  actor IDs, or timestamps (`AGENTS.md` §13; human acceptance is never
  inferred from database actor IDs). Recovering it would be new
  machinery — out of scope here; if the author ever wants a historical
  outcome ledger, that is a NEW decision (§5.5 pattern).
- **Usage is fully retained regardless (ADR-0015):** every attempt row of
  every summary Generation — current-accepted, discarded, or
  outcome-unknown — is RETAINED, never deleted, never rewritten into
  accepted; usage TOTALS include ALL of them; "accepted-outcome counts"
  are meaningful only for the CURRENT selection and must be labeled as
  such; missing gateway-reported usage stays NULL
  (`inputTokens`/`outputTokens` are nullable) and is recorded as unknown
  — NEVER fabricated (`manager.ts:353-354` already persists nulls on
  failed attempts). The §9.3 CAS losing (count 0) does NOT retroactively
  delete the stale claimant's attempt records. Per-attempt claim identity
  beyond the parent-`Generation` linkage is NOT persisted (no such column
  exists and none is proposed); where a claim linkage is ambiguous, it is
  UNKNOWN — stated, never inferred from actor IDs or timestamps.

## 13. Grounding honesty, validation, and read shapes

### 13.1 What validation proves — and what it does not

Fixed response schema: `{ "summary": string, "coveredFactIds": string[] }`.
Server-side validation (fail-closed, pure function in `packages/memory`,
before any write) enforces:

1. `coveredFactIds` non-empty.
2. Unique members; every member ∈ the row's just-built
   `structural.facts[].factId` set (referential closure — no invented
   fact ids).
3. `summary` non-empty and ≤ `MEMORY_SUMMARY_MAX_CHARS` (new named
   constant; value set at implementation and named in the diff).
4. Fixed section headings (arc state / threads / promises) mandated by
   the prompt template and each required present (exact-string check) —
   the only prose-structure constraint.
5. **No-uncovered-entity closure (mechanical):** allowed name vocabulary
   built from the row's structural content; additionally, registered
   entity names (`StoryEntity.name`, `schema.prisma:1387-1390`) appearing
   in the summary but NOT covered by the scope's structural set → INVALID.

**This proves shape and referential closure, NOT semantic faithfulness:**
prose that misdescribes a covered fact, or invents an unregistered name
(no vocabulary entry exists to match), is NOT machine-detectable in v1 —
ACCEPTED RESIDUAL RISK, mitigations: persisted per-fact provenance,
status/diagnostic visibility via `getMemoryStatus` and existing memory
routes, post-hoc human review. No UI surface renders summaries today and
this contract creates none. No later claim of "validated = faithful" is
licensed. Deterministic failures of 1–5 → terminal `summaryStatus FAILED`,
no retry.

Prompt injection as data: structural fact text is interpolated as fenced
quoted data (established precedent
`apps/api/src/services/orchestrator.ts:203-212`); fact text is DATA,
never instruction (MODEL-EVIDENCE-POLICY §5); output that tried to
"cover" an injected invented fact fails the subset check (T2d).

### 13.2 WHERE provenance is persisted and returned

Persisted on the row (§7.1): `summary`, `summaryStatus`, `summaryError`,
`summaryCoveredFactIds`, `summarizerVersion`, `summarizerModelProfile`,
`summarizerPromptVersion`, `summaryGenerationId`.

Returned — the read shapes change by MORE than two fields:

- `MemoryBlock` and `ArcMemoryEntry` gain FOUR fields: `summary`,
  `summaryStatus`, `summaryCoveredFactIds`, and
  `summaryProvenance: { summarizerVersion, modelProfile, promptVersion,
  actorUserId }` (mirroring row + Generation).
- `MemoryScopeStatus` gains `summaryStatus` (+ `summaryError`), observable
  via `getMemoryStatus` only (`memory.ts:256-262`).
- Both hardcoded sites flip from `null`/`"SKIPPED"` to stored values
  (`memory.ts:159-160`, `:701-702`).
- Failure semantics: summary failure leaves `buildStatus: "OK"`, structural
  payload intact, `summaryStatus: "FAILED"`, `summaryError` set,
  `summary` null; `lastError` stays reserved for STRUCTURAL failures
  (`freshness.ts:87-95`). Recovery to OK via a later successful rebuild of
  the scope (§9.5). Freshness/Invariant-2 interplay: summaries live on the
  revision-pinned row and inherit revision pinning; a newer head revision
  makes the scope STALE through existing derivation
  (`freshness.ts:118-169`) carrying its old summary with explicit
  staleness metadata; the existing `DerivedRebuildIntent` flow remains the
  only invalidation path (constitution invariant 14; NF-WF-009 Invariant 4).
- Observability: no new metrics/endpoints; no logs of model output beyond
  existing Generation audit rows.
- Read authorization: summary reads ride the existing `novel:read` gates
  (`recallNovel`/`readAsOf`/`readGlobalMemory`/`getMemoryStatus`);
  tenant scope from stored rows (404 cross-tenant, Invariant 11).

## 14. Authorization and attribution (settled; execute-time gate)

### 14.1 The gate that exists (inspected)

`generate()` authorizes EVERY call, including worker-side ones:
`ai.ts:826-834` calls
`gateWorkspace(input.workspaceId, input.actorUserId, "generation:create")`,
loading the CURRENT membership row (`ai.ts:370-380`) and enforcing
`requireCapability(role, "generation:create")`
(`packages/auth/authorization.ts:260-262`). The capability map grants
`generation:create` to OWNER/ADMIN/AUTHOR/EDITOR and NOT to VIEWER
(`authorization.ts:34`, `:137`, `:179`, `:217`, `:244`). The contract does
NOT bypass this gate and does NOT authorize by data ownership: novel
creator identity is ATTRIBUTION data, never authority.

### 14.2 Execution authority model (settles old D4)

**Authorize at EXECUTE time through `generate()`'s existing gate; record
the actor at enqueue time; a gate refusal at execute time is a terminal
FAILED summary, not a retry — and costs ZERO logical calls, ZERO gateway
attempts, ZERO durable rows** (§11.1; T-auth-1).

- `MemoryRebuildJobData.actorUserId?: string` (additive): `triggerRebuild`
  stamps the authenticated caller (`novel:update` gate,
  `memory.ts:293`); `processRebuild` passes the job's actor into the
  summarizer port; the gate re-checks CURRENT membership at execution
  time, so a membership REVOKED after enqueue yields
  `NotFoundError("workspace")` / `ForbiddenError` before any model call.
- **Reconciliation-enqueued jobs (no human actor)** are attributed to the
  novel's creator (`novel.createdById`) — the established worker-side
  system-act attribution precedent
  (`apps/worker/src/notification-fanout-jobs.ts:146`). Creator = recorded
  ACTOR only; the execute-time gate is the only authority. If the
  creator's membership is absent or VIEWER-class at execution, the summary
  is FAILED and structural memory stays available — bounded, visible
  degradation, no privilege amplification.
- **Missing/deleted actor:** `Generation.userId` is NULLABLE with no User
  relation/FK (`schema.prisma:617`); user deletion cascades memberships
  (`schema.prisma:222`), so the execute-time gate fails first. This task
  always supplies a real current user id to `generate` (never null);
  a missing membership → summary FAILED with an authorization-classified
  `summaryError`.
- Gateway-classified AUTH failures (post-row) are DETERMINISTIC — no
  retry (constitution §6; `packages/ai-core/errors.ts:20-23` retries only
  TRANSIENT/RATE_LIMIT).
- Row attribution: `summarizerVersion`, `summarizerModelProfile`,
  `summarizerPromptVersion`, acting userId (Generation row + §13.2
  provenance output). No provider/model is chosen by any actor here —
  profile → model mapping is admin data (`ModelProfileMapping`,
  `schema.prisma:595-600`).

## 15. Acceptance and verification

### 15.0 Required real acceptance (AUTHOR DIRECTED — 2026-10-16)

Implement now; do not return another design-only/mock-only handoff.

1. Inspect the existing Windows Docker stack, gateway configuration and
   LONG_CONTEXT_REVIEWER mapping without exposing credentials. Reuse them.
   A blocked real connection is a concrete runtime issue to diagnose, not
   permission to substitute a fake success or reopen settled policy.
2. Validate the approved additive migration on a dedicated test database.
   For the required local real-data rollout, capture and verify a recoverable
   pre-change backup, inspect pending migrations and apply only the approved
   required migration. Preserve working data, unrelated pending work and
   existing Docker volumes. Do not run fault/deletion experiments on working
   data. Restart only the affected app/worker when required by new code.
3. Use an existing real novel/arc with approved structural source facts.
   Trigger through the normal authenticated rebuild API. Run the real worker
   and configured gateway using LONG_CONTEXT_REVIEWER; persist the actual
   generated English summary. Do not edit source canon/manuscript or publish.
4. Verify API acceptance, job execution, source revision, row/status, covered
   fact IDs, Generation/GenerationAttempt linkage and reported usage, then
   read the result through the existing memory surfaces. Repeat an unchanged
   rebuild to verify cache/dedup without unnecessary new model calls.
5. Fix actual observed defects at their responsible layer and repeat only
   affected checks. Run relevant existing regressions plus final lint,
   typecheck and tests once on the final implementation. Do not create new
   mock infrastructure as a prerequisite. Where fault/concurrency cases below
   remain unobserved, report their exact evidence limits; never mark them
   PASS from design or from an unrelated real happy path.
6. Obtain separate review of the exact implemented diff, including migration
   and real-acceptance evidence. Stop at the agreed scope after required
   checks and real read-back succeed. No commit/push/merge/deploy.

Real calls use the author's normal generation-usage accounting and gateway
quota policy. No local token/spend budget or fabricated usage. Generated
summaries remain derived artifacts, not approved canon. Existing deterministic
tests are supporting checks, never substitutes for this real acceptance.

### 15.1 Existing regression seams (supporting checks, not real acceptance)

The fake summarizer alone canNOT prove Generation-row attribution.
Existing seams, retained for applicable regressions; no new mock harness is
required before real implementation or §15.0 acceptance:

- **API-level (canonical):** `AIGateway` fake injected through
  `buildApp`/`createTestDriver` — `apps/api/src/ai.test.ts:98-111`;
  `apps/api/src/workflow-test-driver.ts:50-62` constructs the REAL
  `createAiServices` stack.
- **Worker-level:** `createWorkerAiPath(db, { encryptionKey,
  createGateway: () => fakeGateway() })` — the REAL generate/retrieval/
  compiler ports over a fake gateway
  (`apps/worker/src/worker-ai-path.test.ts:84-95`; production default
  `OmniRouteGateway`, `apps/worker/src/workflow-jobs.ts:138-140`, ports
  `:163-166`).

Where state must be forced (expiry), the test writes the timestamp column
directly. No sleeps. Concurrency uses `Promise.all` DELIVERY plus explicit
test barriers — deferred promises in the fake gateway (or an equivalent
controllable seam) that hold a claimant's logical call in flight —
because `Promise.all` alone cannot establish a required interleaving:
with a fast terminal completion, a second delivery's claim is a VALID
sequential retry, indistinguishable from a broken live-claim exclusion
(A-T7 phase separation; T-conc-dup's loser-count assertions hold under
both interleavings and do not claim exclusion).

### 15.2 Consolidated deterministic case list (all fake-gateway)

Flow and lifecycle:

| ID | Case | Expected deterministic outcome |
|----|------|-------------------------------|
| T1 | Happy path through real `generate` + fake gateway | MemoryProjection row (`OK` + all attribution columns incl. `summaryGenerationId`) AND the `Generation` row (userId = acting member, `modelProfile` = D1 constant, `promptVersion` = template version, `task` = `"MEMORY_ARC_SUMMARY"`, `artifactId` = row id, status `SUCCEEDED`, usage recorded) asserted end-to-end; exactly 1 gateway call |
| T-first-row | First-row creation and claim | Structural row persisted BEFORE claim (§9.2 ordering observable via claim predicate matching 1 row / test hook); after flow `summaryStatus OK`, provenance persisted, `summaryClaimId` null; exactly 1 gateway call |
| T-first-row-fail | First-row creation with build failure (valid references) | `buildStructuralMemory` throws deterministically with ALL references intact — the established lever is an invalid scope id (`scope: "bogus:scope"`, the existing "forced failed" case, `apps/api/src/memory.test.ts:307-325`: builder throws "unknown memory scope") → FAILED structural row via the existing `rebuild.ts:209-225` path; `summaryStatus SKIPPED` (default); NO claim; 0 gateway calls. The Revision row MUST remain intact: the projection's `sourceRevision Revision … onDelete: Cascade` (`schema.prisma:2892-2893`) would cascade-delete the projection row, so the earlier delete-the-Revision fixture was INVALID (a FAILED row cannot reference a deleted revision) and is WITHDRAWN. Missing-source outcome (separate situation, NOT this fixture): a revision deleted mid-flight makes the FAILED upsert itself throw on the FK — a job-level throw (§11.5(iii)) that BullMQ retries then abandons; NO FAILED row exists for a deleted revision (cascade), and that is the correct outcome, not a defect. Arc-scope summary-level terminal failure is covered by T-terminal-validation |
| T-claim-interleave | Expiry/reclaim/stale completion (6 steps) | (1) structural row `SKIPPED`; (2) A claims (count 1), gateway call #1 blocked in flight; (3) force-expire via direct timestamp write + sweeper → `SKIPPED`/"claim expired", `summaryClaimId` null; (4) B claims (count 1, ordinary arm), B's call completes, B's result CAS hits (count 1) → `OK`; (5) A's call now returns valid summary; A's result CAS with `summaryClaimId=idA` → count 0, ZERO rows; (6) final: row `OK` with B's summary, B's provenance, B's covered-fact set byte-identical to step 4; `attempts === 2` (serialized driver ONLY, §11.4); A's summary text appears NOWHERE |
| T-conc-dup | Concurrent delivery, fresh scope | Two `processRebuild` race the same key (`Promise.all`): exactly 1 gateway call; 1 row; coherent accepted summary; loser's claim count 0 and result count 0; `1 ≤ attempts ≤ 2`; dedup no-ops never increment. NOT asserted: `attempts === <racing runs>`; any `attempts` monotonicity; any forced interleaving to pin an exact concurrent value |
| T-expiry-no-model | Sweeper expiry never calls model | Row `SUMMARIZING` with aged `summaryClaimedAt` → `SKIPPED`/"claim expired", `summaryClaimId` null, and `summary`/`summaryCoveredFactIds`/`summaryGenerationId` cleared (MINOR-3 hygiene, §9.4 — asserted on a stale-version row that still carried prior-version bytes); gateway call count unchanged |
| T-version-bump | Version invalidation | Arc row `OK` at v1; bump `SUMMARIZER_VERSION`; rebuild → new claim (stale-version arm), 1 gateway call, summary REPLACED with v2 provenance; a v1 row of a DIFFERENT scope retained untouched |

Dedup and retry:

| ID | Case | Expected deterministic outcome |
|----|------|-------------------------------|
| T-dedup-chapter | Chapter-scope dedup preserved | Chapter row `buildStatus OK`, `summaryStatus SKIPPED`; redeliver N times → every delivery `{deduped:true, ok:true}`, `attempts` UNCHANGED, 0 gateway calls, row byte-identical |
| T-dedup-no-port | Absent-port dedup preserved | Arc row `summaryStatus SKIPPED`, port unbound; redeliver → no-op, `attempts` unchanged, 0 calls, `SKIPPED` untouched (never flipped to FAILED) |
| T-dedup-version-ok | Current-version OK cache hit | Arc row `OK` current version; redeliver → no-op, 0 calls, `attempts` unchanged; forced job with any intent ALSO no-op (§10 case 3) |
| T-dedup-failed-dup | Unforced duplicate of terminal FAILED | Arc row `FAILED` current version; unforced redeliver → `{deduped:true, ok:false}`, 0 calls, `attempts` unchanged |
| A-T1…A-T10 | Forced-retry intent + transport cases | Exactly as specified in §8.4 (incl. A-T6 I/J/I delayed replay, A-T7 barrier-separated concurrent manual requests, A-T9 retained-job-window transport, A-T10 force-without-scope refusal) |
| T-forced-retry | Deliberate retry of terminal FAILED | Same row as T-dedup-failed-dup; forced job, fresh intent → claim count 1, 1 logical call, `attempts` +1, row → `OK` or `FAILED` per validation, intent appended |
| T-terminal-validation | Validation failure terminal | Fake gateway returns §13.1-invalid output → exactly 1 logical call; `FAILED`; identity-fenced write; no further gateway attempt after the returned output fails validation |

Bounds and authorization:

| ID | Case | Expected deterministic outcome |
|----|------|-------------------------------|
| T6 | Attempt bounds within one logical call (M = `MEMORY_SUMMARY_MAX_ATTEMPTS`, passed as `maxAttempts`, single-candidate fake registry with `maxRetries: M−1` pinning plan length M) | (a) M−1 TRANSIENT fails then success → row OK after EXACTLY M gateway calls; (b) M TRANSIENT fails → row FAILED after EXACTLY M calls — never M failures plus an extra success call; (c) a single INVALID_REQUEST or DETERMINISTIC failure → EXACTLY 1 attempt, terminal FAILED (`router.ts:199-201` stops immediately); (d) a single AUTH or UNSUPPORTED failure on the single-candidate registry → 1 attempt, terminal FAILED (no next candidate); (e) validation failure of a returned output → no further attempt, terminal FAILED |
| T-auth-1 | Revoked at execute | Enqueue with actor A; delete A's membership before processing → gate refuses → ZERO Generation rows, ZERO attempt rows, ZERO audit rows (§11.1); row: `buildStatus OK`, `summaryStatus FAILED`, auth-classified `summaryError`, structural payload intact; fake gateway call count 0 |
| T-auth-2 | Reconciliation actor | Reconciliation re-enqueue carries creator id (assert captured payload); creator membership revoked → same terminal-FAILED outcome, no model call |
| T-auth-3 | No ownership authorization | A workspace member WITH `generation:create` who is NOT the novel creator triggers rebuild via `POST /memory/rebuild` → successful summary whose Generation row records THAT member — ownership never gates |
| T5 | Reconciliation never chases summaries | `buildStatus OK` + `summaryStatus FAILED`, unforced sweep → no enqueue, no claim, no call |
| T2 | Deterministic invalid outputs | Invalid JSON; unknown/duplicate covered id; empty covered set; missing heading → terminal FAILED, no retry, structural byte-identical |
| T2a–T2d | Adversarial arms (§13.1) | T2a invented registered entity → FAILED, closure violation named; T2b uncovered prose with no registered-name violation → ACCEPTED `OK` with `summaryCoveredFactIds` exactly the validated set (documents residual risk); T2c oversized → FAILED no retry; T2d injection-as-data → validation indifferent, invented "fact" fails subset check |
| T3 | Structural/freshness separation | FAILED summary keeps freshness `FRESH` (`freshness.ts:78`, `:144`); FAILED structural build still `FAILED` |
| T7 | Authorization/no-new-route regressions | Existing memory route negatives stay green |
| T8 | No-regression | Full `pnpm test` / `pnpm lint` / `pnpm typecheck`; NF052 canonical fixtures green (entry shapes extend by §13.2 fields only) |

### 15.3 Commands and prerequisites

Disposable `novelforge_test_*` Postgres + localhost Redis per preflight;
`pnpm test` (vitest root script, `package.json:15`), `pnpm lint` (`:11`),
`pnpm typecheck` (`:14`); per-suite filter syntax confirmed by the
implementer on the host. §15.0 requires actual configured-gateway calls in
the explicit real acceptance run; do not wire secrets/live calls into default
CI. Record actual results separately from expectations; a contract simulation
is NOT an executed service test. Separate review of the exact submitted diff;
findings resolved before VERIFIED.

## 16. Migration and NON-destructive rollback

- The §7.1 migration is additive and forward-only; historical migrations
  are NEVER edited; idempotent-safe per the GAP-030 DO-block pattern.
- **Rollback is operational, not destructive:** revert the code (worker DI
  back to port-absent → behavior identical to structural-only; read sites
  revert to hardcoded `SKIPPED`) → the summary columns become unread but
  RETAINED — re-applying the code restores every stored summary. No data
  loss at any point. All new columns are nullable or defaulted, so a
  pre-migration binary is unaffected by their existence.
- Any later `DROP COLUMN` cleanup is DESTRUCTIVE: it requires its own
  explicit author scope with a backup taken first and is NOT part of this
  task. Stored summaries are costly artifacts, never treated as
  disposable in operational language.
- Existing data: post-migration rows carry `summaryStatus: 'SKIPPED'` and
  are summarized by the natural paths (§9.5) — no content migration,
  no backfill. Populated and empty databases follow the same additive
  path; concurrent writers are handled by the §9.2 unique-key upsert
  convergence.

## 17. Author decisions (APPROVED — 2026-10-16)

### Approved concrete gateway candidates — 2026-10-16

The author specifies this exact priority order for text generation. These
are catalog/profile configuration data, never application model constants.
Current configured acceptance DB: `novelforge_acceptance_050b` on the existing
`nf-pg-5433` service; gateway `9Router local (050c acceptance)`. Six text
profiles, including LONG_CONTEXT_REVIEWER, now have seven enabled mappings
at priorities 10–70. EMBEDDING is unchanged. Gateway maxRetries is 6 and
the manager default attempt cap is 7. Keep the NF053 per-request attempt
cap sufficient for these seven candidates; a smaller override truncates
fallback. Do not reconfigure the models or rerun the smoke probe needlessly.

| Priority | Model ID | Author-declared context | Gateway-reported context | Configured context |
|---|---|---:|---:|---:|
| 10 | bansosmontera/MiniMax-M3 | 1000000 | 1000000 | 1000000 |
| 20 | bansosmontera/deepseek-v4.1-flash | 1000000 | 1000000 | 1000000 |
| 30 | bansosmontera/agnes-2.5-flash | 512000 | 200000 | 200000 |
| 40 | bansosmontera/laguna-s-2.1 | 1000000 | 1000000 | 1000000 |
| 50 | bansosmontera/mimo-v2.6-flash | 1000000 | 1048576 | 1000000 |
| 60 | bansosmontera/muse-spark-1.3 | 1000000 | 1048576 | 1000000 |
| 70 | bansosmontera/claude-haiku-5-5 | 1000000 | 200000 | 200000 |

M/K are interpreted conservatively as decimal token counts. Configured
context is the lower of author-declared and gateway-advertised values;
advertised size is not proof of a full-window generation. Never silently
truncate mandatory context to fit a smaller fallback. Re-evaluate any larger
payload against the selected model before sending it; a large-window-only
request must skip incompatible candidates or fail explicitly.

Observed real smoke generation `86fdf9e5-1a3f-4ef7-baaa-28468574383b` used
LONG_CONTEXT_REVIEWER, requested `bansosmontera/MiniMax-M3`, reported
`MiniMax-M3`, persisted SUCCEEDED, 931 input / 26 output tokens. This is
gateway configuration evidence, NOT completed NF053 summary acceptance.
Receipts: `.nf-batch-worktrees/author-model-catalog-receipt.json`,
`author-model-config-readback.json`, `author-model-real-generation-receipt.json`.
No provider failure/rate-limit was forced by that successful smoke call.

The author approved the complete §7.1 11-column additive specification and
selected `LONG_CONTEXT_REVIEWER`. The former OPEN/GATE descriptions below
are historical rationale, not active blockers. Implement without asking
again. Actual gateway/profile readiness is a runtime check, not a new policy
decision. User approval does not authorize commit/push/merge/deployment or
automatic acceptance/publication of generated story content.

- **D1 — APPROVED:** summaries request `LONG_CONTEXT_REVIEWER`; resolve
  its actual model through existing ModelProfileMapping/gateway configuration.
- **§7.1 — APPROVED:** the complete 11-column table including
  `summary_claim_id`, `summary_retry_ids` and `summary_generation_id`.
  Migration authoring, implementation and real acceptance are authorized.
  Apply only this scope with the recovery/preflight requirements in §15.0.
- Settled, NOT decisions (never reopened): summary output language
  (standing `AGENTS.md` §10 policy); summary-failure-preserves-structural
  (NF-WF-009 Invariant 6 itself); actor authority (§14.2); column types
  (absorbed into §7.1); ADR-0017 deferral (already authoritative);
  human screen-reader acceptance (deferred separately — never PASS from
  this task).

## 18. Documentation, handoff, and honesty

- On completion: update `docs/implementation/ISSUES-AND-GAPS.md` (F3
  narrowing: arc-scope summaries closed; L6 remains), `progress.md`,
  `docs/14-progress/CURRENT.md`, `test-matrix.md`; Engram checkpoint
  topic `novelforge-ai/nf-wf-053-contract` with confirmed read-back;
  deviations get GAP numbers in the single register.
- **Evidence classification for THIS file** — Observed on host
  (2026-10-16, including the second correction round): Git state (main @
  `4227594`, 5 modified doc-WIP files, untracked `.nf-batch-worktrees/`,
  `.harness-memory/`, `output.txt`, stash `nf050b-acceptance-wip`); all
  four frozen-artifact SHA256 values; the pre-correction consolidated
  contract copy `.nf-batch-worktrees/nf053-contract-consolidated-pre-correction-2026-10-16.md`
  (sha256 `9a3c18bf2fa5d0a57d2b9218b5a762ad00d11ff1102ca0862cd76a20e3bfab8c`,
  byte-identical to the submitted consolidation); direct source reads
  cited throughout (`rebuild.ts`, `ai.ts`, `memory.ts`, `memory-jobs.ts`,
  `memory-reconciliation.ts`, `memory-queue.ts` — retention options
  `removeOnComplete/Fail: 100` — `ai-registry.ts`, `manager.ts`,
  `schema.prisma` — MemoryProjection `sourceRevision` cascade FK at
  `:2892-2893` — `authorization.ts`, `freshness.ts`, `memory-routes.ts`,
  `constants.ts` — `memoryRebuildJobId` at `:56-58` — `types.ts`), BullMQ
  5.81.5 `addStandardJob-9.lua:89-93` + `handleDuplicatedJob` (duplicate
  suppression on retained jobIds), and the existing build-failure fixture
  (`apps/api/src/memory.test.ts:307-325`, invalid-scope lever).
  Retained (not re-verified): CI run38717181655; D2 rendered evidence and
  corrected receipts; external review receipts of the frozen chain;
  NF052 integration. Inferred/contractual: ALL §8–§13 mechanics are
  DESIGN for implementation — no test named here has run; predicate
  evaluations are contract-model simulations, not executed service tests.
  Proposed: §7.1 columns; D1 recommendation. Reviewer verdicts and memory
  records are neither source truth nor author approval; human acceptance
  is never inferred from database actor IDs.
- **Unknowns (carried):** exact worst-case bounded summary duration to
  size `MEMORY_SUMMARY_CLAIM_TTL_MS` (default 10 min is a proposal;
  tunable constant, not a decision gate); gateway
  `ModelProfile`→model availability (deployment data); per-suite vitest
  filter syntax (host confirmation at implementation); whether `readAsOf`
  historical reads should ever SUPPRESS summaries rather than serve the
  selected row's summary — current contract serves the selected row's
  summary under the same provenance discipline (flagged for review).
- Next dependency-ready step after approvals: implementation dispatch per
  `docs/06-ai/MULTI-LLM-ORCHESTRATION.md` with one writer per file and a
  separate reviewer of the exact diff.
