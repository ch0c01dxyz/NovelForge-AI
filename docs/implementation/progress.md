# Implementation Progress

> Durable record of phase/task status. Update after each substantial
> change (CLAUDE.md section 35). Detailed architecture lives in
> `docs/02-architecture/`, decisions in
> [decisions.md](./decisions.md), test coverage in
> [test-matrix.md](./test-matrix.md).

Last updated: 2026-09-28 (Phase 6 slice 2 + Phase 7 slice 2 + post-slice-2
audit fix `38a00ae`).

## Phase 0 — Repository & Architecture Foundation

Source: `docs/12-roadmap/IMPLEMENTATION-ROADMAP.md` and
`docs/14-progress/CURRENT.md`.

- [x] NF-0001 Initialize monorepo/workspaces — committed (`0fe2378`).
- [x] NF-0002 Docker Compose baseline for PostgreSQL+pgvector and
  Redis — committed (`528ff20`); healthy boot + pgvector 0.8.6
  verified on Windows Docker Desktop.
- [x] NF-0003 Shared config/env validation — committed (`422fa44`,
  Zod schema in `packages/config`).
- [x] NF-0004 Module-boundary conventions and contract package —
  committed (`54a0394`, includes ADR-0001).
- [x] NF-0005 CI lint/typecheck/test skeleton — committed (`d47e3d5`);
  root `lint`/`typecheck`/`test` scripts are real (eslint, recursive
  tsc, vitest) and pass in a clean clone (NF-0010 verification run).
- [x] NF-0006 ADR/test documentation workflow — committed (`fc0f5fc`;
  ADR template, progress/decisions/test-matrix seeded).
- [x] NF-0007 Bootstrap Nuxt/Tailwind web shell — committed
  (`18ca5e8`); production build passes in clean clone.
- [x] NF-0008 Bootstrap Fastify API health/readiness — committed
  (`5dca86b`, `/health` and `/ready`).
- [x] NF-0009 Bootstrap worker health and BullMQ connection —
  committed (`6178ed2`); unit tests + real-Redis integration and
  clean SIGTERM shutdown verified on Windows.
- [x] NF-0010 Cross-platform clean-clone verification — Windows
  **PASSED** (2026-09-23, `scripts/verify-clone.ps1`: fresh clone →
  frozen-lockfile install → lint → typecheck → test → build all apps
  → `docker compose config`, exit 0). Ubuntu 24.04 **PASSED**
  (2026-09-23, `scripts/verify-clone.sh` inside an Ubuntu 24.04
  Docker container with Node v22.23.2, pnpm 12.5.1, git 2.43,
  Docker CLI 29.1.3 + Compose 2.40.3: full pipeline exit 0,
  `CLEAN-CLONE VERIFICATION PASSED (Linux)`).

Phase 0 exit criteria (roadmap): clean clone boots on Windows
Docker/WSL2 and Ubuntu Docker. **Windows: met. Ubuntu: met**
(container run; a bare-metal Ubuntu host run remains optional
confirmation). Phase 0 is complete.

## Phase 1 — Identity, Tenancy & Persistence Core

Implemented directly in-session (2026-09-24) after gateway instability
blocked Orca workers; task IDs follow the roadmap.

- [x] NF-1001 Prisma platform schema + initial migration with pgvector
  — committed (`f9db7e2`); ADR-0003. Users/sessions/workspaces/
  memberships/novels/novel_settings/audit_logs, UUID keys, pgvector
  extension enabled from migration 1. Integration suite against live
  compose PostgreSQL passing.
- [x] NF-1002 Session auth primitives (`@novelforge/auth`) — committed
  (`cc5c243`); ADR-0002. argon2id hashing, opaque SHA-256-hashed
  session tokens, 30-day sliding sessions, timing-equalized login.
  12 unit + 2 integration tests passing.
- [x] NF-1003 API auth routes (register/login/logout/session) —
  committed (`cac08bc`). Zod validation, HttpOnly SameSite=Lax cookie,
  @fastify/rate-limit (register 10/min, login 20/min). Integration
  tests via fastify.inject against live PostgreSQL passing.
- [x] NF-1004 RBAC platform services + routes + audit foundation —
  committed (`0b12534`); ADR-0004. Capability map in
  `@novelforge/auth/authorization`, workspace/novel services with
  membership-as-tenant-gate (404 for non-members), append-only audit.
  7 authorization unit + 8 platform integration tests passing.
- [x] NF-1005 Tenant isolation exit gate — committed (`7231df5`).
  Route-level suite `apps/api/src/tenant-isolation.test.ts`
  (dedicated `novelforge_test_isolation` db): 401 gate, revoked-session
  access loss, non-member 404 across read/write/member-add shapes,
  session-scoped novel listing, removed-member access loss, VIEWER
  read-only enforcement, audit scoping. 7 tests passing.

Phase 1 exit criteria: full repo gate green on Windows against live
compose PostgreSQL/Redis (2026-09-24): lint 0 errors; typecheck all
workspaces Done; tests 11 files / 70 passed / 1 skipped; apps build
(incl. Nuxt production). **Met.**

### Phase 0/1 audit pass (2026-09-24)

Three parallel read-only audits (auth security, platform RBAC, DB
schema/migrations/worker) over all Phase 0/1 code. Findings fixed:

- worker: `queue.add` failure after a successful probe crashed the
  process (violated the never-throw contract) — now logged + degraded;
  `stop()` could hang forever on `quit()` against a dead Redis — now
  raced with a 2s timeout and hard `disconnect()`. 2 new unit tests.
- platform services: last-owner demote/remove check-then-act race —
  now a `SELECT … FOR UPDATE` workspace-row lock + owner recount inside
  `db.$transaction`; unique-constraint race losers (workspace slug,
  duplicate member, novel slug) map P2002 → 409 instead of 500.
- platform routes: path params now uuid-validated (malformed ids were
  500s); workspace name / novel title trimmed (whitespace-only
  rejected); removed dead ConflictError try/catch (error handler
  already maps it).
- auth: concurrent duplicate register maps P2002 → 409 EMAIL_TAKEN
  (was 500); deleted unused `safeEqual`.
- config: `maskUrlCredentials` redacts passwords containing `@`
  (greedy match to last `@`); regression test added.
- api: `genReqId` only honors a uuid-shaped `x-request-id`.

Verified: lint 0, typecheck Done, 11 files / 73 passed / 1 skipped
(4 new regression tests), apps build green.

Deferred (documented decisions, not bugs):
- `trustProxy` unset — no reverse proxy in the deployment shape yet;
  set it (proxy count/address) when one exists, or rate limits key on
  the proxy IP.
- Audit-after-commit ordering: a failed audit write returns 500 with
  the mutation persisted. Accepted Phase-1 trade-off; revisit with an
  outbox if audit completeness becomes a compliance requirement.
- `listMembers` returns member emails to any role incl. VIEWER —
  intentional for Phase 1 collaboration UX; restrict if email privacy
  becomes a requirement.
- `sessions.expires_at` unindexed — add with a session-cleanup job.
- compose binds 5432/6379 on 0.0.0.0 (local dev only).

Known CI gap: **closed** — `ci.yml` now runs postgres (pgvector/pg16)
and redis service containers with `DATABASE_URL`/`WORKER_IT_REDIS_URL`,
so all DB-backed suites and the worker real-redis suite run remotely.

## Phase 2 — Writing Core

Implemented in-session (2026-09-24).

- [x] NF-2001 Manuscript schema + migration — `chapters`,
  `chapter_versions` (immutable, one per save), `scenes`;
  ChapterStatus enum (DRAFT/IN_REVIEW/PUBLISHED); (novelId, number) and
  (chapterId, number) uniques; current-version 1:1 pointer; migration
  `20260924_phase2_manuscript` verified drift-free via `migrate diff`.
- [x] NF-2002 Manuscript services + routes —
  `apps/api/src/services/manuscript.ts` + `manuscript-routes.ts`.
  Chapter CRUD with novel-row-lock numbering (no retry loop); version
  append on every save (FOR UPDATE + in-tx expectedVersion recheck
  closes the optimistic-concurrency window; deleted-mid-save → 404);
  published chapters immutable until unpublish; chapter:* capabilities
  (OWNER/ADMIN full, AUTHOR create/read/update, EDITOR read/update,
  VIEWER read); shared platform error handler (single setErrorHandler
  app-wide); import atomic single-tx + locked numbering; export
  filename sanitized.
- [x] NF-2003 Editor shell (`apps/web`) — writer-workspace layout on
  nf-* tokens (header/nav/editor/footer per DESIGN-TOKENS.md), wired to
  the manuscript API: fetch chapters, load/select a chapter, autosave
  (dirty→saving→saved, 1.5s debounce) PUT with `expectedVersion`, 409
  refetch instead of clobber, publish PATCH, loading/empty/error states,
  unmount timer cleanup. No AI chrome.
- [x] NF-2004 Import/export baseline — Md import (ATX `#`/`##` split,
  chapters land DRAFT — imports are NOT canon per CLAUDE.md §32), TXT
  setext `===` title underline, whole-novel Markdown export with safe
  filename. Save/import routes carry an explicit bodyLimit above the
  schema cap (Fastify default is 1 MB).
- [x] NF-2005 Exit gate — `apps/api/src/manuscript.test.ts` (21 tests,
  dedicated `novelforge_test_manuscript` db): CRUD+numbering, version
  immutability, stale-version 409, publish/immutability, empty-publish
  409, tenant 404 across all route shapes, VIEWER/EDITOR capability
  enforcement, 401 gate, import parsers (md/txt/large-body), export
  ordering, version history + non-destructive restore, published
  delete/restore guards, audit trail.

Phase 2 exit criteria: author can write/version a manuscript without
AI (roadmap). Full repo gate 2026-09-24: lint 0, typecheck Done,
12 files / 94 passed / 1 skipped, apps build green. **Met.**

### Phase 2 audit pass (2026-09-24)

Inline audit (subagents down — model rate limit). Findings fixed:
- importChapters partial-commit + numbering race → single tx with
  novel-row lock, atomic import, numbering serialized with createChapter
  (which trades its retry loop for the same lock).
- saveChapter deleted-mid-save race → 404 via in-tx existence recheck.
- export filename sanitized (defense-in-depth around header).
- web autosave timer cleared on unmount.
- manuscript error classes unified with platform's (one app-wide
  setErrorHandler — a duplicate Fastify handler was mapping platform
  errors to 500).

### Phase 2 second audit pass (2026-09-24)

Deeper pass on the same phase; findings fixed:
- **No audit trail for manuscript mutations** — chapters were created/
  saved/deleted/published/imported with nothing in `audit_logs`, unlike
  platform services. `createManuscriptServices` now takes an optional
  `AuditService`; all seven mutation paths record (workspaceId +
  actorUserId + action + payload). Wired in `app.ts`.
- **Published chapters could be deleted** — `deleteChapter` lacked the
  PUBLISHED guard `saveChapter` enforces. Now 409 "unpublish first".
- **Version history/restore declared but unimplemented** — the service
  interface and docs promised recovery; there was no write path.
  Implemented `listVersions` (newest-first) and `restoreVersion`
  (non-destructive: appends the old content as a NEW version under a
  chapter-row lock; PUBLISHED-guarded) plus their routes.
- **TXT parser only split once** — the `===` underline required the
  title to be the block's *first* line, so a second chapter never split.
  Rewrote the parser to setext semantics (title = the line above `===`,
  everything before it belongs to the previous chapter); `---` stays
  prose.
- **Body-limit mismatch** — save accepts 1 MB and import 5 MB but
  Fastify's default `bodyLimit` is 1 MB, so valid payloads 413'd before
  Zod ran. Per-route `bodyLimit` set with headroom.
- **Fastify 4xx masked as 500** — 413/415/parse errors fell through the
  error handler to `500 INTERNAL`. Now 4xx statusCodes pass through as
  `400 BAD_REQUEST`.

Deferred: scene CRUD/API (schema only; vertical slice when editor needs
scene editing, not speculative).

### Phase 2 end-to-end wiring (2026-09-24)

The Phase 2 exit criterion — "author can safely write/version a
manuscript without AI" — was not actually reachable: the API and
services were complete and tested, but the browser could not get to
them. Closed the three gaps:

- **No page route** — `apps/web/app/` had only `app.vue`, so `useRoute()`
  yielded no params and the app requested
  `/api/workspaces//novels//chapters` (empty ids). Added
  `pages/index.vue` (novel list + auth gate),
  `pages/sign-in.vue`, and
  `pages/workspaces/[workspaceId]/novels/[novelId]/index.vue` (the
  writer workspace, now reading real route params); `app.vue` is the
  `<NuxtPage/>` root.
- **No API origin** — `fetch('/api/...')` resolved to the Nuxt origin.
  Added `server/api/[...path].ts`, a transparent Nitro proxy to
  `NUXT_API_BASE`, forwarding method/headers/body/status/Set-Cookie.
  Same-origin keeps the HttpOnly SameSite=Lax session cookie working
  (ADR-0002 §6) with no CORS. Web dev port pinned to 3001 (the API also
  defaults to 3000).
- **No sign-in surface** — added `pages/sign-in.vue` (login + register),
  `composables/useApi.ts` (typed `{error}` envelope -> `ApiError`), and
  401 handling that redirects to
  `/sign-in?redirect=<path>` (internal paths only — no open redirect).

Also fixed while verifying: `apps/api/src/server.ts` never loaded the
repo-root `.env`, so `node src/server.ts` failed env validation on every
run (tests loaded it themselves, which hid this); it now loads `.env`
when present, with real env winning. Added `apps/web` typecheck
(`vue-tsc`) — the web app was absent from `pnpm typecheck` entirely.

Verified end-to-end in headless Chrome against live Postgres + API +
built Nuxt server: register/login set the cookie through the proxy,
home lists novels, the editor loads chapter content, autosave produced
v2 server-side, sign-in redirect returned to the editor, and
unauthenticated access to both `/` and the editor redirects to
`/sign-in`. Proxy scope checked (traversal/absolute-host attempts 404;
only `/api/**` proxied). Export headers and a 2 MB import pass through.

Second-pass bugs found and fixed in the new editor code (each a real
data-integrity risk, not cosmetic):
- **Chapter-switch race** — `saveNow` wrote `version`/`saveState` after
  an await, so a save in flight during a chapter switch could write the
  old chapter's version onto the newly selected one. Now only the
  still-active chapter may touch live editor state; stale responses are
  dropped (monotonic `selectSeq` guards `selectChapter` too).
- **Publish on unsaved text** — `publish()` proceeded even if the
  pre-publish save failed or hit a conflict, freezing stale content as
  PUBLISHED. It now aborts unless the save state is `saved`.
- **Stale error banner** — the error message was never cleared on a
  successful save/selection.

Deferred: scene CRUD/API (schema only; vertical slice when the editor
needs scene editing, not speculative). `prompt()` is used for chapter
title creation — fine for now, replace with an inline field when the
editor gets a real chrome pass.

## Phase 3 — AI Infrastructure / OmniRoute

Implemented in-session (2026-09-25).

- [x] NF-3001 AI schema + migrations — `ai_gateways`, `ai_models`,
  `model_profile_mappings`, `generations`, `generation_attempts`, plus a
  `PlatformRole` enum on `users`. Migrations
  `20260925_phase3_ai_infrastructure`, `_platform_admin`, `_gateway_latency`,
  each verified drift-free via `migrate diff --exit-code`.
- [x] NF-3002 `@novelforge/ai-core` — the only provider-adjacent package
  (ADR-0001 §3). `AIGateway` interface; `OmniRouteGateway`
  (OpenAI-compatible chat/stream/embeddings/models, Bearer auth, per-call
  timeout, SSE parsing with final-frame + multibyte flush and reader
  release); `GatewayError` classification (TRANSIENT/RATE_LIMIT/AUTH/
  INVALID_REQUEST/UNSUPPORTED/DETERMINISTIC/INTERNAL, network errors
  detected by code); AES-256-GCM credential crypto; pure routing policy
  (PRIORITY/WEIGHTED/ROUND_ROBIN/LEAST_LATENCY/FAILOVER, circuit breaker,
  bounded backoff+jitter); `GatewayManager` with retry/fallback that
  records every attempt and never restarts a stream that already emitted.
  Depends on injected ports only — no Prisma, no HTTP framework.
- [x] NF-3003 Gateway/model registry + admin API — `apps/api/src/ai-registry.ts`
  (the only place ai-core meets Prisma) and `services/ai.ts` +
  `ai-routes.ts`. Platform-wide resources are guarded by
  `requirePlatformCapability` against `users.platform_role`, a NEW axis
  (ADR-0005): a workspace OWNER cannot manage global gateway credentials.
  Model discovery upserts the local catalog in one transaction with its
  audit row.
- [x] NF-3004 Generation path + history — logical `Generation` row created
  before any transport attempt, one `generation_attempts` row per attempt,
  success/failure recorded with classified category and sanitized message,
  workspace-scoped history endpoints with membership gating (404 for
  non-members).

Phase 3 exit criteria: provider-independent generation path with audited
failures (roadmap). Full repo gate after the audit follow-up
(2026-09-25): lint 0, typecheck Done (incl. web), 15 files / 191 passed /
1 skipped, apps build green.

### Phase 3 deep audit (2026-09-25)

Two parallel read-only audits (ai-core transport/policy; API + authz),
plus live end-to-end verification against a real server. Findings fixed:

- **Breaker poisoned by caller-induced failures** — every failed attempt
  incremented `consecutiveFailures`, so three malformed requests or user
  cancellations could circuit-open a healthy provider. Only faults
  attributable to the instance now count (`isGatewayFault`).
- **Consumer throws misattributed to the gateway** — in `generateStream`
  the `yield` sat inside the transport `try`, so a consumer-side throw (a
  DB write failing mid-persist, a client disconnect) was recorded as a
  gateway INTERNAL failure. Restructured to `try/finally` with only
  `stream.next()` guarded.
- **Programmer errors retried as transient** — `classifyThrown` labelled
  any unknown throw TRANSIENT. Now only real network errors (by code or
  "fetch failed") are TRANSIENT; anything else is INTERNAL.
- **SSE final frame and multibyte tail dropped** — the loop broke on
  `done` without flushing the decoder or parsing the trailing partial
  line, silently truncating output; the reader was never cancelled or
  released. Both fixed.
- **Config faults reported as gateway faults** — an unreadable credential
  (rotated key) or disabled row surfaced as 500 and tripped the breaker.
  Now a 409 with an actionable message, and the breaker is untouched;
  genuine transport failures are 502.
- **`model:read` was a platform capability granted to every workspace
  role** — the invariant it was supposed to enforce. Now platform-only.
- **ADMIN could not use AI generation** while AUTHOR/EDITOR could.
- **`setProfileMapping` clobbered tuned `priority`/`enabled`** with
  defaults on an idempotent PUT.
- **`maxRetries` was inert** — stored, validated, returned, never read.
  Now bounds per-gateway attempts.
- **Non-atomic breaker update** — two UPDATEs could leave a
  circuit-open gateway marked DEGRADED; now one statement.
- **Partial model sync** — upserts committed without the audit row on
  mid-loop failure; now one transaction.
- **Generate route had no `bodyLimit`**, so its own 200×200k schema caps
  were unreachable behind Fastify's 1 MB default.
- Credential hardening: adapter key moved to a `#private` field so
  `JSON.stringify`/structured logging cannot serialize it.
- Dead code removed (`OWNER_MANAGEMENT_CAPS`, no-op ternary, unreachable
  early-return, misleading comments).

### Phase 3 audit follow-up (all seven findings closed)

- **No streaming route** — `POST /api/workspaces/:workspaceId/generations/stream`
  now exposes `GatewayManager.generateStream` over SSE (`event: generation`,
  `delta`, `done`/`error`). `GenerationStatus.INCOMPLETE` is written when
  content was emitted and the stream died; `FAILED` when it died before any
  output. The route writes headers before the first byte, so a mid-stream
  failure is an `error` event, never a status code.
- **Routing strategy inert** — `AI_ROUTING_STRATEGY` (validated env enum)
  is passed to `createAiServices` and becomes the manager's
  `defaultStrategy`; a per-call `strategy` still overrides it.
- **Streaming was untested at the transport layer** — `omniroute.test.ts`
  (18 tests): trailing-slash normalization, Bearer-only credential, no
  credential in failure messages, status classification, SSE ordering,
  **final frame without a trailing blank line**, **multibyte char split
  across chunks**, `[DONE]`, malformed frames, **reader release on early
  abandon**, partial marking, timeout → TRANSIENT, caller abort →
  DETERMINISTIC, health classification, model discovery, and that the
  adapter's credential is not an enumerable/serializable property.
- Credential encryption error paths were asserted only by inspection;
  `crypto.ts` now has tamper / wrong-key / malformed-input rejection tests
  and the dead `try/catch` around GCM decipher was removed.

Streaming and strategy are no longer deferred.

## Phase 4 — Agent / Skill / Workflow Platform (2026-09-26)

Exit criterion from the roadmap: *"chapter test workflow can run multiple
agents deterministically"* — met, and covered by tests.

Delivered:

- `@novelforge/validation` (previously an empty placeholder): a
  fail-closed structured-output contract validator and a workflow graph
  validator. Pure, no IO, 55 tests.
- Schema + migrations `20260926_phase4_agent_skill_workflow`,
  `20260927_phase4_platform_key_uniqueness` and
  `20260927_phase4_steprun_fk_indexes`: `Agent` / `AgentVersion`,
  `Skill` / `SkillVersion`, `Workflow` / `WorkflowVersion`, `WorkflowRun` /
  `WorkflowStepRun`, plus `DefinitionScope`, `SkillCategory` and the three
  status enums. Verified: applies from empty, zero drift against the schema.
- `services/definitions.ts` — versioned CRUD for all three definition
  kinds, scoped to platform or workspace.
- `services/workflow-runs.ts` — the executor, running steps over the
  Phase 3 generation path.
- `definition-routes.ts` — 16 endpoints under `/api/agents`,
  `/api/skills`, `/api/workflows`, `/api/workspaces/:id/workflow-runs`.
- Seven new capabilities (`agent:read|manage`, `skill:read|manage`,
  `workflow:read|manage|run`) plus platform-only `platform:define`;
  ADR-0006 records the design.

Exit-criterion evidence: a three-agent chapter pipeline runs in
deterministic order, each step pinned to its definition version and to a
real `Generation` row, and repeated runs of one graph produce identical
step order.

Full repo gate 2026-09-26: lint 0, typecheck Done (incl. web),
17 files / 267 passed / 1 skipped, apps build green.

Full repo gate 2026-09-27 (after the audit fixes below): lint 0,
typecheck 0, 17 files / 279 passed / 1 skipped.

Every fix below was verified by an executable assertion, not by
inspection: where a fix had no test, one was written and confirmed to
fail against the pre-fix code before being kept.

### Defects found and fixed during this phase

- **Write authorization was never called.** `gateDefinitionWrite` existed
  but no `create*` invoked it, so an AUTHOR could create definitions and a
  workspace ADMIN could create PLATFORM-scoped ones. Every create now
  gates, and `novelId` is validated against the caller's workspace.
- **`nextNumber` used a computed object key** (`{agentId: id}[...]`),
  which evaluates to the bare id string rather than a `where` clause, so
  every version append threw. Split into per-kind helpers.
- **Downstream steps were skipped after a TRANSFORM or VALIDATOR.** Branch
  liveness was propagated only in the AGENT and CONDITION paths, so a
  chain beginning with either kind had every later step silently
  `SKIPPED`. Propagation is now one `advance()` called from every success
  path, with a regression test.
- **`skillKeys` was stored but never used** — declaring an agent's skill
  allowlist had no effect. Granted skills are now resolved up front and
  injected into that agent's system prompt, so the allowlist is
  deterministic rather than inferred from execution order.
- **`gateRead` hardcoded `agent:read`**, so reading a skill checked the
  wrong capability. Now per-kind.
- **A malformed `required` contract enforced nothing.** Verified against
  the installed zod: a `required` entry with no matching `properties`
  declaration is silently ignored. `compileSchema` now rejects it, along
  with any keyword it cannot actually enforce.
- **Concurrent version appends surfaced as 500.** Two simultaneous
  appends collide on `@@unique([parentId, number])`; the P2002 is now
  retried with small jitter and reported as 409 if it persists.
- **An unreachable `GRAPH_UNREACHABLE_STEP` check** was provably dead
  (in a DAG every node reaches an entry) and was removed rather than
  left as a branch that cannot fire.

### Second pass — 2026-09-27

Two parallel audits over the executor/routes and the schema/authz
surfaces, plus direct probing of the installed zod. Findings fixed:

- **A failing step left no record.** `executed` is pushed only on
  success, so a step that threw produced no `WorkflowStepRun` row: the
  run showed the steps that worked and then simply stopped, with no
  indication of which step died or why. The catch block now writes a
  FAILED row for the in-flight step, carrying the client-safe summary in
  `errorMessage`; the VALIDATOR path marks its row already-written so it
  is not duplicated.
- **Raw error text could reach a client.** `failure = err.message` was
  persisted into `WorkflowRun.errorMessage` and served by `run()`,
  `getRun()` and `listRuns()` — responses that never pass through the
  API error handler, so a Prisma message or an upstream provider body
  would have been returned verbatim. Only `GatewayError`,
  `ConflictError` and `NotFoundError` messages are now surfaced; anything
  else becomes a fixed string, with the real error sent to an injected
  `dbg` sink.
- **That sanitization was itself wrong on first attempt.** `AiServices.
  generate` catches the `GatewayError`, records it on the `Generation`
  row, and rethrows a `BadGatewayError` — which does not extend
  `GatewayError`. Checking only `instanceof GatewayError` therefore
  discarded the classified message for *every* real provider failure, the
  common case, replacing it with "workflow step failed". `BadGatewayError`
  is now included; `messageFor` guarantees its text is non-leaking. Found
  by writing the regression test, which failed first against the code as
  committed.
- **`AWAITING_APPROVAL` was stamped `completedAt`**, making a halted run
  indistinguishable from a finished one. It is now left null, and the
  schema comment no longer claims these runs are resumable — they are
  terminal until a resume path exists.
- **Duplicate PLATFORM keys were possible.** `@@unique([scope,
  workspaceId, key])` does not constrain `workspace_id IS NULL` rows,
  because PostgreSQL treats NULL as distinct in a unique index; the
  schema comment claiming otherwise was wrong. Migration `20260927` adds
  three partial unique indexes (with a guard that names offending rows
  rather than failing opaquely), and the corrected comment states where
  uniqueness is really enforced.
- **Two formats were wrongly rejected.** The docstring and the screen
  both claimed `hostname`, `uri` and `base64` are accepted-and-ignored
  by zod. Probed: all three genuinely reject malformed input, so those
  contracts were refused for no reason. They are now supported, along
  with `base64url`, `ksuid`, `xid` and `mac`; `url`, `regex`, `cuid2`,
  `cidrv4`, `cidrv6`, `hash`, `hex`, `lowercase` and `uppercase` are
  excluded because they accept anything.
- **A dead `TYPE_DEPENDENT_KEYWORDS` constant** (superseded by the
  `SCHEMA_MISSING_TYPE` rule) was removed.
- **Docstring defects** corrected: `minItems`/`maxItems` are ignored
  even alongside `type: "array"` (verified), and the test file no longer
  refers to a `FAIL_OPEN_CASES` that does not exist.
- **A VALIDATOR step could not fail.** `outputSchema` was optional on
  every step kind, so a VALIDATOR without one recorded `SUCCEEDED` for
  any value while reading as a real check in run history — a check that
  silently does nothing. The graph validator now requires a VALIDATOR to
  declare a contract, and to bind exactly one input (the executor reads
  only the first, so a second was silently dropped).
- **Four unindexed nullable FKs on `workflow_step_runs`.** Every one is
  `SetNull`, so deleting the parent issues an `UPDATE ... WHERE col = $1`
  with no index — a sequential scan over all accumulated step rows.
  Migration `20260927_phase4_steprun_fk_indexes` (and the matching schema
  declarations) adds them, plus `workflow_runs.triggeredById`. A workspace
  delete cascades into agents and skills and hits exactly this path.
- **The FAILED-row write could escape its own catch.** It runs inside the
  `catch` block, before the run-status update; a DB error there would have
  skipped that update, leaving the run stuck at `RUNNING` forever with no
  terminal state. It is now wrapped, since losing the diagnostic row is
  survivable and losing the run's outcome is not.
- **`dbg` was never wired**, so the "keep the detail server-side" branch
  discarded it. `app.ts` now passes the existing pino instance.

Every supported keyword was then re-probed with a deliberately-invalid
value to confirm it actually bites; `minItems`/`maxItems` and `$ref`
siblings were the only ones that did not, and both are rejected.

Not implemented, and refused explicitly rather than silently skipped:
`RETRIEVAL` steps (Phase 5 owns retrieval), streaming runs, resuming an
`AWAITING_APPROVAL` run, and moving runs to the worker queue.

Known follow-up: deleting a `Workflow` cascades its `WorkflowRun` rows
away. Nothing deletes a workflow yet, so no run history can be lost
today; the FK should move to `Restrict` before a delete endpoint exists.

## Phase 5 — Knowledge & Retrieval (2026-09-25)

Exit criterion from the roadmap: *"retrieval is evidence-bearing and
tenant-safe"* — met, and covered by 21 DB-backed integration tests plus
55 unit tests over the pure retrieval modules.

Delivered:

- **`@novelforge/retrieval`** (new package, pure, no IO, 55 tests):
  - `chunk.ts` — `chunkText` splits on paragraphs, then lines, then
    sentence boundaries, and merges short segments. Offsets are into the
    ORIGINAL text, so `text.slice(start, end)` always equals
    `chunk.text`; `verifyChunks` asserts exactly that so an unsound span
    can never be persisted. One forward pass — a 5.5 MB / 2500-chapter
    document chunks in ~37 ms.
  - `fuse.ts` — Reciprocal Rank Fusion (k=60). Ranks only, never raw
    scores: `ts_rank_cd` and cosine distance are not on a comparable
    scale.
  - `spoiler.ts` — `canView` / `visibleTo` / `canReadDrafts` /
    `parseViewMode`. Deny-by-default throughout: a null boundary is
    withheld from readers, a missing reader position is chapter 0, and an
    unrecognised mode resolves to `READER`.
- **Schema + migration `20260928_phase5_knowledge_retrieval`**:
  `Reference` / `ReferenceVersion` / `Chunk` / `Embedding` /
  `RetrievalAudit`, plus `SpoilerMode`, `ReferenceKind`,
  `ReferenceStatus`. Verified: applies from empty, zero drift.
- **`services/ai.ts` — `embed`**: the Phase 3 path extended to
  embeddings. Writes a `Generation` row (profile `EMBEDDING`) before the
  call and updates it to `SUCCEEDED`/`FAILED` with the classified
  category, exactly as `generate` does.
- **`@novelforge/ai-core` — `GatewayManager.embed`**, sharing
  `routeAttempts` with `generate` so retry, jittered backoff, error
  classification and the circuit breaker cannot drift between the two
  (CLAUDE.md §27). 6 new ai-core tests.
- **`services/retrieval.ts`** — reference CRUD with append-only versions,
  ingestion (chunk → verify → embed, idempotent, projection replaced in
  one statement), hybrid search, and retrieval history.
- **`retrieval-routes.ts`** — 7 endpoints: reference CRUD and versions
  under `/api/workspaces/:id/references` and `/api/references/:id`,
  ingestion on the version, search, and retrieval history.
- **`RETRIEVAL` workflow steps** — the Phase 4 executor gains a
  `StepRetriever` port satisfied by `RetrievalServices.search`, so a
  retrieval step is the same search a direct request runs, with the same
  predicates and its own audit row linked back to the step.
- Two capabilities (`reference:read`, `reference:manage`): ADMIN
  curates, AUTHOR and EDITOR consult.

### Design decisions worth recording

- **Exact vector search; no ANN index.** Prisma 7.10 rejects every
  spelling of HNSW and IVFFlat as an unknown index type. Adding one would
  need a raw-SQL migration that `migrate diff` reports as drift forever,
  or a dimensionless `vector` column that accepts mixed widths and
  silently corrupts distances. Zero-drift is a project gate, so the fixed
  `vector(1536)` column carries no index and search is an exact scan. The
  upgrade path is documented in ADR-0007.
- **Tenant and spoiler predicates are SQL predicates**, not post-filters.
  Filtering a ranked list means having already read rows the caller may
  not see. `canView` is re-applied afterwards as defence in depth, and its
  second job is computing `withheldCount` — the number an operator needs
  when a reader reports missing content.
- **Chunks carry a character span, not just text.** That is what makes a
  citation checkable: the test asserts `content.slice(start, end) ===
  text` on a real hit.
- **`retrieval_audits.step_run_id` and `generation_id` are deliberately
  not unique.** A step may retrieve more than once; a unique constraint
  would turn a legitimate second retrieval into a 500 mid-run.

### Defects found and fixed during this phase

- **Ingestion 500ed on every reference.** The raw chunk `INSERT` passed
  the chunk's `index` into the `id` column, which is `uuid`, so
  PostgreSQL rejected it (`42804`). The column list now omits `id`
  entirely and relies on `gen_random_uuid()`. Found by running ingestion
  against a real database rather than trusting the typecheck.
- **A circular type inference** (TS7022) in `chunkText` — `pending` is
  both read and reassigned inside the merge loop, so `merged` needed an
  explicit annotation.
- **The chunker split a CRLF document into one chunk**: `/\n[ \t]*\n/`
  cannot match `\r\n\r\n`. Caught by the chunker's own tests.
- **A short TRAILING segment stayed its own chunk**, because the merge
  rule only checked the pending side. Fixed to check both.
- **A quadratic `indexOf` scan** in the chunker, replaced with a single
  forward pass.
- **The RETRIEVAL step's audit link is best-effort.** The step has
  already succeeded and its row is durable when the link is written; a
  failure there would otherwise mark a good run FAILED.

### Phase 4 defects fixed in this phase

An independent audit of the committed Phase 4 code reported findings
against `workflow-runs.ts`, `json-schema.ts` and `definition-routes.ts`.
Each was re-probed before acting; three were confirmed and fixed, and two
were disproved and left alone.

Fixed:

- **A prototype key passed validation and became prompt content**
  (`workflow-runs.ts`, `resolveReference`). The graph validator screens
  the reference *syntax*, so `$input.constructor` and `$input.__proto__`
  both pass it. A bare index lookup then returns the inherited
  `Object.prototype` member — a function, which is not `undefined`, so
  the caller's guard never fired and the prompt received the literal text
  `undefined` as though the caller had supplied it. Now `Object.hasOwn`,
  mirroring the existing guard in `json-schema.ts`. Probed before and
  after; `definitions.test.ts` covers it.
- **A DRAFT WORKSPACE workflow was executable.** The status gate covered
  `PLATFORM` scope only, and the column defaults to `DRAFT`, so a freshly
  created workflow ran before anyone published it — contradicting the
  definition service's own contract and ADR-0006, and unlike agents and
  skills, where the parallel gate already existed. The caller's own draft
  is now a 409; anything else stays a 404.
- **`extractJson` failed on the case its own doc comment names.**
  `search(/[[{]/)` takes the first bracket *character*, so
  `"The [main] character: {…}"` returned the prose bracket and
  `"Note [1]: {…}"` returned `[1]`. It now tries each bracket in turn and
  takes the first that actually parses. Latent, not live: the executor
  has its own correct parser and `extractJson` has no production callers.
- **A boolean JSON Schema was accepted in a graph and refused at the
  field.** `compileSchema` supports `true`/`false`, and the graph path
  passes them through, but `definition-routes.ts` used `z.record` alone.
  One spelling of "no constraint" worked in one place and was rejected
  with no explanation in another.
- **A run parked at an approval gate was audited as completed.** The
  audit action took the same else-branch as a finished run, so the trail
  disagreed with the run row it describes (whose `completedAt` is held
  null for exactly that state). It now records
  `workflow.run_awaiting_approval`.
- **The global rate-limit fallback made a large test file order-
  dependent.** The limiter's in-memory store is shared across every
  request in one app instance, so `definitions.test.ts` began tripping
  300/min partway through and the failure landed on whichever test ran
  last — adding two tests was enough to break an unrelated one. The
  global fallback is now effectively disabled under `NODE_ENV=test`; the
  per-route limits (register, login) stay enforced, since those are the
  security-sensitive ones.

Disproved, and therefore not changed:

- **"A VALIDATOR passes vacuously when its input reference is absent."**
  Probed against `{type:"string"}`, `{type:"object"}`,
  `{type:"string",minLength:1}` and `{type:"number"}`: `validate(undefined)`
  reports a failure for every one, so an absent reference fails the
  validator rather than passing it.
- **"An absent key interpolates as the string `undefined`."** The
  `value === undefined` guard does catch an absent key; only the
  prototype case above slipped through.
- **"A provider vector can inject SQL through the interpolated literal."**
  pgvector rejects `NaN`, `Infinity` and any non-numeric element at the
  cast (`NaN not allowed in vector`, `invalid input syntax for type
  vector`), so the literal cannot carry a payload. The finite-number guard
  was still added, for a different reason: without it the rejection
  surfaces as an unclassified driver error (a 500) instead of a 409 naming
  the provider as the culprit.

### Second audit round (2026-09-25)

A nine-dimension adversarial audit of the committed Phase 5 code (finders
→ independent refutation → completeness critic) confirmed a further set of
defects, all fixed here. Each was reproduced before being changed.

**The span invariant was falsifiable.** `chunkText` documents that
`text.slice(chunk.start, chunk.end)` always equals `chunk.text`, and that
is the property every citation rests on. The merge branch violated it:
it rebuilt a merged chunk by concatenation with a literal `"\n\n"`, which
normalised CRLF to LF, collapsed runs of blank lines to one, and swallowed
indentation on the separator line. A cited span therefore returned
different bytes from the ones that had been embedded. The merge now slices
from the source. Not reachable in production today — `ingest` calls
`chunkText(content)` with no `minChars`, so the branch never runs — but it
was one option away from breaking every citation, and the module's own
tests had `minChars` cases that should have caught it.

- **A bare CR was not a separator.** `/\r?\n/` matches LF and CRLF but not
  a lone CR (classic-Mac endings, some .txt/.doc conversions), so such a
  document matched no boundary at all and every run went down the
  hard-split path, cutting mid-word at the budget. Now `/\r?\n|\r/`.
- **A hard split cut surrogate pairs.** Offsets are UTF-16 code units, so a
  split at exactly `maxChars` could land between the halves of an astral
  character, emitting a chunk ending in a lone high surrogate and one
  starting with a lone low surrogate. Both strings are well-formed enough
  for `slice`, `JSON.stringify` and `verifyChunks` to accept, so the
  corruption was silent — the halves embed as replacement characters and
  no citation reaches the original. The split now backs up one unit.
- **`verifyChunks` did not check coverage**, despite documenting that
  chunks "tile the source without gaps". A chunk list that dropped content
  verified clean, so the ingest guard could not detect the failure mode it
  exists for. It now rejects non-whitespace in any gap, including before
  the first and after the last chunk. It does NOT assert contiguity —
  spans are legitimately non-contiguous because the separator between two
  chunks belongs to neither, and asserting tiling would fail on every real
  document.
- **`fuse` double-counted a duplicate id within one list.** RRF contributes
  one reciprocal rank per retriever per document; a repeated id added a
  second, so a chunk outranked genuinely better results as though two
  retrievers had agreed on it, and `foundBy` named the same retriever
  twice. Rejected now (`FUSE_DUPLICATE_HIT`) rather than deduped, because
  a leg emitting a duplicate is broken and collapsing it would hide the
  bug behind a plausible score. The existing test asserted the *buggy*
  behaviour — its comment claimed the opposite of what the code did — and
  has been corrected.
- **`minRetrievers` counted contributions, not retrievers.** Consequence of
  the above: a single-leg hit could satisfy `minRetrievers: 2`. Fixed by
  the duplicate rejection, which makes the count distinct by construction.
- **A missing `lists` threw a TypeError.** Every other malformed option
  returns a structured failure; the one mandatory field dereferenced and
  threw, from a function whose whole contract is that failures are data.
- **A total retriever outage returned 200 with empty hits.** Both legs
  failing produced `hits: []` and `retrievers: []` — indistinguishable
  from a working search that matched nothing, so the caller would conclude
  the knowledge base was empty rather than that the index was down. Now a
  502 (`BadGatewayError`).
- **The embedding provider's numbers were not validated as finite** before
  being stringified into the vector literal. pgvector rejects them either
  way, but the rejection surfaced as an unclassified 500 rather than an
  error naming the provider.
- **`ingest` was not transactional.** The re-ingest path deleted the
  version's chunks and then inserted replacements as separate statements;
  a failure between them left a published reference with zero chunks,
  silently gone from every search until someone re-ingested. Both now run
  in one transaction, so a failed insert rolls the delete back and the
  previous chunks survive. The embeddings upsert stays outside — it is
  idempotent, and a version with chunks but no vectors is self-healing.
- **Changing the spoiler boundary was reported as a no-op.** The skip
  condition returned `skipped: true` whenever chunks existed and were
  embedded and `availableFromChapter` was `undefined`; a caller setting a
  boundary on an already-ingested version was told the work was done while
  every chunk kept its old boundary. The condition now compares the
  requested boundary against the stored one.
- **`withheldCount` was documented as a spoiler metric but is always 0.**
  Proven by enumerating every combination of mode, reader position and
  boundary: the SQL predicate and `canView` agree on all of them, so the
  application-level recheck can never fire. The SQL predicate is the real
  control; the recheck is a tripwire for future drift, and `withheldCount`
  is the signal that the tripwire fired. The docstrings now say that, and
  the integration test that asserted `withheldCount === 0` — which proves
  nothing, since 0 is also what a broken query returns — says so too.
- **A fused hit with no raw row vanished silently** from the result set.
  It cannot happen today, but it is now counted with the withheld so the
  number is never quietly wrong.
- **False claims corrected**: the migration header described a vector index
  it does not create (it is commented out, and there is deliberately no
  vector index); the schema said `ingest` reads `contentHash` on every
  save (it never reads it, and the docstring now explains why the
  projection's own state is the honest signal); `visibleTo`'s docstring
  named two call sites that do not exist (no caller uses it); the
  integration test's header advertised coverage — a shared novel id, a
  new-version projection — that no test exercised; and
  `docs/implementation` claimed 61 unit tests for `@novelforge/retrieval`
  when the package had 46 (now 62).

`RETRIEVAL` steps are no longer refused: `EXECUTABLE_STEP_KINDS` includes
them, and the graph validator now requires a RETRIEVAL step to declare an
instruction (its query) — without one the step would record an empty
result set, which reads as "the knowledge base has nothing on this"
rather than "the step is misconfigured".

### Phase 5 second audit round (2026-09-25)

Adversarial audit of the Phase 5 code (9 finder lenses, then independent
verifiers per finding). Eleven findings were **refuted** by their verifiers
because they described commit `920ae60` — the state before the first fixes
landed in `65111a1`. Those are recorded here so they are not re-opened:

- chunker: merge-branch span rewrite, surrogate split, bare-CR separator
  (all three were already fixed in `65111a1`).
- fuse: duplicate-id double-count, missing `lists` guard (already fixed).
- retrieval: all-legs-down returning 200, non-finite *stored* vector
  (already fixed).
- docstring claims about `visibleTo`, `withheldCount`, the migration
  header, `contentHash`, and the test header (all already corrected).

Confirmed and fixed:

1. **A new version silently removed a reference from search.** Both legs
   join `r.current_version_id = rv.id`, so repointing `currentVersionId`
   orphaned the ingested chunks while the row still read `ACTIVE` — and
   `publish` returned early on `ACTIVE`, so the re-publish that would have
   fixed it did nothing. `addReferenceVersion` now drops an ACTIVE
   reference to DRAFT; publish then works.
2. **A repair ingest cleared the spoiler boundary.** An omitted
   `availableFromChapter` wrote NULL over a boundary the author had set,
   widening what readers could see. The existing value is now carried
   forward.
3. **The vector leg could not exclude a stale embedding model.**
   `dimensions` cannot distinguish a remapped profile, so old vectors were
   ranked against a query vector from a different model. The leg filters
   on `e.model` and the idempotence skip is model-aware, so re-ingest
   repairs it instead of reporting "already done".
4. **Unmapped Prisma P2002 became a 500.** A duplicate reference key and a
   concurrent version append both produced `500 INTERNAL`. The create maps
   it to 409; version append reuses `appendVersionWithRetry` from the
   Phase 4 definitions service (now exported rather than copied).
5. **`outputSchema` on RETRIEVAL/TRANSFORM/HUMAN_APPROVAL was stored but
   never enforced.** The validator rejects it on those kinds
   (`STEP_SCHEMA_NOT_ENFORCED`) rather than persisting an inert contract.
6. **A RETRIEVAL instruction could exceed the query limit.** The generic
   20000-char bound let a published workflow fail at run time; RETRIEVAL
   instructions are now capped at 2000, matching the search.
7. **`generation_id` on a retrieval audit row was unreachable.** `embed`
   did not return the Generation id, so no caller could populate it. It
   now returns it and search persists it.
8. **CJK references 413'd well below the advertised cap.** Fastify counts
   bytes, Zod counts characters, and the limit had 1:1 headroom — a CJK
   document hit the limit at ~2.67M characters against a promised 8M.
   Restored to the 2x headroom rule the manuscript routes state.
9. Also: the `publish` early-return made the versioning bug unrecoverable;
   `canReadDrafts`'s docstring promised draft access the mode-independent
   ACTIVE filter never grants (now documented as inert); `detail` is
   documented as always-NULL rather than left implying a producer; the
   documented test counts were corrected (55 unit / 23 integration).

A completeness pass afterwards found three things the per-lens finders
could not see, because each read only one side of a comparison:

- `embeddingModelFor`'s filter (mapping enabled) was weaker than the
  router's (`resolveProfile`: mapping AND model AND gateway enabled). With
  an EMBEDDING mapping pointing at a disabled model or gateway, the skip
  guard computed a match and returned "already done" for vectors the
  vector leg could never reach — refusing the one repair. The filter now
  matches `resolveProfile` exactly.
- `embeddingProfile` was a declared constructor dependency that no code
  ever read, letting a caller believe the profile was configurable.
  Removed.
- `docs/14-progress/CURRENT.md` had gone stale at 350 passed. All three
  progress documents now state the measured total, and the missing
  retention/pruning gap on the Phase 5 audit tables is recorded in
  Known gaps.

Also refined while acting on that pass: the vector leg now separates its two
failure domains, which it previously conflated. "The embedding route is
unavailable" is a degraded search (recorded as a failed leg); "the provider
returned a vector we cannot use" is a data fault, and is raised to the
caller instead of being recorded as an unavailable index. They cannot be
told apart by error class — both arrive as ConflictError — so they are told
apart by where the throw happens.

Verified after: lint 0, typecheck all workspaces clean, 370 passed / 1
skipped, migration drift 0. Ten regression tests added.

## Phase 6 — Story Intelligence Core

**Slice 1 (canon + candidate canon + Story Brain) COMPLETE.**
`docs/adr/ADR-0008-canon-authority.md`.

What shipped: `story_entities`, `canon_facts`, `canon_fact_sources`,
`canon_proposals` (migration `20260929_phase6_story_intelligence`); three
capabilities; a deterministic read-only Story Brain answering FACT, STATE
and RETRIEVAL with evidence; and `@novelforge/story-intelligence` as the
pure rule layer.

A second migration, `20260930_phase6_evidence_fk_hardening`, carries the
evidence-FK hardening: both `canon_fact_sources` version FKs become
`RESTRICT`, and `canon_proposals.object_entity_id` gains the FK and index it
was missing. These were originally edits made in place to
`20260929_phase6_story_intelligence`, which is only safe while a migration is
unreleased — Prisma records a migration by CHECKSUM, so editing an applied one
makes every deployed database disagree with the repository and `migrate deploy`
refuse. Splitting them restores that migration's immutability and leaves an
already-edited database one migration behind rather than needing a baseline
reset. Not re-runnable — replaying it against a hardened database fails on
`CREATE INDEX`. Generated with `prisma migrate diff`, so drift-zero is the
proof that the migration and the schema agree.

Three things were **probed against real PostgreSQL before the migration was
written**, because the design rests on them and reasoning was not enough:

- The one-live-value-per-subject+predicate constraint is a status-anchored
  partial unique index (`canon_facts_live`), keyed on `(novel, entity,
  predicate)` — NOT on the object value, which would let two contradictory
  live facts coexist, the exact conflict it exists to catch. Anchored on
  `status = 'ACTIVE'` rather than `superseded_by_id IS NULL`, so RETRACT
  frees the slot instead of trapping it forever. Verified: a second ACTIVE
  value is refused with `23505`, and retraction allows re-assertion.
- The supersede transaction is FOUR statements, and the order is
  load-bearing. Both two-statement orders fail: `UPDATE`-then-`INSERT`
  violates the self-FK (`23503`), `INSERT`-then-`UPDATE` violates the
  partial index (`23505`). The shipped order — supersede, insert, link,
  decide — commits with correct final rows (verified including `COMMIT`).
- A **generated** tsvector column is permanent Prisma drift (Prisma cannot
  express `GENERATED ALWAYS AS`), which is why no chapter `content_ts` was
  added. That finding is what removed chapter prose search from this slice.

Deliberately **not** in slice 1, each with its reason recorded in
`decisions.md` and ADR-0008: `story_events`, `causal_edges`,
`story_threads`, `story_promises`, `timeline_events`, hierarchical-memory
tables (rebuildable projections — materialise only with a
`built_from_revision` FK in Phase 11), LLM fact extraction, the
auto-approve class, free-text question dispatch, and chapter prose search.
`EVENT`/`CAUSAL`/`UNRESOLVED`/`PROMISES` return an explicit
not-implemented marker rather than a fabricated answer.

Known limitations carried forward:

- Canon carries no `revision_id` until Phase 11, so it participates in no
  checkpoint or branch. Non-destructive correction is met by the supersede
  chain only. Bounded gap, recorded in ADR-0008 §4.
- A canon fact's chapter citation is a HISTORICAL pin: `ChapterVersion` is
  immutable, but `Chapter.current_version_id` moves on the next save, so a
  source is resolvable forever yet not "the current version".
- `available_from_chapter` is a chapter number, and reordering chapters
  swaps numbers in a transaction, so a reorder must recompute authored
  boundaries or the spoiler filter drifts. Inherited exposure (no reorder
  path ships here), now on tables that are explicitly story truth.
- **The Brain's structured answers are not audited.** FIXED (2026-10-02):
  every structured `ask` leg (FACT, STATE, EVENT, CAUSAL, UNRESOLVED,
  PROMISES) now writes one `RetrievalAudit` row in `auditBrainAsk`
  (services/canon.ts) — query is a `BRAIN:ASK` descriptor, `retrievers` is
  tagged `BRAIN:<KIND>` so they are distinguishable from search rows, and the
  row records mode, readerChapter, returned/withheld counts, ≤100 provenance
  ids, and latency. The RETRIEVAL leg deliberately does not route through it
  (search already writes its own row; double-writing would be the defect).
  READER-mode rows record 0/0 with empty provenance so the audit table cannot
  become the existence oracle the answers themselves refuse to be. The
  Phase 5 unpruned-retention gap now widens to these rows too.
- **Deleting a `StoryEntity` would cascade canon away.** FIXED (2026-10-02,
  migration `20261002_phase7_delete_route_fk_hardening`): the entity-delete
  route landed, so the FKs hardened first. `canon_facts.entity_id` and
  `canon_facts.object_entity_id` are now `ON DELETE RESTRICT` (both
  indexed), so `DELETE .../canon/entities/:entityId` (gate `canon:manage`)
  is refused with a 409 naming canon facts while any fact references the
  entity as subject or object. `canon_proposals` keeps CASCADE by decision:
  a proposal is uncommitted candidate canon (CLAUDE.md §2.13) and dies with
  its subject; the facts are what block. Note the block is PERMANENT —
  retraction withdraws a claim but keeps the row (canon history is never
  destructively overwritten, §9), so a fact-referenced entity is
  undeletable; the route exists for unreferenced names. The same migration
  made `workflow_runs.workflow_id` and `workflow_runs.workflow_version_id`
  `RESTRICT` (both indexed): run history is the execution audit trail, so
  `DELETE /api/workflows/:workflowId` is refused with a 409 once the
  workflow has ever run.

Verified after: lint 0, typecheck clean in every workspace including
`apps/web` (vitest 3→5 pins were behind its earlier nuxt failure), 202/202 in
`apps/api` plus 324 passed / 1 skipped across the packages on vitest 5.0.2,
migration drift 0, build green for all workspaces, and the migration applies
from empty through all ten migrations.

**Audit round 2 (same day).** A second adversarial pass over slice 1 — eight
independent finder agents, then a refutation pass in which every finding had
to survive a verifier trying to kill it — found ten real defects behind the
green first-run gate. All were fixed and re-verified; the verified-then-refuted
findings are recorded so they are not re-litigated. The pattern worth naming:
every one of the four serious ones was a *second path* onto data the primary
path already guarded, and the first pass's tests only covered the primary path.

1. **Supersede destroyed history when the proposal had no `validFromChapter`.**
   `validUntilChapter: proposal.validFromChapter ?? null` left the old row's
   window open to infinity, so the supersession had no effect on any as-of
   query: STATE returned the new value at every chapter, including before the
   correction, and the old value was unreachable forever while its row
   survived. `validFromChapter` is optional, so this was the common path.
   Fixed by closing at `max(replacement start, old start)`, falling back to
   the old row's own start; the both-null case is a genuine limit of as-of
   reconstruction and is documented as such rather than guessed at.
2. **The READER spoiler boundary was bypassed on both list and STATE paths.**
   The list route applied no filter at all, and the STATE branch built
   `notYetTrue` from the ungated row chain, disclosing the fact id and the
   exact chapter a hidden claim takes effect — precisely what the FACT branch
   refuses to disclose. Three independent verifiers confirmed the STATE leak.
3. **A withheld fact was distinguishable from an absent one.** STATE computed
   `insufficient` from the ungated covering set, so `{claim: null,
   insufficient: false}` meant "a claim holds here that you may not see" — an
   existence oracle, and a direct contradiction of the FACT branch's stated
   "the caller must not be able to tell the difference".
4. **A backdated correction was an unmapped 500.** Closing the old window at
   a chapter earlier than the old row's start wrote `valid_until < valid_from`,
   violating the window CHECK; only `P2002` was translated, so the caller got
   a bare `INTERNAL` from deterministic input.
5. **Canon evidence could be silently deleted.** `canon_fact_sources`
   cascaded from `chapter_versions`, and `deleteChapter` hard-deletes any
   non-PUBLISHED chapter — so a routine draft deletion stripped a fact's only
   citation while the fact stayed ACTIVE, with nothing canon-side recording
   why. Both evidence FKs are now `RESTRICT`.
6. **`canon_proposals.object_entity_id` had no foreign key** while its twin on
   `canon_facts` did, so a proposal could name a nonexistent entity and
   approval copied it verbatim into the constrained table.
7. **Approving a proposal that restated existing canon superseded a fact with
   a copy of itself.** `proposeCandidate` classifies only against the live
   fact at propose time, and the live fact can appear afterwards, so the
   approval gate must re-check. It now does.
8. **`RETRACTED` was declared, documented as the live-index's whole
   justification, and unwritable** — no service, route or test produced it.
   `retractFact` + `POST .../canon/facts/:factId/retract` now exist, and a
   test pins that retraction frees the slot for re-assertion, which is the
   claim ADR-0008 §1 makes and nothing previously exercised.
9. **Statement rendering used machine keys and could emit a raw uuid**
   (`ling-fan father-of wei-zhao`); `renderStatement` now takes display names
   and `(unknown entity)` replaces the uuid fallback.
10. Non-`P2002` constraint rejections were unmapped; `P2039`/`P2004`/`P2003`
    now map to a 409 (verified that no constraint name or data value leaks).

Two findings were NOT fixed, for different reasons — the distinction matters,
because only one of them was actually wrong:

- **Refuted on the code: an `atChapter`/`readerChapter` binding requirement.**
  The claim was that a reader can ask about an unreached chapter and bisect
  when a hidden fact becomes true. `canView` compares
  `availableFromChapter` against the **reader position only** — `atChapter`
  is never an input to it and `canonBoundary` wraps only
  `availableFromChapter` — so a fact hidden from a reader is withheld at
  every `atChapter` and sweeping it discovers nothing. The cited example also
  set `availableFromChapter: 1`, which is the author declaring the
  information reader-visible from ch 1. No change made; the premise was an
  opinion, not a defect.
- **Accurate but unreachable: entity-delete cascades.** The cascade is real
  and would destroy canon — but no entity-delete route exists in this slice,
  so nothing can trigger it. Moved to the known-limitations list above rather
  than dismissed, because the same-shaped sibling finding (evidence cascading
  from `chapter_versions`) WAS reachable and was fixed.

**Audit round 3 — the full verified workflow, and a correction.** The 18-agent
workflow that round 2 drew its findings from completed *after* the fixes were
committed, and it audited **pre-fix HEAD** — so most of its 43 surviving
findings describe defects already closed. Reading it against current code
separated those from what was genuinely new, and three things in it mattered:

1. **Defect 1's fix was incomplete, and my own test encoded the bug.** Round 2
   fixed the *null* `validUntilChapter` by closing the old window at the old
   row's own start. That still destroys the history, differently: an undated
   replacement has `valid_from_chapter = NULL`, so it covers from −∞ and
   shadows the old value at *every* as-of chapter anyway. My regression test
   asserted `STATE at ch 5 → "white"` — that is, it asserted the corruption.
   The undated replacement is now refused at the boundary (409): with no
   chapter to split on there is no honest as-of answer, and guessing one is
   what produced both versions of this bug. This is the failure mode a
   self-written test cannot catch — it encodes the same misunderstanding as
   the fix — which is the whole argument for the external refutation pass.
2. **The decision paths were not atomic.** `approveProposal` and
   `rejectProposal` each read `status !== "PROPOSED"` in one statement and
   wrote in another, so concurrent approve+reject could both pass their
   guards: a live ACTIVE fact minted while the row ended `REJECTED`, and an
   audit entry recording a rejection for a decision that created canon —
   CLAUDE.md §2.13 defeated by interleaving. Both writes are now
   compare-and-set on `status`, so the loser throws and its transaction rolls
   back entirely.
3. **Three doc claims were false.** "The Brain writes a `RetrievalAudit` row
   per ask" — the row is written inside `RetrievalServices.search`, so only
   the RETRIEVAL leg writes one and FACT/STATE/not-implemented write nothing.
   The truth is worse than the claim: structured answers about canon leave no
   trace. Corrected in the ADR and both progress docs rather than silently
   deleted. Similarly, "the Brain answers FACT, STATE and RETRIEVAL" was true
   of the code and false of the tests — the RETRIEVAL leg had no assertion at
   all, which is how its `basis` drifted to a non-null `"SUGGESTION"` on a
   null basis while FACT and STATE returned `null`. Now tested and aligned.

Refuted again, and worth recording because it keeps recurring: reference
evidence "should be scoped to the novel like its sibling chapter branch" —
`Reference.novelId` is **nullable by design** ("Optional narrowing to one
novel"), so a workspace-wide reference is legitimate and requiring a novel
would break it.

**Audit round 4 — re-run against the fixed tree.** The workflow was re-run at
`c3613cd` with the audit targeting the *current* code and two changes to the
harness itself: verdicts are keyed by claim index (last round several findings
were counted as "survived" with no verifier verdict at all, because verdicts
matched on exact problem text), and a new lens seeds the list of landed fixes
and asks whether each actually holds. 29 agents, 10 lenses, 6 refuted, 33
verified survivors, **0 unverified** — the index keying closed that hole. A
second independent verifier re-checked all 8 critical/high findings and
overturned none.

Consolidated, the 33 were 15 distinct defects, and the worst was **the
previous round's own fix**:

1. **The RESTRICT evidence FKs had no way out** — flagged by 6 lenses
   independently. Changing `canon_fact_sources` FKs to `ON DELETE RESTRICT`
   correctly stopped a draft-chapter delete from silently destroying a live
   fact's citation, but `deleteChapter` ran a bare `db.chapter.delete` with no
   try/catch, so the FK violation surfaced as an unmapped 500 — and the
   remedy the migration comment promised ("the author unlinks the evidence
   first") did not exist anywhere in the repo. A silent data loss had become
   an unrecoverable dead end. Now: the failure is a mapped 409 naming the
   cause, and `DELETE .../canon/facts/:factId/sources/:sourceId` is the escape
   hatch that makes it recoverable.
2. **`retractFact` was read-then-write** — the identical defect the proposal
   decisions were hardened against one commit earlier, left unfixed on the
   fact-status write. A concurrent approve could overwrite `RETRACTED` back to
   `SUPERSEDED`, producing the state ADR-0008 §1 and a test both assert cannot
   exist (retraction sets no `supersededById`). Now compare-and-set.
3. **Supersede re-dated an authored window.** `priorLive` did not select
   `validUntilChapter`, and `closeAt` was computed only from the two start
   chapters, so a fact authored as `black [1,9)` became `[1,20)` when a ch-20
   claim superseded it — filling a gap the author deliberately left, turning
   chapters 10..19 from "nothing holds" into "black". The authored bound now
   wins; only an open end is closed.
4. **Three leaks in the READER list path.** Evidence spans (`quote`/`start`/
   `end`) were returned verbatim with no boundary check — and neither
   `ChapterVersion` nor `ReferenceVersion` carries one, so a row-level gate
   could not classify them; they are now omitted for readers entirely.
   `withheldCount` was an existence oracle (a reader seeing `2` learns two
   claims exist that they may not read) and is now always 0 for readers.
   And `includeSuperseded` dropped the status filter entirely rather than
   admitting only `SUPERSEDED`, so RETRACTED rows appeared in reader lists.

Also fixed from the same run: `readerChapter=abc` silently coerced to 0
instead of 400ing.

**Corrected in round 5.** The round-4 record above previously claimed three
more fixes that were never in the code: that `notYetTrue` stopped reporting
empty-window rows, that the approve transaction's `P2002` was scoped to the
colliding row, and that both list routes were bounded. None of the three had
a diff, a test, or a migration — the sentence asserting them was authored in
the same commit as the rest of the round and had no behavioural counterpart.
Two were genuine defects and are now actually fixed (the empty-window
`notYetTrue` filter, and the `P2002` mapping scoped to `canon_fact_id`); the
list routes remain unbounded, now recorded here as open rather than fixed. A
record of a fix is not a fix, and a round that writes one must diff it.

Refuted this round (recorded so they are not re-litigated): the entity-delete
cascade (still unreachable), reference evidence "not scoped to the novel"
(`Reference.novelId` is nullable by design), and the RESTRICT change being
wrong in principle — it is right in principle and was incomplete in practice.

**The pattern, twice now:** a fix that stops one bad outcome can create a
worse one, and the fix's own tests will not notice because they test the
outcome it was aimed at. Both rounds' worst defects were of this shape — an
incomplete fix, caught only by an independent pass.

**Pre-existing, NOT introduced here:** `apps/web` typecheck fails at
`nuxt.config.ts:7` (`Plugin<any>[]` vs `PluginOption`). Two hoisted vite
versions — 8.3.0 via `@tailwindcss/vite` and 7.3.6 via `nuxt` — give
`tailwindcss()` a plugin type from one and the config a type from the
other. Confirmed by stashing this phase's work and reproducing the failure
at committed HEAD. The web app has no Phase 6 surface, so it is untouched
by this work; fixing it is a dependency-dedup task, not a Phase 6 change.

### Round 5 — audit run: three real defects, three discriminating tests

The audit workflow itself was **degraded and is reported as degraded**: 7 of
10 finder lenses died to provider credit exhaustion, 2 of the 6 that returned
produced empty result lines, and the verify stage never ran at all. The ten
findings that were captured were therefore adjudicated by direct read against
this HEAD rather than by the workflow, and no finding is called "verified"
that only a dead agent asserted.

Fixed, each with a test that was run with the fix reverted to confirm it
actually fails (a test that is green either way pins the belief, not the
behaviour):

1. **The supersede was not a compare-and-set.** `retractFact` and the
   proposal decision both predicate their write on the status they read; the
   supersede's first statement did not. A retract committing `RETRACTED`
   between `priorLive`'s read and the write was silently reversed to
   `SUPERSEDED` and left linked to the successor that replaced it — the
   state ADR-0008 §1 says cannot exist, and a withdrawn value that every
   as-of query past the correction chapter kept answering. This is what
   `bdb5fa8` came closest to but did not cover: that commit fixed what
   `closeAt` is set to, not whether the row may be written at all.
2. **`notYetTrue` still reported emptied windows.** A backdated correction
   can leave the old row with `validFrom >= validUntil` — a window that
   never held. The guard existed only on the `insufficient` path; the
   "about to become true" list asserted a fact that becomes true at no
   chapter.
3. **`createEntity` lost the create race with a 500.** Two concurrent creates
   for one derived key both pass the `findUnique` guard and the loser
   violates `story_entities_novel_id_key_key`. The house pattern is
   `platform.ts`'s `isUniqueViolation` → `ConflictError`; this path had no
   catch, so it answered `INTERNAL` on its own documented idempotent route.

Also corrected: `supersededById` is now absent (not null) in a reader's fact
list, matching `sources` and the `withheldCount` rule — the id names the
replacement, and confirming a future fact exists is the same oracle the rest
of that branch refuses.

**Pre-existing, still open, NOT introduced here:** both canon list routes are
genuinely unbounded (no `take`/`skip`). Round 4 claimed this was fixed; it
never was. `apps/api` typecheck is clean; `packages/auth` is clean standalone
(the recursive runner aborts before reaching it). `apps/web` still fails at
`nuxt.config.ts:7` for the hoisted-vite reason recorded above.

### Round 6 — Phase 5 audit: nine confirmed clusters, fixed with proofs

The audit workflow completed but is **reported as degraded**: the
`find:drift-incomplete` lens died mid-run; 22 verified findings deduped to
9 code/doc clusters (1 doc-only). One finding stayed REFUTED
(`input.generationId` — dead code, not a defect). Fixed, each named by the
test that fails without it; revert-proofs were executed for clusters 1, 2,
4, 5+8 (cluster 3's and 6's discrimination is logical, not executed):

1. **Publish was not a compare-and-set** (`services/retrieval.ts`). A
   version append committing between the chunk count and the status flip
   left the reference ACTIVE on a chunkless current version — invisible to
   search while reading ACTIVE. Now an `updateMany` predicated on
   `currentVersionId`; losing the race is a 409. Test: "never leaves a
   published reference on a chunkless current version" (interleave
   injected via a patched `findUniqueOrThrow`).
2. **Ingest died on a concurrent re-ingest's FK violation.** An embed of
   chunk ids a moment stale is a lost interleaving, not a broken request:
   retry exactly P2003/P2010/23503 (the driver adapter wraps PG 23503 in
   P2010), re-read the ids once, never swallow provider faults. Test:
   "repairs a stale embed whose chunk ids a concurrent re-ingest deleted".
3. **The re-ingest skip guard could skip under a multi-model route.** Its
   model resolution now mirrors the router's candidate set (mapping +
   model + gateway all enabled) and refuses to skip when more than one
   enabled model could win. Test: "does not skip when two enabled models
   could both win the route".
4. **The SSE route never aborted the upstream on client disconnect** —
   generator went on burning provider tokens with no reader. AbortController
   wired to the raw socket's close, forwarded through `generateStream`
   (service and manager already plumbed `signal`). Proven against a REAL
   socket (`app.listen` + `fetch` abort): light-my-request cannot simulate
   a mid-stream disconnect. Test: "aborts the upstream stream when the
   client disconnects mid-response" (also asserts FAILED settlement).
5+8. **`fuse` crashed or lied on malformed lists** (`packages/retrieval`).
   `typeof [] === "object"` let an array `lists` silently fuse to empty; a
   non-array leg threw `hits.forEach is not a function`. Both are now
   `FUSE_BAD_LISTS` structured failures. Tests: the two new "fails closed"
   cases.
6. **Provider faults reported as 409.** Wrong vector count/dimension/
   finiteness (ingest and query legs) are upstream failures — 502
   `BadGatewayError`, like the already-correct all-legs-down path. Tests:
   "reports an ingest-time provider fault as 502, not 409", the poisoned
   search-vector case.
9. **Two divergent copies of the mode/readerChapter rule.** Retrieval
   search now imports canon-routes' `checkModePair`; behavior identical,
   one contract. (No new test — the existing 400 assertions on both routes
   cover it.)
10. **Body limits vs character caps, the CJK gap.** Fastify counts bytes,
    Zod counts characters (3x for CJK). References 16MB→24MB so the
    advertised 8M chars is reachable; manuscript save 2MB→3MB and import
    8MB→15MB for the same latent mismatch (5M-char import 413'd at ~2.67M
    CJK chars — the sibling defect the audit did not name).
7. **Doc-only:** chunk.ts module header and `chunkText` docstrings claimed
    spans "tile the source without gaps or overlap"; they are deliberately
    non-contiguous with whitespace-only gaps, per `verifyChunks`.

Checks run: `apps/api` typecheck clean; retrieval 27/27, ai 29/29, canon +
manuscript (with retrieval: 98/98), fuse 17/17.

### Slice 2 — events, threads, promises, causality COMPLETE

Shipped: migration `20260927_phase6_story_intelligence_slice2` adds six
tables — `story_events`, `timeline_events`, `story_threads`,
`story_thread_events` (thread↔event join), `story_promises`, `causal_edges`
— with `ThreadKind`/`ThreadStatus`/`PromiseStatus`/`CausalConfidence`
enums. Uniqueness is load-bearing: one causal edge per `(novel, cause,
effect)` so the same "X because Y" claim cannot be asserted twice; one
thread membership per `(thread, event)`; one timeline `order` per novel.
`story_events.available_from_chapter` is indexed for the reader boundary.
Generated with `prisma migrate diff`; drift-zero is the schema agreement
proof. Slice 1's "deliberately not in slice 1" list names all four of
these tables — they land here with the same rules that list promised.

`@novelforge/story-intelligence/events.ts` carries the pure rules (no
Prisma, no HTTP — same domain-package shape as canon.ts), 63/63:

- Promise lifecycle is a closed transition table (`canPromiseTransition`):
  forward moves only, no backwards, no no-op, terminal states
  (`PAID_OFF`/`ABANDONED`/`INVALIDATED`) accept nothing. `isPromiseOpen`
  and `isThreadUnresolved` (`DORMANT` is unresolved) pin what "open"
  means.
- `edgeRequiresApproval`: `EXPLICIT` edges are author-asserted truth;
  `INFERRED`/`SPECULATIVE` are AI-derived candidates and map to
  `SUGGESTION` basis until approved (CLAUDE.md §2.13).
- `findCausalCycle` is an iterative DFS (no recursion limit) proven against
  a 50k-edge chain; self-loops, two-cycles and exact-cycle members are
  caught, a diamond is correctly not.
- `narrativeDebt` ranks by importance × urgency × age, deterministic,
  closed items score 0 but stay so the caller can render the full ledger.
- `readerVisible` is inclusive at the boundary, and an unanchored row
  (null `introducedAtChapter`) is never reader-visible; `isChronological`
  is strict — ties are refused, not resolved.

The four Brain legs that returned the not-implemented marker now answer
from these tables (`services/canon.ts`):

- **EVENT** — story_events with the READER boundary applied in the query
  (`availableFromChapter: { not: null, lte: at }` — null means
  unclassified and unclassified is withheld, never chapter 0). Readers
  get no withheld count (existence oracle); authors get
  `total − returned`.
- **CAUSAL** — an edge is returned only when BOTH endpoints are visible:
  an edge whose cause or effect is withheld would disclose the hidden
  half's existence through the edge that names it. Basis weakens to
  `SUGGESTION` when any returned edge requires approval, matching
  `answerBasis`' mixed-list contract.
- **UNRESOLVED / PROMISES** — the full ledger ranked by narrative debt,
  computed at read time and never stored. `ageChapters` uses the novel's
  chapter frontier because open threads carry no end stamp of their own.
  Reader anchor is `introducedAtChapter`; the boundary is applied in the
  view layer because null = unanchored = never visible is not a
  `not: null, lte` predicate shape. UNRESOLVED shows open threads +
  open promises; PROMISES filters to promise rows.

`timeline_events` is schema-present with no service surface yet — Phase 11
will decide whether it becomes a rebuildable projection or a first-class
editor feature; the unique `(novel, order)` constraint is the only
commitment made.

Checks run: story-intelligence 63/63, `apps/api` full suite 196/196
(canon legs included), typecheck clean in every workspace, lint 0,
`pnpm -r build` complete.

## Phase 7+

Slice 1 (schema + pure rules in `@novelforge/planning`) landed at
`7761fa3`. Slice 2 ships the service, routes, and tests:

- **`services/planning.ts`** — synopses, sagas, outline nodes, outline
  versions, horizon; 13 methods. Every multi-step write is
  compare-and-set or conflict-guarded:
  `archiveSynopsis` uses `updateMany` with a status predicate (zero rows
  updated → 409, not a silent no-op); `createSaga` writes a
  `candidate:${randomUUID()}` derived key and maps `P2003` → 409;
  `createOutlineNode` leaf-links with same-novel guards on both the
  parent and the version, `P2002` → 409; `createOutlineDraft` takes the
  next draft number inside a `$transaction` (max-read + 1);
  `approveOutlineVersion` is a two-step transaction whose `P2002` reads
  "another outline version was approved concurrently";
  `putHorizon` probes `horizonFor(0, policy)` first and refuses policies
  that cannot order a chapter, rather than storing an unusable policy.
- **`gate()`** resolves membership and the novel server-side and answers
  the SAME `NotFoundError("novel")` when either is missing — no
  existence leak through a 403/404 difference.
- **Capabilities** (`@novelforge/auth/authorization`): `canon:manage`
  gates synopsis/saga/outline-node/draft/horizon writes, `canon:approve`
  gates `approveOutlineVersion`/supersede, `canon:read` gates lists and
  `getHorizon`. Not scattered `role === "ADMIN"` checks.
- **`planning-routes.ts`** — zod validates every body; bad input is 400
  `INVALID_INPUT`, missing actor 401 `UNAUTHENTICATED`. Query booleans
  use `z.stringbool()`, not `z.coerce.boolean()` — `Boolean("false")`
  is `true` and would have turned a pagination flag into a lie.

Checks run: planning 8/8; typecheck clean in every workspace; lint 0;
`pnpm -r build` complete; canon + manuscript regression 98/98;
story-intelligence 63/63.

### Post-slice-2 audit fix (`38a00ae`, 2026-09-28)

42-agent deep audit over the Phase 6 slice 2 + Phase 7 slice 2 code:
11 candidate findings, 7 confirmed, 4 refuted by adversarial
verification. 4 root-cause fixes landed in `38a00ae`:

- **`services/canon.ts` (brain)** — UNRESOLVED/PROMISES ledger:
  reader-anchored `now` (`min(chapter frontier, readerAt)`), open
  status re-derived from each row (no phantom `open` flag on
  `DebtScore`), `BrainAnswer.status` widened to `string | null`,
  READER mode returns `withheldCount: 0` (an existence oracle must
  not leak counts) and masks open-row status to null. Verified debts:
  READER@3 = 33/24 vs AUTHOR@40 = 196/144.
- **`canon.test.ts`** — 4 seed payloads that contradicted the Prisma
  schema (`workspaceId` on chapters; threads missing `kind`/creator)
  replaced with schema-accurate seeds; boundary tests prove outline
  draft content is 400 for absent AND null.
- **`services/planning.ts`** — cross-tenant guards on
  sagaId/chapterId/sceneId before outline-node create; `P2002`/`P2003`
  from draft-number race, concurrent approve, and order collision all
  mapped to 409 `ConflictError`, never 500.
- **`planning-routes.ts`** — outline-draft `content` must be present
  non-null (`z.unknown().refine`); planning list routes take
  `take`/`skip` pagination (planning tables are the growth tables).

Checks run since `38a00ae`: typecheck clean in every workspace,
full recursive test suite green (apps/api 197/197,
story-intelligence 63/63, planning 19/19), `pnpm -r build` complete.


### Round 7 — vitest 5.0.2 pin + delete endpoints + Brain audit rows (2026-10-02)

Three tasks in one round: the vitest 3→5 upgrade completed to exact
`5.0.2` pins in all 12 package.json files; the two documented delete
hazards got their routes; the Brain's structured asks became auditable.

- **vitest 5.0.2 everywhere.** All `"^5.0.0"` ranges pinned exact. The
  upgrade surfaced (and the pin fixed) the long-standing `apps/web`
  typecheck failure — typecheck now clean in every workspace.
- **Entity delete + FK hardening** (migration
  `20261002_phase7_delete_route_fk_hardening`): `canon_facts.entity_id`,
  `canon_facts.object_entity_id`, `workflow_runs.workflow_id`,
  `workflow_runs.workflow_version_id` → `ON DELETE RESTRICT` (referencing
  columns indexed — Postgres does not index them automatically;
  steprun_fk_indexes precedent). `canon_proposals` FKs stay CASCADE by
  decision: proposals are uncommitted candidate canon and die with their
  subject. `DELETE .../canon/entities/:entityId` (gate `canon:manage`)
  returns 409 while any fact cites the entity; the block is PERMANENT —
  retraction withdraws a claim but keeps the row (§9), so the route is for
  unreferenced names only and the 409 message promises no escape.
- **Workflow delete**: `DELETE /api/workflows/:workflowId` deletes a
  never-run workflow with its versions; a run history gives 409 because
  run records are the execution audit trail and survive.
- **Brain audit rows**: `auditBrainAsk` writes one `RetrievalAudit` row
  per structured ask (query `BRAIN:ASK …`, retriever tag `BRAIN:<KIND>`,
  mode, readerChapter, returned/withheld, ≤100 provenance ids, latency).
  READER rows record 0/0 + empty provenance (the audit table must not
  become the existence oracle). The RETRIEVAL leg does not route through
  it — `search` already writes its own row.

Verified after: lint 0; typecheck clean in every workspace (apps/web now
included); apps/api 202/202; packages 324 passed / 1 skipped on vitest
5.0.2; migration drift 0 (`prisma migrate diff` from migrations to
schema); `pnpm -r build` green including apps/web; revert-proof needle
check 10/10 (409 assertions, run-survival, P2003/P2039 mapping, RESTRICT
SQL, BRAIN tag, RETRIEVAL skip).

Two adversarial verification runs (5 refute dimensions × 10 agents each)
over the finished round. First run surfaced the deleteNovel defect —
fixed as `fb315a3` with migration `20261002b` (canon_facts.novel_id →
RESTRICT) plus a novel-delete test for each refusal path. Second run
(independent, against the committed state) came back with all 4 gates
green and only three minors, fixed as `88715da`: `deleteEntity` now
skips the audit row when a concurrent caller already deleted (count 0 —
same no-audit-for-no-op rule as the create-race join); the brain-audit
test pins `retrievers.length === 1`; the entity-delete test asserts the
citing fact row survives the 409 explicitly. Workflow-delete and
brain-audit dimensions clean both runs (P2039 dead-OR and PLATFORM-gate
notes recorded as intentional, not defects).
