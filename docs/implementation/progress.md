# Implementation Progress

> Durable record of phase/task status. Update after each substantial
> change (CLAUDE.md section 35). Detailed architecture lives in
> `docs/02-architecture/`, decisions in
> [decisions.md](./decisions.md), test coverage in
> [test-matrix.md](./test-matrix.md).

Last updated: 2026-09-24 (task NF-1005).

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

## Phase 3+

NOT STARTED.
