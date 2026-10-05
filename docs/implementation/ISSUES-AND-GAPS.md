# Technical Issues and Implementation Gaps

Single authoritative register for unresolved technical problems, ambiguous
contracts, unsupported claims, missing product paths and environment blockers.
Applies to every coding model, the coordinator and reviewers.
CURRENT and task handoffs summarize/link IDs here; do not create competing
issue files. Historical progress/test receipts remain evidence, not live queues.

## Recording and resolution rules

1. Before a workaround or an affected completion claim, create/update an
   entry. Search existing IDs first and consolidate duplicates by linking.
2. Record exact symptom, source revision/diff, file/symbol or command/output,
   expected versus observed result, and reproducibility. Redact secrets.
3. Distinguish OBSERVED, DOCUMENTED, INFERRED and UNKNOWN. A suspected root
   cause stays a hypothesis until a check supports it.
4. Name affected invariant/capability, severity, owner task, dependency,
   attempted checks, recommended next action and closure test.
5. Block only dependent work. Do not hide the issue with skipped tests,
   hardcoded success, relaxed authorization/validation or fabricated evidence.
6. Record architectural choices in an ADR and link it here. Routine fixes
   within authorization do not require another permission request.
7. Close only after a fix/contract resolution and relevant verification plus
   reviewer evidence. A diagnosis, planned fix or new doc is not a runtime fix.
8. Keep entries and status history. Reopen on regression; never delete an
   inconvenient finding or overwrite an older failure receipt.

States: OPEN, INVESTIGATING, BLOCKED, FIX_READY, VERIFY_PENDING, CLOSED,
DEFERRED_BY_AUTHOR_DECISION. The last state requires the decision reference,
remaining impact and a revisit condition; it is not a successful acceptance.

Severity: P0 data loss/security/canonical authority breach; P1 blocked core
workflow or invariant; P2 limited capability/operability; P3 polish. An open
P0/P1 blocks the affected release gate. Any promised capability, even P2,
still blocks a claim that the full capability is complete.

## Entry template

```text
ID / title:
Status / severity / first observed / last updated:
Reporter actual model / owner task / reviewer:
Source revision or diff identity:
Capability / invariant / blocked tasks or milestone:
Expected:
Observed (file:line, command/result, bounded receipt link):
Evidence class and unknowns:
Reproduction / environment:
Cause: verified or hypothesis:
Checks attempted and actual results:
Proposed remedy / architectural decision needed:
Safe independent work:
Closure acceptance and required regression check:
Resolution receipt / reviewer / residual limitations:
Status history:
```

## Initial register — 2026-09-30

These entries were seeded from local documentation and static source
inspection during the workflow comparison. No runtime tests were rerun.
Baseline is the local working tree at this documentation revision; a fixing
worker must record its actual git revision/diff and reproduction. Requested
model names are not evidence that those models performed this inspection.

| ID | Status / severity | Evidence and expected outcome | Owner / closure proof |
|---|---|---|---|
| GAP-001 Chapter context incomplete | CLOSED / P1 | OBSERVED: services/orchestrator.ts compile reads facts/references, not approved outline and chapter-consumed state. Expect shared version-pinned chapter context. **CLOSED 2026-10-05 (NF-WF-003, commit `494a796`):** one shared tiered compiler (`services/context-compiler.ts`, pure) used by both `orchestrator.ts` generate paths and the workflow RETRIEVAL step; approved outline resolved server-side in the pin phase (`getApprovedOutline`, version id in tier-2 provenance); tier 4 state resolved at the derived story position (highest non-DRAFT chapter); head revision pinned before/after bounded reads with typed 409 refusal on movement and no model call; mandatory overflow → typed OVERFLOWED result, never silent; tiers 7/8 explicit UNAVAILABLE. Verified: 7 suites, 197 passed, separate diff re-review APPROVE. | NF-WF-003 |
| GAP-002 Canon selection unbounded and oldest-first | CLOSED / P1 | OBSERVED: canon.ts listFacts AUTHOR uses createdAt asc without take; compiler stops at 6,000 chars. Expect relevant bounded selection retaining mandatory task constraints. **CLOSED 2026-10-05 (NF-WF-003, commit `494a796`):** `listFactsForCompiler` carries `take` (FACT_LIMIT) on the query itself — the old unbounded read + `break` loop is removed; ordering is entity/objectEntityId match, then `createdAt` desc, then `id` asc (the exact inversion of the defect); ACTIVE-only filter preserved; spoiler predicate in-query; tenant gate before reads (404 for non-members). Negative tests assert `take` on the query (a sort-only fix cannot pass) and that the newest relevant facts survive while the oldest are dropped — both fail against the old behavior by construction. Verified: 7 suites, 197 passed, separate diff re-review APPROVE. | NF-WF-003 |
| GAP-003 Approval cannot resume | OPEN / P1 | OBSERVED: workflow-runs.ts HUMAN_APPROVAL parks permanently; no decision/resume routes. Expect authorized same-run continuation | NF-WF-005; restart, rejection, stale and duplicate decision tests |
| GAP-004 Cross-domain revision/checkpoint not fully accepted | OPEN / P1 | Initial absence was recorded from CURRENT/ADR-0008. NF-WF-002 delivers a partial implementation; the historical receipts were replaced on 2026-10-04 by NF-WF-002F, which reran the full gate on the submitted tree (all green) and verified C8 baseline, snapshot coverage, refusal, non-destructive restore, tenant isolation, PRE_MUTATION payloads at all four HIGH sites, 002D's tri-state and atomicity through actual tests. **Scope accepted:** the evidenced M1 foundation slice only — revision, snapshot, checkpoint, non-destructive restore, durable rebuild intent, tenant isolation. **Not accepted:** full cross-domain recovery, and the acceptance itself is self-verification, not independent review (GAP-013). Supersede history alone is still not consistent restore | Remaining scope stays with NF-WF-003/010 and later milestones; independent review of the acceptance remains owed under GAP-013 |
| GAP-005 AI extraction/consolidation absent | OPEN / P1 | DOCUMENTED: CURRENT says author-authored canon and no materialized L0–L6. Expect final-version proposals then approved revision-derived memory | NF-WF-008/009; rejected proposal excluded and chapter N→N+1 E2E |
| GAP-006 Workflow jobs are request-bound | OPEN / P1 | OBSERVED/DOCUMENTED: synchronous executor; inspected worker provides heartbeat. Expect durable resumable execution | NF-WF-004; process restart/queue outage/duplicate delivery/cancel tests |
| GAP-007 Writer integration and rich editing incomplete | OPEN / P1 | OBSERVED: workspace page uses textarea and basic chapter panel; CURRENT records API-only intelligence. Expect usable review/apply and state/evidence UI | NF-WF-007/015/016; browser journey and concurrent-edit tests |
| GAP-008 Reader release path missing | OPEN / P1 | DOCUMENTED: CURRENT records no non-member public chapter API/UI. Expect published-version access and server spoiler boundaries | NF-WF-012–014; anonymous/member/draft/unpublish/search tests |
| GAP-009 Completion labels overstate integrated delivery | VERIFY_PENDING / P2 | OBSERVED: previous CURRENT headline said phases 0–9 COMPLETE while listing missing deliverables. This documentation revision separates slices/gates; no runtime feature fixed | M0 documentation task; consistency/link review and phase-to-milestone mapping |
| GAP-010 Automated workflow E2E and scale evidence missing | OPEN / P1 | DOCUMENTED: CURRENT says no automated E2E runner. Expect real writer/reader loop and measured bounded 2,500-chapter operation | NF-WF-007/011/023; actual selected E2E tests and load receipts |
| GAP-011 Timeline/event and character/canon identity joins unresolved | OPEN / P1 | DOCUMENTED: CURRENT lists separate unlinked timeline/events and standalone characters. Shared context/restore requires explicit stable joins and temporal semantics. **2026-10-04 (NF-WF-002F): NOT closed.** The M1 migration adds nullable `characters.story_entity_id` and `timeline_events.story_event_id` (both `ON DELETE SET NULL`) plus a partial unique index on the former, and backfills `characters.story_entity_id` **only** on an exact `(novel_id, key)` match with `kind = 'CHARACTER'` — never a name match, because the two `key` columns already share one contract. `timeline_events.story_event_id` gets **no backfill** by design: nothing in the schema ties a timeline row to a story event, so any automatic link would be fabricated provenance. Nullable-FK existence is not a join and must not be read as closing this gap | NF-WF-003/010; reviewed identities, migration and temporal/cross-domain tests. Do not close on nullable-FK existence |
| GAP-012 Narrative policy semantics incomplete | OPEN / P2 | DOCUMENTED: CURRENT records arbitrary DNA JSON, stored SCALE policy and hardness not consumed consistently. Expect validated consumed fields and explicit soft/hard behavior. **2026-10-05 (NF-WF-010 contract authoring):** the `NarrativeDnaProfile.dna` schema comment ("Shape validated in packages/narrative-rhythm") is FALSE — no DNA validation exists in that package; `putDna` (apps/api/src/services/narrative.ts:292-322) checks only non-null non-array object. The 010 contract pins minimal-shape + defensive reads and requires the comment corrected; this does not need a new GAP | NF-WF-010; policy-to-review integration and no forced drama tests |
| GAP-013 Coding actor/model runtime evidence incomplete | OPEN / P2 | OBSERVED: read-only Claude smoke through configured `bansoskenari/deepseek-v4-1-flash` gateway alias called Engram/Ruflo successfully. Claude warns unrecognized model; backend identity/context/token metadata remain unverified. 2026-10-01: the reviewer worker's gateway (localhost:20127) returned HTTP 500 with no body on all 10 retries, twice, so no independent review ran. **Later the same day the gateway recovered** (`POST /v1/messages` → 200 SSE; `/api/health` `ok:true`, `failedProviders:[]`) and the review ran as dispatch `ctx_c4dcc5969164`. The worker self-reported `bansosmontera/deepseek-v4.1-flash` from `ANTHROPIC_DEFAULT_HAIKU_MODEL` — **not the `glm-5.3-flash` the contract requested**, so the reviewer role is still not the requested model and no backend identity is proven for either role. GLM runtime remains UNKNOWN. The round-2 re-review (`ctx_db14a16c6968`) self-reported `glm-5.3-flash` from `ANTHROPIC_DEFAULT_FABLE_MODEL` — a different env var, still a self-report, and still not proof that the requested model ran. **Root cause identified 2026-10-01:** those self-reports are the harness **tier aliases**, not the serving model. `~/.claude/settings.json` maps `ANTHROPIC_DEFAULT_HAIKU_MODEL` to `bansosmontera/deepseek-v4.1-flash` and `ANTHROPIC_DEFAULT_FABLE_MODEL` to `bansosmontera/glm-5.3-flash`, so each worker reported whichever alias its tier resolved to: the discrepancy was a tier change, not a model change, and neither reading proves which backend served the tokens. The requested id **is** dispatchable — `GET http://localhost:20127/v1/models` lists `bansosmontera/glm-5.3-flash`. Round 3 (`ctx_a28a8bb47dc7`, task `task_52d7a3338dbb`) therefore passed that id explicitly instead of relying on tier aliasing; whether inference is actually served by GLM still needs backend evidence, not an env read. **2026-10-04 (NF-WF-002D review):** the reviewer was dispatched by direct `POST http://localhost:20127/v1/messages` with `"model":"bansosmontera/glm-5.3-flash"` — the requested id is proven (present in `GET /v1/models`, echoed as `glm-5.3-flash` in the response). The serving backend is still not proven, and the gateway was intermittently flaky: several attempts returned `upstream_error` ("All upstream attempts routed by Mortera Cloud failed") *after* 25-35k characters of reasoning and before any content, so an empty answer there means "retry", not "no findings". `glm-cn/glm-5.3-flash` and `cl/z-ai/glm-5.3-flash` both returned HTTP 503 `429 ... balance/credit exhausted`, so only the `bansosmontera` route is usable today | Coordinator before each role dispatch; actual backend identity/tool/capability record for both roles, or explicit unavailable/alternative decision. See [harness receipt](CLAUDE-CODE-CONFIGURATION.md) |
| GAP-014 Historical chronology needs attribution | OPEN / P2 | OBSERVED: progress/CURRENT contain October-dated claims relative to 2026-09-30 session. Preserve history; verify commit/receipt provenance before using chronology | Next evidence-maintenance task under M0; source attribution or explicit unresolved dates, not invented replacements |
| GAP-015 Remaining retained capability gaps | OPEN / P2 | DOCUMENTED: formats, reader social/admin, advanced recovery/simulation/endgame/operations still need integration. CAP-12–20 enumerate scope | NF-WF-015–024; expand into specific entries when investigated and close only against capability receipts |
| GAP-016 NF-WF-001 contract defects | CLOSED / P1 | OBSERVED: three independent reviews ran (`ctx_c4dcc5969164`, `ctx_db14a16c6968`, `ctx_a28a8bb47dc7`). Rounds 1 and 2 returned CHANGES_REQUESTED; round 3 returned **VERIFIED** — all five round-2 corrections correct, all regression checks pass (C1 56/56, C4 CAS order, C8 baseline split, C6 dedup, links, no placeholders). The contract is frozen and NF-WF-002 is unblocked. Reviewer backend identity stays unproven across all three (GAP-013) | NF-WF-002 implementation. See detail below |
| GAP-017 Pre-existing test seeds bypass `createNovel`, so the C8 head CAS 409s them | CLOSED / P1 | REPAIR OBSERVED 2026-10-02 (NF-WF-002A, same day as the receipt below): all 12 valid-fixture sites across the ten suites now create their novel through `createPlatformServices({ db, audit: createAuditService(db) }).createNovel(...)` instead of a raw `db.novel.create`. No raw `db.novel.create` remains in the ten files; `revision.test.ts`'s deliberate missing-baseline fixture is untouched. Two non-seed fixture edits were required and are recorded in `test-matrix.md` G-01: `manuscript.test.ts`'s exact audit-action array gained `novel.created` (the production path writes its own creation row), and `narrative.test.ts`'s race test now parks the write by wrapping `db.$transaction` (NF-WF-002 moved the guarded write inside a transaction, so the old `db.antagonist.updateMany` spy no longer intercepted — the stage predicate and the 409/`count 0`/`DEFEAT` assertions are unchanged). Actual results on the preserved NF-WF-002 diff, scratch PostgreSQL `127.0.0.1:5433`: targeted ten suites `10 passed (10)` / `288 passed (288)`; `revision.test.ts` `1 passed (1)` / `25 passed (25)`; full API `15 passed (15)` / `338 passed (338)`; root `pnpm test` `38 passed (38)` / `796 passed | 1 skipped (797)`; `pnpm lint` and `pnpm typecheck` exit 0. The one skip is the pre-existing `describe.skipIf(!WORKER_IT_REDIS_URL)` redis integration case, not a new skip. Independent exact-diff review: **APPROVE** from two separate reviewer workers over the final diff `sha256 d775ad1f…` (439 lines); the two findings raised (a misstated race-test comment and the held-open transaction's 5 s default timeout) were both fixed in `narrative.test.ts`. Closure still requires NF-WF-002 / G-01 parent acceptance, which belongs to NF-WF-002B. Historical receipt follows. OBSERVED 2026-10-02: with NF-WF-002 applied, `pnpm --filter @novelforge/api exec vitest run` = **123 failed / 215 passed (338)**; the same command at baseline `5b5f139` with the diff stashed = **313 passed / 0 failed (14 files)**. Every failure is `{"error":"CONFLICT"}: expected 409 to be 201/200` on the first covered mutation. Cause (VERIFIED by reading each seed): 12 valid-fixture creation sites across 10 suites create the novel with raw `db.novel.create` (`canon.test.ts:220`, `character.test.ts:193`, `manuscript.test.ts:126`, `narrative.test.ts:187`, `planning.test.ts:155`, `story.test.ts:178`, `orchestrator.test.ts:249`, `ai.test.ts:256`, `definitions.test.ts:220,1234`, `retrieval.test.ts:257,1204`), bypassing `createNovel`, so no `novel_branches` row exists and `advanceHead` refuses by name (`services/revisions.ts:304`) — which is exactly C8's stated contract. Lazy branch creation in `advanceHead` is **not** a permitted fix: C8 forbids inventing pre-baseline history and calls create-time init "not lazy first-mutation init". NF-WF-002's scope says "Forbidden: every other path", which excludes those ten existing test files, while its acceptance criteria require `pnpm test` to pass — the two cannot both hold | Coordinator scope decision, requested 2026-10-02 via `orca orchestration ask` (messageId `msg_352e8c279405`): authorize a minimal fixture update (seed helpers create `main` branch + `BASELINE` revision + change set) or accept `IMPLEMENTED_WITH_GAPS`. **Unanswered at handoff** — the ask timed out at 600000 ms twice and was not re-asked. Scope decision now documented on 2026-10-02: [NF-WF-002A](../../tasks/NF-WF-002A-fixture-compatibility.md) explicitly authorizes only the ten fixture files. Historical unanswered ask is preserved. Closure: full API and root tests pass with original and new coverage preserved, followed by exact-diff review; do not require the old 313-test count. **CLOSED 2026-10-04 (NF-WF-002F)** on the parent acceptance it was pending: the full API suite (15 files, 365 passed) and root `pnpm test` (38 files, 823 passed \| 1 skipped) are green on the submitted tree, with original coverage preserved, and 002A's independent exact-diff review returned APPROVE |
| GAP-018 Dev-dump upgrade check fails before the M1 migration (pre-existing drift) | OPEN / P2 | OBSERVED 2026-10-02: restoring `.local-backup-novelforge-dev-20261002.sql` into a scratch database and running `prisma migrate deploy` fails with `P3018 ... ERROR: relation "canon_proposals_object_entity_id_idx" already exists`, from `20260930_phase6_evidence_fk_hardening`. **Reproduced with the NF-WF-002 diff stashed**, so it is not caused by this task. Cause (VERIFIED, and now narrower and more serious than recorded): the dump's `_prisma_migrations` records only 10 of the 19 migrations, and the database **does** already hold that migration's end state — `canon_proposals_object_entity_id_idx` exists and both `canon_fact_sources` FKs are `RESTRICT` — but has no row for it. The migration's own header predicts the collision: it "is not re-runnable … FAILS on CREATE INDEX with a duplicate-index error". **NEW, measured 2026-10-04 by NF-WF-002F: the failure is PARTIALLY APPLIED, and the documented workaround makes that permanent.** Reproduced on a fresh restore (`nf_dump_raw`), reading the FK set before and after: the raw dump has **four** `canon_fact_sources` FKs including both `RESTRICT` ones; after the failed `migrate deploy` it has **two** — `chapter_version_id` and `reference_version_id` are gone. The migration's two leading `DROP CONSTRAINT` statements **commit**, then `CREATE INDEX` fails, and Prisma records the migration as failed (`finished_at` NULL, `rolled_back_at` NULL) with the drops left in place. `prisma migrate resolve --applied` then marks it applied, so the `ADD CONSTRAINT` half never runs and the loss is permanent. **The workaround is not a skipped no-op — it is what strips the two constraints.** **Behavioural proof** (same probe, `BEGIN … ROLLBACK`, run against both databases): on the workaround-built populated DB, `DELETE FROM chapter_versions` for a version cited by a `canon_fact_sources` row **succeeds** and leaves the citation orphaned (`ORPHAN_SOURCES=1`); on the from-empty DB the same DELETE is **refused** by `canon_fact_sources_chapter_version_id_fkey`. `pg_dump --schema-only` diff of the two databases is exactly those two `ADD CONSTRAINT` statements and nothing else. This is precisely the silent evidence loss the migration's own header says it prevents ("CASCADE let a routine draft deletion silently strip canon evidence"). **Scope: pre-existing and outside NF-WF-002** — the M1 migration is unaffected, and all nine M1 objects are present and identical in both databases. **Do not read this as "the dump was already broken": it was not.** | Coordinator/evidence-maintenance. Workaround used for the NF-WF-002 upgrade receipt, and the only one that lets the check proceed without editing history: `prisma migrate resolve --applied 20260930_phase6_evidence_fk_hardening` against the scratch DB. **It is now known to cost two RESTRICT constraints**, so a populated-upgrade receipt built on it is valid for the M1 migrations but is **not** a faithful post-deploy schema, and the scratch database must not be treated as production-representative. Closure test: a fresh dump whose `_prisma_migrations` matches the repository's migration set; a `prisma migrate deploy` that does not partially apply; and a schema diff against a from-empty database that is empty. **Follow-up required:** make the migration's `CREATE INDEX` re-runnable (`CREATE INDEX IF NOT EXISTS`) so a failed deploy cannot leave a half-applied database, and re-verify the two RESTRICT constraints after any populated deploy |
| GAP-019 NF-WF-002 contract questions left unanswered by C1–C11 | CLOSED / P2 | DISPOSITION 2026-10-02 (NF-WF-002B): all five answered in `docs/03-domain/STORY-VERSIONING.md` §C12, each against source rather than against the passing suite. (1) `expectedHeadRevisionId` tri-state is now contract (C12.1): `undefined` asserts nothing, `null` asserts "no head exists yet", a uuid compares — and the lock still runs in all three cases, so the CAS is never optional. **Newly named, previously unowned:** no C3 *mutation* route accepts a client head expectation, so C4's "the caller re-reads rather than silently retrying" cannot be satisfied for a mutation — the server can never detect a plan built on a stale head. The head CAS as implemented protects internal consistency (number allocation, no lost revision, no torn interleave) but not mutation-level optimistic concurrency. Split out as **GAP-022**. (2) `checkpoint.create` is **HIGH**, correcting the earlier LOW-with-checkpoint reading (C12.2): C3's class decides *capture*, and the operation whose whole purpose is to capture a snapshot is the clearest member of the capturing class; LOW would make the one operation named "checkpoint" capture nothing by default. Code already classified it HIGH — this corrects the prose, not the code. (3) Pinning is now stated as a rule (C12.3): explicit capture pins `NEW`, a HIGH mutation's mandatory capture pins `PREVIOUS`, a checkpoint hangs off the revision whose state it captured, and `snapshots.revision_id`'s uniqueness makes reuse of an existing snapshot mandatory rather than optional. Worked example added. (4) The C11 claim that `events.ts`'s `revisionId` is "currently always `null`" is **withdrawn** (C12.4): a nullable field does not prove a value, and inspection shows `domainEventSchema` has no producer and no consumer anywhere, with `domain_outbox` absent from the schema. No integration is claimed in either direction; the producer is a future requirement owned by **GAP-023**. `events.ts` was not edited. (5) Test naming confirmed consistent with the repository convention (C12.5) and closed. Also found: **GAP-024**, a real defect — four HIGH call sites write before calling `advanceForMutation`, so their `PRE_MUTATION` snapshot captures the *post*-mutation image (C12.6). Observed by probe: approving a proposal on a novel with 1 ACTIVE `canon_facts` row produced a `PRE_MUTATION` snapshot holding 2 rows, and applying that checkpoint left both ACTIVE — the author's "step back from this approval" operation does nothing. The existing suite cannot catch it because the one `PRE_MUTATION` assertion checks the pin and the snapshot's metadata, never the payload contents. Not fixed here (production code is out of NF-WF-002B's scope). **Review closed 2026-10-02:** independent review of the §C12 diff and the follow-up task contracts returned CHANGES_REQUESTED with four findings (all confirmed against source and corrected), then APPROVE of the reviewed artifacts as they stood — `docs/03-domain/STORY-VERSIONING.md` `sha256 73e3c9f5…`, `tasks/NF-WF-002C-premutation-ordering.md` `sha256 8fd083eb…` (an "as reviewed" receipt: 002C is READY and its review-history section is appended on execution), `tasks/NF-WF-002D-mutation-head-expectation.md` `sha256 640f9698…` — because three of the four findings' corrections landed outside `STORY-VERSIONING.md`. The register files are bookkeeping: a combined-diff hash that includes this row is not a stable receipt, because citing it here changes it. The reviewer's backend is MODEL_UNVERIFIED, so GAP-013 stays open | NF-WF-002B's own review, then parent G-01. GAP-022 and GAP-023 need bounded follow-up task contracts; GAP-024 needs a reordering fix plus the payload-content assertion that would have caught it. Original observation preserved: five questions the frozen contract does not answer, each resolved conservatively in code and recorded rather than by silent choice |


| GAP-020 Local PostgreSQL port-forwarding conflict | OPEN / P2 | Historical task checks used scratch PostgreSQL on 5433 because 5432 was shadowed. **Re-verified 2026-10-02 during NF-WF-002A:** `127.0.0.1:5432` refused the connection (`ECONNREFUSED`) with nothing listening; `docker compose up -d postgres` then failed with `Bind for 0.0.0.0:5432 failed: port is already allocated` on an endpoint created 13 hours earlier, so the stale allocation persists across the Docker Desktop restart. The workaround again was an isolated `pgvector/pgvector:pg16` container `nf-pg-5433` on `-p 5433:5432` mounting the repo's own `novelforge-ai_postgres_data` volume, with `DATABASE_URL` rewritten to `127.0.0.1:5433` per command; the repo `.env` was not modified. Repo credentials failed against 5432 (`28P01`) and succeeded against 5433 | Coordinator/environment owner; the port is not merely shadowed but held by a stale endpoint. Closure: release the stale `:5432` allocation (`wsl --shutdown`, per the earlier diagnosis) or change the compose host port, then confirm connectivity before a test run; do not edit credentials or reset a live database |
| GAP-021 Current documentation session has no confirmed Engram runtime binding | OPEN / P2 | OBSERVED 2026-10-02: runtime hook explicitly reports no authoritative registered identity; agent-attributed saves must stop. No MCP checkpoint is claimed for this turn. **Re-observed at the NF-WF-002A, NF-WF-002B, NF-WF-002C-preparation and NF-WF-002C-execution boundaries**, post-compaction: still no authoritative identity, so none of those checkpoints was written to Engram and no session ID was invented or reused. **2026-10-03:** the SessionStart hook registered an authoritative runtime identity (`5ff5313c-d745-4a35-aecf-b34f4ce795d6`) and an agent-attributed save succeeded under it, so the 002D checkpoint is a real MCP write. The binding is therefore **per-boundary, not standing** — it was absent for four consecutive boundaries and present at this one, so the state must be re-observed at each boundary rather than assumed either way. **Re-observed again at the 002D-execution boundary:** the SessionStart/compact hook registered a *different* authoritative identity (`0238856e-21de-4b68-8644-f604cad2d10f`), and the 002D implementation checkpoint is written under that one. The `5ff5313c…` ID is historical and was not reused. **Re-observed at the 002F boundary:** a *third* identity (`fae4b412-db3a-4ddc-a052-cfda214cfa9d`), under which the 002F checkpoint was written; neither earlier ID was reused and none was invented. Three boundaries, three distinct IDs — the binding is confirmed present at each and must still be re-observed rather than assumed | Host/coordinator; re-register through the runtime startup/resume hook, then verify a scoped save/read under its confirmed identity. Existing task/progress records hold the fallback; no invented/old ID or model-driven mem_session_start |
| GAP-022 No mutation route accepts a client head expectation, so C4's optimistic-concurrency guarantee is unreachable for callers | CLOSED / P2 | OBSERVED 2026-10-02 by NF-WF-002B (C12.1). **IMPLEMENTED 2026-10-03 by NF-WF-002D:** the four HIGH mutation routes now accept `expectedHeadRevisionId` with the §C12.1 tri-state — `proposal.approve`, `outlineVersion.approve`, `outline.supersede`, `chapters.import`. A mismatch is a 409 whose body is `{ error: "CONFLICT", currentHeadRevisionId }` (the head observed at refusal, `null` when none), via an optional typed `ConflictError` property; generic slug/status/missing-baseline/scope/chapter-version conflicts keep `{ error: "CONFLICT" }` unchanged. Both halves of `applyRestore`'s mechanism are used per route: an unlocked advisory pre-check before any write, and the authoritative locked CAS inside the transaction. Route set derived from `impactFor(operation) === "HIGH"`; the coverage test asserts the implication (every HIGH operation *with* a route carries it), not equality — `checkpoint.create` (existing client assertion) and `restore.apply` (server-pinned, unchanged) plus three route-less operations (`ai.bulkRewrite`, `branch.merge`, `outline.bulkRewrite`) complete the HIGH set. **Per-route negative receipts** in `apps/api/src/revision.test.ts`: each of the four has match-commits, omitted-commits, stale-409 + no-partial-write + named head, explicit-null-409, and malformed-400; a **per-route** locked-CAS probe (falsified against a pre-check-only build on all four routes — 200/200/204/201 with the locked comparison disabled — and passing restored) and an authorization suite (outsider 404, viewer 403, neither disclosing a head). Targeted suites 145/145, story-versioning 17/17, full API 365/365, root `pnpm test` 823 passed / 1 skipped, lint and typecheck clean. **REVIEWED 2026-10-04** — independent `glm-5.3-flash` review via the 9Router gateway: **APPROVE** on the production diff (authorization precedes every head disclosure; generic 409s stay bare; the tri-state is not collapsed). One MAJOR test-fidelity defect found and fixed: `parkHeadMove`'s `waitForBlocked` matched any lock waiter in the test DB, so a foreign waiter could release the probe before the request parked — now pinned to the parking backend via `pg_blocking_pids` and re-falsified on all four routes. Re-review of the fix: APPROVE. Reviewer backend MODEL_UNVERIFIED (GAP-013 stays open). Self-checks are still not a review; this is one reviewer on one model. | Closed for implementation; parent G-01 still requires the separate review and NF-WF-002F acceptance |
| GAP-023 `domainEventSchema.revisionId` has no producer or consumer; the "always `null`" claim was unobserved | OPEN / P3 | OBSERVED 2026-10-02 by NF-WF-002B (C12.4): `packages/contracts/events.ts` declares `revisionId: z.string().min(1).nullable()`. C11 asserted it "is currently always `null`" — that is an inference from nullability, not an observation, and it is withdrawn. Inspection finds no producer and no consumer of `domainEventSchema` or `DomainEvent` anywhere in the repository: `packages/contracts/index.ts` re-exports them and `packages/contracts/boundaries.test.ts` only checks `DOMAIN_EVENT_NAMES` against `SYSTEM-ARCHITECTURE.md`. `domain_outbox`, named in the data-model blueprint, is absent from `schema.prisma` | Follow-up task when a domain event producer is actually designed. Requirement to record then: a versioned mutation's event carries the revision that mutation created; a system-initiated event may carry `null`. Open design question: whether events travel through a `domain_outbox` row in the mutation transaction, which would put them under C6's atomicity rule. `events.ts` must not be edited before that design exists. Owned by **NF-WF-002E** (`tasks/NF-WF-002E-domain-event-producer.md`, PLANNED — blocked on a consumer design; an outbox with no consumer is not to be built speculatively) |
| GAP-024 HIGH `PRE_MUTATION` snapshots capture the post-mutation image at four call sites | CLOSED / P1 | OBSERVED 2026-10-02 by NF-WF-002B (C12.6), by probe against the running system — **not** inferred from reading. C4 puts `INSERT snapshot` before the mutation's own writes, and `advanceHead`'s own doc comment requires it ("MUST be called … before the caller's own writes"). Four HIGH call sites write first and advance last: `proposal.approve` (`apps/api/src/services/canon.ts`), `outlineVersion.approve` and `outline.supersede` (`apps/api/src/services/planning.ts`), `chapters.import` (`apps/api/src/services/manuscript.ts`). `captureSnapshot` reads live tables when it runs, so each "PRE_MUTATION" snapshot is post-mutation. **Measured:** approving a proposal on a novel with 1 ACTIVE `canon_facts` row produced a `PRE_MUTATION` snapshot whose `canon_facts` payload held **2** rows (the pre-approval fact *and* the fact the approval minted); applying that checkpoint left both ACTIVE, and `previewRestore` reported `canon_facts {added: 0, removed: 0, retained: 2}`. The author's "step back from this approval" operation does nothing. `applyRestore` is **not** affected: it advances at `revisions.ts:1070` *before* its deletes at `:1095`, and an earlier draft of this row claimed otherwise — corrected, because a record that names a correct site as violating is how a correct path gets broken. `createWithRevision` is correct (it writes then advances), which is why the pattern looks uniform. **Why the suite is green:** the one `PRE_MUTATION` assertion checks `checkpoint.revisionId` (the pin, which is correct — `pin: "PREVIOUS"` reads the head before the advance) plus the snapshot's `revisionId`, `formatVersion` and `byteSize > 0`. It never inspects the payload, so a snapshot holding the wrong image passes every assertion | Bounded follow-up task. Fix: at each HIGH site call `advanceForMutation` before the first covered write — **including the status CAS**, which is itself a covered write (`canonProposal.updateMany` → `canon_proposals`, `outlineVersion.updateMany` → `outline_versions`, both in `COVERED_TABLE_NAMES`). An earlier draft said "check the CAS first, then advance, then write"; the reviewer showed that yields a snapshot pre-mutation for `canon_facts` but post-mutation for `canon_proposals` — a partial fix a `canon_facts`-only assertion passes. The race concern behind that wording was unfounded: a losing CAS throws inside the transaction, so rollback removes checkpoint, revision, head move and snapshot together. Other constraints — `chapters.import` loops, and `canon.ts`'s change-set items name `fact.id` which does not exist until the fact is minted — make it a design choice at one site, not a pure move. Required test: assert the `PRE_MUTATION` payload holds the *pre*-approval rows for **every** table the operation touches. Re-verify C12.3's worked example (its `R45` step is aspirational until this lands). Owned by **NF-WF-002C** (`tasks/NF-WF-002C-premutation-ordering.md`, EXECUTED 2026-10-02 — reordering plus the payload-content assertions are in place, each proven to fail against the old ordering and pass against the new). **CLOSED 2026-10-02** on the required two receipts: the two-direction proof (each assertion fails on the old ordering, passes on the new — four receipts plus a partial-fix probe) and the independent review verdict. Round 1 returned CHANGES_REQUESTED (finding A hash-identity defect corrected in the records, finding B refuted, finding C confirmed by probe and fixed); round 2 against the corrected tree `sha256 653a769d…` (2301 lines, six files, reproduced exactly by the reviewer) returned **APPROVE with no findings** — all eight falsification items CONFIRMED. Reviewer backend MODEL_UNVERIFIED (GAP-013 stays open). Note for the closure record: existing checkpoints already written under the old ordering stay post-mutation images and are **not** rewritten, because rewriting a historical snapshot is destructive |

| GAP-025 Task readiness and final-acceptance contracts drift | CLOSED / P2 | OBSERVED 2026-10-03: delivery queue called 002D PLANNED despite its recorded READY decision; D excluded revision-service changes needed for typed 409 metadata, left test paths vague, reopened proposal scope and promised rollback 400 from non-strict schemas; no bounded parent acceptance task existed. Markdown corrections now delivered; no runtime failure or independent approval is inferred. **2026-10-03 (002D execution):** the amended contract was implemented as written — exact allowed paths, head-mismatch metadata, authorized proposal scope, optional empty-body compatibility, no generic/unauthorized head disclosures, forced race checks. Verification of those against the submitted diff was performed by the separate review on 2026-10-04 (APPROVE on production; one test-fidelity defect fixed and re-reviewed) — that verdict covers the frozen diff, not the whole tree, and the parent acceptance in NF-WF-002F still verifies against the tree. **CLOSED 2026-10-04 (NF-WF-002F)**: the amended contract was implemented as written and NF-WF-002F verified it against the tree, not against the frozen-diff verdict — all four HIGH routes carry the tri-state (`canon-routes.ts:98`, `planning-routes.ts:63` for both planning routes, `manuscript-routes.ts:157`), the routes preserve `undefined` rather than collapsing it into `null`, and each service runs its tenant gate before any head is read or disclosed | NF-WF-002D amended contract and NF-WF-002F; verify exact allowed paths, head-mismatch metadata and authorized proposal scope, review amended artifacts; advance parent only on final receipts |

| GAP-026 NF-WF-003 dispatch contract remains inconsistent | CLOSED / P1 | OBSERVED 2026-10-05 at ac4a19a: composition paths forbidden, unbounded state/debt/event readers, cast dedupe after take, empty backed tiers rejected and weak source pin/identity instructions. Contract remedies delivered. **CLOSED 2026-10-05:** separate review of frozen blob `aaed86bc` returned APPROVE_WITH_FINDINGS (F1 cast-overflow prose, F2 unnamed pair budget); both fixed → blob `186fa644` (commit `0d094c3`); implementation per that contract completed and its diff re-reviewed APPROVE after all five implementation findings were fixed (commit `494a796`); final verification 197 tests passed, lint/typecheck clean, scratch DBs only. Reviewer backends MODEL_UNVERIFIED — GAP-013 stays OPEN. | NF-WF-003 coordinator. See [detail](#gap-026--nf-wf-003-dispatch-contract-remains-inconsistent-2026-10-05). |

| GAP-027 External Ubuntu preparation conflicts with Docker-only setup guidance | VERIFY_PENDING / P2 | OBSERVED 2026-10-05: DEPLOYMENT.md required Compose on Ubuntu; verify-clone.sh ends with a mandatory Docker check. Author now requires native Ubuntu preparation without Docker and reuse of existing Windows containers/data. Documentation remedy supplied in ENVIRONMENT-PREFLIGHT.md. **2026-10-05 (this host, Ubuntu 24.04.5 LTS):** native setup completed and exercised — pnpm 12.5.1, PostgreSQL 16.15 + pgvector 0.6.0, Redis 7.0.15, all started by hand, no Docker installed; scratch-test readiness proven by the NF-WF-003 verification (197 tests against scratch `novelforge_test_*` DBs, `db:test:prepare` never pointed at live data). Remaining: the Windows side (reuse existing containers/volumes/data, separate scratch DBs) is the author's host and is not verified here. | Environment owner; Windows must preserve existing containers/volumes and use separate scratch databases. |

## Active queue — historical snapshot, 2026-10-04

- **002D REVIEWED 2026-10-04:** implemented 2026-10-03, reviewed by
  `glm-5.3-flash` on 2026-10-04 — APPROVE on the production diff, one MAJOR
  test-fidelity defect found, fixed and re-reviewed APPROVE. GAP-022 is closed
  for implementation and review. The reviewer's backend is MODEL_UNVERIFIED
  (GAP-013).
- **002F VERIFIED 2026-10-04** (evidenced foundation scope only) by
  `deepseek-v4.1-flash` — **self-verification, not an independent review.**
  Verdict and full evidence in `tasks/NF-WF-002F-foundation-acceptance.md`.
  All gates green against this tree: story-versioning 17/17, constraints 8/8,
  targeted API 137/137, full API 15 files/365, root `pnpm test` 38 files/823
  passed \| 1 skipped, lint 0, typecheck 0, build 0. Empty upgrade applies all
  20 migrations; populated upgrade reproduced GAP-018 and **narrowed its
  mechanism to a partial apply** (see the GAP-018 row — the two leading
  `DROP CONSTRAINT`s commit before `CREATE INDEX` fails, so the documented
  workaround is what strips two RESTRICT FKs; proven behaviourally). GAP-004,
  GAP-011, GAP-013, GAP-017, GAP-018,
  GAP-020, GAP-021, GAP-023 and GAP-025 are each disposed in the verdict;
  GAP-013 stays OPEN as a carried limitation.
- **002E PLANNED:** revisit during NF-WF-004's actual consumer design; no
  speculative outbox and no automatic foundation-blocking dependency. Source
  inspection for 002F found no G-01 path that consumes a domain event, so G-01
  neither accepts nor requires event capability.
- **003 PLANNED with a drafted contract**
  ([`tasks/NF-WF-003-chapter-context-compiler.md`](../../tasks/NF-WF-003-chapter-context-compiler.md)):
  grounded in recon, not assumption — the only context compiler is the
  unexported `compile()` at `orchestrator.ts:135`, which reads **only**
  `canon.listFacts` and `retrieval.search`; the workflow `RETRIEVAL` step
  (`workflow-runs.ts:460`) is a second, divergent path. **Two §7/§2.16
  violations in one path:** `canon.listFacts` (`canon.ts:1415`) issues
  `findMany` with `orderBy: { createdAt: "asc" }` and **no `take`/`limit`
  anywhere in `canon.ts`** — so it reads every ACTIVE fact — and `compile`
  then `break`s on budget at `:167`, which means the budget **keeps the oldest
  facts and discards the newest**. Unbounded read (§2.16) and
  truncate-by-creation-order (§7) together. `retrieval.search` is **not**
  affected: it ranks by relevance and clamps `limit` to 1..100
  (`retrieval.ts:857`). No approved-outline resolver, no story-position model,
  no chapter-generation entry point, and **no memory/summary service** exist,
  so tiers 7 and 8 of the §7 ladder have no backing store; the other **seven**
  store-backed tiers do, through `stateAt`/`stanceAt`/`bondStageAt`,
  `canon.ask` and `retrieval.search`. Author scope decision RESOLVED
  2026-10-04: **full tiered compiler**. Two review rounds have run
  (round 1 CHANGES_REQUESTED, round 2 APPROVE_WITH_FINDINGS; ten findings
  total, all applied). The material ones corrected the contract's own
  assumptions, not the code's: the outline window does **not** name the cast
  (`OutlineNode`/`Scene` carry no character or entity id), so the real chain is
  `CharacterState` → `Character.storyEntityId` → `StoryEntity` →
  `CanonFact.entityId`/`objectEntityId`; and `take` bounds rows, not
  characters, so the cast bound needs a `characterId` dedupe. Round 2 left
  three items asserted-but-unverified; all three are now verified by the author
  directly against the tree at HEAD `fcbd4f4` (2026-10-05, read-only): the
  approved-outline resolver is genuinely absent, `readHeadRevisionId` uses the
  `novelId_name` compound key, and every service/schema line number in the
  contract is exact. That is author-verification, not independent review. Both
  rounds ran
  on an unevidenced backend (`MODEL_UNVERIFIED`, and on `glm-5.3-flashx`
  rather than the requested `glm-5.3-flash`, because the requested route kept
  returning `upstream_error`), so GAP-013 still applies and a repo-grounded
  review by an evidenced backend is outstanding. The contract is still not
  dispatchable.
- **004:** may be prepared independently only with frozen shared interfaces and
  non-overlapping file ownership. 003 and 004 are not to be dispatched as an
  unbounded swarm.

GAP-019's CLOSED status covers reviewed clarification only; GAP-023 owns its
remaining implementation requirement. Issue states and task readiness are
separate: a READY fix does not close its issue. GAP-021 is OPEN as an
intermittent per-session problem: the previously documented 5ff5313c… binding
and save are historical, the 002D-execution boundary confirmed a fresh
authoritative identity (`0238856e-…`), and the 002F boundary confirmed another
(`fae4b412-…`) under which that checkpoint was written — three distinct
identities across three boundaries, so the binding is re-observed, never
assumed. GAP-024 remains
CLOSED on its existing review receipts, not on checks rerun here.

The older execution summary below is historical through its last update;
use this active queue with CURRENT/DELIVERY-PLAN for the next dispatch.

## Historical execution summary — 2026-10-02 through early 2026-10-03

1. **GAP-024 (P1): CLOSED 2026-10-02.** HIGH `PRE_MUTATION` snapshots captured
   the post-mutation image at four call sites, so the checkpoint an author
   restores away from did not undo the mutation. Found by NF-WF-002B's review,
   measured not inferred. **Fixed by NF-WF-002C**: all four sites advance before
   their first covered-table write, each gained a payload-content assertion
   proven to fail against the old ordering and pass against the new, and the
   independent re-review returned APPROVE with no findings.
2. **NF-WF-002A / GAP-017:** fixture repair executed 2026-10-02 — all 12 sites
   converted, targeted ten suites, `revision.test.ts`, full API, root tests,
   lint and typecheck all green on the preserved diff. Independent exact-diff
   review returned **APPROVE** (two non-blocking findings, both fixed), so
   GAP-017 is closed for the child scope and remains VERIFY_PENDING only on
   NF-WF-002 / G-01 parent acceptance.
3. **NF-WF-002B / GAP-019:** clarification executed 2026-10-02 — all five items
   disposed in STORY-VERSIONING §C12. Two answers changed, one named a
   previously unowned requirement (**GAP-022**), and the review found
   **GAP-024**. GAP-019 is CLARIFIED / APPROVED on its own independent
   review of the full implementation diff.
4. **NF-WF-002C / GAP-024:** executed and CLOSED 2026-10-02. Production
   reordering at the four HIGH call sites plus the payload-content assertions
   that would have caught the defect, each proven to fail against the old
   ordering and pass against the new. Round-1 review CHANGES_REQUESTED (three
   findings, all resolved — A records fixed, B refuted, C probe-confirmed and
   fixed); round-2 review of the corrected tree APPROVE, no findings.
5. **NF-WF-002D / GAP-022:** implemented 2026-10-03 and **REVIEWED
   2026-10-04**. The blocking author decision is recorded in `decisions.md`
   (HIGH-route scope derived from `impactFor`, body field with the §C12.1
   tri-state, re-read-and-abandon recovery with `currentHeadRevisionId` in the
   409 body, coexistence with `chapter.save`'s `expectedVersion`). The
   independent `glm-5.3-flash` review returned APPROVE on the production diff;
   its one MAJOR finding — `parkHeadMove`'s `waitForBlocked` matching any lock
   waiter rather than the request's — was a real test-fidelity defect, fixed by
   pinning the match to the parking backend's pid via `pg_blocking_pids`, and
   the fix was re-reviewed APPROVE. Reviewer backend MODEL_UNVERIFIED.
   **NF-WF-002E / GAP-023:** still PLANNED and still blocked on a decision
   rather than on capacity — no consumer exists, so there is no requirement to
   satisfy beyond field semantics. Do not dispatch it by inventing the missing
   consumer.
6. **Parent G-01 acceptance:** retain IMPLEMENTED_WITH_GAPS until required
   tests, contract disposition and review actually support advancement.
   GAP-022 and GAP-024 are both CLOSED (implementation + independent review);
   the acceptance task must still verify them against the tree rather than
   take these rows' word, and must record GAP-013 (reviewer backend
   MODEL_UNVERIFIED) as an open limitation — silently advancing past it would
   make the acceptance record false. NF-WF-003/004 implementation stays gated by
   its parent prerequisites.

GAP-018 and GAP-020 are environment/evidence prerequisites for the relevant
checks; diagnose them without mutating live data or rewriting migration history.
GAP-013 remains model-identity evidence work. Other product gaps keep their
existing dependency owners; do not restart completed NF-WF-001 design.
GAP-016's former RESOLVED label is normalized to the defined CLOSED state;
its review history and remaining GAP-013 limitation are preserved.

NF-WF-002A executed the bounded fixture repair its contract authorized. No
production service, route, schema, migration, lockfile or root constitution
was modified, and no test was skipped or weakened. Its independent review
returned APPROVE, so GAP-017 is now closed for the child scope and remains
VERIFY_PENDING only on NF-WF-002 / G-01 parent acceptance.

NF-WF-002B then clarified GAP-019 and reviewed the integrated implementation.
Its dispositions are §C12 of `docs/03-domain/STORY-VERSIONING.md`. Two of the
five answers changed (C12.2 `checkpoint.create` is HIGH, not LOW-with-checkpoint;
C12.4 the "always `null`" event claim is withdrawn as unobserved), one named a
previously unowned requirement (C12.1 — no mutation route accepts a client head
expectation), and the review found a real defect in the HIGH snapshot ordering
(C12.6). That defect is **GAP-024**; it was found by probing the running system,
not by reading the contract, and it is not fixed by this documentation task.

## GAP-016 detail — NF-WF-001 contract defects

Two passes, both against source, neither a substitute for re-review.

**Pass 1 — coordinator self-review** (before any independent review could run;
recorded here because it is the reason the artifacts changed before review).
Reporter: coordinator (`bansoskenari/deepseek-v4-1-flash` per harness config;
backend identity unverified, GAP-013). Source revision:
`cfe762a5cfed6f44d80af16ad3c5fd008188ae95` + dirty documentation set. Five
claims refuted and corrected: `novels` unclassified in C1 (55/56); C4 ordered
the head `UPDATE` before the `INSERT` that its FK requires; C7 deleted
`chapters` rows and cascaded into immutable `chapter_versions`; C7 named a
column that exists in no table; four wrong table/enum/row counts.

**Pass 2 — independent review**, dispatch `ctx_c4dcc5969164`, terminal
`term_a1458038-9230-4bb2-abab-074018b8bc35`, verdict **CHANGES_REQUESTED**.
Reviewer resolved model `bansosmontera/deepseek-v4.1-flash` (self-reported; the
requested `glm-5.3-flash` did not run — GAP-013). It confirmed C1 coverage
(56/56, zero missed, zero invented), the C4 CAS order, the C8 baseline split
and C6 dedup as VERIFIED, and raised the following. Every row below was
re-verified against the cited source by the coordinator before the fix.

| # | Sev | Location | Defect | Resolution |
|---|---|---|---|---|
| 1 | P1 | C7, C5 | A payload `chapters.id` absent live with its `number` **free** (plain `deleteChapter`, no re-create) was undefined: step 3's in-place update has no row, step 4 finds no pointer, content is unrecoverable — and re-inserting its `scenes`/`outline_nodes` violates their `ON DELETE CASCADE` FKs, dying on an unmapped Prisma error. `deleteChapter` hard-deletes non-PUBLISHED chapters (`manuscript.ts`); `ChapterVersion.chapter`, `Scene.chapter`, `OutlineNode.chapter` are all `onDelete: Cascade` | C7 now refuses by name for **any** absent live chapter id, whatever the number holds, in a new step 0 that runs before the first write; the number-reuse and number-free shapes are both spelled out; C5's row reworded |
| 2 | P1 | NF-WF-002 scope | The task wrapped only the HIGH-impact operations, but C3/C10 require LOW operations such as `saveChapter` to record a revision — the C10 worked example was unimplementable as scoped | C3 now states both classes cross the boundary and the class decides only the checkpoint/snapshot; NF-WF-002 scope and invariant reworded to route every covered C3 operation through the CAS |
| 3 | P1 | C8 | No owner created `novel_branches` rows for novels created after deploy: `createNovel` (`platform.ts`) knows nothing of branches and NF-WF-002 excluded `platform.ts`, so the first covered mutation would `FOR UPDATE` a nonexistent row → 404/500 instead of the promised CAS | C8 names `createNovel` as the creation point, in the novel's own transaction; `platform.ts` added to NF-WF-002 scope; C4's ordering rationale gained the missing-row reason |
| 4 | P2 | C2 | `restore_operations` was declared immutable while preview→apply transitions its `status` | C2 now lists `status`/`target_revision_id`/`applied_at` as the mutable fields of that row, keeping the rest write-once |
| 5 | P2 | C5 vs C7.4 | PUBLISHED pointer: C5 promised a 409 while C7.4 says skip-and-surface; the two could not both be satisfied, and NF-WF-002's acceptance asserted the 409 | C5's row removed (it is not a failure) and replaced with prose pointing at C7.4/ADR-0014 §5; NF-WF-002's negative test now asserts skip-and-surface succeeds |
| 6 | P2 | C2 | `checkpoints.kind` was not among the five listed enums, so the "five enums" count only held if it reused `RevisionOrigin` — unstated | C2 states `checkpoints.kind` reuses `RevisionOrigin`; the counts now hold as written |
| 7 | P3 | C9, NF-WF-002 | The `UNIQUE`-where-non-null on `characters.story_entity_id` needs a partial index Prisma cannot express, and the migration description named only "two nullable columns" | C9 names the partial unique index as raw SQL (Phase 6–9 pattern); NF-WF-002's migration scope, outputs and rollback sections updated |
| 8 | P3 | C7 | Retained post-boundary chapters coexist with rewound canon/state, stated only as generic "compatibility review" — the contract never said their `outline_nodes`/`scenes`/`story_events` **are** rewound | C7 gained a sentence: the `chapters` row and its versions survive, all their covered relational state rewinds |
| 9 | P3 | NF-WF-002 header | "recorded at execution" dispatch-time fields, per TASK-TEMPLATE | No change required (reviewer's own conclusion) |

Consequence carried forward: the corrected contract is still not VERIFIED. Per
CLAUDE.md §11 an edit invalidates the review tied to the previous version, so
the corrected diff owes its own review before NF-WF-002 is called VERIFIED.

**Pass 3 — re-review of the round-1 corrections**, dispatch `ctx_db14a16c6968`,
task `task_ac1e018f9e8d`, verdict **CHANGES_REQUESTED** after ~3h43m. Reviewer
self-reported `glm-5.3-flash` from `ANTHROPIC_DEFAULT_FABLE_MODEL` — a
different self-report from round 1's `bansosmontera/deepseek-v4.1-flash`, and
still an environment variable read, not backend proof (GAP-013). It **VERIFIED
all eight round-1 corrections** and independently re-confirmed C1 coverage
(56/56), the C4 CAS order, the C8 baseline split and C6 dedup, then raised five
new defects. Every row below was re-verified against the cited source by the
coordinator before the fix.

| # | Sev | Location | Defect | Resolution |
|---|---|---|---|---|
| 10 | P1 | NF-WF-002 scope | Allowed paths listed only `{canon,planning,manuscript}.ts`, but C3's LOW operations span `story.ts`, `characters.ts`, `relationships.ts`, `narrative.ts` — so the invariant was unimplementable as scoped | Scope line expanded to `{canon,planning,manuscript,story,characters,relationships,narrative}.ts`, with the C3 ownership named per service |
| 11 | P2 | C7 | Step 2 deletes post-boundary covered rows; `change_set_items` store no before-image and audit payloads hold only ids/predicate, so that content survives only in later snapshots — the contract never told the author | C7 gained "Restore discards post-boundary state content, and the author must be told."; C7 Preview gained the "removed counts are load-bearing" paragraph |
| 12 | P3 | C2 | "the enum's values minus `RESTORE`" miscounted: `RevisionOrigin` has nine values and the text itself names `BASELINE` | Reads "nine values minus `RESTORE` and `BASELINE`" |
| 13 | P3 | C2 | The `String`+CHECK rationale claimed Prisma cannot express a single-column closed set; this schema has 44 Prisma enums | Rationale rewritten on Postgres-enum-churn and load-bearing grounds; no impossibility claim |
| 14 | P3 | test-matrix.md | G-01 row still said "REVIEW_PENDING — reviewer gateway unavailable", predating both reviews | Row updated to "first review ran (CHANGES_REQUESTED); corrected diff re-review owed" |

Round-2 findings 10–14 are corrected. The same consequence applies one level
down: those corrections are themselves unreviewed, so the contract remains
**not VERIFIED** and NF-WF-002 stays gated.

**Pass 4 — verification of the round-2 corrections**, dispatch
`ctx_a28a8bb47dc7`, task `task_52d7a3338dbb`, ~1h9m, verdict **VERIFIED**.
Scoped by design to the five round-2 findings plus a regression sweep, so that
the regressive review loop would close rather than extend. Result: all five
corrections VERIFIED, all regression checks pass.

| # | Verified | Evidence |
|---|---|---|
| 10 | Scope now matches the invariant in both directions | `NF-WF-002:72-78` allows the seven services and names each one's C3 ownership; a residual sweep over `ai/orchestrator/definitions/definition-resolution/workflow-runs/retrieval/audit/platform` found **zero** covered-table writes — nothing missing, nothing added that owns none |
| 11 | C7 states the loss accurately and nothing contradicts it | `STORY-VERSIONING.md:436-453`; `change_set_items` has no before-image (C2:174-177), confirmed in code — `canon.ts:781` payload holds only `{novelId, entityId, predicate}`, `characters.ts:271` records none. Line 446 explicitly qualifies "later history remains readable" as a claim about revisions; the removed-counts paragraph (400-404) closes the gap |
| 12 | Enum arithmetic and prose agree | `RevisionOrigin` = 9 values; checkpoint list = 7; 9 − `RESTORE` − `BASELINE` = 7. ADR-0014 carries no competing count |
| 13 | Rationale no longer overstates | `STORY-VERSIONING.md:214-223` states impossibility is not the reason and affirms a single-column closed set is expressible; `grep -c '^enum '` on `schema.prisma` = exactly 44 |
| 14 | Row matches reality, no stale survivor | `test-matrix.md:35` updated. Remaining `reviewer gateway unavailable` text is the historical defect record itself (correct to keep); `progress.md:2337` is headed "superseded below"; the two `REVIEW_PENDING` occurrences in NF-WF-002 are forward-looking instructions, not state |

Regressions re-checked and passing: C1 set-diff (31 covered + 25 outside = 56 =
all `@@map` names, zero overlap/missing/phantom), C4 CAS order, C8 baseline
split, C6 dedup, all relative links resolve, no placeholder tokens.

One out-of-scope observation, recorded and not actioned: C3 lists "scene CRUD"
as a LOW operation, but no production code path creates or updates `scenes` —
`manuscript.ts:4-6` says so directly ("Scene CRUD is schema-only in Phase 2 (no
API yet) ... YAGNI until then"), `planning.ts:326` only reads, and the sole
writer is a test cleanup. C3 is correct as written — it names the operation
class that will owe a revision when a write path lands — so no contract change.
Noted in NF-WF-002 instead.

## GAP-017 detail — the 123 failing tests in pre-existing API suites

Receipts, both run 2026-10-02 against `novelforge_test` on the scratch
PostgreSQL (`127.0.0.1:5433`, see GAP-020):

```text
$ git stash push -u                      # NF-WF-002 diff removed, baseline 5b5f139
$ pnpm --filter @novelforge/api exec vitest run
 Test Files  14 passed (14)
      Tests  313 passed (313)

$ git stash pop                          # NF-WF-002 diff restored
$ pnpm --filter @novelforge/api exec vitest run
 Test Files  7 failed | 8 passed (15)
      Tests  123 failed | 215 passed (338)
```

Failure shape, uniform across all 123 (`canon.test.ts` shown; the other six
suites differ only in the helper that trips first):

```text
FAIL src/canon.test.ts > canon facts and the one-live-value invariant
     > creates a fact, reads it back with its subject key, and refuses a
       second live value
AssertionError: {"error":"CONFLICT"}: expected 409 to be 201
 ❯ createEntity src/canon.test.ts:240:36
```

The refusal is the contract working as specified. C8: "a novel created after
deploy would have no `novel_branches` row — and the first covered mutation's
`SELECT … FOR UPDATE` on that row would find nothing … `createNovel` therefore
creates the `main` branch … so a novel is never observable without a head."
C5 maps the missing-baseline case to `ConflictError("no baseline exists for
this novel")` → 409. A raw `db.novel.create` in a test seed *is* the
"novel created without a head" C8 exists to prevent; the suites are asserting
the pre-C8 world.

This is **not** a defect in the head CAS and **not** fixable inside the
implemented paths. The two candidate fixes and why neither was taken
unilaterally:

1. **Lazy branch creation in `advanceHead`** — refused. C8 names it and rules
   it out: "This is the create-time path, not lazy first-mutation init: lazy
   init would put a create-if-absent race on the hot mutation path and would
   let a novel exist in a state the contract says cannot exist."
2. **Update the valid seed helpers** — correct, but out of the original scope. NF-WF-002's
   Scope section ends "Forbidden: every other path", and the ten affected
   suites are other paths. One writer per file also forbids editing files a
   sibling task may hold.

Left red and reported rather than silently scoped around, per the dispatch
brief ("Silent scope reduction is the failure mode this process exists to
prevent"). The historical coordinator decision request is `msg_352e8c279405`.

**Inventory correction — 2026-10-02:** static search at HEAD `811e7e6` plus
the existing dirty implementation identifies 12 valid-fixture creation calls
across the ten listed files, not the earlier reported 13. The thirteenth API
call is the intentional invalid/pre-baseline novel in `revision.test.ts`.
It is negative coverage and must not be normalized. This corrects the prior
count claim without altering the historical failure receipts.

**Scope amendment — 2026-10-02:** NF-WF-002A now permits the ten test fixture
files explicitly. Prefer the existing production novel-creation path; keep
creation-time baseline initialization and intentional missing-baseline 409
tests unchanged. No repair or rerun is claimed. The 313-test comparison is
API-only; the applied API inventory was 338, and the root inventory was 797.
Close on passing preserved coverage plus exact-diff review, not by shrinking
the suite back to the old baseline count.

**Repair executed — 2026-10-02 (NF-WF-002A):** all 12 sites converted; the
inventory above (12 valid + 1 deliberate negative) was reconfirmed by source
search before editing and matched. Exact-diff identity and every command
receipt are in `test-matrix.md` G-01. Result: targeted ten suites `288 passed
(288)`, `revision.test.ts` `25 passed (25)`, full API `338 passed (338)`, root
`796 passed | 1 skipped (797)`, `pnpm lint` and `pnpm typecheck` exit 0. Two
fixture-internal edits were unavoidable and are itemized there: the
`manuscript.test.ts` exact audit-action array gained the setup row
`novel.created`, and the `narrative.test.ts` race test moved its write-parking
spy from `db.antagonist.updateMany` to `db.$transaction` because NF-WF-002 put
the guarded write inside a transaction. The second is the one edit that could
conceal a regression, so it is called out for the reviewer rather than buried:
the parked write still returns `count 0`, the stored stage is still `DEFEAT`,
and the first request still returns 409. Independent review returned
**APPROVE** from two separate reviewer workers over the final diff
`sha256 d775ad1f…`; the two findings it raised (a misstated comment and the
held-open transaction's 5 s default timeout) were both fixed in
`narrative.test.ts`. Reviewer backend model identity remains unproven
(GAP-013). GAP-017 stays VERIFY_PENDING: this child's review is complete, but
NF-WF-002 / G-01 parent acceptance is unchanged and belongs to NF-WF-002B.

## GAP-019 detail — the five contract questions

| # | Question C1–C11 does not answer | Choice made | Why this choice |
|---|---|---|---|
| 1 | How does an omitted `expectedHeadRevisionId` differ from an explicit `null`? C4 says only "head <> expected (null-safe)". | `undefined` asserts no expectation (head read under the lock); `null` asserts "no head exists yet"; a uuid compares. | Collapsing them makes `null` mean both "no expectation" and "no head", so every checkpoint on a baselined novel 409s. Found by running the suite, not by reading. |
| 2 | Which C3 impact class is `checkpoint.create`? It is absent from C3's operation table but must take the head CAS. | LOW, with a checkpoint. | It advances the head and captures a snapshot, but mutates no story state, so it invalidates no projection. Matches C3's "the class decides only whether a checkpoint and snapshot are captured". |
| 3 | Which revision does a checkpoint's `checkpointId` land on? | `createCheckpoint` pins the revision it just created (`pin: "NEW"`); a HIGH mutation's `PRE_MUTATION` checkpoint pins the head it is about to change (`pin: "PREVIOUS"`). | C10 step 4 says the HIGH checkpoint is "captured **inside** the same transaction as the supersede" at R45 while the commit is R46 — so the pin is the *previous* revision. The explicit case is the mirror: the author is marking the state they just made. |
| 4 | C11 references nullable event `revisionId`, but events.ts is outside the implementation scope; actual emitted values require producer inspection. | Left untouched. | Scope is authoritative; a file outside it is not edited on the strength of a C11 aside. |
| 5 | The task names the package test `story-versioning.test.ts`; `packages/narrative-rhythm` (the layout it copies) uses `narrative-rhythm.test.ts` — the same convention, so no drift. | Kept the task's name. | No conflict; recorded for completeness. |

GAP-019 clarification is assigned to NF-WF-002B; current choices remain
review inputs. The earlier always-null event claim was unsupported by the
nullable schema alone and is corrected above. No event integration is claimed.

**Resolved by NF-WF-002B — the table above is the pre-clarification record,
kept because two of its five answers changed.** The dispositions are
`docs/03-domain/STORY-VERSIONING.md` §C12. Item 2 was **wrong**: `checkpoint.create`
is HIGH, not LOW-with-checkpoint (C12.2). Item 4's premise is **withdrawn**: the
"always `null`" claim was never observed, and there is no producer at all
(C12.4). Items 1, 3 and 5 stand, with item 1 promoted to contract (C12.1) and
item 3 generalised into a rule (C12.3). Item 1 also surfaced a requirement no
task owned — no mutation route accepts a client head expectation — now
**GAP-022**. The review found a real defect in HIGH snapshot ordering, now
**GAP-024**. See §C12.6; the probe that found it is described there and in the
GAP-024 row.

## GAP-024 detail — why a green suite cannot see this

**RESOLVED 2026-10-02 by NF-WF-002C.** All four sites now call
`advanceForMutation` before their first covered-table write, the status CAS
included. The payload-content assertion this section asked for was added at
each site, and **all four were proven to fail against the old ordering** before
the fix was accepted — the receipts are in `progress.md` and the NF-WF-002C
review history. The measured failure per site: `canon_facts` held 2 rows
instead of 1; `outline_versions` held v1 as `APPROVED` instead of `DRAFT`;
`outline_versions` held v1 as `SUPERSEDED` instead of `APPROVED`; and the
import's `chapters` payload held the 2 imported chapters instead of none.
`applyRestore` was verified unchanged and correct, and was not "fixed".

**Review closure 2026-10-02.** Round-1 review returned CHANGES_REQUESTED (three
findings — A: the recorded frozen hash did not reproduce because `git diff`
silently omitted the untracked `revision.test.ts`, corrected in the records;
B: the "eight HIGH rows" claim was refuted against STORY-VERSIONING.md:760-764;
C: a test comment overstated the `canon_proposals` assertion, probe-confirmed
and fixed). Round-2 review of the corrected tree (`sha256 653a769d…`, 2301
lines, six files) returned **APPROVE with no findings**, all eight
falsification items CONFIRMED, including that the identity reproduces exactly
and `revisions.ts` is unchanged (`b0b25225…`). Reviewer backend
MODEL_UNVERIFIED both rounds (GAP-013 stays open).

**Limitation, recorded rather than repaired.** `PRE_MUTATION` checkpoints
already written under the old ordering keep their post-mutation images. They
are **not** rewritten or deleted, because rewriting a historical snapshot is a
destructive act against the record it is supposed to preserve. Any checkpoint
created before this fix should be treated as unusable for undo.

The analysis below is preserved as the defect's record.

The defect is invisible to the existing tests for a specific reason worth
recording, because the same shape will hide the next one.

`apps/api/src/revision.test.ts` asserts, for a HIGH mutation:

```text
checkpoints[0].kind          === "PRE_MUTATION"
checkpoints[0].revisionId    === headBeforeApprove   // the PIN
snapshot.revisionId          === headBeforeApprove   // the PIN, again
snapshot.formatVersion       === 1
snapshot.byteSize            >  0
```

Every one of those is **metadata**, and every one is *correct*. `pin:
"PREVIOUS"` reads the head before the advance, so the pinned revision id is
right even when the payload is wrong; the payload is never opened. The
assertion therefore passes on a snapshot that captured the wrong image, and it
would keep passing if `captureSnapshot` were called after every write in the
transaction.

What would have caught it is a content assertion:

```text
the PRE_MUTATION snapshot's canon_facts payload holds the PRE-approval rows
  — i.e. it does NOT contain the fact this approval minted
```

That is the assertion the follow-up task must add. The general rule: when a
contract says a capture is a *pre*-state image, asserting that the capture
happened is not asserting what it captured.

The probe that established the defect (run against the scratch PostgreSQL on
`127.0.0.1:5433`, then removed — no probe file remains in the tree):

```text
FACTS BEFORE APPROVE: [{"predicate":"is-alpha","objectText":"true","status":"ACTIVE"}]
FACTS AFTER APPROVE:  [{"predicate":"is-alpha",...},{"predicate":"wields","objectText":"the crown","status":"ACTIVE"}]
SNAPSHOT canon_facts: [["is-alpha","true","ACTIVE"],["wields","the crown","ACTIVE"]]
PRE_MUTATION snapshot row count: 2 | live after: 2 | live before: 1
PROBE2 preview canon_facts counts: {"added":0,"removed":0,"retained":2}
PROBE2 facts AFTER restoring the PRE_MUTATION checkpoint: [{"predicate":"is-alpha","status":"ACTIVE"},{"predicate":"wields","status":"ACTIVE"}]
PROBE2 VERDICT: the approval was NOT UNDONE (defect)
```

## GAP-020 Local PostgreSQL port 5432 is shadowed by a stale Docker port-forwarder

OBSERVED 2026-10-02: after Docker Desktop was restarted, nothing listened on
host `:5432`, yet `docker compose up postgres` failed with `Bind for
0.0.0.0:5432 failed: port is already allocated` and a bare
`netstat`-equivalent showed `wsl-bootstrap` (pid 12) holding `:::5432` inside
the `docker-desktop` VM. The container also came up with an empty `PORTS`
column (`5432/tcp`, no host mapping) even though `docker inspect` reported
`HostConfig.PortBindings = {"5432/tcp":[{"HostPort":"5432"}]}`. Restarting
Docker Desktop, `docker compose down`, and killing the Windows-side
`com.docker.backend` forwarder each cleared only part of it; a
`wsl --shutdown` was required to release the in-VM bind.

Workaround, used for every receipt in this task: a sibling container
`nf-pg-5433` (`pgvector/pgvector:pg16`, `-p 5433:5432`) with the repo's own
`.env` credentials, and `DATABASE_URL` pointed at `127.0.0.1:5433` for the
duration of each command. The repo's `.env` is unmodified.

This is an environment defect, not a repository one, and it does not affect
the task's evidence — but a future worker who runs the suites without
exporting `DATABASE_URL` will get `ECONNREFUSED 127.0.0.1:5432` or
`28P01` against whatever is squatting the port, not a real failure.

## GAP-021 detail — missing runtime memory attribution

The current hook reports no authoritative registered session identity. This
is a harness attribution issue, not loss of the earlier Engram database.
Memory writes and an end-of-turn MCP summary are suspended for this turn.
The Markdown amendment and progress handoff preserve the unfinished state.
Only a successful host startup/resume registration can provide the identity;
do not reuse a historical session, manually invent one or bypass the guard.
After recovery, verify project/task attribution and a save/read; never claim
persistence from an attempted or unattributed write. Independent documentation
work may continue.

Re-observed 2026-10-02 at the NF-WF-002A, NF-WF-002B and NF-WF-002C-preparation
task boundaries (SessionStart/compact hook, post-compaction): still no
authoritative registered identity, so **none** of those checkpoints was written
to Engram and no session ID was invented or reused.
The fallback handoff lives in `docs/implementation/progress.md` under
"Checkpoint state — Engram unavailable, fallback handoff (GAP-021)" and, for
002B, in `tasks/NF-WF-002B-contract-clarification.md`. The 002A/002B/002C
boundary history is asserted from this session's hook output and progress
entries, not from an independent receipt.

**Resolved at the 2026-10-03 boundary.** The SessionStart hook registered an
authoritative runtime identity (`5ff5313c-d745-4a35-aecf-b34f4ce795d6`) and an
agent-attributed save succeeded under it, satisfying the closure check above.
The 002D checkpoint is a real MCP write, not a fallback. The binding is
**per-boundary**: it was absent at four consecutive boundaries and present at
this one, so it must be re-observed at each boundary rather than assumed. A
later boundary that reports no identity re-opens this observation for that
boundary; it does not invalidate this one.

## GAP-025 detail — contract corrections, not implementation

Source inspection: `services/revisions.ts` throws head conflicts inside
`advanceHead` and `applyRestore`; `platform-routes.ts` emits bare generic 409.
`canon.ts` already obtains a proposal's novel through the authorized gate.
The four route schemas have no `.strict()` call; planning approval/supersede
currently do not parse a body. The earlier rollback 400 promise was therefore
unsupported. Locked transaction rejection cannot be equated with committed
partial state; retain the 002C ordering and rollback assertions.

Corrections: exact test/doc paths and a diagnostic-only revision-service
allowance in 002D; resolved proposal scope; optional empty-body compatibility;
no generic/unauthorized head disclosures; forced race checks. Added 002F to
verify parent acceptance separately from implementation. Superseded prose is
attributed in decisions/progress; earlier review hashes identify their original
artifacts. This amended task's own review ran on 2026-10-04 (APPROVE on production; one
test-fidelity defect found, fixed and re-reviewed). GAP-025 itself stays
VERIFY_PENDING: the verdict covers the frozen 002D diff, not this file's whole
correction set, and NF-WF-002F is the acceptance that verifies against the tree.
Current Engram fallback remains GAP-021.

## Linked evidence

- [Comparison report](workflow-comparison-analysis.md) — historical analysis;
  later accepted decisions supersede its proposed-only status.
- [CURRENT](../14-progress/CURRENT.md) — detailed implementation snapshot.
- [Delivery plan](DELIVERY-PLAN.md) — capability owners and dependencies.
- [Test matrix](test-matrix.md) — executed and pending verification.

For each active investigation, expand its row into the entry template below
in this same file. Keep the table as an index; link its detail rather than
maintaining a second description elsewhere.

## GAP-026 — NF-WF-003 dispatch contract remains inconsistent (2026-10-05)

Status: VERIFY_PENDING / P1. Owner: NF-WF-003 contract coordinator; separate
reviewer unassigned. Source: HEAD ac4a19a, contract blob f89b75abc9955e72accb97a73cb47ac0382a3e06.
Observed: the contract requires injected reader ports but forbids app.ts,
where both service factories are wired (app.ts:219,276). It requires bounded
state reads but stateAt/stanceAt fetch full histories (characters.ts:380,
relationships.ts:306). EVENT/CAUSAL and debt answers also fetch unbounded
rows (canon.ts askEvent/askCausal/askDebt). The cast example applies take
before character deduplication, contradicting its own rule. PRESENT forbids
legitimate empty backed tiers. Merely reading a revision before separate live
reads does not establish a coherent source snapshot. Review Step 0 treats
environment aliases as actual serving-model identity, contrary to GAP-013.
Impact: G-02 implementation remains blocked by an unsafe/incomplete contract.
Next action: repair exact scope, bounded selection, output states, pin
consistency and identity instructions, then freeze a replacement manifest.
Closure: separate exact-artifact contract review; implementation, race,
empty-context and bounded-query receipts remain required for GAP-001/002.
No code implementation or review approval is claimed by this diagnosis.

Contract remedy delivered 2026-10-05: added composition/test/doc scope, bounded
compiler-facing readers, grouped cast IDs, empty/applicability states, head-race
checks and commands; replaced model-specific active assignments and alias-based
review identity instructions. Status INVESTIGATING → VERIFY_PENDING. Independent
review of the refreshed artifact is still required; no dispatch approval claimed.

**CLOSED 2026-10-05.** Separate review of frozen blob `aaed86bc` (46,686
bytes) returned APPROVE_WITH_FINDINGS — all six central claims VERIFIED
against the tree, tier table VERIFIED, GAP-026 remedies present. The two
findings (F1: cast-overflow prose vs `groupBy` query; F2: unnamed pair
budget) were fixed per author decision → blob `186fa644`, committed
`0d094c3`. Implementation per that contract completed (pure
`services/context-compiler.ts`, bounded readers, both callers wired, no
migration) and its diff was separately reviewed: APPROVE_WITH_FINDINGS
with five findings, all fixed per author decision (horizonProblem loud in
tier-2 provenance; head race → 409; outline version pinned; test-matrix
corrected; HTTP-level divergence test), then focused re-review APPROVE
with no regressions — cross-checked against Prisma docs (`groupBy`+`take`
paginates groups), MDN/RFC 9110 (409 for optimistic-concurrency
conflicts), and Fastify docs. Final verification on this host: 7 suites,
197 passed, 0 failed; lint and typecheck clean; scratch DBs only.
Committed `494a796`. Reviewer serving backends remain MODEL_UNVERIFIED
(GAP-013 stays OPEN); nothing here claims to close GAP-004.

## Prioritized remedies — 2026-10-05

This is the solution plan inside the existing register, not another issue log
or a claim that features are implemented. Preserve open statuses until the
named tests and separate reviews exist. The current bounded task repairs
contracts; it does not implement all product phases at once.

| Gap | Remedy and execution owner | Closure evidence / dependency |
|---|---|---|
| GAP-026 | Review the amended NF-WF-003 scope and query/output/source-pin contract using its refreshed manifest. Select actors/model at runtime. | Separate exact-blob verdict; corrections re-reviewed. Blocks coding 003, not unrelated preparation. |
| GAP-001 | NF-WF-003: compose backed tiers with approved-outline resolution, temporal state, horizon, DNA, explicit unavailable memory and immutable provenance. Preserve generic novel-less generation. | Real generation and workflow paths share the compiler; mandatory overflow makes no model call; changed-head refusal and future-state exclusion. Unbacked memory remains owned by 009. |
| GAP-002 | NF-WF-003: bound canon query candidates before materialization, prioritize explicit entity/object IDs with deterministic recency/id ties; bound every additional tier read. | Late relevant fact survives; query-bound assertions fail against old reads; inactive facts/foreign tenants excluded. Changing sort alone is insufficient. |
| GAP-003 | NF-WF-005: persist the approval decision and continuation cursor, authorize approve/reject, bind decision to final text/version/source pins, and consume once. | Restart-safe continuation; rejection, stale edit, duplicate decision and unauthorized approval tests. Depends on durable execution in 004. |
| GAP-004 | NF-WF-003/010 and later recovery contracts: inventory covered domains and explicitly refuse unsupported restore/apply. Extend immutable snapshots and atomic rebuild intent only after reviewed coverage/schema decisions. | Cross-domain restore reproduces content/state with later history retained; unsupported coverage refuses before mutation. Existing 002F scope remains attributed, not full recovery. |
| GAP-005 | NF-WF-008/009: extract structured candidate changes from accepted final text; persist proposals/provenance, apply only approved policy classes, rebuild revision-tagged projections. | Reject leaves canon unchanged; stale text invalidates decisions; chapter N learning is retrieved by N+1. Depends on accepted author loop. |
| GAP-006 | NF-WF-004: reuse BullMQ/PostgreSQL for durable jobs and attempt/cursor state; idempotent commit, bounded retry, cancellation and explicit incomplete streaming. | Process restart, queue outage, duplicate delivery, cancellation and no duplicated persisted output. No second orchestrator. |
| GAP-007 | NF-WF-007/015/016: connect writer UI to generation/review/approval/save, then bounded rich-editing/scene tasks; retain expected-version conflicts. UI labels/messages use English/Indonesian locale resources and English fallback. | Browser journey with loading/empty/error states, concurrent edit, approval invalidation after edits, both locales and missing-translation fallback. Backend tests do not accept UI. |
| GAP-008 | NF-WF-012–014: explicit immutable published versions, publication authorization and a non-member reader path with spoiler-safe navigation/search. | Both UI locales and fallback; anonymous/member access sees published content only; draft, unpublish and next/previous/search negatives. Depends on publication contract. |
| GAP-009 | M0 evidence maintenance: keep roadmap phase numbers separate from capabilities and release receipts; current pointers must name pending review honestly. | Link/constitution/status consistency plus separate documentation review; no phase labels imply delivery. |
| GAP-010 | NF-WF-007/011/023: add real chapter-loop browser/API E2E, then measured 2,000–2,500+ chapter retrieval/load fixtures with bounded query/output budgets. | Nonzero selected tests, actual p95/error/query/context receipts and failure recovery. Choose thresholds in the load contract before measuring. |
| GAP-011 | NF-WF-003 owns explicit Character.storyEntityId → StoryEntity → fact subject/object joins; NF-WF-010 owns event/timeline identity decisions. | Null linkage contributes no ID, never name matching; temporal and tenant negatives; migrations reviewed if later required. Nullable columns alone do not close this gap. |
| GAP-012 | NF-WF-010: distinguish hard author constraints from advisory DNA/rhythm preferences and connect policy evaluation to final-text review. | Soft preference never forces plot/drama; malformed policy, hard-rule rejection and changed-version tests. |
| GAP-013 | Coordinator: author-selected runtime models, separate actor/session IDs, requested alias versus actual runtime/backend evidence; keep unknowns explicit. | Actual dispatch/tool/capability evidence for each role, or recorded unavailable status. Same model in separate actors is allowed; `/clear` in one actor is self-review. Past alias uncertainty remains historical. |
| GAP-014 | M0 evidence maintenance: attribute each receipt's date/commit to its source, including future-named migrations; label unresolved chronology explicitly. | Traceable date/commit/source links; never replace uncertain dates with invented ones. |
| GAP-015 | NF-WF-015–024: expand only the next dependency-ready capability into a bounded contract with allowed paths and measurable release gates. | Capability-by-capability implementation/review/E2E evidence; no blanket closure from a plan. |
| GAP-018 | Environment/migration owner: preserve applied migration checksums. Use matched disposable dumps; diagnose partial application, restore missing RESTRICT FKs after orphan checks, and verify index/FK definitions before any resolve. Prepare a reviewed transactional recovery procedure/forward repair migration as needed. | Empty and populated upgrades without drift or partial schema; cited-version deletes are refused; schema comparison equal. No live reset or unverified mark-applied workaround. See correction below. |
| GAP-020 | Environment owner: probe the selected endpoint first. If the documented host-port conflict recurs, choose an explicit free compose host port and align scratch connection settings; coordinate any host restart. | SQL connectivity to the intended disposable DB before DB tests. Do not run wsl --shutdown blindly; current state has not been re-probed here. |
| GAP-021 | Host integration owner: startup/resume must re-register the runtime's own identity, verify binding/project, then perform an attributed scoped save/read. Until confirmed, retain task/progress fallback. | Real runtime-bound save/read success at the affected boundary, not a historical session or invented ID. Current hook still reports no identity; reads alone do not close it. |
| GAP-023 | NF-WF-004 investigates actual consumers; activate 002E only when producer/consumer contract exists. Mutation event revision and any durable intent commit together. | Real consumer delivery/replay/idempotency tests and correct revision attribution; no speculative outbox. |
| GAP-028 | Production worker AI wiring (OPEN/P1, found 2026-10-05 during NF-WF-004 implementation): the worker's executor is built with db + audit + DB-backed definition resolvers, but `generate` / `retrieval` / `compiler` are not constructed — those service factories live in `apps/api/src`, which `apps/worker` must not import (contract forbidden path). Consequence: AGENT/SKILL/RETRIEVAL steps fail on the production worker with a clear "not configured" error; deterministic kinds (TRANSFORM/CONDITION/VALIDATOR) work. Fix: move the AI/retrieval/compiler service factories to shared packages (or define a worker-safe construction seam) in a follow-up task; do not duplicate ~1000 lines of service wiring into the worker. | Worker executes an AGENT step end-to-end in a staging deployment; no `apps/worker` → `apps/api/src` import. |
| GAP-029 | Definition-resolver duplication (OPEN/P2, found 2026-10-05): `createDbDefinitionResolvers` in `@novelforge/workflow-executor` re-implements the workspace-shadows-platform / published-only rules from `apps/api/src/services/definition-resolution.ts` (used by the orchestrator). The two must stay in sync until the orchestrator path is unified behind the package version. | One resolver implementation used by all three callers (route, worker, orchestrator), or an explicit sync test. |

GAP-027 remedy: environment owner follows the platform-specific preflight,
installs only missing Ubuntu native prerequisites, and verifies actual tool,
service and scratch-test readiness. Windows reuses existing containers/data.
Closure needs actual host receipts; documentation review alone cannot verify
Ubuntu installation. This remains VERIFY_PENDING until the new host is checked.

### GAP-018 remedy correction

The earlier suggestion to change the historical CREATE INDEX to IF NOT EXISTS
is superseded as a proposed remedy, not as an observation of the failure.
The migration is already recorded as applied in historical receipts. Editing it
changes its checksum; IF NOT EXISTS alone also does not make multiple DROP/ADD
statements atomic, validate an existing index definition, or repair a duplicate
FK addition. A failed database needs inspected recovery before a later forward
migration can run, because migrate deploy stops at the failure. Verify both
RESTRICT constraints and orphan absence before any mark-applied decision. Keep
all repair SQL reviewed and explicitly transactional where supported; never
claim a fresh production-equivalent upgrade from the existing workaround.

### Current environment and evidence boundary

The 2026-10-05 runtime hook again reports no registered authoritative session
identity. Attributed memory writes were not attempted; historical successful
boundaries in GAP-021 remain valid only for those boundaries. No live database,
WSL host, credentials, installed model routes or global harness settings were
changed. Application runtime verification is limited to the checks recorded
in progress/test-matrix; no full author/reader journey is accepted here.


## GAP-027 — platform-specific environment policy (2026-10-05)

Owner: environment coordinator for the current task. Source: 52056ee.
Author requirement: provision missing native dependencies on Ubuntu without
Docker. Follow-up overrides optional Windows installation: reuse the author's
running Docker environment and preserve data. Existing deployment instructions
were Docker-only and the Linux clone script always invokes Compose. This is a
setup-contract conflict, not evidence that any running service is broken.
Remedy: mandatory Ubuntu preflight/native setup and Windows reuse rules in
[ENVIRONMENT-PREFLIGHT](../11-deployment/ENVIRONMENT-PREFLIGHT.md), linked from
both constitutions, START-HERE, deployment, testing and task template.
Status: VERIFY_PENDING until a host-specific receipt verifies the actual setup.
No packages, containers, databases or volumes were modified on this workstation.
The legacy clone script is documented as Compose-specific; use the native
commands rather than installing Docker just to satisfy its final check.

## GAP-030 — `CREATE TYPE` has no `IF NOT EXISTS` (migration DDL lesson, 2026-10-05)

Status: CLOSED (resolved during NF-WF-005 implementation; recorded per
standing author instruction).

OBSERVED: the first draft of migration
`20261005_nf_wf_005_approval_decision` used
`CREATE TYPE IF NOT EXISTS "ApprovalDecisionKind" AS ENUM (...)`.
PostgreSQL 16 rejects it: `syntax error at or near "NOT"` (SQLSTATE
42601) — unlike `CREATE TABLE` / `CREATE INDEX`, `CREATE TYPE` has no
`IF NOT EXISTS` clause. The failed `migrate deploy` was recovered by
dropping the scratch database and redeploying from empty (scratch-only;
no working data involved).

FIX: the idempotent `DO $$ BEGIN CREATE TYPE ...; EXCEPTION WHEN
duplicate_object THEN null; END $$;` block — re-runnable, so a partially
applied deploy converges on retry (GAP-018). Documented in the migration
file's header. Future migrations introducing a PG enum must use the DO
block, not `IF NOT EXISTS`.

REFINEMENT (NF-WF-012, 2026-10-05): catching only `duplicate_object` is
NOT enough for `ALTER TABLE ... ADD CONSTRAINT`. The 012 migration's
re-apply test (`packages/database/test-backfill-012.sh`) found that a
UNIQUE constraint's backing index raises SQLSTATE 42P07
(`duplicate_table` — `relation "publications_chapter_id_key" already
exists`), which `EXCEPTION WHEN duplicate_object` does NOT catch; the
re-apply died half-applied. Fix (applied in the 012 migration, verified
by the re-apply test): `EXCEPTION WHEN duplicate_object OR
duplicate_table THEN null;` on every ADD CONSTRAINT DO-block. FK
constraints raise 42710 (`duplicate_object`); UNIQUE/PKEY backing
indexes raise 42P07 (`duplicate_table`). Future migrations must catch
both.

## GAP-031 — NF-WF-006 contract's condition-path field charset vs its own findings-schema (2026-10-05)

Status: RESOLVED (deviation applied during NF-WF-006 implementation; for the
separate diff reviewer's attention).

OBSERVED: the reviewed NF-WF-006 contract pins the condition-path extension
field charset as `[a-z0-9_-]{1,64}` ("same charset as step keys"), but the
contract's own normative findings-schema — and every normative CONDITION in
the stage list — uses the camelCase field `needsCorrection`, which that
charset rejects. The two requirements are jointly unsatisfiable; the
template's `correct_1`/`correct_2` CONDITIONs would fail `validateGraph`
with `CONDITION_BAD_PATH` (reproduced in the validation suite before the
fix).

FIX: the field charset is `[a-zA-Z0-9_-]{1,64}` (uppercase allowed) in both
`packages/validation/workflow-graph.ts` (`CONDITION_PATH_PATTERN`) and
`packages/workflow-executor/executor.ts` (`resolveReference`). Step keys
stay lowercase-only. The safety properties are unchanged: the pattern is
still anchored, still exactly one level, and the executor still uses an
`Object.hasOwn` own-property guard (prototype members can never resolve) —
the charset never carried the security property. The frozen contract text
was NOT rewritten; this entry is the record of the deviation.

## GAP-032 — NF-WF-006 contract says "four" platform agents but the normative stage list needs five (2026-10-05)

Status: RESOLVED (implementer judgment call during NF-WF-006 implementation;
for the separate diff reviewer's attention).

OBSERVED: the contract's Scope ("the four platform agent specifications"),
Outputs ("four PUBLISHED platform agents"), and invariant 8 ("The four
agents") say four, but the normative 16-stage list names FIVE distinct
agent refs: `chapter-planner`, `chapter-writer`, `voice-style-reviewer`,
`final-reviewer`, and `chapter-extractor` (STRUCTURED_EXTRACTOR). The
delivery plan's "Planner/writer/voice/style/final review" shorthand counts
only the review stages. With four agents, the `extract` step's ref would be
unresolvable and every template run would fail at definition resolution.

DECISION: implement FIVE platform agents. The normative stage list is the
most detailed and most constraining part of the contract; "four" reads as a
stale count carried over from the delivery plan shorthand. The frozen
contract text was NOT rewritten; this entry is the record. If the author
prefers four (e.g. folding extraction into another agent), that is a
contract amendment for a follow-up.

## GAP-033 — NF-WF-006 contract's camelCase run-input names rejected by REFERENCE_PATTERN; inputs never bound (2026-10-05)

Status: RESOLVED (fixed during NF-WF-006 diff-review remediation; for the
separate re-reviewer's attention).

OBSERVED: the reviewed NF-WF-006 contract pins required run inputs
`{ novelId, chapterNumber, outlineRef }` (F6) and states "`compile_context`,
`plan`, and `write` read these via `$input.*`". Two defects, found by the
independent diff reviewer:
1. `REFERENCE_PATTERN` (`packages/validation/workflow-graph.ts`) restricted
   input names to `[a-z0-9_-]{1,64}`, which REJECTS the contract's own
   camelCase names (`$input.chapterNumber`, `$input.outlineRef`,
   `$input.novelId` — reproduced empirically; only lowercase
   `$input.chapter_number` passed).
2. No step in `graph.json` bound `$input.*` in its `inputs` — the names
   appeared only as uninterpolated literal text inside instruction strings
   (`renderInstruction` pushes instruction text verbatim; only `inputs`
   bindings are resolved). A real model would have received the literal
   string "$input.chapterNumber" instead of `1`.

FIX (GAP-031-parallel): the input-name charset is `[a-zA-Z0-9_-]{1,64}`
(uppercase allowed) in BOTH `REFERENCE_PATTERN` and the `input.`
alternative of `CONDITION_PATH_PATTERN`. Step keys stay lowercase-only;
the runtime `$input` lookup (`Object.hasOwn`, no charset check) is
unchanged, so the charset never carried a security property.
`compile_context`, `plan`, `write`, `rewrite_1`, `rewrite_2` now bind
`{ chapterNumber: "$input.chapterNumber", outlineRef: "$input.outlineRef" }`
in `inputs` (rendered as `## chapterNumber` / `## outlineRef` sections);
the uninterpolated literals were removed from instruction text. A new
integration test asserts the planner and writer prompts contain the
rendered `## chapterNumber` / `## outlineRef` values and no `$input.*`
literals. `novelId` scoping already works via the run row
(`executor.ts` `runRow.novelId` → compiler), independent of this fix. The
frozen contract text was NOT rewritten; this entry is the record of the
deviation.

## GAP-034 — Server-side runs-by-chapter filter for GET /workflow-runs (NF-WF-007 follow-up, 2026-10-05)

Status: OPEN (follow-up task; recorded per NF-WF-007 Invariant 11 and
contract Q1 resolution).

OBSERVED: `GET /api/workspaces/:workspaceId/workflow-runs` filters by
`workflowId` + `limit` only. The NF-WF-007 UI finds runs for a chapter by
filtering `listRuns` rows client-side on `input.chapterNumber` (the field
is present on every row, verified). For novels with hundreds of runs this
is coarse — the client pages through up to `limit` rows to find one
chapter's runs.

NEXT ACTION: a follow-up task (not NF-WF-007, which was contractually
forbidden from backend changes) to add an optional `chapterNumber`
query filter (or an `input.<field>` filter) to the list-runs route, with
the usual validation/test/review. The UI already isolates the filtering
in one place (`GenerationPanel` chapterHistory computed), so adopting the
server filter later is a small change.

## GAP-035 — NF-WF-008 F5 registration missed `COVERED_TABLES` (found during implementer verification, 2026-10-05)

Status: FIXED during NF-WF-008 implementation (implementer actor; backend MODEL_UNVERIFIED per GAP-013).

OBSERVED: the working-tree NF-WF-008 implementation registered
`canon_applications` / `canon_application_items` in `TABLE_SCOPE`
(`apps/api/src/services/revisions.ts`) per contract F5, but NOT in
`COVERED_TABLES` (`packages/story-versioning/snapshot.ts`) — and
`advanceHead` gates on `isCoveredTable` (the `COVERED_TABLES` set), not
on `TABLE_SCOPE`. Every `approveApplication` therefore failed with 409
`{error:"CONFLICT"}` ("outside story restore scope:
canon_applications"), surfacing only at apply time. Found by the
implementer's new API tests (all 5 apply-path tests failed identically).

FIX: added both tables to `COVERED_TABLES` (`restoreTarget: true`, like
`canon_proposals`), mapped both to the `canon` projection in
`TABLE_PROJECTION` (`packages/story-versioning/impact.ts`), and updated
`story-versioning.test.ts` (31 → 33 tables + parent→child edges
`canon_applications → canon_application_items`,
`canon_facts → canon_application_items`). The restore/snapshot paths
iterate the coverage set generically, so no further changes were needed.
Verified: API 15/15 new tests pass, story-versioning 17/17, full API
suite 462/462, lint clean.

LESSON: F5-style "register in the revision scope" requirements must name
BOTH registries (`TABLE_SCOPE` for scoping, `COVERED_TABLES` for the
gate) — a contract that names only one invites exactly this half
registration.

## GAP-036 — VM service restart wiped PostgreSQL/Redis mid-task (environment obstacle, 2026-10-05)

Status: WORKED AROUND (native reinstall; recorded per standing rule
before any completion claim).

OBSERVED: a service restart replaced the VM environment mid-task,
removing the natively installed PostgreSQL 16 + pgvector and Redis.
Reinstalled natively via apt (`postgresql-16`,
`postgresql-16-pgvector`, `redis-server`); removed `mirror.cogentco.com`
from apt sources again (it stalls `apt-get update`; kept `.bak`);
removed a stale apt lock with no holder; started `pg_ctlcluster 16
main`; ensured role/db `novelforge_test`; `redis-server --daemonize
yes` → PONG. All test DBs remain scratch `novelforge_test_*` only, per
policy. No Docker (project policy).

## Note — pre-existing web typecheck errors (not NF-WF-008, 2026-10-05)

`npx vue-tsc --noEmit` in `apps/web` reports 3 errors in files the
NF-WF-008 working tree does not touch: `app/pages/sign-in.vue` (2) and
`app/pages/index.vue` (1). All NF-WF-008 web files
(`CanonApplicationReview.vue`, `ProposalsPanel.vue`,
`useChapterGeneration.ts`, i18n) typecheck clean, and `pnpm
--filter @novelforge/web build` succeeds. Left for the owning task;
not widened here.

## GAP-037 — NF-WF-009 migration needed `revisions` before it existed (migration ordering, 2026-10-05)

Status: FIXED (renamed migration; recorded per standing rule before the
workaround).

OBSERVED: the `20261005_nf_wf_009_memory_projections` migration's
`memory_projections.source_revision_id → revisions(id)` FK failed on a
fresh `migrate deploy` with `42P01: relation "revisions" does not exist`.
The `revisions` table is created by `20261006_m1_story_versioning`,
which sorts AFTER `20261005_nf_wf_009_memory_projections`
alphabetically. Migration names are date-prefixed, but the 009
migration was authored (2026-10-05) before the story-versioning
migration's date prefix (2026-10-06).

FIX: renamed the migration directory to
`20261006_nf_wf_009_memory_projections` (`20261006_nf…` sorts after
`20261006_m1…`). Verified with a fresh `migrate deploy` on a scratch
DB. Lesson: a migration's date prefix must reflect its dependency
order, not its authoring date — a new table with an FK to another new
table must sort after the migration that creates the referenced table.

## NF-WF-009 F3 follow-up — full-lineage memory (not in 009 scope, 2026-10-05)

Status: OPEN (contract F3; Invariant 6 gates the follow-up).

The 009 contract is STRUCTURAL-ONLY (Q1): `summary: null`,
`summaryStatus: "SKIPPED"` always. Model-assisted summaries and the
full-lineage memory (L5 global novel, L6 historical archive with
summarization) are a separate follow-up task gated by Invariant 6.
The rebuild route refuses `{simulation: true}` with 400
`SIMULATION_SOURCE_REFUSED` (Invariant 8 enforceable scope); canon is
safe by the 008 boundary.

## NF-WF-009 intent-lifecycle gap — no consumer moves DerivedRebuildIntent rows (2026-10-05)

Status: OPEN (found at diff review; behavioral no-op today — see below).

OBSERVED: the 009 contract's Invariant 4 says "the worker moves
intents `PENDING → RUNNING → FRESH`/`FAILED` (intent-level mirror of
the outcome)". The implementation never reads or writes
`DerivedRebuildIntent`: staleness is derived against the main-branch
head (no intent read), and rebuilds are enqueued by the explicit
rebuild route / BullMQ jobs (no intent read). Verified by the
reviewer: `grep -rln DerivedRebuildIntent apps packages` (excluding
generated/test) finds only the writer side (`apps/api/src/services/revisions.ts`
writes; nothing consumes).

WHY NO-OP TODAY: no intent consumer exists for ANY projection in the
platform — NF-WF-008 only writes intents; nothing consumes them. And
memory has no projection name by the Q2 decision, so there is no
correct intent set for the memory worker to move without touching
other projections' intents (which belong to the canon/manuscript/
story-intelligence rebuild machinery). Nothing in 009's behavior
(staleness derivation, status API, rebuild, freshness) reads intents,
so nothing is silently wrong.

NEXT: either implement platform-wide intent consumption (a follow-up
task covering all seven projections, with per-projection workers and
locking so two consumers don't fight over one row), or amend the 009
contract text to describe the head-derived staleness + manual-trigger
model actually shipped. Do NOT silently edit the frozen contract —
amend with the review record.

## GAP-038 — NF-WF-010 IMPOSSIBLE_PREREQUISITE could never fire: the requiring fact self-established (2026-10-05)

Status: FIXED during implementer verification (test-exposed).

OBSERVED: the first implementation of the `IMPOSSIBLE_PREREQUISITE`
rule in `apps/api/src/services/story-health.ts` asked "does any ACTIVE
canon fact mention the prerequisite entity as subject or object?" — but
the requiring fact itself always mentions the prerequisite as its
object, so the rule matched itself and could NEVER fire. The acceptance
test ("Cannon requires Gunpowder", nothing else in canon) exposed the
dead rule.

FIX: the establishment lookup now excludes the requiring fact itself
(`id: { not: f.id }`) — establishment needs a DIFFERENT active fact
about the entity. The rule's documented semantics ("no ACTIVE canon
fact establishes the prerequisite entity (as subject or object)") were
updated in the file comment to say so. No contract amendment needed:
the contract only pins the finding name and the acceptance scenario,
both of which the fix satisfies.

VERIFICATION: `apps/api/src/state-consumers.test.ts` —
"IMPOSSIBLE_PREREQUISITE fires for a required-but-unknown entity (and
clears when it appears)" passes; the negative (adding "Gunpowder is
stockpiled") clears the finding.

## GAP-039 — NF-WF-010: SCALE policies never FAIL a final-text review (no deterministic proposal source, 2026-10-05)

Status: OPEN (documented limitation, follow-up task).

OBSERVED: the contract adds the missing SCALE policy schema (GAP-012)
and wires SCALE through write-time validation and read-side fail-open,
but `reviewFinalText` has no deterministic way to propose a SCALE
standing change from prose — there is no extraction/proposal source in
010. So a violated SCALE standing produces no HARD/SOFT verdict in the
review; it only surfaces via write-time 409s and read-side
MALFORMED_POLICY findings. The limitation is documented in
`apps/api/src/services/final-text-review.ts`.

NEXT: a follow-up task should define the SCALE assessment source
(author-declared standings vs extracted claims, or an explicit
proposal flow) before SCALE can participate in review verdicts. Do not
invent one silently inside 010.

## Note — NF-WF-010 explicit product behavior change (owned by the contract, not a deviation)

The `manuscript.setStatus` gate is an AUTHOR-DECIDED behavior change
(contract §author decision): ANY transition out of DRAFT now refuses
with 409 `HARD_POLICY_VIOLATION` (latest receipt FAIL) or 409
`REVIEW_STALE` (no receipt for the current version, or version
mismatch). `runs.decideRun` (005) is untouched. The existing
`manuscript.test.ts` case "published chapters reject saves; unpublish
via IN_REVIEW re-enables" was updated to review the version (PASS)
before publishing — the empty-chapter 409 and tenant-isolation cases
are unchanged.

## Note — NF-WF-010 diff review: setStatus gate scope fixed (2026-10-05)

Status: FIXED inline by the diff reviewer (with regression tests).

OBSERVED: the implementer's `manuscript.setStatus` gate fired on EVERY
status transition, but the contract (Invariant 4, author decision at
review) pins the gate to transitions OUT of `DRAFT` only — "the
setStatus contract is otherwise unchanged". The over-scoped gate
refused PUBLISHED→IN_REVIEW (the unpublish path) and
IN_REVIEW→PUBLISHED whenever the current version lacked a PASS
receipt, breaking the natural fix-after-FAIL flow (review FAIL →
edit → re-review → publish) and contradicting the documented intent
in this same file ("ANY transition out of DRAFT").

FIX: the gate now applies only when `chapter.status === "DRAFT"`
(the route only accepts IN_REVIEW | PUBLISHED as targets, so this is
exactly "out of DRAFT"). Two regression tests added to
`apps/api/src/state-consumers.test.ts` (IN_REVIEW→PUBLISHED ungated
with no receipt for the current version; IN_REVIEW→PUBLISHED ungated
despite a FAIL receipt for the current version). `manuscript.test.ts`
21/21 and `state-consumers.test.ts` 32/32 pass.

## GAP-040 — NF-WF-010: cross-branch asOfRevisionId accepted in health/assembly temporal ceiling (2026-10-05)

Status: OPEN (documented limitation; behavior is safe, semantics incomplete).

OBSERVED: the contract's Invariant 3 defines "as of revision R" via
the 009 as-of semantics (009 Invariant 7), which pins cross-branch
`revisionId` → 400 `INVALID_INPUT` ("cross-branch as-of is rejected,
not defined"). The 010 implementation (`evaluateHealth`,
`assembleTimeline`, `assembleCharacterState`) accepts any revision of
the novel: `db.revision.findFirst({ where: { id, novelId } })` does not
constrain to the novel's main branch, and the birth-number ceiling
compares revision numbers without branch context.

IMPACT: low. The as-of in 010 is only a temporal ceiling (exclude rows
born after R.number); a cross-branch R still yields a monotone
ceiling, never a wrong truth claim. But it is not the 009 semantics
the contract names.

NEXT: either enforce same-branch (resolve `(branchId, number)` and
400 on branch mismatch, mirroring `memory.ts`'s 009 as-of path), or
amend the 010 contract to define the temporal ceiling as
branch-agnostic. Do NOT silently edit the frozen contract — amend with
the review record.

## GAP-041 — NF-WF-011 contract pins `POST /generate` as the chapter-generation step, but the generation surface starts workflow runs (2026-10-05)

Status: OPEN (contract defect, not a product defect; implementer deviation recorded BEFORE the workaround).

OBSERVED: the NF-WF-011 contract's Invariant 2, step 1 pins
`POST /api/workspaces/:workspaceId/generate` (`orchestrator-routes.ts:56`)
with `{ agentKey, instruction, novelId }` as the step that "starts the
chapter workflow run". Three independent checks refute this:

1. `POST /generate` returns `{ generationId, content, model,
   agentVersionNumber }` (`services/orchestrator.ts:276-329`) — a direct
   generation with NO run row. There is no run to drive and no
   approval flow, so the contract's own step 2 ("drive the run to
   terminal via the test driver; if the run parks at AWAITING_APPROVAL:
   `POST .../workflow-runs/:runId/approve`") is unimplementable from a
   `/generate` call.
2. The author-preview surface the contract pins (`apps/web/app/
   components/generation/GenerationPanel.vue`) never calls `/generate`:
   it resolves the workflow id by key `chapter-generation-review`
   (`runs.resolveWorkflowId`, line 80) and starts a run with
   `POST /api/workspaces/:workspaceId/workflows/:workflowId/run`
   carrying a fresh `idempotencyKey`, `novelId`, and
   `input.chapterNumber/outlineRef` (lines 121-152).
3. The contract's own Goal section describes the generate step as
   "generate (workflow run, fake gateway)" — i.e. a workflow run.

The contract reviewer's backend verification confirmed only that
`/generate` EXISTS with that body shape; it did not verify that
`/generate` starts a run. The normative core of Invariant 2 ("the E2E
loop replays the UI's EXACT API sequence... UI↔E2E drift is a contract
violation") points the other way: the UI's sequence IS the workflow run
route.

IMPLEMENTER DEVIATION (recorded before the workaround, per Invariant
10): the E2E loop's steps 1–2 use the workflow run route
(`POST /workflows/:workflowId/run` with `idempotencyKey`, `novelId`,
`input`) against the real `chapter-generation-review` platform template
(seeded through the public API via `scripts/seed-chapter-template.ts`'s
`ensureChapterTemplate`), driving runs with `createTestDriver` and
approving at `AWAITING_APPROVAL` through the pinned approve route. Step
1's `/generate` pin is NOT implemented — it cannot be, without
inventing a run semantics `/generate` does not have.

NEXT: amend the frozen NF-WF-011 contract's Invariant 2 step 1 with the
review record (replace `/generate` with the workflow run route and the
`chapter-generation-review` template pin). Do NOT silently edit.

## GAP-042 — NF-WF-011 `FIXTURE_REVISIONS = 30` is not exactly attainable through real service paths (2026-10-05)

Status: OPEN (documented limitation; normative constraint still satisfied).

OBSERVED: the NF-WF-011 contract pins `FIXTURE_REVISIONS = 30`
("10 chapters per revision"). The product's revision machinery makes an
exact count of 30 unattainable through the real service stack the
fixture MUST use: every covered-table mutation advances the head by
exactly one revision (`advanceHead`, `services/revisions.ts:314-376`,
called by `advanceForMutation` from every service — `chapter.create`,
`chapter.save`, `fact.create`, outline approval, character/thread/event
creation all advance). Building 300 chapters (create + save = 2
revisions each), 3,000 canon facts, 60 characters, 300 timeline events,
30 threads, and one approved outline through the real services yields
roughly 4,000 revisions — every measured row still attributable to a
real revision (Invariant 4's actual normative requirement), and the
"multi-revision work" rationale for memory rebuild (30 revisions × 7
scopes) is exceeded, not undermined.

IMPLEMENTER DEVIATION (recorded before the workaround): the fixture
builder asserts `revisionCount >= 30` (the normative floor that makes
the rebuild measurements meaningful) rather than an exact 30, and the
measurement receipt records the actual revision count. The fixture does
NOT batch rows revision-lessly — that would violate Invariant 4.

NEXT: amend the NF-WF-011 contract's Invariant 3 to say "at least 30
revisions" (exact counts are a product-semantics artifact, not a
fixture choice). Do NOT silently edit.

## GAP-043 — NF-WF-011 G9's compiler-tier half is conditional and can be vacuous (2026-10-05)

Status: OPEN (documented limitation; the gate's authoritative signal is asserted).

OBSERVED: the G9 gate test (`apps/api/src/e2e/gates.test.ts`) asserts
"tier 7/8 blocks MUST carry staleness metadata" only over
`compiled.blocks.filter((b) => (b.tier === 7 || b.tier === 8) && b.status === "PRESENT")`.
When no tier-7/8 block is PRESENT (e.g. no projection exists for the
scope at all — tier 8 UNAVAILABLE/MISSING rather than STALE), the loop
body executes zero iterations and that half of the gate is vacuous.
The authoritative STALE signal IS asserted unconditionally via
`GET .../memory/status` (`freshness === "STALE"` for the scope), so the
gate still proves stale detection end to end — but the compiler-tier
half only constrains the PRESENT case.

IMPLEMENTER DECISION (recorded before keeping the conditional): forcing
a PRESENT-but-stale tier 7/8 in the test would require engineering the
fixture to hold a projection for the exact compiled scope, which is
setup the gate does not own; the /memory/status assertion is the
product's authoritative staleness surface (the same one the UI reads).
The conditional is kept deliberately, documented here.

NEXT: NF-WF-023 (or a follow-up) may pin a dedicated stale-tier case
with a pre-built projection for the compiled scope so the compiler-tier
half is unconditional. Do NOT silently strengthen the test to pass
vacuously without this record.

## GAP-044 — `writer-ui.test.ts` "forced race — autosave conflict" is flaky under full-suite load (2026-10-05)

Status: OPEN (pre-existing test flakiness; not caused by NF-WF-011).

OBSERVED: full `apps/api` suite on the fresh VM: 529/530 pass. The one
failure is `src/writer-ui.test.ts > forced race — autosave conflict:
one 200, one 409, no clobber` — `after.content` was "loser text",
expected "winner text". The test fires two concurrent PUTs with the
same `expectedVersion` via `Promise.all` and asserts the FIRST array
element's text landed, but `app.inject` gives no ordering guarantee:
whichever request the server processes first wins the 200. Re-running
the file alone: 11/11 green (twice); `-t` filtered: 3/3 green. The
NF-WF-011 changes do not touch `saveChapter`, the manuscript routes, or
this test file (only additive `workflow-test-driver.ts` memory port,
e2e files, docs) — the flakiness is inherent to the test's assumption
that array position determines the race winner.

NEXT: make the test order-agnostic (assert the 200-winner's text landed
and the 409-losers's did not, keyed by actual status codes rather than
array position), or serialize the two PUTs. Owner: whoever touches the
writer-UI tests next; not NF-WF-011 scope (no product code is wrong —
the 200/409/no-clobber behavior itself held in every run).

## GAP-045 — NF-WF-012 deliberately supersedes NF-WF-010's IN_REVIEW→PUBLISHED carve-out (2026-10-05)

OBSERVED during NF-WF-012 contract authoring: the 010 contract explicitly
carved the IN_REVIEW→PUBLISHED transition out of the final-text-review
gate ("IN_REVIEW→PUBLISHED and the PUBLISHED→IN_REVIEW 'unpublish' path
keep their pre-010 behavior", `apps/api/src/services/manuscript.ts:404-406`).
That carve-out leaves a hole 012 cannot accept: an author can save a NEW
(unreviewed) chapter version while IN_REVIEW and publish it through the
ungated IN_REVIEW→PUBLISHED path — the public would see text no review
ever approved, contradicting "immutable public version" and constitution
§11 ("Revalidate the final edited text; any later edit invalidates
approvals/reviews tied to the previous version").

DECISION (contract, not code yet): NF-WF-012 Invariant 3 extends the gate —
any transition whose target is PUBLISHED (from DRAFT or IN_REVIEW)
requires a PASS `FinalTextReview` receipt for the chapter's
`currentVersionId`. PUBLISHED→IN_REVIEW stays ungated. This is an explicit,
owned product behavior change by NF-WF-012, recorded here before any
implementation, for the separate contract reviewer to scrutinize. The
011 author-preview loop (step 6, DRAFT→PUBLISHED with a PASS receipt) is
the no-regression guard. Not a workaround — no code changed; the frozen
010 contract text is untouched (annotate, don't rewrite).

## GAP-046 — Novel page still publishes via PATCH /status; no Publication row, no actionable 409s (2026-10-05)

OBSERVED during NF-WF-012 implementation: the NF-WF-007 novel page's
`publish()` calls `PATCH .../chapters/:id/status { status: "PUBLISHED" }`
(`apps/web/app/pages/workspaces/[workspaceId]/novels/[novelId]/index.vue:385-406`).
That route (manuscript.setStatus) does NOT create a Publication row, so a
chapter "published" from the novel page has `chapters.status = PUBLISHED`
but no release record — NF-WF-013's reader (which resolves Publication
rows) will not see it. Additionally, the page's publish error handling
branches only on 403 vs a generic `errors.publishFailed`; it does not
surface 409 `REVIEW_STALE` / `HARD_POLICY_VIOLATION` with an actionable
message ("revalidate the final text", constitution §11) — `ApiError.code`
carries the envelope code, so the branch is possible, just not wired.

DECISION: out of NF-WF-012 scope (the contract's Invariant 3 obligation is
"verify ... or record a follow-up GAP"; the Allowed scope lists no web
files). The new `POST .../publication/publish` route is the release path.
NF-WF-013 (or a follow-up) should migrate the novel page's publish action
to the new route and add the 409-code branches with en/id messages. The
011 e2e loop also publishes via PATCH and stays green — it is an
author-preview loop, not the release path. Not a workaround — no web code
changed.

## GAP-047 — Worker-local C3 head-advance duplicates advanceHead's LOW path (2026-10-05)

OBSERVED during NF-WF-012 implementation: the publication fire transition
runs in `apps/worker`, which must not import `apps/api/src`
(workflow-jobs.ts module-boundary rule), but the fire is a covered
mutation and C3 requires the head CAS. `advanceHead` /
`advanceForMutation` live in `apps/api/src/services/revisions.ts` and
cannot be shared without a package refactor. The worker therefore carries
a minimal local `advanceHeadLow` (`apps/worker/src/publication-jobs.ts`)
mirroring advanceHead's LOW path (branch lock → head CAS → revision →
branch head update → change set → rebuild intents via
`projectionsForTables`).

RISK: any divergence between the two is a bug. Mitigations in place:
the mirror is documented at the definition site; the
`UNIQUE(branchId, number)` constraint turns a race into a deterministic
conflict, never silent corruption; the fire path is idempotent and
low-frequency; a test asserts the worker-produced revision chain shape
(parent links, monotonic numbers, change-set items).

NEXT: extract the head-advance into a shared package
(e.g. `packages/story-versioning`) so both sides use one implementation.
That refactor touches every C3 mutation's critical path and needs its
own task + the full suite green — deliberately not done inside NF-WF-012.

## GAP-048 — Contract's `tables: [..., "novels"]` pin unimplementable; novel flip rides the transaction unlisted (2026-10-05)

OBSERVED during NF-WF-012 implementation: the contract pins
`advanceForMutation` with `tables: ["publications"]` plus `["chapters"]` /
`["novels"]` "where those rows change". But `novels` is deliberately
outside restore scope (`apps/api/src/services/revisions.ts:161`: "restore
rewinds story state, not identity") and `advanceHead` refuses uncovered
tables with 409 — listing `"novels"` would throw on every publish/archive.

DECISION (not a workaround — forced by a hard code constraint): the novel
DRAFT→ACTIVE / ACTIVE→ARCHIVED flips run inside the same transaction and
revision as the publication mutation, but `tables` lists only covered
tables (`["publications"]`, plus `["chapters"]` where the chapter row
changes). The contract's intent — one transaction, one revision, no extra
snapshot — is preserved; restore semantics are unchanged (novel status was
never restorable). Documented in the service header.

## GAP-049 — NF-WF-013 adds three additive extensions to NF-WF-012's frozen public API shapes (2026-10-06)

OBSERVED during NF-WF-013 contract review: NF-WF-012 froze the public API
shapes in §"Contract with NF-WF-013" ("013 must implement exactly these
shapes; any deviation is a contract violation"). The 013 contract
deliberately ships three ADDITIVE extensions beyond the frozen shapes:

1. `author: { id, displayName }` on `GET /api/public/novels/:slug` (the
   novel byline — 012's shape has no byline).
2. `prevChapter` / `nextChapter` on
   `GET /api/public/novels/:slug/chapters/:number` (chapter navigation).
3. A third route, `GET /api/public/authors/:authorId` (author page),
   which 012's shapes never pinned.

DECISION (contract, not code yet): the extensions are 013-owned and
additive — every 012-pinned field is present and unchanged, so nothing
012 promised is broken. Independent contract reviewer judged them
LEGITIMATE, not violations of 012's freeze: 012 explicitly assigns
"navigation" to 013 (`resolvePublicChapter` interface + GAP-046 code
note), the delivery-plan task title literally includes "author routes"
(`docs/implementation/DELIVERY-PLAN.md:147`), and the pinned fields are
untouched. Recorded here BEFORE any implementation per the standing
rule (GAP-045 precedent); the frozen 012 contract text is untouched
(annotate, don't rewrite).
