# Task NF-WF-002A: Restore API fixture compatibility with C8

Status: IMPLEMENTED / REVIEWED — APPROVE. Executed 2026-10-02 on the preserved
NF-WF-002 diff. Milestone: M1 / G-01. Capability: CAP-03.
Owner: implementer, requested `deepseek-v4.1-flash`; independent reviewer,
requested `glm-5.3-flash`. Record actual routing evidence; unknown backend
identity remains GAP-013, never a fabricated model receipt.
Observed documentation baseline: HEAD `811e7e68debdd7550b5516df96637d227d10fdf6`
with the existing dirty NF-WF-002 implementation. Record the actual baseline
and diff at dispatch and preserve all existing changes.
Engram topic: `context/NF-WF-002A/<worktree>/implementer`.

## Goal and dependencies

Repair GAP-017 by bringing valid-novel fixtures through C8's creation-time
initialization. Preserve the head CAS, baseline refusal and existing test
coverage. NF-WF-001's reviewed contract and the delivered NF-WF-002 code are
inputs; full NF-WF-002 acceptance is still pending, not a prerequisite for
repairing its test gate. The author authorized this bounded follow-up through
the documentation-update request on 2026-10-02. Confirm one writer per file
and that no previous dispatch still owns the fixture paths before editing.

Read the loaded constitution, MODEL-EVIDENCE-POLICY, STORY-VERSIONING C4/C8,
ADR-0014, NF-WF-002 and GAP-017/018/020. Inspect relevant sections only:
`apps/api/src/services/platform.ts` (`createPlatformServices`, `createNovel`),
`services/revisions.ts` (`advanceHead`), `revision.test.ts` (`seedNovel` and
deliberate missing-baseline case), the seed helpers below, database cleanup
and actual package scripts.

## Scope and outputs

This is an explicit fixture-only extension of NF-WF-002's previous scope.
Allowed implementation paths, limited to imports and fixture setup/cleanup:

- `apps/api/src/canon.test.ts`
- `apps/api/src/character.test.ts`
- `apps/api/src/manuscript.test.ts`
- `apps/api/src/narrative.test.ts`
- `apps/api/src/planning.test.ts`
- `apps/api/src/story.test.ts`
- `apps/api/src/orchestrator.test.ts`
- `apps/api/src/ai.test.ts`
- `apps/api/src/definitions.test.ts`
- `apps/api/src/retrieval.test.ts`

Allowed evidence paths: this task's status; NF-WF-002's current status;
`docs/implementation/{ISSUES-AND-GAPS,progress,test-matrix}.md`;
`docs/14-progress/CURRENT.md`. All other paths are read-only, including
production services/routes, dependencies, lockfile, schema, migrations,
`.env`, root constitutions and the deliberate negative fixtures in
`revision.test.ts`. No shared fixture framework or new helper file is needed.

Output: the 12 currently identified valid-fixture creation sites across these ten suites
are compatible with C8. Reconfirm the current sites before editing; do not
perform a repository-wide replacement of raw novel creation. A source search
on this documentation baseline found 13 raw creation calls across API tests:
12 in the ten allowed suites and one intentional missing-baseline fixture in
`revision.test.ts`, which must stay untouched.

## Required behavior

Prefer the existing production `createNovel` service or authenticated API,
reusing the suite's actual database, audit service and authorized owner.
`revision.test.ts` demonstrates API creation; `platform.ts` exposes
`createPlatformServices({ db, audit }).createNovel(...)`. These are observed
interfaces, not new proposals. Avoid hand-copying the baseline transaction.
Preserve fixture return shapes, workspace membership, novel settings, and
cross-novel/cross-tenant test identities, including the two additional-novel
sites in definitions/retrieval. Account for creation-time audit rows in setup
without deleting the audit evidence of the behavior being tested.

The valid fixture must have exactly one `main` branch, its non-null head at
the first `BASELINE` revision, and the revision's change set; initialization
must not invent a snapshot or explicit checkpoint. Preserve C8's missing-head
409 for deliberately invalid/pre-baseline novels. Never fix this by lazy
initialization in `advanceHead`, by accepting 409 instead of intended success,
by disabling tests, by dropping concurrency/tenant assertions or by relaxing
authorization. Genuine production defects remain outside this task: record
and propose a bounded follow-up rather than disguising them as fixture issues.

## Acceptance and commands

- [x] Reproduce the fixture failure on the preserved implementation diff in
      an isolated test environment and record selected suites/results.
      — `canon.test.ts` alone: `44 failed | 12 passed (56)`, all
      `{"error":"CONFLICT"}: expected 409 to be 201` at `createEntity`.
- [x] All 12 identified valid-fixture sites follow the supported creation path; setup and
      cleanup remain isolated across suites. Review both additional-novel sites.
      — all 12 now call `createPlatformServices({ db, audit: createAuditService(db) }).createNovel`;
      no raw `db.novel.create` remains in the ten files; both additional-novel
      sites reviewed.
- [x] Existing C8 initialization and missing-baseline negative tests in
      `src/revision.test.ts` pass unchanged. Original domain/tenant/concurrency
      assertions remain meaningful; no new skip or reduced test selection.
      — `revision.test.ts` unmodified, `25 passed (25)`. Two fixture-internal
      assertions were updated for the production seeding path (the manuscript
      audit-action array and the narrative race-test interception point); both
      are itemized in `test-matrix.md` G-01 and neither relaxes an assertion.
- [x] Targeted ten-suite run, full API suite, and root tests all pass; record
      current selected counts and explanations for additions/changes. Earlier
      receipts were API 338 selected and root 797 selected; they are reference
      counts, not permission to delete tests or a substitute for inventory.
      — ten suites `288 passed (288)`; API `338 passed (338)`; root
      `796 passed | 1 skipped (797)` (the one skip is the pre-existing
      `describe.skipIf(!WORKER_IT_REDIS_URL)` case). `pnpm lint` and
      `pnpm typecheck` exit 0.
- [x] Independent review covers the exact fixture diff and preserved negative
      coverage. Record REVIEW_PENDING if unavailable. Passing this child alone
      does not make NF-WF-002 or G-01 VERIFIED.
      — **VERDICT: APPROVE** from two separate reviewer workers over the final
      diff `sha256
      d775ad1fd867098b60072e359449c780175b6b8add26582387d51acb8f65edd8`
      (439 lines). The pre-review identity was `sha256 885dabaa…` (417 lines);
      the difference is the two `narrative.test.ts` fixes it required. Findings, both
      non-blocking and both fixed: (1) the race test's header comment misstated
      the intermediate state — the parked write has not executed, so the second
      request commits `FRICTION → DEFEAT`; comment corrected. (2) The held-open
      interactive transaction spans a second HTTP round trip, so the 5 s
      default Prisma timeout could abort it on a slow machine; fixed by passing
      `{ timeout: 30_000, ...opts }`. Reviewer 1 independently confirmed from
      the Prisma 7.10 runtime source that model delegates are proxies with a
      written-keys `get` trap, so `db.antagonist !== itx.antagonist` and the
      original spy genuinely never fired; it could not run the suites (no
      database) and said so. Reviewer backend model identity is unproven —
      GAP-013, recorded honestly, no fabricated receipt. GAP-017 stays
      VERIFY_PENDING pending parent acceptance in NF-WF-002B.

Use only a confirmed disposable test database. GAP-020's historical checks
used port 5433; verify the current endpoint and connectivity rather than
assuming that workaround is still running. Do not print credentials. The
`db:test:prepare` script drops/recreates its test database: run it only after
confirming the target is disposable and no concurrent worker owns it.
— Re-verified 2026-10-02: 5432 refused (`ECONNREFUSED`) and a stale endpoint
held the compose bind; the isolated `nf-pg-5433` container was used, and
`db:test:prepare` dropped/recreated only `novelforge_test`. GAP-020 updated.

```text
pnpm --filter @novelforge/database db:test:prepare
pnpm --filter @novelforge/api exec vitest run src/canon.test.ts src/character.test.ts src/manuscript.test.ts src/narrative.test.ts src/planning.test.ts src/story.test.ts src/orchestrator.test.ts src/ai.test.ts src/definitions.test.ts src/retrieval.test.ts
pnpm --filter @novelforge/api exec vitest run src/revision.test.ts
pnpm --filter @novelforge/api exec vitest run
pnpm lint
pnpm typecheck
pnpm test
```

These are required future checks, not results of the documentation update.
Reuse existing NF-WF-002 build/migration receipts only with their original
diff attribution; the final integrated review decides which require rerunning.
Do not stash/reset someone else's dirty implementation to establish a baseline.

## Migration, rollback and handoff

No new migration, production-data mutation or deployment. Rollback only this
fixture patch while preserving the preceding implementation. Update GAP-017
to FIX_READY or VERIFY_PENDING until both actual checks and independent review
support CLOSED. Save a scoped Engram checkpoint using the current runtime
binding, or record the failure and fallback handoff in existing progress.
Then hand off to NF-WF-002B; NF-WF-003 remains gated by parent acceptance.

Executed outcome: no migration, no production-data mutation, no deployment.
Rollback is `git checkout --` over the ten fixture files only; the NF-WF-002
implementation beneath them is untouched and must stay. GAP-017 moved to
VERIFY_PENDING. **No Engram checkpoint was written:** the resume hook reported
no authoritative registered runtime identity, so per GAP-021 the fallback
handoff is the NF-WF-002A entry in `docs/implementation/progress.md` (including
its "Checkpoint state — Engram unavailable" section). No session ID was
invented, derived or reused.
