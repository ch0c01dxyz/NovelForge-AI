# Task NF-WF-060: Canon summary projection — first registered intent pipeline

Project language: English for all authored/revised artifacts and generated
project content; UI uses English (`en`)/Bahasa Indonesia (`id`) locale keys
and resources with English fallback. No author override recorded for this task.
Model selection: author-selected at runtime. Implementer and reviewer are
separate actors; the implementation session must not approve its own diff.

Status: VERIFIED AFTER POST-REVIEW REPAIR (2026-10-25); earlier acceptance below
predates the post-implementation branch/ownership review. Publication authorized.
Milestone / capability IDs: derived rebuild intent lifecycle (ADR-0017),
canon summary projection (ADR-0022)
Implementer role / requested and resolved model: coding implementer, session
model (resolved at runtime; no model is mandatory)
Reviewer role / requested and resolved model: independent code reviewer,
separate actor, resolved at review time
Readiness evidence / unresolved decisions / parent acceptance owner:
ADR-0017 accepted 2026-10-25; ADR-0022 accepted 2026-10-25; C6/C7 amendment
dated 2026-10-25. No unresolved design decision. Acceptance owner: the author.
Frozen review manifest / exact artifact paths and identity: the diff of
Tasks NF-WF-057..059 plus this task in branch `feat/derived-rebuild-intents`
(manifest is the submitted diff, not a hash of itself).
Baseline revision / local changes to preserve: `97dbcf3`; preserve the
untracked plan `docs/superpowers/plans/2026-10-25-derived-rebuild-intents.md`.
Engram checkpoint topic key / last confirmed observation reference:
Engram MCP was not available in this session. A concise fallback handoff lives
in the plan file and this contract; this limitation is recorded in
ISSUES-AND-GAPS with the acceptance evidence.

## Goal and reason

Make `canon` intents real rebuild work. A committed canon mutation writes a
PENDING intent; the consumer must claim it, build a bounded `canon_summaries`
digest at the intent's source revision, and record FRESH/FAILED truthfully.
The other six projections remain terminal audit (ADR-0017 Option B).

## Required reading

- [Operating constitution](../../AGENTS.md).
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- [ADR-0017](../../docs/adr/ADR-0017-derived-rebuild-intent-end-state.md).
- [ADR-0022](../../docs/adr/ADR-0022-canon-summary-projection.md).
- [STORY-VERSIONING](../../docs/03-domain/STORY-VERSIONING.md) C6, C7, C10 and
  the 2026-10-25 amendment.
- `apps/worker/src/derived-intents.ts`, `packages/story-versioning/impact.ts`,
  `packages/database/prisma/schema.prisma`.

## Environment prerequisites

Windows host reusing the existing Docker PostgreSQL and Redis services; no
stack reset. Read-only acceptance database `novelforge_acceptance_050b` on
port 5433. Disposable test databases `novelforge_test_*` on the same host are
created and dropped by the suites. pnpm and Node 24 on PATH. No provider
network call is required.

## Dependencies and evidence

- ADR-0017 accepted (2026-10-25) — audit end-state.
- ADR-0022 accepted (2026-10-25) — `canon` opt-in and artifact definition.
- Consumer machinery from NF-WF-057 (`apps/worker/src/derived-intents.ts`) with
  lifecycle tests passing.
- Active issue: the NF-WF-009 intent-lifecycle entry in ISSUES-AND-GAPS; it is
  closed only by NF-WF-061 evidence, not by this contract.

## Scope

Allowed paths:
- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20261025_canon_summary_projection/`
- `packages/database/prisma/migrations/20261025_derived_intent_lookup_indexes/`
- `packages/story-intelligence/canon-summary.ts`
- `packages/story-intelligence/canon-summary.test.ts`
- `packages/story-intelligence/index.ts`
- `packages/story-versioning/intents.ts`
- `packages/story-versioning/index.ts`
- `packages/story-versioning/restore-scope.ts`
- `packages/story-versioning/restore-scope.test.ts`
- `packages/ai-services/src/canon-summary.ts`
- `packages/ai-services/index.ts`
- `apps/worker/src/canon-summary.ts`
- `apps/worker/src/canon-summary.test.ts`
- `apps/worker/src/derived-intents.ts`
- `apps/worker/src/derived-intents.test.ts`
- `apps/worker/src/index.ts`
- `apps/api/src/services/canon-summary.ts`
- `apps/api/src/services/derived-intents.ts`
- `apps/api/src/canon-summary-routes.ts`
- `apps/api/src/derived-intents-routes.ts`
- `apps/api/src/canon-summary.test.ts`
- `apps/api/src/derived-intents.test.ts`
- `apps/api/src/app.ts`
- `apps/web/app/components/workspace/HealthMemoryPanel.vue` (comment only)
- `docs/adr/ADR-0017-derived-rebuild-intent-end-state.md`
- `docs/adr/ADR-0022-canon-summary-projection.md`
- `docs/03-domain/STORY-VERSIONING.md` (dated amendment)
- `docs/implementation/ISSUES-AND-GAPS.md` (closure record)
- `docs/14-progress/CURRENT.md` (progress evidence)
- `tasks/NF-WF-060-canon-summary-projection.md`

Forbidden paths: everything else, including any new canonical mutation,
Redis/BullMQ wiring for intents, LLM calls, UI changes, and unrelated
migrations.

Inputs: `RebuildHandler`/`HandlerRegistry` from `apps/worker/src/derived-intents.ts`;
`CanonFact.status` values ACTIVE/SUPERSEDED/RETRACTED; `StoryEntity.kind`;
`revisions.created_at`, `branch_id`, `number`.

Outputs: `canon_summaries` rows; `buildCanonSummaryDigest`;
`rebuildCanonSummary(db, input)` exported from `@novelforge/ai-services`;
`createCanonSummaryHandler`; `PIPELINE_PROJECTIONS = ["canon"]`;
`GET/POST .../canon/summary[/rebuild]`.

Out of scope: richer canon summaries (new ADR), intent pipelines for the other
six projections, pruning RebuildStatus values, UI consumption of the summary.

## Behavior and invariants

Happy path: the sweep groups eligible canon intents by `(projection, branch)`,
claims the newest with a CAS (`PENDING` or backed-off `FAILED` → `RUNNING`,
attempts incremented), supersedes older eligible intents to `STALE`, rebuilds
the digest at the claimed `source_revision_id`, then marks `FRESH` with
`completed_at`.

Invalid input: a nonexistent or foreign `source_revision_id` throws; the intent
becomes `FAILED` with `last_error` and is retried with exponential backoff up
to 5 attempts.

Authorization/tenant: both API routes resolve membership and novel
server-side; missing membership or a missing/foreign novel is the same 404
(ADR-0004). Read requires `novel:read`; rebuild requires `novel:update`.

Missing/stale source: no summary → `MISSING`; a same-branch
`PENDING`/`RUNNING`/`FAILED` canon intent with a greater source revision
number than the summary → `STALE`; otherwise `FRESH`.

Retry/idempotency: `UNIQUE (projection, source_revision_id)` keeps intent
writes idempotent; `canon_summaries` upserts on
`(novel_id, branch_id, source_revision_id)` so re-running a rebuild against
unchanged source data yields the same values and creates no duplicate row.

Concurrency: two sweeps may race; the CAS admits exactly one claim. A worker
crash leaves `RUNNING`; the lease reaper moves it to `FAILED` after 5 minutes.

Failure: a failed rebuild leaves the previous summary intact and a `FAILED`
intent; the read surface never reports `FRESH` for it.

## Acceptance and verification

- [x] `buildCanonSummaryDigest` unit tests: status/kind counts, deterministic
      predicate ranking (code-unit order), 20-predicate cap and truncation flag.
- [x] `rebuildCanonSummary` DB tests: the source revision's own writes are
      included, rows of the next revision are excluded at a non-head revision,
      everything is included at the head, and idempotent upsert (same row id,
      one row).
- [x] Worker tests: canonical rebuild through the intent sweep (registered
      handler), registry matches `PIPELINE_PROJECTIONS`, supersession beyond the
      batch window, lease reaper, CAS single winner.
- [x] API tests: 401; MISSING → rebuild → FRESH; newer canon intent → STALE;
      rebuild → FRESH; foreign workspace 404; foreign revision rejected;
      branch-scoped status counts.
- [x] `pnpm --filter @novelforge/worker typecheck` and
      `pnpm --filter @novelforge/api typecheck` exit 0.
- [x] Additive migration applies to a disposable database and to acceptance
      (58 migrations; `canon_summary_projection` plus
      `derived_intent_lookup_indexes`).
- [x] Separate reviewer verifies the exact diff; findings resolved
      (APPROVE_WITH_FINDINGS, all four resolved).

## Migration and rollback

New additive table `canon_summaries` with four cascading FKs and two indexes.
No existing data is rewritten; no existing column changes. Rollback before
first production use: drop the table and the migration row. After rows exist,
dropping loses only derived data; canon is untouched. Deploy order: migration
first, then API/worker code that reads it.

## Post-review repair scope — 2026-10-25

The author authorized fixing all three reported findings, committing safe project
changes and pushing main. Production deployment is not part of this repair.
Historical timestamp-based acceptance is retained above but superseded by the
ADR-0022 source/ownership amendment. An unavailable historical source must fail
rather than substitute live data. Required regressions cover exact historical and
inactive-branch snapshots, unavailable/malformed source preserving the prior row,
concurrent head advance, expired claim/reclaim, atomic artifact/outcome, fenced
failure and draining shutdown. Preserve all other uncommitted work and stashes.

Repair verification:32database/API cases plus13retained pure cases passed;
ai-services/API/worker typechecks exited0. Source and worker repairs received a
separate read-only APPROVE. Disposable database migration application passed in
the suites; no production or acceptance database was mutated during the repair.
Registered handlers now use the supplied transaction client. Historical sources
without a usable exact snapshot fail explicitly; the head rebuild endpoint remains
the recovery path. The old timestamp/current-status approximation is superseded.
