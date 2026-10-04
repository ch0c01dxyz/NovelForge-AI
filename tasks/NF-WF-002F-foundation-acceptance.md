# Task NF-WF-002F: Verify and accept the integrated revision foundation

Status: **VERIFIED** (evidenced foundation scope only) — 2026-10-04, by
`deepseek-v4.1-flash`. See the Verdict section at the end of this file.
Self-verification: the one independent verdict that exists is 002D's
(`glm-5.3-flash`, APPROVE, backend MODEL_UNVERIFIED per GAP-013).
Milestone: M1 foundation slice / G-01.
Requested verifier/reviewer: `glm-5.3-flash`; coordinator/implementation owner:
`deepseek-v4.1-flash`. Record actual available model evidence (GAP-013).
Availability update (author, 2026-10-03): GLM is inactive; only DeepSeek is
active. Preserve this acceptance gate while 002D implementation/checks proceed.
No substitute reviewer has been dispatched and no review exception is approved.
Baseline: record HEAD, dirty paths and immutable review artifacts at dispatch.
Engram topic: `context/NF-WF-002F/<worktree>/verifier`.

## Goal and dependencies

Decide whether the complete NF-WF-002 implementation satisfies its acceptance
contract, after children 002A–002D. A passing child or a historical green run
does not independently accept the parent. This task verifies existing work;
it does not implement another feature or approve production deployment.

Required inputs: NF-WF-002 contract; reviewed 002A fixture, 002B C12 contract,
002C snapshot-ordering and 002D concurrency artifacts; STORY-VERSIONING
C1–C12; ADR-0014; current source; G-01 receipts; GAP-004/011/013/017–024.
Reopen only relevant files. Verify which prior receipts still describe the
submitted implementation; never treat dirty HEAD alone as a diff identity.

## Scope

Production code, test code, schema, migrations and configuration are read-only.
Allowed writes: this task and parent task statuses;
`docs/implementation/{progress,test-matrix,ISSUES-AND-GAPS}.md`;
`docs/14-progress/CURRENT.md`; next-task pointer in START-HERE and DELIVERY-PLAN.
Preparing the next task may create a bounded `tasks/NF-WF-003-*.md` contract,
but may not invent interfaces without inspecting consumers and relevant source.

Use confirmed disposable databases for test setup and migration verification;
no live-data restore, destructive rollback, blind stash/reset, dependency
upgrade, skipped failures or security workaround. If a check fails, leave
parent acceptance pending and record/reopen its issue with a bounded repair
owner. Do not repair production code inside this verification task.

## Acceptance evidence

- [ ] Review the complete implementation manifest and affected interfaces;
      enumerate which code/test/contract artifacts each child review covers.
      Review changed or uncovered portions independently. Unchanged artifacts
      may retain attributed prior reviews; do not restart all review rounds.
- [ ] Verify C8 creation-time baseline, complete snapshot coverage, required
      checkpoint refusal, non-destructive restore and authorization/tenant
      isolation through actual tests, not schema inspection alone.
- [ ] Verify PRE_MUTATION payload contents and rollback at all four HIGH sites,
      retaining 002C's discriminating tests and proof receipts. Historical
      checkpoints made under the old ordering are not repaired by new code;
      record that limitation without rewriting snapshots.
- [ ] Verify 002D's optional tri-state assertion, authorization before head
      disclosure, stale-head 409 metadata, and forced race between pre-check
      and lock. Preserve checkpoint/restore and chapter expectedVersion behavior.
- [ ] Verify canonical mutation and durable rebuild intent atomicity and
      relevant duplicate/outage behavior. No model call or human wait inside
      the database transaction.
- [ ] Run selected package/API/constraint tests, full API and root tests,
      lint/typecheck/build on the submitted implementation. Record counts,
      skips, commands and environment; zero-selected tests never pass.
- [ ] Validate empty and populated upgrade evidence against the submitted
      schema/migrations. Rerun a stale or insufficient receipt in scratch
      only; disclose GAP-018's migration-history drift and any scratch-only
      workaround. Do not reinterpret a prior workaround as a repaired dump.
- [ ] Dispose every acceptance-relevant open issue explicitly. Close only
      verified scope; keep remaining character/canon/timeline joins owned by
      NF-WF-003/010, rather than closing all GAP-011 on nullable FK existence.
- [ ] Keep GAP-023 owned by 002E and the NF-WF-004 consumer-design investigation.
      A producer/outbox is not required speculatively for this foundation gate;
      document what G-01 does and does not accept. No author deferral or event
      capability completion is implied. If source inspection establishes that
      G-01 actually depends on it, block with evidence and a concrete decision.

Existing commands (verify current scripts and test prerequisites first):

```text
pnpm --filter @novelforge/database db:test:prepare
pnpm --filter @novelforge/story-versioning test
pnpm --filter @novelforge/api exec vitest run src/revision.test.ts src/canon.test.ts src/planning.test.ts src/manuscript.test.ts
pnpm --filter @novelforge/database exec vitest run test/revision-constraints.integration.test.ts
pnpm --filter @novelforge/api exec vitest run
pnpm lint
pnpm typecheck
pnpm test
pnpm -r build
```

`db:test:prepare` drops/recreates its target; confirm it is disposable, record
its redacted identity, and ensure no other worker owns the database first.
Populated-upgrade checks use an existing dump restored into a separate scratch
database and the actual deploy script. Keep credentials out of receipts.

## Verdict and next contract

Return VERIFIED only for the evidenced foundation scope, otherwise
CHANGES_REQUESTED/BLOCKED/REVIEW_PENDING with exact findings and next action.
Unknown backend identity is reported separately; independent review cannot be
fabricated. Any waiver must cite an explicit author decision, not a coordinator's
guess. No full M1, author-loop, reader or platform completion follows from G-01.

On acceptance, update parent/G-01 status and scope-specific issue receipts.
Prepare NF-WF-003 by inspecting actual outline approval, story position,
revision/source pins, bounded fact selection and direct/workflow compiler
callers. Its contract must name exact paths, mandatory-context overflow
behavior, temporal/tenant constraints and executable negative tests. Review
the contract before dependent coding. NF-WF-004 may be prepared independently
only with frozen shared interfaces and disjoint ownership; do not dispatch both
as an unbounded swarm.

No migration is authored/applied to live data and no production rollback is
performed. Save a confirmed runtime-bound checkpoint, or preserve fallback
handoff in progress if the current binding is unavailable. Report the next
READY action without silently converting a queue row into a coding contract.

---

# VERDICT — 2026-10-04: VERIFIED (evidenced foundation scope only)

Verifier: `deepseek-v4.1-flash` (this session's runtime model), running the
checks itself. **This is not an independent review.** The 002D production
diff carries the one independent verdict that exists (`glm-5.3-flash`,
APPROVE, backend MODEL_UNVERIFIED per GAP-013). Everything below was executed
by the same model that is writing the verdict, so it is self-verification and
must be read as such.

## Baseline

- HEAD `811e7e6`; 42 modified paths, 14 untracked — the NF-WF-002 tree, not a
  clean checkout. Review artifacts were compared to this tree, not to dirty
  HEAD alone.
- Scratch PostgreSQL 16.15, container `nf-pg-5433` (image
  `pgvector/pgvector:pg16`), published `127.0.0.1:5433->5432`, on its own
  fresh named volume `nf-scratch-5433` — deliberately NOT the repo's
  `novelforge-ai_postgres_data` volume, so no live/dev data is reachable from
  it. `DATABASE_URL` passed per command; the repo `.env` was not modified.
- GAP-020 re-observed and worse than recorded: `docker port
  novelforge-ai-postgres-1` returns **empty** — the running compose container
  publishes nothing, and the listeners on host `:5432` belong to
  `com.docker.backend` (pid 15536) and `wslrelay` (pid 380). Repo credentials
  against `127.0.0.1:5432` fail `28P01`. The workaround is therefore still
  required, and the port is held by the Docker/WSL relay rather than a
  forgotten container.

## Gate results (all green, this session, against this tree)

| Gate | Command | Result |
| --- | --- | --- |
| Package | `pnpm --filter @novelforge/story-versioning test` | 1 file, **17/17** |
| Constraints | `pnpm --filter @novelforge/database exec vitest run test/revision-constraints.integration.test.ts` | 1 file, **8/8** |
| Targeted API | `vitest run src/revision.test.ts src/canon.test.ts src/planning.test.ts src/manuscript.test.ts` | 4 files, **137/137** |
| Full API | `pnpm --filter @novelforge/api exec vitest run` | 15 files, **365/365** |
| Root | `pnpm test` | 38 files, **823 passed \| 1 skipped (824)** |
| Lint | `pnpm lint` | exit 0 |
| Typecheck | `pnpm typecheck` | exit 0 |
| Build | `pnpm -r build` | exit 0 |

Zero-selected tests never passed: every suite above reported a non-zero file
and test count.

## Empty upgrade

`pnpm --filter @novelforge/database db:test:prepare` against the scratch
server: `novelforge_test` dropped and recreated, **all 20 migrations applied
from empty**, exit 0, final line
`postgresql://novelforge:***@127.0.0.1:5433/novelforge_test`.

## Populated upgrade — GAP-018 reproduced, mechanism narrowed to a partial apply

`.local-backup-novelforge-dev-20261002.sql` restored into a separate scratch
database `nf_upgrade_002f` (`psql -v ON_ERROR_STOP=1`, exit 0), then
`prisma migrate deploy`:

```
Error: P3018
ERROR: relation "canon_proposals_object_entity_id_idx" already exists
```

**Reproduced exactly as GAP-018 records**, on a database containing none of
this task's changes. The dump's `_prisma_migrations` holds 10 of 19 rows.

The documented workaround was then applied —
`prisma migrate resolve --applied 20260930_phase6_evidence_fk_hardening` —
after which `migrate deploy` applied the remaining **7** migrations including
`20261006_m1_story_versioning`, exit 0.

**C8 backfill on real populated data — correct.** 2 novels → 2 `main`
branches, 2 BASELINE revisions, **0** branches without a head, **0** BASELINE
revisions without a change set. Snapshots, checkpoints and rebuild intents
all 0, which is the honest state: the migration deliberately creates no
snapshot (it would hold one transaction over the whole database), and no
post-migration mutation has run.

**New finding — a failed `migrate deploy` is PARTIALLY APPLIED, and the
documented workaround makes the damage permanent.** The populated database is
NOT schema-equivalent to a fresh one. `pg_dump --schema-only` of both,
diffed:

```
< ALTER TABLE ONLY public.canon_fact_sources
<     ADD CONSTRAINT canon_fact_sources_chapter_version_id_fkey
<       FOREIGN KEY (chapter_version_id) REFERENCES public.chapter_versions(id)
<       ON UPDATE CASCADE ON DELETE RESTRICT;
< ALTER TABLE ONLY public.canon_fact_sources
<     ADD CONSTRAINT canon_fact_sources_reference_version_id_fkey
<       FOREIGN KEY (reference_version_id) REFERENCES public.reference_versions(id)
<       ON UPDATE CASCADE ON DELETE RESTRICT;
```

Exactly two statements, both the RESTRICT FKs
`20260930_phase6_evidence_fk_hardening` exists to create.

**Mechanism, measured — not inferred.** On a third fresh restore
(`nf_dump_raw`) the FK set was read *before* and *after* the failing deploy:

| | `canon_fact_sources` FKs |
| --- | --- |
| raw dump, as restored | 4 — including both `RESTRICT` ones |
| after the failed `migrate deploy` | 2 — `chapter_version_id` and `reference_version_id` gone |

The migration's two leading `DROP CONSTRAINT` statements **commit**, then
`CREATE INDEX` fails, and Prisma records the migration as failed
(`finished_at` NULL, `rolled_back_at` NULL) with the drops left in place.
`prisma migrate resolve --applied` then marks it applied, so the
`ADD CONSTRAINT` half never runs. **The workaround is not a skipped no-op —
it is what strips the constraints.** GAP-018's original cause statement ("the
database already holds that migration's end state, the FKs are `RESTRICT`")
is therefore **correct**, and was confirmed here; an earlier draft of this
verdict refuted it, which was wrong — that draft had read the FK set only
*after* deploy, by which point the drops had already committed. Corrected
before recording.

**Behavioural proof** (same `BEGIN … ROLLBACK` probe against both databases):
on the workaround-built populated DB, `DELETE FROM chapter_versions` for a
version cited by a `canon_fact_sources` row **succeeds** and orphans the
citation (`ORPHAN_SOURCES=1`); on the from-empty DB the same DELETE is
**refused** by `canon_fact_sources_chapter_version_id_fkey`. That is exactly
the silent evidence loss the migration's own header says it prevents.

Scope: **pre-existing and outside NF-WF-002.** The M1 migration is unaffected
— all nine M1 objects (8 tables, 5 enums, `characters_story_entity_id_key`,
`ChangeSetItem_operation_valid`, both nullable FKs, three unique indexes) are
present and identical in both databases. GAP-018 is corrected in place with
this mechanism and a concrete follow-up (`CREATE INDEX IF NOT EXISTS`, so a
failed deploy cannot leave a half-applied database); a repaired dump is a
fresh dump whose `_prisma_migrations` matches the repository set, which this
is not.

## Acceptance items

- **Manifest / interface enumeration.** Reviewed this session: `revision-routes.ts`
  (6 routes), `services/revisions.ts` (1182 lines), the migration (354 lines),
  `revision.test.ts` (1737 lines, 34 tests), `revision-constraints.integration.test.ts`
  (405 lines, 8 tests), and the four C3 service call sites. The 002A/002B/002C
  child artifacts retain their attributed prior reviews — each child's scope is
  disjoint (fixtures, C12 contract, snapshot ordering) and none was re-opened.
  002D's production diff is covered by the independent GLM verdict; its test
  fidelity was re-falsified in that review.
- **C8 baseline + snapshot coverage + refusal + non-destructive restore +
  tenant isolation** — verified through tests, not schema inspection:
  `gives a novel created through the API a main branch, a BASELINE revision and
  its change set`; `refuses a covered mutation on a novel with no baseline`;
  `refuses a mutation that touches an uncovered table, by name`;
  `rewinds canon and character state to the checkpoint and keeps later history
  readable`; `scopes a restore to its own novel`; `keeps a novel's revisions out
  of another novel's history`; `answers a non-member with a 404, not a 403`;
  `lets an EDITOR read revision history but not create a checkpoint`;
  `lets a VIEWER read neither revision history nor a checkpoint`.
- **PRE_MUTATION payload at all four HIGH sites**, both covered tables each —
  the discriminating assertions 002C added are retained and were read in place:
  `proposal.approve` (`revision.test.ts:480`, asserts `canon_facts` holds exactly
  the pre-approval row and `canon_proposals` still `PROPOSED`, plus a preview
  that reports the minted fact as `removed`); `outlineVersion.approve` and
  `outline.supersede` (`planning.test.ts`, both versions `DRAFT` before the
  approve; `v1:APPROVED` before the supersede); `chapters.import`
  (`manuscript.test.ts`, `chapters` and `chapter_versions` both `[]`).
  **Limitation retained:** checkpoints written under the old ordering before
  002C are post-mutation images and are not rewritten — rewriting a historical
  snapshot is destructive.
- **002D tri-state, authorization before head disclosure, stale-head 409,
  forced race.** Re-verified against the tree, not accepted from the verdict:
  all four routes carry `expectedHeadRevisionId: uuid.nullable().optional()`
  (`canon-routes.ts:98`, `planning-routes.ts:63` used by both planning routes,
  `manuscript-routes.ts:157`); `planning-routes.ts` and `revision-routes.ts`
  spread the value only when it is not `undefined`, preserving the tri-state
  rather than collapsing `undefined` into `null`; `canon-routes.ts` and
  `manuscript-routes.ts` spread `...body.data`, which is equivalent because Zod
  omits absent optional keys. Ordering verified at each site: `approveProposal`
  resolves `novelId` from the **stored** proposal *after* `gateProposal`
  (`canon.ts:1027-1050`) — the head is never disclosed to an unauthorized
  caller; `approveOutlineVersion` and `supersedeApprovedOutline` call
  `assertHeadExpectation` after `gate`; `importChapters` calls it after `gate`
  and before the parse. The advisory pre-check precedes the transaction at all
  four, and the locked CAS inside `advanceForMutation` remains authoritative.
- **Atomicity.** `advanceHead` and `queueRebuildIntents` run inside the
  caller's `$transaction`; the revision, change set, snapshot, checkpoint, head
  move and rebuild intents commit or roll back together. Duplicate dispatch is
  absorbed by `skipDuplicates` on `UNIQUE (projection, source_revision_id)`
  (`replay is a no-op` test). **No model call or human wait inside any database
  transaction** — grep over all eight revision-touching services
  (`canon`, `planning`, `manuscript`, `characters`, `relationships`, `narrative`,
  `story`, `revisions`) finds no gateway, orchestrator or generation call.
- **M1 constraints probed, not just declared.** The 8/8 constraint suite
  exercises each hand-written object the Phase 6/8/9 way: the refused statement
  is retried with the constraint dropped and the probe fails if it is then
  accepted (`is load-bearing`), plus a schema-restoration check.

## Limitations carried, not waived

1. **GAP-013 stays OPEN.** The one independent review was a single model on an
   unverified backend. Nothing here substitutes for it. This verdict is
   self-verification.
2. **Two MINOR test findings left unactioned deliberately** (carried from 002D):
   the coverage inventory cannot detect a newly added HIGH route, and its "has a
   route" premise is comment-asserted. Recorded as a known limit, not fixed
   inside a verification task.
3. **GAP-018 corrected, not closed**, per the schema divergence above.
4. **The populated-upgrade receipt is not schema-equivalent to fresh.** The M1
   portion is valid; the database as a whole is not a faithful post-deploy
   image.
5. **Self-check is not review.** Every green number above was produced by the
   model writing this verdict.

## Disposition of open issues

- **GAP-004** (cross-domain revision/checkpoint not fully accepted) — advances
  to the evidenced foundation scope only: revision, snapshot, checkpoint,
  non-destructive restore, rebuild intent and tenant isolation are accepted;
  full cross-domain recovery is not. Stays OPEN at P1 for the remaining scope.
- **GAP-011** (timeline/event and character/canon identity joins) — **not
  closed.** The M1 migration adds the nullable `characters.story_entity_id`
  and `timeline_events.story_event_id` columns and a partial unique index, and
  backfills `characters.story_entity_id` only on an exact `(novel_id, key)`
  match with `kind = 'CHARACTER'`; `timeline_events.story_event_id` gets **no
  backfill**, deliberately, because any automatic link would be fabricated
  provenance. Nullable-FK existence is not a join. The remaining
  character/canon/timeline joins stay owned by NF-WF-003/010.
- **GAP-013** — OPEN, unchanged, per limitation 1.
- **GAP-017** — CLOSED for the child scope; the parent acceptance it was
  pending on is this verdict. 002A's repair is confirmed by the green full-API
  and root gates above.
- **GAP-018** — corrected in place (mechanism narrowed to a partial apply with
  the two RESTRICT FKs stripped, plus a re-runnable-`CREATE INDEX` follow-up);
  stays OPEN.
- **GAP-020** — re-observed; the container publishes no port and the host
  listener is the Docker/WSL relay. Workaround used and recorded.
- **GAP-021** — re-observed at this boundary; see the checkpoint note below.
- **GAP-022** — CLOSED for implementation and review (002D). Re-verified
  against the tree here.
- **GAP-023** — OPEN, owned by NF-WF-002E and the NF-WF-004 consumer-design
  investigation. **Not** a G-01 dependency: source inspection finds no G-01
  path that consumes a domain event, so no producer or outbox is built
  speculatively. G-01 neither accepts nor requires event capability.
- **GAP-024** — CLOSED (002C); its payload assertions were read in place and
  are retained.
- **GAP-025** — the amended 002D contract was implemented as written and
  verified against the tree here; the markdown drift it recorded is corrected.
  Closes with this verdict.

## Checkpoint

Written through MCP under the runtime-bound identity registered at this
boundary (`fae4b412-db3a-4ddc-a052-cfda214cfa9d`), distinct from the
`0238856e…` binding recorded at the 002D boundary. No old ID was reused and no
ID was invented. GAP-021 remains per-boundary.

## Next

NF-WF-003 (chapter context compiler) now has a drafted contract at
`tasks/NF-WF-003-chapter-context-compiler.md`, status **PLANNED** — the author
scope decision is RESOLVED (full tiered compiler) and it must still be
separately reviewed before any coding. It is
**not** dispatched, and nothing in it is implemented. NF-WF-004 may be prepared
independently only with frozen shared interfaces and disjoint ownership.
Neither is a swarm.
