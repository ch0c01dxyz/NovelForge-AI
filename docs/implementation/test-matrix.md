# Test Matrix

> Coverage tracking by phase. Test levels are defined in
> [docs/10-testing/TESTING.md](../10-testing/TESTING.md): unit,
> integration, contract, e2e, migration.
>
> Status values: `pending` (planned, not yet written or not yet run in
> CI), `exists` (test file committed), `passing` (executed and green —
> only mark after actually running it, per CLAUDE.md Rule 4).

## Phase 0 — Repository & Architecture Foundation

| Area | Unit | Integration | Contract | E2E | Migration |
| ---- | ---- | ----------- | -------- | --- | --------- |
| Env validation | passing | — | — | — | — |
| Module boundaries | — | — | passing | — | — |
| API health | passing | pending | pending | — | — |
| Worker/BullMQ | passing | passing (local) | — | — | — |
| Compose baseline | — | passing (local) | — | passing (Windows) | pending |
| CI skeleton | passing | pending | pending | pending | pending |

Executed results (2026-09-23, Windows, clean clone via
`scripts/verify-clone.ps1`): full `pnpm test` run — 24 tests passed, 1
skipped (worker real-Redis integration, gated on `WORKER_IT_REDIS_URL`),
exit 0. Lint, typecheck (19 workspaces), app builds (incl. Nuxt
production), and `docker compose config` all green.

Per-area notes:

- **Env validation** (`packages/config`): unit `env.test.ts` passing.
- **Module boundaries** (`@novelforge/contracts`): contract test checks
  the boundary map and domain event names against
  SYSTEM-ARCHITECTURE.md (ADR-0001); passing.
- **API health** (`apps/api`): unit `app.test.ts` passing; readiness
  datastore probes (integration) and health response schemas
  (contract) pending.
- **Worker/BullMQ** (`apps/worker`): unit `worker.test.ts` passing
  (7 hermetic tests via injectable fakes). Integration against real
  Redis passed locally on Windows (compose redis on host port 16379,
  2026-09-23): heartbeat job completed, connectivity proven, clean
  shutdown. In CI the integration test skips unless
  `WORKER_IT_REDIS_URL` is set.
- **Compose baseline**: postgres+pgvector (0.8.6) + redis boot reached
  `healthy` locally on Windows Docker Desktop (2026-09-23).
  Clean-clone e2e: **Windows passing**; **Ubuntu 24.04 passing**
  (2026-09-23, `scripts/verify-clone.sh` in an Ubuntu 24.04 container,
  Node v22.23.2 / pnpm 12.5.1 / Compose 2.40.3, exit 0).
- **CI skeleton** (`.github/workflows/ci.yml`): lint/typecheck/test
  wiring committed; first pipeline run on the forge is pending (counts
  as CI-verified once green remotely).

Phase 0 exit test: clean clone boots on Windows Docker/WSL2 and Ubuntu
Docker (NF-0010) — Windows passing (2026-09-23); Ubuntu 24.04 passing
(2026-09-23, container run of `scripts/verify-clone.sh`). **Phase 0
exit criteria met.**

## Phase 1 — Identity, Tenancy & Persistence Core

| Area | Unit | Integration | Contract | E2E | Migration |
| ---- | ---- | ----------- | -------- | --- | --------- |
| Platform schema (`packages/database`) | — | passing (local) | — | — | passing (local) |
| Session auth (`packages/auth`) | passing | passing (local) | — | — | — |
| Authorization capabilities | passing | — | — | — | — |
| Auth routes (`apps/api`) | passing | passing (local) | pending | — | — |
| Platform services/RBAC | — | passing (local) | pending | — | — |
| Tenant isolation gate (NF-1005) | — | passing (local) | — | — | — |

Executed results (2026-09-24, Windows, against live compose PostgreSQL
with per-package test databases per ADR-0003 §8): full `pnpm test` —
11 files, 70 passed, 1 skipped (worker real-Redis, gated), exit 0.
Lint 0 errors; typecheck all workspaces Done; `pnpm -r --filter
"./apps/*" build` green (incl. Nuxt production).

Per-area notes:

- **Platform schema**: `platform.integration.test.ts` drops/recreates/
  migrates `novelforge_test` and exercises migrations + pgvector
  extension presence. Local only — CI lacks a postgres service
  container (known gap, tracked in progress.md).
- **Session auth**: `auth.test.ts` (12 unit: token generation/hashing,
  register/login/session lifecycle, sliding renewal, timing-equalized
  failure) + `test/auth.integration.test.ts` (2, `novelforge_test_auth`).
- **Authorization**: `authorization.test.ts` (7 unit: role→capability
  map invariants, OWNER-grant rules, requireCapability typing).
- **Auth routes**: `auth-routes.test.ts` via fastify.inject against
  `novelforge_test_api` — register/login/logout/session flow, 400/401/
  409 mapping, cookie flags (HttpOnly, SameSite=Lax), token never in
  response bodies.
- **Platform services**: `services/platform.integration.test.ts`
  (8, `novelforge_test_platform`) — owner creation + audit, duplicate
  slug 409, non-member NotFound, VIEWER cannot invite, OWNER-grant/
  demote guards, last-owner ConflictError, removed-member access loss,
  cross-workspace denial.
- **Tenant isolation gate**: `tenant-isolation.test.ts` (7,
  `novelforge_test_isolation`) — unauthenticated 401 on all platform
  routes, revoked-session immediate loss, non-member 404 (not 403) on
  read/write/member-add shapes, session-scoped `/api/novels`,
  removed-member immediate loss, VIEWER read-only at route level,
  audit rows scoped to workspaceId + actor.

Phase 1 exit test (NF-1005): tenant isolation suite green + full repo
gate green locally (2026-09-24). **Phase 1 exit criteria met** (with
the CI-services gap noted above).

Audit pass additions (2026-09-24, 4 new regression tests; totals now
11 files / 73 passed / 1 skipped):

- **Worker resilience**: add-failure degrade (no crash), stop() timeout
  when quit() hangs.
- **Auth**: concurrent duplicate register (P2002) → 409 EMAIL_TAKEN.
- **Config**: URL password containing `@` fully redacted.

CI-services gap closed: `ci.yml` runs postgres (pgvector) + redis
service containers; all integration suites + worker real-redis suite
execute remotely on push/PR.

## Phase 2 — Writing Core

| Area | Unit | Integration | Contract | E2E | Migration |
| ---- | ---- | ----------- | -------- | --- | --------- |
| Manuscript schema (`packages/database`) | — | passing (local) | — | — | passing (local) |
| Chapter capabilities (`packages/auth`) | passing | — | — | — | — |
| Manuscript routes (`apps/api`) | — | passing (local) | — | — | — |
| Editor shell (`apps/web`) | — | — | — | manual | — |

Executed results (2026-09-24, Windows, against live compose PostgreSQL
per ADR-0003 §8): `manuscript.test.ts` (21, `novelforge_test_manuscript`)
— chapter CRUD + auto-numbering, delete cascades versions, version
immutability across saves, stale expectedVersion → 409, published-save
guard, empty-publish guard, tenant 404 across all route shapes, 401
gate, VIEWER read-only, EDITOR save-but-not-publish/delete,
md-import parser + DRAFT landing, TXT setext `===` parser (`---` stays
prose), import above the 1 MB default body limit, export ordering +
filename, import tenant isolation, version history newest-first,
non-destructive restore (appends, history preserved), unknown-version
404, restore capability/tenant gates, published delete/restore guards,
audit rows scoped to workspace + actor. Totals: 12 files, 94 passed,
1 skipped.

Phase 2 exit test (NF-2005): manuscript suite green + full repo gate
green (lint 0, typecheck Done, apps build incl. Nuxt production).
**Phase 2 exit criteria met.** Second audit pass (same date) added the
version-history/restore, published-immutability, audit-trail, and
large-body coverage above.

Phase 2 end-to-end wiring (same date): the browser could not reach the
API (no page routes, no API origin, no sign-in), so the exit criterion
was unmet in practice despite green tests. Verified manually in headless
Chrome against live Postgres + Fastify + built Nuxt server, driven
through CDP:

| Scenario | Result |
| -------- | ------ |
| Register + login through the Nitro proxy | cookie set, `nf_session` present |
| `/` unauthenticated | redirects to `/sign-in?redirect=/` |
| Editor unauthenticated | redirects to `/sign-in?redirect=<editor path>` |
| Sign-in form -> redirect back | lands on the editor, chapter loads |
| Editor renders chapter | textarea holds stored content, footer shows `v1` |
| Autosave (type, 1.5s debounce) | new version on the server (`v2`), UI agrees |
| Chapter switch during in-flight save | edit lands on the origin chapter, no cross-contamination |
| Export through proxy | `content-disposition` + `text/markdown` preserved |
| 2 MB import through proxy | 201 |
| Proxy traversal / absolute-host attempts | all 404, only `/api/**` proxied |
| `apps/web` typecheck (`vue-tsc`) | clean (added to `pnpm typecheck`) |

These are manual browser checks, not automated: the repo has no E2E
runner yet (TESTING.md lists E2E as a later layer). Recorded as
executed, not as CI coverage.

## Phase 3 — AI Infrastructure

| Area | Unit | Integration | Contract | E2E | Migration |
| ---- | ---- | ----------- | -------- | --- | --------- |
| AI schema (`packages/database`) | — | passing | — | — | passing (drift-free) |
| `ai-core` transport + policy | passing (48) | — | — | — | — |
| `ai-core` OmniRoute transport/SSE | passing (21) | — | — | — | — |
| Gateway/model admin API | — | passing | — | — | — |
| Generation path + history | — | passing (non-stream) | — | manual | — |
| Generation streaming (SSE) | — | manual | — | manual | — |
| Platform-admin authorization | passing | passing | — | — | — |

Executed results (2026-09-25, Windows, live compose PostgreSQL):
`ai-core.test.ts` (48) — error classification incl. network-code vs
programmer-error, credential encrypt/decrypt + tamper/wrong-key/malformed
rejection, routing order for all five strategies, circuit breaker
open/close, per-gateway retry budget, manager retry/fallback, attempt
recording, stream success, stream-not-restarted-after-partial, stream
consumer-throw-not-attributed-to-gateway, health probes, and that
caller-induced failures (INVALID_REQUEST/DETERMINISTIC) leave the breaker
untouched. `omniroute.test.ts` (21) — transport/SSE behaviour listed under
the audit follow-up in `progress.md`, plus the two real-deployment
normalizations (a capability MAP reduced to tags, and a completion body
with a trailing `data: [DONE]` salvaged — with a truncated body still
rejected) added in Round 9. `ai.test.ts` (28,
`novelforge_test_ai`) — gateway CRUD with the credential absent from every
response, encrypted-at-rest assertion, workspace OWNER denied (403) on
gateway read/create, unauthenticated 401, duplicate-name 409, credential
rotation, model sync + profile mapping, platform-role requirement,
unreachable-gateway 502 with breaker recorded, unreadable-credential 409
with breaker NOT tripped, health recovery, generation success with one
attempt, failover with both attempts recorded, FAILED with classified
category and no provider detail, no-route 409, membership 404, body
validation, history list/detail, cross-tenant 404.

Streaming is verified live, not in CI: a fake OpenAI-compatible SSE
upstream streamed seven ordered `delta` frames through
`POST /api/workspaces/:workspaceId/generations/stream` over a real
Postgres, terminated by `done {status: SUCCEEDED}`. It is a manual row
until a test-harness fake upstream lands.

Verified live against a running API + Postgres (not CI): platform gate
returns 403 for a workspace owner and 401 unauthenticated; the credential
is stored as `v1:iv:tag:ciphertext` and never appears in a response or
audit payload; a dead upstream yields 502 with `consecutive_failures=1`;
an unreadable credential yields 409 with the breaker left at 0.

## Phase 4 — Agent / Skill / Workflow Platform

| Area | Unit | Integration | Contract | E2E | Migration |
| ---- | ---- | ----------- | -------- | --- | --------- |
| Contract validator (`packages/validation`) | passing (59) | — | — | — | — |
| Workflow graph validator | passing | — | — | — | — |
| Phase 4 schema (`packages/database`) | — | passing | — | — | passing (drift-free, 8 migrations) |
| Definition CRUD + versioning | — | passing | — | — | — |
| Definition authorization | — | passing | — | — | — |
| Workflow execution | — | passing | — | manual | — |
| Structured-output enforcement | passing | passing | — | — | — |

Executed results (2026-09-27, Windows, live compose PostgreSQL; supersedes
the 2026-09-26 run):
`validation.test.ts` (55) — fail-closed keyword screen (unknown keyword,
`minItems`/`maxItems` alongside `type: "array"`, `not`/`if`/`definitions`,
unsupported formats, remote `$ref`, non-JSON values, malformed pattern,
depth bound, undeclared `required`, prototype-key `required`, a
constraint with no discriminator, `$ref` siblings, local `$ref` cycles
including indirect ones), enforcement against a real contract, local
`$defs` resolution, hostile-value safety, JSON extraction from
prose/fences, and graph validation: ordering, determinism across repeated
calls, cycle, self-loop, CONDITION branch shape, a third outgoing edge,
branch labels, unresolvable and unmatchable conditions, forward/unknown/
malformed references, duplicate keys, `maxSteps`, per-step
retry/timeout rejection, non-executable step kinds, VALIDATOR contract
and input arity, `ref` placement, nested output schemas.
`definitions.test.ts` (33, `novelforge_test_phase4`) — as
previously, plus: a duplicate PLATFORM key is 409 with exactly one row
stored; a workspace key may shadow a platform key **and resolution
prefers the tenant row** (asserted by running a workflow and checking the
tenant's instructions reached the model); a failing step gets its own
FAILED row carrying the sanitized summary; an `AWAITING_APPROVAL` run
records a null `completedAt`; a provider failure returns its classified
message rather than the generic fallback, with the same value on the
step row.

Migration verified: applies from empty on a scratch database through all
eight migrations (`migrate deploy` on a fresh database, 2026-09-27), and
`migrate diff --from-migrations --to-schema --exit-code` reports 0 (no
drift) against the schema.
`definitions.test.ts` (30, `novelforge_test_phase4`) — version append
leaves the prior version intact; a contract the validator cannot enforce
is rejected (400) with the offending path; cyclic graph rejected; publish
without a version is 409; duplicate key 409; the same key in two
workspaces is allowed; unauthenticated 401; another tenant's definition is
404 and absent from its list; VIEWER denied; AUTHOR may read and run but
not manage; PLATFORM scope requires `platform:define` while a workspace
ADMIN is refused; a platform admin cannot write another tenant's
definition; DRAFT platform definitions are invisible until published;
three-agent pipeline runs in deterministic order with version pinning and
one generation per step; repeated runs give identical order; CONDITION
takes one branch and marks the other SKIPPED; HUMAN_APPROVAL stops the run
with no model call; an unsatisfied contract fails the step; a satisfied
one stores parsed JSON; `skillKeys` injection is present for granted
skills and absent for ungranted; SKILL steps pin their version; a chain
beginning with TRANSFORM runs every step; VALIDATOR failure fails the run;
an unpublished agent reference refuses the run with no generation and no
run row; a novel-bound workflow rejects a different novel; cross-tenant
run is 404; run history lists; a completed run is audited.

## Phase 5 — Knowledge & Retrieval

| Area | Unit | Integration | Contract | E2E | Migration |
| ---- | ---- | ----------- | -------- | --- | --------- |
| Chunker (`packages/retrieval`) | passing (28) | — | — | — | — |
| Rank fusion | passing (15) | — | — | — | — |
| Spoiler predicate | passing (12) | — | — | — | — |
| Embedding routing (`packages/ai-core`) | passing (6) | — | — | — | — |
| Phase 5 schema (`packages/database`) | — | passing | — | — | passing (drift-free, 9 migrations) |
| Reference CRUD + versioning | — | passing | — | — | — |
| Ingestion (chunk + embed) | — | passing | — | — | — |
| Hybrid search | — | passing | — | — | — |
| Tenant isolation | — | passing | — | — | — |
| Spoiler enforcement | — | passing | — | — | — |
| Retrieval audit / provenance | — | passing | — | — | — |
| `RETRIEVAL` workflow step | passing | passing | — | — | — |

Executed results (2026-09-25, Windows, live compose PostgreSQL 0.8.6
pgvector; full suite 370 passed / 1 skipped).
`chunk.test.ts` (28) — paragraph/line/sentence splitting, offsets into the
original text, CRLF and mixed line endings, short-segment merging on both
sides, oversized runs split at sentence boundaries then hard-split,
`maxChars`/`minChars` validation, blank input, and `verifyChunks`
soundness (span, overlap, index, text-match, gap-drops-content). Plus the
invariant regressions: chunk text equals its source slice across a merge
(CRLF, blank-line runs, indent-padded separators), a bare CR is a line
separator, and a surrogate pair is never split between two chunks.
`fuse.test.ts` (15) — RRF rank-only scoring, k's effect on the
adjacent-rank gap, ties broken by id, single-list and empty-list inputs,
`minRetrievers`, limit, and the rejection codes for a rank mismatch, a
bad hit id, a duplicated id within one list, a missing `lists`, and
non-positive k/limit.
`spoiler.test.ts` (12) — AUTHOR/EDITOR see everything, READER bounded by
`availableFromChapter`, a null boundary withheld, a missing reader
position treated as chapter 0, an invalid one refused, unrecognised modes
resolving to READER, `visibleTo` filtering, and `canReadDrafts`.
`ai-core.test.ts` (+6) — `embed` routes through the same policy as
`generate`: profile resolution, retry on a transient failure, no retry on
a non-retryable one, an attempt row per transport call, breaker update,
and an empty batch making no attempt at all.
`validation.test.ts` — RETRIEVAL validates as a runnable kind; a RETRIEVAL
step with no instruction is refused (`RETRIEVAL_NO_QUERY`); `extractJson`
skips a prose bracket that is not JSON (`"The [main] character: {…}"`) and
still fails closed when no value parses.
`retrieval.test.ts` (23, `novelforge_test_phase5`) — an ingested
reference is citable to its exact character span (`content.slice(start,
end) === text`, asserted on a real hit); re-ingesting unchanged content
skips and makes **no** second provider call; publishing a reference with
no chunks is 409; a DRAFT reference is absent from search until
published; a chunk above the reader's chapter is withheld (and
`withheldCount` is 0, proving the SQL predicate filtered rather than a
post-filter) while a chunk at or below it is returned; an unclassified
chunk is withheld from readers at any position; READER mode without a
reader position is 400 and a reader position on an AUTHOR query is 400;
another workspace's reference is 404 on direct read and absent from that
workspace's search; a novel-scoped reference is absent from a query for a
different novel; a VIEWER (a member, so scope passes) is 403 on reference
read; every search writes an audit row carrying the query, mode,
returned/withheld counts, which legs ran, and the same chunk ids the
caller received; the embedding call leaves a `Generation` row with profile
EMBEDDING, task `embed`, status SUCCEEDED and the actor's id; a RETRIEVAL
workflow step returns cited hits and its audit row is linked to the step;
an empty index succeeds with zero hits while recording that only the
lexical leg ran. Second audit round adds: a new version takes an ACTIVE
reference out of scope until it is re-ingested and re-published; a repair
re-ingest does not clear the spoiler boundary; an embedding from a
different model is not ranked, and re-ingest repairs it; a duplicate key
is 409 rather than 500; five concurrent version appends all succeed with
a gap-free number run; a retrieval audit row names the generation
that produced its query vector; a new version takes an ACTIVE reference
out of scope until it is re-published; a repair re-ingest does not clear
the boundary; a disabled embedding model is treated as no route so the
repair is attempted rather than skipped; and a non-finite provider vector
is a 409, not a degraded 200.
`validation.test.ts` (+2, 59 total) — an `outputSchema` is rejected on
RETRIEVAL/TRANSFORM/CONDITION/HUMAN_APPROVAL (accepted on AGENT/SKILL); a
RETRIEVAL instruction is capped at the 2000-char query limit while a
prompt is not.
`chunk.test.ts` (+1, 28 total) — a hard split never emits a blank chunk,
and dropping the blanks loses no content.
`definitions.test.ts` (+3, 36 total) — an unpublished WORKSPACE workflow
is 409 with no generation and no run row; an inherited `$input.constructor`
reference renders as `(not available)` and never as a function's
stringification; a run parked at an approval gate records
`workflow.run_awaiting_approval`, never `workflow.run_completed`.

Migration verified: applies from empty on a scratch database through all
ten migrations (`migrate deploy` on a fresh database, 2026-09-25), and
`migrate diff --from-migrations --to-schema --exit-code` reports 0 (no
drift) against the schema.

## Phase 6 — Story Intelligence Core

**Mandatory cross-cutting scenario (TESTING.md): candidate canon conflict
is not silently committed.** Covered by
`apps/api/src/canon.test.ts` — a proposal whose (entity, predicate) matches
a live ACTIVE fact with a different object stays `PROPOSED` with
`conflictKind = FUNCTIONAL_CONFLICT` and `conflictsWithFactId` set, the
live fact is asserted **byte-identical** afterwards (`toEqual` on the whole
row, not just its status), no second fact is minted, and a proposal
identical to live canon is refused with a 409 rather than stored.

`canon.test.ts` (46, `novelforge_test_canon`) — the API-level suite, which
pins the *service* behaviour: a second live value for one (entity,
predicate) is 409 with no read-then-write pre-check; a claim with both or
neither object form is refused; two spellings that fold to one subject key produce
ONE entity; approval supersedes non-destructively (old row `SUPERSEDED`,
linked, window closed at the replacement's start chapter, object text never
overwritten) and approving twice cannot mint a second fact; rejection
creates no canon row but records the decider; a chapter span whose quote
does not match its offsets is refused rather than stored; evidence naming
both a chapter and a reference is refused; FACT answers with
`ESTABLISHED_FACT` and names its fact; a missing fact reports
`insufficient: true` (no evidence — not "false"); STATE reconstructs
as-of history and returns `INFERENCE` for reconstructed rows; the four
slice-2 question kinds return `NOT_IMPLEMENTED_IN_PHASE_6` rather than an
empty result; a ch-400 fact is withheld from a reader at ch 3 and shown at
ch 400; a fact with no boundary is withheld at every reader position (deny
by default) while the author sees it; READER requires a reader position and
AUTHOR refuses one; a non-member, a foreign novel id, a foreign entity id
and a foreign proposal id are all 404; an EDITOR reads canon but is 403 on
propose and create; an unauthenticated request is 401.

Round-2 regressions (each one fails against the pre-fix code):

- supersede with a NULL `validFromChapter` still closes the old window, so
  the old value stays reachable as-of a chapter before the correction (the
  pre-fix behaviour returned the NEW value at every chapter, including ch 0);
- a backdated correction is accepted rather than 500ing on the window CHECK;
- a two-step chain reconstructs `black[1,10) red[10,20) white[20,∞)` and as-of
  5/15/25 answers black/red/white;
- STATE does not leak a withheld fact's id or start chapter through
  `notYetTrue`, and returns the same `notYetTrue: []` the FACT branch returns;
  AUTHOR still sees the chain, so the gate cost the author-facing behaviour
  nothing;
- a withheld covering fact and an absent one produce **byte-identical** STATE
  bodies (`toEqual`), closing the existence oracle;
- the list route withholds above the reader's position and reports
  `withheldCount: 0` to a reader (the count is an existence oracle — see the
  round-2 correction), and an omitted `mode` is a 400 (READER with no
  position) rather than the permissive default;
- retracting a live fact leaves the row with status `RETRACTED` and a NULL
  `supersededById`, and a different value for the same subject+predicate can
  then be asserted — the ADR-0008 §1 claim, previously untestable; a second
  retraction is 409 and a foreign fact id is 404; and a retracted fact stops
  answering a STATE question (it keeps a NULL `validUntilChapter`, so its
  window would otherwise stay open to infinity and it would be returned as
  the current value forever) and stops appearing in `notYetTrue`, while
  remaining in the record;
- approving a proposal identical to canon that appeared *after* the proposal
  was filed is 409, leaving one ACTIVE fact with a NULL `supersededById`;
- a statement renders from display names, never a machine key or a raw uuid;
- **the RETRIEVAL leg** (previously untested, while three docs claimed the
  Brain answers three kinds): a query with a matching ingested chunk returns
  hits with `basis: SUGGESTION` — reference material is guidance, never story
  truth — and a query that matches nothing returns `insufficient: true` with
  `basis: null`, the same representation FACT and STATE use. The embedder is
  faked through `BuildAppOptions.createGateway`, so no test reaches a provider;
- an entity name whose key is already taken by a DIFFERENT kind is 409 rather
  than silently returning the stored entity, while the same kind stays
  idempotent;
- one of two concurrent decisions on a proposal wins and the other is
  rejected; a `REJECTED` row never points at a fact and an `APPROVED` row
  always does (the guard is compare-and-set, not read-then-write);
- an undated replacement is refused (409) because it would make the old value
  unreachable at every as-of chapter, and a DATED replacement leaves the old
  value reconstructable across its window;
- a superseded fact that carried an AUTHORED `validUntilChapter` keeps it —
  the replacement's start does not reach back and fill the gap the author
  left (`black [1,9)`, a ch-20 replacement, and ch 15 still answers nothing);
- deleting a chapter cited as canon evidence is a mapped 409, and
  `DELETE .../canon/facts/:factId/sources/:sourceId` releases it so the
  delete then succeeds; the fact itself survives with one fewer citation, and
  a foreign tenant or a mismatched fact id cannot unlink it (404);
- READER mode's list omits evidence spans entirely, reports `withheldCount: 0`
  (the count is an existence oracle), and a withheld predicate's response body
  is `toEqual` that of a predicate that does not exist.

Round 5 added three tests, each confirmed to FAIL with its fix reverted (a
test that passes either way pins the belief, not the behaviour):

- an **emptied window** (`validFrom` >= `validUntil` after a backdated
  correction) is not reported in `notYetTrue` — it becomes true at no
  chapter, so offering it as "about to become true" is the same false oracle
  the `insufficient` path was fixed for;
- **12 concurrent duplicate entity creates** all answer 201 and yield one
  row — the loser previously took a bare 500 on
  `story_entities_novel_id_key_key`, contradicting `createEntity`'s own
  idempotence contract. Two concurrent requests do NOT reproduce this (the
  first commits before the second's guard read resolves), which is why the
  count is 12;
- a **retract raced against its approve** leaves the row RETRACTED whenever
  the API reported the retraction done. The supersede was an unpredicated
  `update` on the id, so a retract that committed first was silently
  rewritten to SUPERSEDED and left carrying a successor — the ADR-0008 §1
  forbidden state, with every as-of query after the correction chapter still
  answering the "withdrawn" value. Note both requests may legally succeed in
  sequence (retract commits, approve then finds no live fact and mints a
  fresh one rather than superseding), so the test asserts the terminal state
  of a successful retract, NOT "exactly one winner".

**The DB constraints themselves** (`canon.test.ts`, "the DB constraints are
the subject…"). Everything above travels through the HTTP API, and the
service guards — `resolveObject`, `verifySpan`, the source-kind derivation —
all fire before the statement reaches the database. Those tests therefore
pin the *guard*, not the CHECK: they stay green with a constraint dropped.
Six cases write straight to the database, past every guard, so each fails if
its constraint is absent — all six were confirmed to fail against a
migration with the constraints removed, then restored. Covered: the
`canon_facts_live` partial unique index (a second ACTIVE row for one
(novel, entity, predicate) is refused, a different predicate is not, and a
`RETRACTED` row frees the slot — the ADR-0008 §1 anchor); both
`object_exactly_one` CHECKs; `valid_window_ordered`; both
`span_matches_kind` and `span_ordered`. Each case also asserts the
admissible shape still inserts, so a pass means the mismatch was refused
rather than everything being refused.

Not covered this way, and not coverable: `quote === content.slice(start,
end)`. A CHECK cannot read another row's content, so that rule is only ever
a service guard and its test stays in the API suite above.

`packages/story-intelligence/canon.test.ts` (+31) — the pure rules, pinned
because a domain package may not import the generated client:
`canonicalSubjectKey` folds case, whitespace, punctuation and diacritics
but NOT a typo (silently merging two names is worse than asking) and
returns `""` for unusable input; the enum member sets are pinned so a
schema member added without updating the local union fails a test rather
than a typecheck that still passes; `resolveObject` mirrors the DB CHECK
including the empty-literal case; `classifyProposal` separates DUPLICATE
from FUNCTIONAL_CONFLICT (only NEW is free of a live fact); `answerBasis`
takes the MINIMUM over evidence — one candidate row demotes an otherwise
established chain to INFERENCE, a superseded row is never established, an
as-of reconstruction is never established, a draft chapter is inference
while a published one is established, and a reference chunk is only ever a
suggestion; `locateQuote` refuses an unlocatable quote instead of guessing;
`verifySpan` rejects empty, reversed, negative, fractional and
past-the-end spans; `canonBoundary` maps absent or malformed boundaries to
`null`, which `canView` withholds.

`authorization.test.ts` (+3, 27 total) — canon capabilities are asserted
per role rather than left to the generic loops: none is a platform
capability and `canPlatform(SUPER_ADMIN, "canon:approve")` is false;
`canon:read` is held by OWNER/ADMIN/AUTHOR/EDITOR and not VIEWER;
`canon:manage` and `canon:approve` are held by OWNER/ADMIN/AUTHOR and
NOT by EDITOR. The EDITOR asymmetry is the point — no generic loop covers
it, so a future edit granting it would otherwise pass every test.

Round 6 (Phase 5 audit) added seven tests across three suites; the
interleave, FK and disconnect rows were each confirmed to FAIL with the fix
reverted:

`apps/api/src/retrieval.test.ts` (27 total) —

- a **publish raced against a version append** never leaves the reference
  ACTIVE with a chunkless current version (invisible to search while
  reading ACTIVE). Interleave injected by patching
  `db.reference.findUniqueOrThrow`; the loser now 409s on the
  `currentVersionId` compare-and-set;
- an **ingest whose embed references chunk ids a concurrent re-ingest
  deleted** retries exactly the embeddings-FK violation (P2003/P2010/
  23503) once, re-reading the ids — and still fails the request when a
  *provider* fault produces the same code, which is why the retry is
  category-scoped;
- the **re-ingest skip guard refuses to skip when two enabled models
  could both win the route** — its model resolution mirrors the router's
  candidate set instead of assuming the single enabled model wins;
- a **provider returning a wrong vector count/dimension** on ingest, and a
  poisoned query vector, answer 502 `BAD_GATEWAY`, not 409 — they are
  upstream failures, not caller mistakes;
- the **search route shares canon-routes' `checkModePair`** (no new test;
  the existing 400 assertions on both routes pin the identical behavior).

`apps/api/src/ai.test.ts` (29 total) —

- a **client disconnecting mid-SSE aborts the upstream stream**, proven
  against a REAL socket (`app.listen` + `fetch` + abort):
  light-my-request cannot fire a response `close` mid-stream, so an inject
  harness would pass vacuously. Asserts the abort reached the gateway's
  signal AND the generation settles FAILED. The fake gateway's generator
  hangs until its `signal` fires, modeling a live upstream whose fetch was
  aborted.

`packages/retrieval/fuse.test.ts` (17 total) —

- **`lists` as an array** fails closed with `FUSE_BAD_LISTS` —
  `typeof [] === "object"` previously passed the guard, the per-retriever
  lookups always missed, and the fusion silently returned empty;
- a **non-array leg** (a string, a number, a hit-like object) fails closed
  with `FUSE_BAD_LISTS` naming the retriever — it previously threw
  `hits.forEach is not a function` from a function whose contract is that
  failures are data.

## Phase 7+

Rows added when each phase starts. Mandatory cross-cutting scenarios
(streaming interruption, candidate canon, etc.) are listed in TESTING.md
and become matrix rows in the phase that implements them.

## AI Orchestrator milestone (2026-10-03)

`apps/api/src/orchestrator.test.ts` (14 total) — dedicated
`novelforge_test_orchestrator` database (ADR-0003 §8). Every test drives
the real HTTP surface against a real migrated database and the REAL
Phase 3 generation path — gateway routing, the generation ledger, and
the audit trail all run for real. Only the transport is faked
(`BuildAppOptions.createGateway`), so no test ever reaches a provider
(CLAUDE.md §25).

- **prompt assembly** — the `system` message holds ONLY instructions
  (the agent's and the granted skill's); canon facts and reference
  excerpts reach the model in the `user` message inside a `<context>`
  fence, with their provenance ids inline and the author's instruction
  unmodified. The test asserts the boundary from both sides: the system
  turn must NOT contain `## Established canon`, `[fact:<id>]` or a
  reference title. `task` is `agent:<key>`; `promptVersion` is
  `agent:<key>@v<n>` and `contextSnapshot` carries the fact and
  reference/chunk ids actually injected. Pinned on the `Generation`
  row, not on the service's return value.
- **agent settings reach the transport** — a `DEEP_PLANNER` agent with
  `temperature: 0.2` / `maxTokens: 512` produces exactly those on the
  gateway request, and the ledger row records the profile. Without this,
  a dropped `temperature` is invisible: the generation still succeeds.
- **retrieval leg** — a published, novel-scoped, ingested reference
  whose text shares no terms with the instruction is still injected when
  `contextQuery` names it, and is absent when it does not. `contextQuery`
  being ignored is otherwise indistinguishable from "no hits".
- **resolution gating** — a DRAFT or unknown agent is 409, a foreign
  workspace 404, a VIEWER 403, a novel in another workspace 404, a bad
  body 400; each asserts `generation.count() === 0`, so a refusal that
  still burned a provider call fails the test. The foreign-novel case
  uses an agent key that does not exist, so a resolution-first order
  would answer 409 — the 404 proves the orchestrator's OWN novel guard
  ran rather than being masked by the identical check downstream.
- **contracts fail closed, both ways** — non-JSON output is 409, and
  JSON that parses but violates the shape is 409. Both assert the row
  was left `FAILED`/`DETERMINISTIC` with `promptVersion` null: a
  rejected output must not leave a ledger row claiming success, and must
  not be stamped as validated. A THIRD case asserts the positive half —
  a contracted agent's response carries `output` (the value the contract
  approved, extracted from fenced JSON a bare `JSON.parse` would
  reject), and a prose agent's response carries no `output` key at all.
  Without it, `enforceContract`'s return value could be discarded and
  every caller would silently re-parse the raw text, re-opening the
  boundary the contract exists to close.
- **streaming** — deltas arrive, the row settles `SUCCEEDED` and is
  stamped; a stream that throws after emitting settles `INCOMPLETE` with
  **no** provenance stamp and an empty `contextSnapshot`; a contracted
  agent is refused with a real 409 and a non-SSE content type before any
  bytes, so the refusal is not laundered into an error event.

Note for anyone running this suite: `novelforge_test_orchestrator` is a
single shared database, so two concurrent runs of this file collide
(users_email_key violations, then cascading 401/500s that do not
reproduce in isolation). Run it alone, or give each run its own copy.

## Phase 8 — Character & Relationship Intelligence (2026-09-30)

`apps/api/src/character.test.ts`, 22 tests, dedicated
`novelforge_test_phase8` database. The two roadmap exit scenarios are
driven through the real HTTP surface, because that is where the criterion
lives — a domain-package test would prove the rules and not the wiring.
No test in this file reaches a provider: the Phase 8 routes issue no
model call at all, and the gateway factory given to `buildApp` throws if
one ever does.

- **enemy-to-ally** — an ENEMY span `[1,50)` followed by an ALLY span
  `[50,∞)` reads back ENEMY at 49 and ALLY at 50 (half-open, so the
  chapter the turn happens on belongs to the new stance), and
  `/stances/since` reports `{stance: "ALLY", sinceChapter: 50}` — the
  dated turn, which is the thing an author actually asks for. A third
  span overlapping the first is 409 and **both original spans are still
  present afterwards**: the turn is recorded by adding a span, never by
  editing the old one. Self-stance is 409. A chapter with no recorded
  stance is **200 with a null body**, not a 404 — the pair exists, so
  "nothing recorded yet" must stay distinguishable from "no such
  character".
- **monogamy / harem / polygamy** — a second concurrent MONOGAMY bond
  sharing a member is 409, and the same bond is 201 **after** the first
  is deleted, proving the rule is about concurrency and not a lifetime
  cap. A three-member MONOGAMY bond is 409. A HAREM of four, a
  POLITICAL_MARRIAGE and a MONOGAMY bond all coexist (201 each, three
  rows listed) — POLITICAL_MARRIAGE is deliberately not exclusive
  because it names *why* a bond exists, not how many a character may
  hold. A duplicated member is 409.
- **bond lifecycle** — ATTRACTION → COURTSHIP → MARRIAGE reads back
  COURTSHIP at ch 30 and MARRIAGE at ch 90; a stage that goes backwards
  while labelled ADVANCE is 409 (MISLABELED_REGRESSION is the rule with
  teeth — a quiet rewind is otherwise invisible).
- **neglect is weighted, not counted** — a 0.9 interaction at ch 5 and a
  0.05 scene at ch 40 report `lastMeaningfulChapter: 5` and
  `neglected: true` at ch 50. A chapter-presence heuristic would report
  the opposite, which is the case the spec's "not simple chapter
  presence" rule is about.
- **authorization and tenancy** — 401 without a session, 403 for a
  VIEWER (who may read canon but not manage it), 404 for a novel in
  another workspace, and 404 for a bond member belonging to another
  novel. The FK alone would have accepted that last one, so the test
  pins the service's own guard.
- **the DB constraints are the subject, not the service guard in front
  of them** — eight cases write straight to the database, past every
  guard: overlapping character-state windows, an inverted/zero-length
  window, overlapping knowledge windows for one (character, fact), two
  overlapping stances in one direction, a self-stance, an interaction
  weight outside 0..1, a milestone chapter below 1 and a duplicate
  milestone chapter, and an inverted bond window. Adjacency is asserted
  to be legal (`[1,50)` then `[50,∞)`), the reverse stance direction is
  asserted to be unconstrained, and a second character is asserted to
  hold the same fact over the same chapters — each proving the
  constraint is not wider than it claims.
- **Every one of the eight was confirmed to fail with its constraint
  dropped**, by a one-off probe that dropped the constraint inside a
  rolled-back transaction and retried the exact refused statement. All
  eight are load-bearing (three `23P01`, five `23514`). Two probe bugs
  were fixed en route and are recorded in `progress.md`: a refused
  `INSERT` aborts the enclosing transaction (`25P02`, needs a
  `SAVEPOINT` per attempt), and a constraint cannot be re-added while
  the probe row is still present because `ADD CONSTRAINT` re-validates.

The domain packages carry their own unit suites —
`packages/character-intelligence/character.test.ts` (22) and
`packages/relationship-intelligence/relationship.test.ts` (33) — which
include the enum pins that catch drift against the Prisma enums.

## Phase 6 slice 3 — the story write surface (2026-09-30)

`apps/api/src/story.test.ts` (20 tests, dedicated `novelforge_test_story`
db). Drives the real HTTP surface against a real migrated database, because
the claim under test is that rows written through the API are what the
**Brain** then answers with — a suite that only checked the write would
pass while the Brain read a different table.

- **Write → read through the Brain.** An event POSTed to
  `story/events` appears in the `EVENT` answer. A promise POSTed to
  `story/promises` is what `PROMISES` ranks, and importance × age orders
  it correctly. These two are the tests that would have failed before this
  slice: the Brain had no way to be fed.
- **Spoiler boundary on authored data.** An event at
  `availableFromChapter: 40` is absent from a `READER` ask at chapter 10
  **and reports no withheld count** (the count is itself an existence
  oracle), is present for the author, and appears for a reader at 40.
- **`canPromiseTransition`.** Full forward walk SETUP → DEVELOPING →
  READY_FOR_PAYOFF → PAID_OFF; a paid-off promise refuses to reopen (409);
  a backward move and a same-state move are refused; `ABANDONED` is
  reachable from an open state.
- **`findCausalCycle`.** A → B accepted, B → A refused 409. Self-edge,
  duplicate edge, and a cross-novel event all refused (409/409/404).
- **Confidence splits authority.** `EXPLICIT` needs no approver and stores
  none; `INFERRED` requires `canon:approve` — an EDITOR gets 403 — and
  stores the approver's id. The Brain reports an `INFERRED`/`SPECULATIVE`
  edge as basis `SUGGESTION`, never as established fact (CLAUDE.md §21).
- **The resolution pairs.** `RESOLVED` without a chapter and a chapter
  without `RESOLVED` are both 409; `DORMANT` is still unresolved, so it
  appears in the `UNRESOLVED` ledger with a non-zero debt.
- **`isChronological`, by index.** A raw insert of a colliding
  `(novelId, order)` is rejected `P2002` — the rule is enforced by the
  unique index, and an earlier read-side branch asserting it was removed
  as unreachable.
- **Tenancy and capability.** 401 unauthenticated; 403 for a VIEWER on
  both read and write; 404 for a novel in another workspace **and** for a
  nonexistent one (identical, no existence leak); 404 for a real thread id
  reached through the wrong novel; 400 for `importance: 99`, an unknown
  thread kind, and a blank description.

**Not covered, and said so:** the concurrent-append `P2002` → 409 branch
in `appendTimelineEvent`. Prisma serialises injects on one connection, so
the interleaving cannot be forced; a test that races only sometimes was
deleted rather than kept, and the branch is documented as race defence.

**Constraint probe.** All six slice-2 CHECKs confirmed load-bearing by
dropping each inside `BEGIN`/`ROLLBACK` and retrying the exact refused
statement — `refused: 23514` with, `accepted` without. Probe deleted after
use; results in `progress.md`.

## Phase 9 — Narrative DNA & Rhythm (2026-09-30)

`apps/api/src/narrative.test.ts` (46 tests, dedicated `novelforge_test_phase9`
db). The two roadmap exit scenarios are driven through the real HTTP surface,
because that is where the criterion lives — a domain-package test would prove
the rules and not the wiring. No test here reaches a provider: the Phase 9
routes issue no model call at all, and the gateway factory given to `buildApp`
throws if one ever does.

- **"non-mechanical" is asserted at the WORD level.** A drama window whose
  guidance says "insert drama" has turned the ADR-009 soft preference into
  the cron-like rule `NARRATIVE-RHYTHM.md:5` forbids, and a state-only
  assertion would stay green while it did. `expectNoImperative` checks the
  guidance string against `["should", "must", "insert", "add ", "need",
  "consider", "time for", "now"]` for **both** the IN_GAP case (40 chapters
  inside the authored 30-50 gap) and `BEYOND_EXTENDED_CALM` at 200 chapters
  with `strictInterval: true`. `strict` is asserted to be echoed as **data**
  and never as a command in the prose.
- **No policy is never a default.** `POST /narrative/drama-window` with no
  stored `DRAMA_GAP` policy is 409, not a default ladder (ADR-0011 §2). The
  same holds for `POST /narrative/cooldown` with no `COOLDOWN` policy — it was
  a silent `allowed: true` until the deep audit, which is the identical
  substitution in the one rule that actually binds.
- **A malformed policy is refused on write and stored nowhere** — a policy
  with `extendedGap.max < typicalGap.max` is 409 and the list is still empty
  afterwards.
- **The cooldown is the one hard rhythm rule.** A same-type beat 5 chapters
  back inside a 10-chapter window is `allowed: false` with
  `conflictsWith.beatId` and `distance` named; a **different** type at the
  same distance is `allowed: true` — the window protects a flavour, not drama.
- **"evidence-backed" means concrete rows, never a score.** A sequence
  repeated twice returns `occurrences: 2`, `severity: INFO`, and
  `evidence` listing **all six** beat ids and chapters (`b1..b6`,
  `10,11,12,40,41,42`). The suggestion is asserted to contain "vary" — a
  variation, not a ban. A trope used once returns **null**, not a low-severity
  finding — and asking for `minOccurrences: 1` is 400, because a "repeat" of
  one is the result the rule itself calls not a pattern.
- **The soft/hard split reaches the response.** A TEMPORARY antagonist with
  no purpose is 409; the same role with a stated purpose is 201. One whose
  span runs 30 chapters (past the doc's ~5-20) is **201 with an `advisory`
  array naming `SPAN_OUT_OF_BOUNDS`** — the migration calls that bound "a
  pacing note, not an unrepresentable row", so refusing it would be the
  soft constraint acting as the schedule ADR-009 forbids.
- **Antagonist lifecycle.** A backward move (CONFRONTATION → FRICTION) is 409
  **and the stored stage is unchanged afterwards**; a repeated stage is 409;
  a forward move records the outcome; a span ending before it starts is 409;
  the same character cast twice in one novel is 409. **A later advance that
  omits `outcome` leaves the recorded one in place** (the route used to coerce
  it to null and wipe it), while an explicit `null` still clears it — omission
  and null stay distinct.
- **Hardness is per-policy (ADR-009).** `HARD` with no reason and with a
  whitespace-only reason are both 409; `HARD` with a reason and `SOFT` with
  none are both 200; a second PUT for the same kind **upserts** rather than
  accumulating a row.
- **A policy can be unset, not only overwritten.** `DELETE .../policies/:kind`
  is 204, removes only that kind, and 404s for a kind never set (400 for an
  unknown kind). One test asserts the delete is **real** rather than a soft
  flag: after deleting the `DRAMA_GAP` policy the drama-window call returns to
  409, because no policy must never read as a default ladder (ADR-0011 §2).
  Authorization is checked on the delete path too, and the refusal is asserted
  to have deleted nothing.
- **Narrative DNA round-trips** and returns `null` before anything is
  written — the novel exists (the gate would have thrown otherwise), so
  "nothing written yet" is a real answer. A non-object payload is 400.
- **Authorization and tenancy.** 401 without a session, 403 for a VIEWER on
  write, 404 for a novel in another workspace, 404 for an antagonist id
  reached through the wrong novel, and 404 for a **character** belonging to
  another novel — the last one matters because `character_id` references
  `characters(id)` with no novel predicate, so the FK alone would have
  accepted it.
- **The DB constraints are the subject, not the service guard in front of
  them.** Five cases write through Prisma, past every guard: a TEMPORARY
  antagonist with a null purpose, with a whitespace-only purpose, an inverted
  span and a `fromChapter: 0`, a `HARD` policy with no reason — plus the
  one-live-policy-per-kind unique index. Each is paired with the legal row
  the constraint must still accept, proving it is not wider than it claims.
- **The scale route is reachable and pinned.** `POST /narrative/scale` had
  zero coverage anywhere — swapping `proposal` and `standing`, or dropping
  the tenant gate, left every suite green. Four cases now drive it: a
  proposal beyond reach (`reach: TOWN`, `gap: 4`), one inside reach, an
  unknown scale as 400 at the boundary, and a cross-workspace novel as 404.
- **The domain vocabulary is pinned against the generated Prisma enums, not
  just against itself.** `rhythm.test.ts` pins the mirrors against
  hand-copied literals, which catches an edit to `vocabulary.ts` but not
  drift from `schema.prisma`. `apps/api` is the only package that may import
  both, so one test there compares all five schema-backed Phase 9 enums
  member-for-member (`NarrativePolicyKind`, `PolicyHardness`,
  `AntagonistRole`, `AntagonistStage`, `AntagonistOutcome`). The four
  domain-only vocabularies (`DRAMA_TYPES`, `DRAMA_DENSITIES`,
  `NARRATIVE_SCALES`, `DRAMA_WINDOW_STATES`) have no schema counterpart and
  keep the literal pin as their only guard.

**Constraint probe.** `packages/database/test/narrative-constraints.integration.test.ts`
(11 tests) is the companion and the load-bearing proof. It writes straight to
the database with raw SQL, so it does not import `services/narrative.ts` — the
point is what PostgreSQL does when the service layer is not in the path. Each
of the three CHECKs is dropped inside a rolled-back transaction, the exact
refused statement is retried, and it is confirmed to then be **accepted**;
all three are load-bearing (`23514` with, `ACCEPTED` without). **Every
refused shape is probed, not just one per constraint** — a sibling shape whose
refusal came from some other mechanism (a `NOT NULL`, a second CHECK) would
leave the CHECK under test inert for it and still pass a single-shape probe.
A guard asserts all three constraints exist **before** probing, so a missing
one cannot make "refused" a false pass. Two Phase 8 lessons carry over: a
refused `INSERT` aborts the enclosing transaction (`25P02`, needs its own
`SAVEPOINT`), and `ROLLBACK` — never a cleanup `DELETE` — both restores the
dropped constraint and discards the probe row, because `ADD CONSTRAINT`
re-validates existing rows.

The domain package carries its own unit suite —
`packages/narrative-rhythm/rhythm.test.ts` + `scale.test.ts` (38 tests), including the enum pins
that catch an edit to `vocabulary.ts` and the branch coverage the HTTP surface
cannot reach (a malformed stored window, an empty pattern sequence, a
non-chapter `chaptersSinceDrama`).
