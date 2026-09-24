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
| `ai-core` OmniRoute transport/SSE | passing (18) | — | — | — | — |
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
untouched. `omniroute.test.ts` (18) — transport/SSE behaviour listed under
the audit follow-up in `progress.md`. `ai.test.ts` (28,
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
| Contract validator (`packages/validation`) | passing (55) | — | — | — | — |
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
`definitions.test.ts` (32, `novelforge_test_phase4`) — as
previously, plus: a duplicate PLATFORM key is 409 with exactly one row
stored; a workspace key may shadow a platform key; a failing step gets
its own FAILED row carrying the sanitized summary; an
`AWAITING_APPROVAL` run records a null `completedAt`.

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

## Phase 5+

Rows added when each phase starts. Mandatory cross-cutting scenarios
(streaming interruption, candidate canon, etc.) are listed in TESTING.md
and become matrix rows in the phase that implements them.
