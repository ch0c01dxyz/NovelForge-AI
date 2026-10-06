# Implementation Progress

> Durable record of phase/task status. Update after each substantial
> change (CLAUDE.md sections 10–13). Detailed architecture lives in
> `docs/02-architecture/`, decisions in
> [decisions.md](./decisions.md), test coverage in
> [test-matrix.md](./test-matrix.md).

Latest documentation update: 2026-10-05. Historical entries and their dates
are preserved; current integration status lives in CURRENT and the delivery
plan. New technical issues belong only in ISSUES-AND-GAPS.md.

## External-host prerequisites — 2026-10-05

Author request: the next coding model runs on Ubuntu, which must provision
missing native dependencies without installing Docker. Follow-up: Windows
uses the author's already running Docker environment and existing data, not
optional native reinstallation. Added ENVIRONMENT-PREFLIGHT and linked both
constitutions, START-HERE, deployment/testing/playbook/template. Recorded the
previous Docker-only guidance conflict as GAP-027 before applying the remedy.

Guide covers runtime/pnpm pinning from the repository, PostgreSQL/pgvector,
Redis, optional task tools, host-specific private config, service readiness,
Engram/harness binding and dedicated scratch databases. Legacy clone scripts
remain Compose-specific; native Ubuntu runs relevant checks directly instead.
Official Node/pnpm/PostgreSQL/pgvector sources were checked for setup guidance.
No host packages, containers, databases, credentials or applied migrations
were changed here. Ubuntu installation/runtime validation has not been run.
Documentation checks passed: 10 Markdown files, 46 local links, equivalent
constitutions, unchanged NF-WF-003 frozen blob and git diff --check. Separate
documentation actor review returned APPROVE, with no runtime acceptance implied.
GAP-027 stays VERIFY_PENDING for host evidence; NF-WF-003 remains PLANNED and
its contract blob is unchanged. Current runtime still lacks Engram binding;
this progress entry is the fallback checkpoint, not an attributed MCP save.

## Workflow audit and model-neutral continuation — 2026-10-05

Baseline ac4a19a; working tree initially clean, main two documentation commits
ahead of origin/main. Engram search recalled the 003 contract/history; source
and Git inspection, not memory alone, established current status. 002D/002F
receipts are historical and scoped. 003 remains PLANNED, not implemented.

Recorded GAP-026 before workaround: missing composition/test/doc paths,
unbounded internal state/debt/event reads, cast take-before-dedupe, legitimate
empty tiers rejected, weak source-head checks and alias-based reviewer identity.
Amended the contract and refreshed review-request blob to
`aaed86bc34ecd599cef1e57533edaef41b4c0eeb`. Preserved previous review history;
this changes the artifact and requires full contract review before dispatch.
Corrected stale index-idempotency guarantees; no applied migration was edited.
Added prioritized owner/remedy/closure evidence for all unresolved gaps inside
the single issue register. These are solutions to implement, not closed runtime
features. No application code, database, WSL host or credentials were changed.

Author follow-ups: coding roles are model-neutral and runtime-selected, with
separate reviewer actors; historical model names remain evidence only. English
is the global project default. UI is the explicit bilingual exception, using
English/Bahasa Indonesia resources with locale keys, English fallback and
both-locale/fallback acceptance tests. Constitutions changed together.

Fresh checks: Node v24.14.1, pnpm 12.5.1; story-versioning 1 file/17 tests
passed; pnpm lint exit 0; API typecheck exit 0. Local Markdown/link/constitution/
active-model/manifest checks and git diff --check passed: 15 Markdown files,
83 local links and 26 unique issue rows; all unresolved rows have remedies.
No DB-backed suite,
full platform E2E or UI locale journey was rerun; historical counts remain
attributed. Separate actor review_workflow_docs requested two documentation
corrections (stale migration assurance, conflicting review-identity gate), then
re-reviewed APPROVE after repair. This is documentation review only, not NF003
full contract approval or proof of a serving backend/model. GAP-026 remains
VERIFY_PENDING for that full contract gate.

Fallback checkpoint (GAP-021): runtime hook has no authoritative registered
identity. Attributed memory writes were not attempted, and no save is claimed.
Next: assign a reviewer for the refreshed 003 contract, resolve actual findings,
then implement only after approval. Preserve 004/002E consumer/dependency gates
and remaining product/runtime gaps; no full release claim is warranted.

## Task workflow analysis and preparation — 2026-10-03

Availability follow-up: the author confirms only DeepSeek is active and GLM is
inactive. Updated D/F ownership notes, CURRENT and decisions: D implementation
and checks continue without waiting for GLM; separate review stays pending and
F/parent acceptance remain gated. Earlier GLM assignment is a requested role,
not a dispatched actor. No application changes, runtime checks or agent dispatch
were performed for this follow-up. Engram attribution remains unavailable
(GAP-021); this entry is the fallback checkpoint, with no MCP save claimed.

Observed status from current task/source records: 001 design and 002A–C have
attributed independent reviews; D is READY on the recorded author decision;
E is consumer-design-blocked; parent 002 is IMPLEMENTED_WITH_GAPS. These are
existing receipts, not runtime results rerun by this task.

Source-backed findings (GAP-025): D's scope omitted revision error throw sites
needed for typed 409 metadata and exact test/doc paths; its proposal-shape note
reopened an already resolved four-route decision; pre-check rationale confused
transaction work with committed partial state; rollback promised 400 without
strict schemas. E proposed dropping pending outbox intents on rollback. The
queue also called D PLANNED, and final parent acceptance had no bounded owner.

Corrected the task contracts, preserved accepted decisions and protected CAS/
snapshot ordering; added PLANNED NF-WF-002F for integrated verification after
reviewed D. Aligned START-HERE, CURRENT and DELIVERY-PLAN to D → F → bounded
003/004 contract preparation. Assigned E's activation investigation to 004's
real consumer design. Added review-manifest and changed-scope continuation
rules to the playbook/template. Old hashes still identify original artifacts;
this amended D needs review at its next submission, not invented approval.

Verification: inline checks passed across the first eleven edited/new Markdown
files (80 local links, fences, 25 unique issue IDs/valid states, equivalent
unchanged constitutions), and git diff --check exited 0. Application-tree digest
before/after matched `f9569cff…`: apps/packages unchanged. Runtime tests,
databases, migrations, agents and configuration were not modified or dispatched.
No independent approval of this documentation amendment is claimed.
Final check after owner/handoff clarification passed for 13 Markdown files
and 86 local links, issue/queue/owner checks, unchanged application digest
and git diff --check. Next action remains current-session 002D execution,
followed by separate review and planned 002F acceptance.

**Fallback checkpoint / GAP-021:** current runtime has no authoritative session
binding. Historical successful binding 5ff5313c… must not be reused; no MCP save
or summary was attempted. HEAD `811e7e68debdd7550b5516df96637d227d10fdf6` with
existing dirty implementation preserved. Next actor: the author's current DeepSeek-selected Claude session (owner
confirmed by the supplied waiting response); request a separate GLM reviewer
at submission, without a duplicate implementation writer.
inspect current ownership/artifacts, verify current runtime binding or fallback,
execute amended D, then F verifier decides parent scope-specific acceptance.
The earlier Engram decision checkpoint predates these amendments; its role,
LOW/partial-write/rollback rationales and inventory must be refreshed from
current source under that session's own confirmed binding.
E and later tasks remain pending. GAP-025 is VERIFY_PENDING for independent
contract review; actual readiness does not close GAP-022.

## NF-WF-002 follow-up documentation and fallback handoff — 2026-10-02

The author requested Markdown preparation for another DeepSeek/GLM worker.
Added READY NF-WF-002A (ten existing test files, fixture-only C8 repair) and
PLANNED NF-WF-002B (GAP-019 clarification plus integrated review). Updated
START-HERE, CURRENT, DELIVERY-PLAN, parent task and issue/test records to
point at these children. Parent remains IMPLEMENTED_WITH_GAPS; no dependent
feature is accepted or advanced by this amendment.

Corrected test-versus-suite terminology, API/root baseline attribution and
fixture inventory (12 valid creation sites plus one intentional negative);
normalized GAP-016 to CLOSED and indexed GAP-020. Preserved failure and review
history. No application source, fixtures, database, model dispatch or harness
configuration was changed.

Documentation checks: inline static validation passed for the ten amended/new
Markdown files, 65 local links, balanced fences, 21 unique issue IDs with valid
states, task ordering and the 12-valid/one-negative source inventory.
`git -c core.excludesFile=NUL diff --check` exited 0. Constitutions are unchanged
and equivalent after normalizing their expected filename/header references;
an initial strict byte-comparison rejected only those expected differences.
No runtime tests or migrations were rerun; independent review of this Markdown
amendment is not claimed.

**Engram fallback (GAP-021):** the runtime reports no confirmed session identity,
so no agent-attributed checkpoint or session summary was attempted/claimed.
Observed HEAD `811e7e68debdd7550b5516df96637d227d10fdf6`; preserve the dirty
NF-WF-002 implementation. Next action: host confirms a new runtime binding,
then the assigned worker checks file ownership/current diff and executes 002A.
Record selected/full test results, review disposition and a confirmed scoped
checkpoint before 002B. Prior memory is navigation only, never completion proof.

## NF-WF-002 — minimum revision/checkpoint/restore foundation — 2026-10-02

**Status: IMPLEMENTED_WITH_GAPS.** Baseline `5b5f139`. One bounded writer
(this task); no other agent wrote to these paths.

Delivered the frozen C1–C11 contract: eight Prisma models, five enums, two
nullable FK columns and the additive migration with the hand-written partial
unique index plus the C8/C9 baseline backfill
(`packages/database/prisma/migrations/20261006_m1_story_versioning/`); the
pure `@novelforge/story-versioning` package (`impact.ts`, `snapshot.ts`);
`apps/api/src/services/revisions.ts` and `revision-routes.ts`; and the head
CAS routed through every C3 mutation in the seven allowed service files.

Receipts (all at this diff, scratch PostgreSQL on `127.0.0.1:5433` — GAP-020):

- `pnpm --filter @novelforge/story-versioning test` → 17 passed (17), exit 0
- `pnpm --filter @novelforge/api exec vitest run src/revision.test.ts` → 25
  passed (25), exit 0
- `pnpm --filter @novelforge/database exec vitest run
  test/revision-constraints.integration.test.ts` → 8 passed (8), exit 0
- `pnpm lint` → exit 0; `pnpm typecheck` → exit 0; `pnpm -r build` → exit 0
- `db:test:prepare` → all 19 migrations applied from empty, exit 0
- populated-dump upgrade check (scratch restore, never a live DB) → exit 0,
  C8/C9 end state verified
- **`pnpm test` → exit 1: 123 failed | 673 passed | 1 skipped (797).** All
  123 are tests in pre-existing API suites whose seeds create a novel with no
  `novel_branches` row, so the C8 head CAS refuses them by design — **GAP-017**.
  Separate API-only baseline run with the diff stashed: 313 passed (313);
  this is not a root `pnpm test` baseline receipt.

Both candidate repairs are blocked by the task's own constraints (lazy branch
creation is forbidden by C8; editing the seed helpers is outside the allowed
paths), so the suites are left red and reported rather than silently
weakened. The coordinator scope ask `msg_352e8c279405` was not answered.

New gaps recorded: GAP-017 (head CAS vs pre-existing seeds, P1), GAP-018
(pre-existing dev-dump migration drift, P2), GAP-019 (five C1–C11 contract
questions, P2), GAP-020 (host port 5432 shadowed, P2). G-01 in
`test-matrix.md` carries the full receipt table. Independent review of this
exact diff is still owed.

## Engram context persistence — 2026-10-01

Subsequent authorized harness work is recorded in
[Claude Code configuration](CLAUDE-CODE-CONFIGURATION.md): lean MCP registry,
native Ruflo filtering, preserved Orca integration, repaired Windows Engram
hooks and verified save-before-close behavior. Local MCP/status checks, hook
failure tests and a live read-only Claude smoke passed. Interactive `/clear`
and a long coding session remain untested; application delivery gates are
unchanged. The paragraph below records the earlier documentation-only scope.

Added mandatory compact coding-task checkpoints and scoped recovery after
manual clear/compaction to the root constitutions, START-HERE, multi-model
playbook and task template. Checkpoints preserve unfinished work and evidence;
current repository files remain authoritative. Runtime session IDs must not
be invented or carried into unrelated new sessions. Failed saves use the
existing task/progress handoff and single issue register. No harness hook,
automatic clear interception or real reset recovery has been implemented/tested.

## Workflow documentation repair — 2026-09-30

Applied the author's approved comparison recommendations in English:
ADR-0013, corrected phase dependencies, early recovery foundation, complete
chapter/review/approval/memory workflow, explicit reader/publishing scope,
capability/task gates, and DeepSeek/GLM implementation/review protocol.
Added mandatory model evidence/hallucination policy and one technical issues
register. Root onboarding/constitutions and related domain/security/testing
references are aligned. Historical broad completion labels now distinguish
implemented slices from pending product integration.

This is a documentation change. No runtime feature, model dispatch, database
migration, application test or deployment is claimed. Documentation checks
and remaining gaps must be recorded in test-matrix.md and ISSUES-AND-GAPS.md.
Next task is NF-WF-001 (reviewed revision contract), not automatic Phase 10.

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

### Slice 3 — the write surface, and why slice 2 was not actually done (2026-09-30)

Slice 2 shipped the **read** half. Its own record above says so without
naming the consequence: `timeline_events` was called "schema-present with
no service surface yet", and the four Brain legs were described as
answering "from these tables" — which was true, and hid the fact that
nothing outside a test could put a row in one.

Discovery, before any code:

```
=== writes to slice-2 tables outside tests ===
services/canon.ts:1688  db.storyEvent.findMany      (read)
services/canon.ts:1693  db.storyEvent.count         (read)
services/canon.ts:1724  db.causalEdge.findMany      (read)
services/canon.ts:1807  db.storyThread.findMany     (read)
services/canon.ts:1814  db.storyPromise.findMany    (read)
```

Five reads, zero writes. Repo-wide, the only `storyThread.create` /
`storyPromise.create` calls were in `canon.test.ts` (~2080–2093), seeding
raw rows past every API. The roadmap's exit criterion — "Story Brain can
answer core factual/continuity questions with evidence" — therefore held
**in tests only**. A green gate was covering a product gap.

Three of the nine pure rules had **no production caller at all**:
`canPromiseTransition`, `findCausalCycle`, `isChronological`. Tested,
documented, dead. They police a write path that did not exist, which is
the signature of a domain-first slice whose consumer never landed.

Shipped: `apps/api/src/services/story.ts` + `apps/api/src/story-routes.ts`,
wired in `app.ts`. Routes under
`/api/workspaces/:ws/novels/:novelId/story/{events,timeline,threads,
promises,causal-edges}`. `canon:read` for lists, `canon:manage` for writes;
`INFERRED`/`SPECULATIVE` causal edges take `canon:approve` and store the
approver, because an AI-derived claim is candidate canon (CLAUDE.md §2.13,
§5) — an EDITOR is refused 403, asserted explicitly.

Two rules now run on the request that would violate them
(`canPromiseTransition`, `findCausalCycle`); the six migration CHECKs are
the race backstop. `isChronological` took the other route — see below.

**A test that was wrong, and what it revealed.** The first version of the
timeline suite asserted a *read-side* `isChronological` throw: seed a
duplicate slot raw, expect `listTimeline` to 409. It failed — the raw
insert was rejected by `timeline_events_novel_id_order_key` before any read
could happen. The read-side branch was unreachable code guarding an
unrepresentable state. Removed the branch (and the now-dead import), kept
the rule in the domain package where its unit test pins it, and replaced
the test with one asserting the **actual** enforcement: the index refuses
the duplicate. The migration's own comment had already named the index as
"the write-side twin of isChronological()'s tie refusal"; the code had
just not believed it.

**A test removed rather than kept.** A concurrent-append test asserting
`[201, 409]` passed as `[201, 201]`: Prisma serialises the injects on one
connection, so the interleaving cannot be forced. Rather than weaken it
into something that races only sometimes, it was deleted and the P2002
branch in `appendTimelineEvent` is documented as race defence with no
covering test. Stated plainly rather than implied by a green run.

**Constraint probe.** Each of the six slice-2 CHECKs was confirmed
load-bearing the Phase 8 way: dropped inside `BEGIN`/`ROLLBACK`, the exact
refused statement retried, and `accepted` observed.

```
OK   StoryThread_importance_1_to_5          with=refused: 23514  without=accepted
OK   StoryPromise_importance_1_to_5         with=refused: 23514  without=accepted
OK   StoryThread_resolution_pair            with=refused: 23514  without=accepted
OK   StoryPromise_payoff_pair               with=refused: 23514  without=accepted
OK   CausalEdge_not_self                    with=refused: 23514  without=accepted
OK   CausalEdge_approval_matches_confidence with=refused: 23514  without=accepted
```

The probe carried the two lessons from the Phase 8 run: a refused statement
aborts the enclosing transaction (25P02), so each attempt needs its own
`SAVEPOINT`; and `ADD CONSTRAINT` re-validates existing rows, so the
probe's own row must never be present at restore time — hence `ROLLBACK`,
never a cleanup `DELETE`.

**Deliberate omission: no delete routes.** `causal_edges` cascade from
`story_events`, so deleting an event would silently take its causal claims
with it — the loss CLAUDE.md §9 forbids. A correction path needs a
supersede chain of its own, as canon has, before a delete is safe. Until
then the write surface is append-and-transition only.

Checks run: `pnpm typecheck` 0 (every workspace), `pnpm lint` 0,
`pnpm test` **31 files, 642 passed / 1 skipped** (622 before, +20 new),
`pnpm -r build` 0, `prisma migrate diff` zero drift (no schema change —
this slice is service and routes only).

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

### Round 8 — AI Orchestrator milestone (2026-10-03)

The `ai.generate` lifecycle CLAUDE.md §7 and
`docs/06-ai/AI-ORCHESTRATION.md` call for, built by **composing the
phases that already exist** rather than reimplementing any of them. No
migration: `Generation.promptVersion` and `Generation.contextSnapshot`
already existed.

- **`services/definition-resolution.ts`** — `resolveAgent` / `resolveSkill`
  lifted verbatim out of `workflow-runs.ts` (which now imports them).
  Both entry points must resolve the SAME published definition the same
  way, or a workflow run and a direct generation could disagree about
  which agent version executed. Rules kept: a workspace row shadows the
  platform row of the same key (PostgreSQL orders the `DefinitionScope`
  enum by declaration — PLATFORM then WORKSPACE — so `orderBy: { scope:
  "desc" }` is what prefers the tenant's own definition), and only
  PUBLISHED resolves (a DRAFT is mid-edit; pinning a run to an
  unfinished definition makes the run unexplainable after the next edit).
- **`services/orchestrator.ts`** — the four legs the orchestrator owns:
  membership + `generation:create` gate (no platform-role bypass — a
  super admin is not implicitly a workspace member, ADR-0005); novel
  tenancy; prompt assembly; fail-closed contract validation. Context is
  compiled under a char budget (`FACT_BUDGET_CHARS`/`REF_BUDGET_CHARS`
  6 000, `REF_LIMIT` 8) with inline provenance — `- [fact:<id>]
  <predicate>: <statement>` and `[n] <referenceTitle> (chars a-b)` — and
  the ids used are persisted to `contextSnapshot`. Mode is fixed to
  AUTHOR, exactly like the workflow `RETRIEVAL` step: the caller holds
  workspace capabilities, so reader-facing generation needs its own
  validated contract later, not a passthrough here. The `system` turn
  holds ONLY instructions; every retrieved fact and reference excerpt
  goes into the `user` turn inside a `<context>` fence, so reference text
  cannot impersonate the orchestrator's own instructions (SECURITY.md;
  the executor draws the same line).
- **`orchestrator-routes.ts`** — `POST .../generate` and
  `POST .../generate/stream`. The stream route attaches the abort
  listener to the raw socket (`reply.raw.on("close", …)`) only AFTER
  `generateStream` returns, because that call is where every fail-closed
  refusal happens — registering first left a listener, a closure and an
  `AbortController` on the socket of a request answered with a plain
  403/404/409. Refusals therefore reach the caller as real status codes
  rather than SSE error events. A contracted agent is refused up front
  on the streaming route for the same reason: the contract check cannot
  run after the bytes have left.
- **`app.ts`** — registers the routes with the SAME `aiServices`,
  `canonServices` and `retrievalServices` the direct routes use, so
  gateway routing, retry, the generation ledger and the audit trail stay
  in one place.
- **`orchestrator.test.ts`** (14 tests) — dedicated
  `novelforge_test_orchestrator` database (ADR-0003 §8); every test
  drives the real HTTP surface against a real migrated database and the
  real Phase 3 generation path. Only the transport is faked
  (`BuildAppOptions.createGateway`), so no test reaches a provider
  (CLAUDE.md §25). Covers prompt assembly with the system/user boundary
  asserted from both sides and the provenance pin, agent settings
  (profile, temperature, maxTokens) reaching the transport, the
  reference/retrieval leg and the `contextQuery` override, resolution
  gating (unpublished/unknown 409, foreign workspace 404, VIEWER 403,
  foreign novel 404, body 400), contracts failing closed both ways, and
  streaming (deltas + SUCCEEDED + provenance; a broken stream settles
  INCOMPLETE with **no** provenance stamp; a contracted agent refused
  before any bytes).

Adversarial verification (5 refute dimensions, three agents) found four
real defects behind the green gate, all fixed here:

- **A contract-rejected generation stayed `SUCCEEDED` in the ledger.**
  `ai.generate` settles the row SUCCEEDED on transport success, and the
  orchestrator then threw its 409 without touching the row — so the
  ledger claimed a generation that produced no usable result, with no
  error category to find it by. The workflow executor marks its run
  FAILED on the same rejection (`workflow-runs.ts`); the orchestrator
  was the sibling path that did not. Now updated to FAILED /
  DETERMINISTIC, and both contract tests assert it.
- **Untrusted reference text was concatenated into the `system`
  message.** A reference containing "## Established canon", or a
  directive aimed at the model, was indistinguishable from the
  orchestrator's own instructions — `SECURITY.md` states the intended
  posture ("references are data, not system authority") and the workflow
  executor already honoured it. `compile()` now keeps only instructions
  in the system turn and moves every retrieved block into the fenced
  user turn, and the prompt-assembly test asserts the boundary from both
  sides.
- **`orchestrator-routes.ts` did a per-request user round-trip whose
  value nothing read.** `requireActor` awaited `platformRoleOf(userId)`
  to build `{ userId, platformRole }`, and no handler ever dereferenced
  `platformRole` — the orchestrator authorizes by workspace capability
  only. The extra query is gone and `requireActor` returns the id.
- **Abort listener leaked onto refusals.** Reported as a listener leak;
  verified — the `reply.raw.on("close", …)` registration preceded the
  `generateStream` call, so a request answered with a plain 409/404/403
  still retained a listener, a closure and an `AbortController` for a
  stream that never existed. Moved below the await.
- **The contract-validated value was discarded.** `enforceContract`'s
  return was ignored and the caller got the raw model string, so the
  contract acted as a gate every consumer would then re-open with its
  own parser — and with streaming refusing contracted agents up front,
  no endpoint returned a validated object at all. `generate` now returns
  it as `output` (absent for prose agents), which is the handoff
  `AI-ORCHESTRATION.md` orders between "schema validate" and "extract
  candidate changes".

Two further gaps were found in the TESTS rather than the code, and closed
by adding the assertion that fails if the behaviour regresses — a
mutation to a no-op previously passed:

- **The novel tenancy guard was untested.** `ensureNovelInWorkspace` was
  redundant with an identical check inside `ai.generate`, so deleting it
  left the suite green. Removing it would still strip a tenancy guard at
  a trust boundary, so instead the foreign-novel test now sends an agent
  key that does not exist: a resolution-first order answers 409, and the
  404 proves the orchestrator's own guard ran.
- **The reference/retrieval leg had zero coverage**, and neither did
  `temperature`/`maxTokens` pass-through or the recorded model profile.
  Both are now asserted.

Checks run after the fixes: lint 0; typecheck clean in every workspace;
`apps/api` 218/218 on vitest 5.0.2; packages 324 passed / 1 skipped;
`pnpm -r build` green including `apps/web`.

### Round 9 — real 9Router deployment (2026-09-30)

First run against a real gateway (`http://localhost:20127`, 9Router) with a
real credential, a real 1 958-model catalog and real generations. Every
defect below was invisible to a suite whose fake gateways return two
models and never send a malformed body — the same "green gate covers the
primary path" shape as rounds 2 and 7.

- **`pnpm start` could not run the API at all.** Both entrypoints ran
  `node src/server.ts`, which is Node's *strip-only* type stripping, and
  it refuses non-erasable TypeScript syntax. The codebase uses parameter
  properties (`constructor(readonly failures: …)`) in
  `services/definitions.ts`, `ai-core/errors.ts`, `ai-core/manager.ts`
  and `ai-core/manager.ts`'s `GatewayManager`, so the process died with
  `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` before binding a port. Fixed with
  `--experimental-transform-types` in `apps/api` and `apps/worker`. The
  first attempt rewrote three constructors to assign in the body, which
  fixes the reported file and leaves the class of failure intact for the
  next one — the flag is one line and fixes all of them, so the edits were
  reverted. `db:test:prepare` keeps `--experimental-strip-types`: it only
  needs to run, and strip-only is the stricter mode.
- **A capability map reached a `String[]` column.** 9Router returns
  `capabilities` as an object (`{vision: true, tools: false,
  thinkingFormat: "deepseek", …}`); `OpenAIModelEntry` declared
  `capabilities?: string[]` and the cast at the `res.json()` boundary hid
  the lie, so the object went to Prisma verbatim and every sync died on
  `Argument \`set\` is missing`. The adapter is the boundary that parses
  untrusted provider JSON, so `normalizeCapabilities` narrows there: a
  tag list passes through, a map becomes its truthy keys minus
  `thinkingFormat` (a mode string, not a flag), and anything unrecognized
  yields `["chat"]` — the catalog's pre-existing default. The existing
  test only fed the tag-list form, which is exactly why this shipped.
- **Model sync outlived Prisma's 5 s interactive-transaction default.**
  1 958 sequential upserts exceeded it and the sync failed with
  `expired transaction` — an infrastructure error surfacing as a 500 on
  an operator action, with the catalog half-applied. The transaction now
  carries an explicit `timeout: 120_000`. A fake gateway with two models
  never reaches 5 s, so the suite was green throughout. Still a per-row
  upsert (`ponytail:` noted at the site); revisit with one
  `createMany`+`updateMany` pair if the sync becomes slow.
- **A trailing SSE sentinel on a NON-streaming body broke the fallback
  chain.** One upstream behind 9Router appends `data: [DONE]` to a
  `chat/completions` response. `await res.json()` threw on the trailing
  bytes, `classifyThrown` returned INTERNAL, INTERNAL is not retryable,
  and `shouldTryNext` stopped the loop — so the configured chain never
  reached fallback #2, and a *healthy* model two priorities down was
  never tried. `parseJsonBody` salvages the leading value when the parse
  error names an offset whose prefix is already a complete value, and
  still rethrows a genuinely truncated body. The classification is
  defensible (unparseable upstream body); the bug was that one bad
  upstream could end a chain that had somewhere else to go.

Verified live, not just in tests:

- Gateway inserted through `POST /api/gateways` (the credential is
  encrypted at rest by `credentialCiphertext`; it appears in no response,
  log line, URL or committed file), `baseUrl` stored as
  `http://localhost:20127` — the adapter appends `/v1/...` itself, so
  passing the user's `…/v1` would have doubled the segment.
- `POST /api/gateways/:id/sync-models` → `{"discovered":1957}`.
- The requested chain is expressed as three models mapped to the same
  profile at priorities 10/20/30 (the router dedupes by gateway, then
  appends same-gateway repeats, so a single-gateway chain is
  `priority`-ordered). Mapped to all six text profiles, 18 rows.
- All three tiers were exercised for real by disabling the one above:
  primary `cbai/deepseek-v4.1-flash` → SUCCEEDED (`deepseek-v4.1-flash`,
  3.1 s, 47/239 tokens); with it disabled,
  `dahlinference/deepseek-ai/DeepSeek-V4-Flash-0731` → SUCCEEDED; with
  that disabled too, `dahlinference/MiniMaxAI/MiniMax-M2.7` → SUCCEEDED.
  Each attempt row names the model that served it. Both disabled models
  were re-enabled afterwards.
- The primary's earlier 503 (`ENOENT: getaddrinfo ENOENT
  www.codebuddy.ai`) was transient upstream DNS — it served a real
  completion on a later probe, so the chain as specified works and no
  substitution was needed.
- **`EMBEDDING` is deliberately unmapped.** The orchestrator's retrieval
  leg degrades correctly without it (the vector leg is recorded as a
  failed leg, the lexical leg answers, the generation proceeds — the
  `embedding unavailable for the vector leg` log at error level is the
  designed signal, not a fault). Mapping it was skipped because the
  candidate models are `text-embedding-3-large` and
  `sea-lion-modernbert-embedding-300m`, and the 1 536-dimension
  requirement in `retrieval.ts` is unverified for both: a wrong width
  fails at ingest with a 502, and `EMBEDDING_DIMENSION` is a schema
  constraint, not a preference. Verify the width first.

Checks run after the fixes: lint 0; typecheck clean in every workspace;
`apps/api` 218/218; packages + worker 326 passed / 1 skipped on vitest
5.0.2 (324 + the two adapter tests added here); `pnpm -r build` green
including `apps/web`.

## Phase 8 — Character & Relationship Intelligence (2026-09-30)

Roadmap exit criterion, verbatim: *"monogamy/harem/polygamy and
enemy-to-ally validation scenarios pass."* Both are tested at the HTTP
boundary in `apps/api/src/character.test.ts`.

### Slice 1 — domain packages

`@novelforge/character-intelligence` (22 tests) and
`@novelforge/relationship-intelligence` (33 tests). Pure rules, no
Prisma, no HTTP (ADR-0001). Windows are half-open `[from, to)` so the
chapter a state changes on belongs to the new state — the same
convention a canon fact's validity window uses.

Enum-shaped unions are declared locally as `as const` arrays with a test
pinning the member set against a hardcoded literal. That pin is the only
guard that catches schema drift: the Prisma enums must match those sets
exactly, and the route modules validate bodies with `z.enum(MIRROR)`
rather than the Prisma enum, so a drift fails a test instead of silently
widening what a route accepts.

### Slice 2 — schema (migration `20261003_phase8_character_relationship`)

Ten tables, seven enums. Scope is exactly what the two packages validate
and nothing more; the blueprint's other tables (`character_state_events`,
`character_beliefs`, `relationship_events`, `relationship_groups`,
`relationship_group_members`, `relationship_agreements`,
`relationship_arcs`, plus structured reputation / possessions /
development-milestone columns) are deferred **by name** in the schema
docstring. Each earns a table when a consumer asks for one.

Three sub-decisions, each recorded in the schema:

- **`characters` is standalone**, not a `StoryEntity` of kind CHARACTER.
  Nothing in Phase 8 reads an entity link, and requiring every character
  to be a canon subject would force a row the author never asked for.
  A link can be added when a consumer needs canon claims *about a
  character* (ADR-0008 §5's posture: wait for real data).
- **`Bond` is the spec's "relationship groups" and "agreements" in one
  table**, because the domain package models the whole shape as structure
  + members + window. A separate groups table would be a second name for
  the same rows.
- **`workspaceId` is denormalised on the four tenant-scoped parents**
  (`characters`, `relationship_stances`, `bonds`,
  `meaningful_interactions`); the six children reach the tenant through
  their parent. Tenant isolation is therefore not uniform across the
  codebase — `CanonFact` denormalises, Phase 6 slice 2 does on all five
  tables, Phase 7 and `Scene` do not. Phase 8 follows the parents.

**Overlap is refused by the database, not only by the validator.** The
three EXCLUDE constraints (`character_states_no_overlap`,
`character_knowledge_no_overlap`, `relationship_stances_no_overlap`) use
`btree_gist`, verified *trusted* in `pgvector/pgvector:pg16` so
`CREATE EXTENSION IF NOT EXISTS` needs no superuser. A validator only
runs if a caller calls it, and the failure mode is silent: two rows
claiming chapter 12 make "where was she in chapter 12" answerable two
ways, and whichever the query returns becomes accidental canon.

Bonds deliberately get **no** EXCLUDE. Overlapping bonds are the
author's business — a monogamy bond and a political marriage may run
concurrently — and refusing that would be the engine overruling the
author (§2.13). The exclusivity rule needs the sibling *members* of a
bond, which no CHECK can see, so it stays in `validateBondStructures`.

### Slice 3 — services, routes, tests

- **`services/characters.ts`** (14 methods) and
  **`services/relationships.ts`** (13 methods), following the
  `services/planning.ts` template: an inner `gate()` resolves membership
  and the novel server-side and throws the SAME `NotFoundError("novel")`
  for either miss (no existence leak through a 403/404 difference), then
  `requireCapability`; `audit.record` after every successful mutation.
- **Capabilities** are reused, not extended: `canon:read` /
  `canon:manage` / `canon:approve`, as Phase 7 did.
- **The baseline-diff discipline** in `addMilestone` and
  `addTransition`. `validateArc` walks the array in the order given, so
  appending the candidate and running it only checks the append case — an
  insert in the middle slips through. The fix validates the whole set
  with and without the candidate and acts on the set difference: a
  pre-existing defect cannot block a correct write, and no error message
  is parsed. The first attempt identified the failing record by splitting
  `e.message` on spaces; that was replaced before it shipped.
- **`isExclusionViolation`** (`services/platform.ts`) is separate from
  `isUniqueViolation`: SQLSTATE **23P01**, not P2002. A caller mapping
  only unique violations surfaces an overlap as a 500.
- **Cross-tenant ids are checked, not merely FK'd.** `putKnowledge`
  proves the fact belongs to THIS novel and `requireCharacters` proves
  every named character does — the FK alone would have accepted a
  foreign id.
- **`stateAt` / `stanceAt` return null, not 404, for a chapter with no
  recorded value.** The pair or character exists (an unknown one is
  already 404'd by the gate), so "the author recorded nothing yet" is a
  real answer and must stay distinguishable from "no such character".

### The DB-constraint suite, and why it is separate

Every refusal in the suites above arrives through the HTTP API, and the
service validators all fire *before* the statement reaches the database.
Those tests therefore stay green with a constraint dropped — they pin the
validator, not the CHECK. `canon.test.ts` established the pattern; Phase
8's last suite writes straight to the database, past every guard.

**Each of the eight constraints was confirmed to fail with its
constraint dropped, not merely to pass with it present.** A one-off probe
dropped each constraint inside a rolled-back transaction, retried the
exact statement the suite asserts is refused, and confirmed it then
succeeded: all eight are load-bearing (three `23P01`, five `23514`).

Two probe bugs were found and fixed along the way, both worth recording
because either would have produced a confident false negative: a refused
`INSERT` aborts the enclosing transaction (`25P02`), so each attempt
needs its own `SAVEPOINT`; and dropping a constraint cannot be undone
while the probe row is still present, because `ADD CONSTRAINT`
re-validates existing rows.

### Checks run

- `pnpm typecheck` — clean in every workspace, EXIT=0.
- `pnpm lint` — EXIT=0.
- `pnpm test` — **30 files, 622 passed / 1 skipped** (600 before; +22
  here). Vitest 5.0.2.
- `prisma validate` — valid; `migrate diff` — zero drift;
  `migrate deploy` to an empty database — all 16 migrations applied,
  EXIT=0.
- Constraint probe — 8/8 constraints confirmed load-bearing.

Not run: `apps/web` browser flows (no automated E2E runner exists).

## Phase 9 — Narrative DNA & Rhythm (2026-09-30)

Roadmap exit criterion, verbatim: *"a low-frequency drama scenario remains
non-mechanical and repetition warnings are evidence-backed."* Both halves are
tested at the HTTP boundary in `apps/api/src/narrative.test.ts`.

### Slice 1 — the domain package

`packages/narrative-rhythm` was a stub (`export {};`). It now holds
`vocabulary.ts` (enum-shaped unions mirroring `schema.prisma`, pinned by a
test) and `rhythm.ts` (five pure rules, 23 tests). ADR-0001: no Prisma, no
HTTP, no provider, no `node:` imports.

The five rules split into three that refuse and two that advise:

- `assessDramaWindow` — bands the story against the **novel's own** gap
  policy (RECENT → IN_GAP → EXTENDED_CALM → BEYOND_EXTENDED_CALM). Its
  `guidance` string is asserted at the **word level** to contain no
  imperative under any policy, including `strictInterval: true`. That is the
  ADR-009 soft-constraint rule made mechanical: a state-only assertion would
  stay green while the guidance said "insert drama".
- `checkCooldown` — the one HARD rule. Refuses a same-TYPE beat strictly
  inside the window and never blocks a different type.
- `validateAntagonistProgression` — forward-only lifecycle, explicit purpose
  for TEMPORARY antagonists, bounded 5-20 chapter span.
- `detectRepeatedSequence` — evidence-backed: every beat id and chapter, and
  a suggestion to vary rather than a ban (ADR-012).
- `assessScaleAppropriateness` — reports the gap between a conflict's scale
  and the protagonist's reach. Carries a `ponytail:` comment: reputation is
  evidence in the reason and is deliberately **not** scored, because the doc
  gives no threshold and inventing one would make the number up.

### Slice 2 — schema (migration `20261004_phase9_narrative_dna`)

Three tables, five enums. `NarrativeDnaProfile` (PK = novelId, JSONB `dna`),
`NarrativePolicy` (unique `[novelId, kind]`, `hardReason`), `Antagonist`
(unique `[novelId, characterId]`, `workspaceId` denormalised as the tenant
boundary, `fromChapter`/`toChapter`).

**Three hand-written CHECKs**, each a rule the docs state and a route could
forget: `Antagonist_temporary_needs_purpose`,
`Antagonist_chapter_span_valid`, `NarrativePolicy_hard_requires_reason`.

The purpose/span split is deliberate and recorded in the migration comment:
the SPAN bound is "a pacing note, not an unrepresentable row", so it is not a
CHECK; the PURPOSE is the hard half and is.

### Slice 3 — services, routes, tests

- **`services/narrative.ts`** (12 methods) and **`narrative-routes.ts`**
  (12 routes), following the `services/story.ts` template: an inner `gate()`
  resolves membership and the novel server-side and throws the SAME
  `NotFoundError("novel")` for either miss (no existence leak through a
  403/404 difference), then `requireCapability`; `audit.record` after every
  successful mutation.
- **Capabilities** are reused, not extended: `canon:read` / `canon:manage`,
  as Phases 7 and 8 did. No `canon:approve` — nothing here is canon.
- **The soft/hard split reaches the response, not just the code.** A
  TEMPORARY antagonist with no purpose is refused (409); one whose span runs
  30 chapters comes back **201 with an `advisory` array** naming
  `SPAN_OUT_OF_BOUNDS`. A soft constraint that refuses has become the
  schedule ADR-009 forbids, so the service splits
  `validateAntagonistProgression`'s findings rather than acting on `ok`.
- **No policy is never a default.** `assessWindow` refuses (409) when the
  novel has no `DRAMA_GAP` policy, matching `getHorizon`'s posture
  (ADR-0011 §2) — a default ladder would plan distant chapters at a rhythm
  the author never chose.
- **Malformed policies are refused on write.** `putPolicy` probes with the
  rule that will consume the payload, so a rejected policy is stored nowhere.
  `checkCooldown` has no problem channel (a bad window reads as "no cooldown
  configured", a silent pass), so its shape is checked directly.
- **`advanceAntagonistStage` reconstructs the progression as
  `[current, next]`.** The row keeps only the current stage, so the pair is
  the honest reconstruction — and it is exactly what makes a backward or
  repeated move visible.
- **Cross-tenant ids are checked, not merely FK'd.** `createAntagonist`
  proves the character belongs to THIS novel; `character_id` references
  `characters(id)` with no novel predicate, so the FK alone would have
  accepted a foreign character.

### Known gaps recorded, not papered over

- **`NarrativeDnaProfile.dna` has no field inventory.** The schema comment
  says "shape validated in packages/narrative-rhythm" — true of the POLICY
  payloads, aspirational for DNA. No rule consumes a DNA field yet, and
  pinning a list would make the service a second, drift-prone schema.
- **The `SCALE` policy kind is stored unvalidated** for the same reason:
  `assessScaleAppropriateness` takes the protagonist's standing, not the
  novel's preference, so no rule can probe a scale policy.
- **No narrative UI.** The Phase 9 surface is API-only.
- **`density` is validated but has no behaviour.** `assessDramaWindow`
  refuses a value outside `DRAMA_DENSITIES`, but no rule varies its bands by
  density — the author's `typicalGap` / `extendedGap` numbers are the whole
  policy. Deliberate: a density→band mapping would be a universal default
  ladder, which is what the doc's Principle forbids.
- **`hardness` gates writes but no rule branches on it.** It is load-bearing
  today (HARD requires a reason, per ADR-009), but nothing yet reads it to
  decide whether a finding refuses or advises. The one rule that hard-refuses
  (`checkCooldown`) does so unconditionally. A `hardness`-aware finding
  channel is the natural next step if a SOFT cooldown is ever wanted.
- **`Antagonist` has no delete or correction path.** Append-and-advance only,
  as Phase 6 slice 3's five tables do.
- **The takeover dropped two deliverables the Task D spec named, and one was
  silently lost.** `updateAntagonist` (PATCH) became `advanceAntagonistStage`
  (POST `.../stage`) — a narrower surface, recorded here. `deletePolicy` was
  simply absent: `putPolicy` upserts, so a policy could be overwritten but
  never unset, and a novel with a stale `DRAMA_GAP` could not return to "no
  agreed pacing". Added after the takeover with four tests, one of which
  asserts the delete is real (the drama-window call goes back to 409).
  The lesson: a coordinator inheriting a dead worker's tree must diff the
  landed surface against the spec, not only run the gate — the gate was
  green while the deliverable was missing.

### Deep audit round (2026-09-30) — six defects behind the green gate

An eleven-dimension adversarial audit of the Phase 9 surface (finders →
three-lens refutation per finding → completeness critic) plus independent
reproduction of each candidate against the source. Six defects survived; all
were fixed here with a regression test each. Every one of them was green
before the fix.

1. **`assessDramaWindow` labelled chapters the policy never described.**
   `EXTENDED_CALM` starts at `typicalGap.max + 1`, but its guidance claimed the
   story was "inside the authored extended calm of `eMin`-`eMax`" — false for
   every `d` in `tMax+1 .. eMin-1`. With the repo's own 30-50 / 70-140 policy,
   chapters 51-69 reported `EXTENDED_CALM` while the sentence said they were
   inside 70-140. Validation never rejected `eMin > tMax`, so the documented
   policy produced it. The guidance now states the band the state machine
   actually uses; the test asserts the false clause is **absent** at 51.
2. **`checkBeat` read a missing `COOLDOWN` policy as `{ windowChapters: 0 }`**
   — a silent `allowed: true` for the one rule that actually binds, and the
   exact substitution `assessWindow` refuses (ADR-0011 §2). Now 409, with a
   test. The path was previously uncovered.
3. **`ANTAGONIST_STAGE_RANK` and `NARRATIVE_SCALE_RANK` are object literals**,
   so `RANK["constructor"]` reads back as a function. The `rank === undefined`
   guard missed it, clobbering `previousRank` and letting a real
   `BACKWARD_STAGE` pass. Both lookups now use `Object.hasOwn`. (Unreachable
   over HTTP — Zod and the DB enum forbid it — but the domain functions are
   exported and a planner assembling state from model output is a real caller.)
4. **`assessScaleAppropriateness` returned `ok: true` for an unknown scale.**
   `undefined > undefined` is false, so an out-of-reach proposal read as inside
   reach. Now guarded like `UNKNOWN_STAGE`, for both `standing.scale` and
   `proposal.scale`.
5. **`advanceAntagonistStage` wiped a recorded outcome.** The route coerced an
   omitted `outcome` to `null`, so advancing a stage without restating the
   outcome erased it (trace only in `audit_log`). Omission and explicit null
   are now distinct — omitted preserves, null clears.
6. **`detectRepeatedSequence` could be driven below its own definition of a
   pattern.** `minOccurrences: 1` (accepted by the route) emitted a
   "repeats 1 times" finding the rule's own doc calls meaningless; 0 or
   negative emitted a finding with **no evidence**, violating ADR-012. Clamped
   in the pure rule and floored in the route from the domain constant.

Also fixed: `PolicyHardness` and `NarrativePolicyKind` were hand-declared in
`services/narrative.ts` while the route inlined a *third* copy as Zod literals,
so the route file's own claim that "the mirrors are pinned by a test" did not
hold for them. Both now live in `vocabulary.ts` and are pinned.

One candidate was **refuted** by reading the source: a terminal-stage outcome
was thought unrecordable because a same-stage advance is `REPEATED_STAGE`, but
the outcome rides on the advance *into* the terminal stage, which is legal.

### Second audit round (2026-09-30) — the coverage holes the first round left

The first round fixed nine defects and proved the code was correct where it was
read. This round asked the complementary question: **what is not read at all?**
Seven candidates survived three-lens refutation; three were already-recorded
accepted deviations and no code changed for them (see below). The other four
are test-only, and each one was verified by grep before being written:

1. **`POST /narrative/scale` and `assessScale` had zero coverage anywhere.** A
   shipped, reachable endpoint: swapping `proposal` and `standing` in the route
   wiring, or dropping the `gate(..., "canon:read")` call, left every suite
   green. Four HTTP cases now pin it (beyond-reach with `gap: 4`, inside reach,
   unknown scale as 400, cross-workspace as 404).
2. **The enum pin could not detect the drift it claimed to prevent.**
   `rhythm.test.ts` compares `vocabulary.ts` against hand-copied literals, so it
   catches an edit to the vocabulary but not a schema change: add `MENTOR` to
   `AntagonistRole` in `schema.prisma` and the route rejects it with 400 while
   the database accepts it — pin still green. `apps/api` is the only package
   allowed to import both sides, so the comparison now happens there, across
   all five schema-backed Phase 9 enums.
3. **`MISSING_SPAN` was never asserted in any suite.** `spanOf(from, null)` is
   `null`, not `0`, so an open-ended TEMPORARY antagonist reports it — advisory,
   since `HARD_ANTAGONIST_PROBLEMS` excludes it. Changing `spanOf` to return 0
   would have silently turned an unknown span into a zero-chapter one with every
   test green. Now pinned at both levels.
4. **`checkCooldown`'s nearest-blocker selection was never exercised** — every
   history in both suites held exactly one same-type beat, so `>` versus `<`
   (nearest versus farthest) was indistinguishable. The back-fill test added in
   round one covers the future-beat direction; a two-beat case now pins the
   selection itself. Also added: the invalid-window branch (unreachable over
   HTTP since `putPolicy` refuses a non-positive window), an empty pattern
   sequence, a non-integer `chaptersSinceDrama`, the singular "step" wording,
   and the `MISSING_SPAN` unit path.

The constraint probe was also widened: it probed **one** violation shape per
CHECK, so a sibling shape whose refusal came from a different mechanism would
have left the CHECK inert for it undetected. It now loops over every refused
shape.

**Three findings were accepted deviations, not defects** — each was already
recorded in `docs/14-progress/CURRENT.md`, and the audit confirmed the record
matches the code:

- `PUT .../policies` takes `kind` in the body while `DELETE .../policies/:kind`
  takes it in the path. Internally split, but both are documented and pinned.
- There is no `PATCH .../antagonists/:id`; the surface is append-and-advance
  only, so a wrong `purpose` or span written at create time cannot be corrected
  through the API. Recorded as a deliberate Phase 9 ceiling.
- The repetition endpoint is `/narrative/patterns`, not the spec's
  `/narrative/repetition`. The behaviour exists; only the name differs.

### Third audit round (2026-09-30) — the CHECKs that did not check, and five refutations

> **Correction (same day, fourth round).** Refutation 1 below — the missing
> `bodyLimit` — was **wrong**, and the finding was real. It is left standing
> here with this note rather than deleted, because the mistake is the useful
> part: I measured the payload with short synthetic ids, got 0.79 MB, and
> concluded the transport could carry anything the schema allowed. Measured at
> the schema's *declared* maxima instead, `detectPatternBody` is 4.17 MB and
> `checkBeatBody` is 1.18 MB — both past Fastify's 1 MB default. The fourth
> round below records the fix.

A third pass over the same surface, this time reproducing every candidate
against a **live PostgreSQL** rather than reasoning about the code. Six
candidates went in; one survived. The other five are recorded here because a
refuted finding is evidence too — it is the reason no code changed for it.

**The one confirmed defect — both hand-written CHECKs accepted a blank
string (fixed in migration `20261005_phase9_blank_reason_fix`).**

`Antagonist_temporary_needs_purpose` and `NarrativePolicy_hard_requires_reason`
were written as `btrim("purpose") <> ''` / `btrim("hard_reason") <> ''`.
PostgreSQL's **single-argument** `btrim` strips only the ASCII space
(U+0020) — not tab, newline, CR, VT, FF, NBSP, ideographic space, BOM, NEL,
figure space, or narrow NBSP. Probed against a live database, a purpose of
`"\t"`, `"\n"`, `" "`, `"　"`, `"﻿"` or any mixture was
**ACCEPTED** while `"   "` was refused. The migration comment calls such a
row "unrepresentable here"; it was representable.

The consequence was a real malfunction, not a cosmetic one: a TEMPORARY
antagonist stored with a blank purpose is flagged `MISSING_PURPOSE` by
`validateAntagonistProgression` on every later read, and `MISSING_PURPOSE`
is in `HARD_ANTAGONIST_PROBLEMS` — so **the row could never be advanced
through its lifecycle again**. Legal to write, illegal to use.

Why it escaped: the constraint test's own cases were *named* "whitespace-only
purpose" and *named* "whitespace-only hard_reason", but passed only `"   "`.
The class was named and the class was not probed. That is the same failure
mode round two recorded for `MISSING_SPAN` — a test whose name asserts more
than its body does.

The fix replaces both with a POSIX class negated over the full blank set
`[[:space:]]` misses, keeping the `IS NOT NULL` arm (NULL satisfies a CHECK):
`x ~ E'[^[:space:]   ﻿\u0085]'`. The form was verified
against all 19 blank shapes and a set of non-blank controls before the
migration was written. A `DO $$` pre-flight now raises a named error if a
row already slipped in, so `ADD CONSTRAINT` cannot fail with a bare 23514
that names no row (ADR-0011 §2). The HTTP path was already safe — Zod
`.trim()` and JS `String.prototype.trim()` cover the same set plus U+3000 —
so this restores the CHECK to the backstop its comment always claimed to be,
for a direct write, a seed, or a migration.

Both suites now probe the whole class: `BLANKS` in the constraint integration
test carries 19 shapes, and the API test loops over 13.

**Five candidates refuted — no code changed.**

1. ~~**"The narrative routes are missing `bodyLimit`, unlike their siblings."**~~
   **WRONG — see the correction above.** The refutation rested on a 0.79 MB
   measurement taken with short synthetic ids rather than at the schema's
   declared maxima. At the declared maxima the payloads are 4.17 MB and
   1.18 MB, both over the 1 MB default, so the routes really did 413 a
   schema-valid body before Zod ran. Kept here as written, struck through,
   because a refutation that was itself wrong is the more instructive record.
2. **"`density` is read nowhere."** It is read — `assessDramaWindow` validates
   it against `DRAMA_DENSITIES` and returns `MALFORMED_POLICY` for anything
   else, which `putPolicy` turns into a 409. It carries no *behaviour*, which
   is a different claim, and one the file comment already makes: no rule
   consumes a density band, so no default is invented for it.
3. **"`hardness` is inert."** It is load-bearing: HARD without a reason is
   refused at the boundary and by the CHECK, and the column is what makes
   ADR-009's soft-by-default rule auditable. No rule *branches* on it yet —
   recorded below rather than fixed.
4. **"The DRAMA_GAP read path has no malformed-payload test, unlike
   COOLDOWN."** True, and now closed with one test — the sibling coverage
   really was asymmetric. Not a code defect; the service already returns 409.
5. **"`outcome` is accepted at any stage."** Refuted against the doc:
   NARRATIVE-RHYTHM.md says "Possible outcomes: regret, resentment, …" with no
   stage coupling, and the schema comment on `outcome` reads "Null until the
   arc closes" — a description, not a constraint. Inventing a
   `outcome`-requires-`DEFEAT` rule would be a HARD rule from a soft sentence,
   which is what ADR-009 forbids.

Also removed in this round: eight stray files at the repo root and two probe
test files (`apps/api/src/zz-*.test.ts`, `packages/database/tmp_probe*.mjs`)
left by earlier ad-hoc probing. All were untracked and unreferenced.

### Checks run

- `pnpm typecheck` — clean in every workspace, EXIT=0.
- `pnpm lint` — EXIT=0.
- `pnpm test` — **35 files, 739 passed / 1 skipped** (737 before this round).
  Vitest 5.0.2. Superseded by the fourth round below: **746 passed / 1
  skipped**.
- `apps/api/src/narrative.test.ts` — 48 passed (46 before; +2: the
  whole-blank-class purpose loop and the malformed DRAMA_GAP read path).
- `packages/narrative-rhythm` — 38 passed.
- Constraint probe (`packages/database/test/narrative-constraints.integration.test.ts`)
  — 11/11, with `BLANKS` now 19 shapes per constraint; the new migration was
  confirmed applied to the test database before the probes ran.
- `prisma migrate deploy` — the new migration applied cleanly to the dev
  database and to both test databases: **18 migrations applied, 0 failed or
  rolled back** in each, and `pg_get_constraintdef` confirms both CHECKs are
  the new regex form. Both constraints are hand-written SQL and deliberately
  absent from `schema.prisma`, so `migrate diff --from-migrations --to-schema`
  is not a meaningful drift check for them (it reports them as drift by
  design); the applied-migration ledger above is what was verified instead.


Not run: `apps/web` browser flows (no automated E2E runner exists).

### Fourth audit round (2026-09-30) — the refutations that were wrong, and three real defects

The third round's findings were re-verified adversarially — each candidate
handed to independent skeptics told to refute it. The result was not a
cleaner list but a shorter one: **two of my own refutations were wrong**, and
two further defects surfaced that no round had named. Three fixes.

**Defect 1 — the missing `bodyLimit` (refutation 1 of round three, reversed).**

The measurement that refuted this was taken with short ids (`beat-0`,
`underestimation-of-the-protagonist`), which is not the payload the schema
describes. At the declared maxima — `id`/`kind` 200 chars, `chapter` ≤ 100 000
— and with 3-byte CJK ids as the worst case a string field admits:

| route | declared maxima | ASCII | CJK |
|---|---|---|---|
| `POST /narrative/patterns` | 10 000 beats × 2 × 200 chars | 4 374 103 B | **12 382 103 B (11.81 MB)** |
| `POST /narrative/cooldown` | 5 000 beats × 200 chars | 1 235 272 B | **3 235 672 B (3.09 MB)** |

Fastify's default `bodyLimit` is 1 MB, and neither route overrode it, so a
payload the schema explicitly permits was refused with a 413 by the transport
**before Zod ever ran**. Fixed with `PATTERNS_BODY_LIMIT = 13_000_000` and
`COOLDOWN_BODY_LIMIT = 3_500_000`, each just above its CJK measurement, with
the measurement in the comment — the same shape `manifest-routes.ts` uses.
Confirmed load-bearing by removing the options and watching both new tests
flip 200 → 413.

**Defect 2 — `validBand` let `null` through and threw.**

`validBand` tested `band !== undefined`, which `null` satisfies. The payload
column is JSONB with no CHECK, so `typicalGap: null` — a shape a seed or a
direct write can store — reached `band.min` and threw a `TypeError` **out of a
pure function**. The error handler reports that as `{"error":"INTERNAL"}` with
a 500, on a request whose correct answer is a 409. Reproduced both in
isolation and end-to-end over HTTP (`NULL BAND STATUS: 500`, and the same for
the EXTENDED gap). Fixed by testing `typeof band === "object" && band !== null
&& !Array.isArray(band)`; both paths now answer 409, and both are pinned by a
test.

**Defect 3 — `assessScaleAppropriateness` iterated `standing.access` unguarded.**

Same 500 class, sibling path: `access` arrives from JSONB and can be `null` or
hold non-scale members, and the `for...of` plus the `access.length` in the
reason string both threw. The route's Zod schema forbids both shapes, which is
exactly why this was easy to miss — the guard is for the writes that do not go
through the route. Fixed with one `Array.isArray` narrowing reused for both
the loop and the reason.

**Defect 4 — `advanceAntagonistStage` was a check-then-act race.**

It reads `current.stage`, validates `[current, next]` against that read, then
writes with `where: { id }` — no stage predicate, no transaction. Two
concurrent advances both read the same stage, both pass the forward-only
check, and the loser's write lands on top of the winner's, **storing a
backward transition the rule exists to reject**. Fixed by writing through
`updateMany` with `stage: current.stage` pinned to the value the check
actually ran against; a zero count is a 409.

The regression test forces the interleaving rather than hoping for it: the
first advance's write is intercepted and parked while a second request reads,
validates and commits, then the parked write is released and must be a no-op.
Confirmed discriminating — with the predicate removed the test fails on
`expected 1 to be +0`, storing the backward stage. (The first attempt at this
test ran two `Promise.all` injects and passed *without* the predicate: Prisma
serialises them on one connection, so the race never happened. A concurrency
test that cannot fail is not a test.)

**Still refuted, re-checked.** `density` inertness, `hardness` inertness,
`outcome` at any stage, and the ADR-0009/ADR-0012 text — each re-verified and
each still not a defect. The three deferrals are recorded in `CURRENT.md`.

### Fourth-round checks run

- `pnpm lint` — EXIT=0.
- `pnpm typecheck` — EXIT=0 in every workspace.
- `pnpm test` — **35 files, 746 passed / 1 skipped** (739 before this round).
  Vitest 5.0.2.
- `apps/api/src/narrative.test.ts` — **53 passed** (48 before; +5: two
  null-band 409s, the forced race, and two over-default body sizes).
- `packages/narrative-rhythm` — **40 passed** (38 before; +2: null/array band,
  null/non-array `access`).
- Each of the four fixes was confirmed **load-bearing** by reverting it and
  watching the matching test fail — the body limits (413), the stage
  predicate (`expected 1 to be +0`), and the two guards (`TypeError`).

### Round note — a dispatched worker thrashed and shipped nothing

Task D (the API write surface above) was dispatched to an Orca worker and
returned **zero files**. Its terminal showed `Autocompact is thrashing: the
context refilled to the limit within 3 turns of the previous compact, 3 times
in a row`, then a completed turn with no `worker_done`. The dispatch was
fenced with `worker-stop` and the work done in the coordinator session
instead. The lesson is the same one the recovery reference states: an
`unverifiable` liveness verdict authorizes no action, and a *finished* turn
with no report is evidence of failure, not of success.

## M1 — NF-WF-001 revision contract (2026-10-01, documentation only)

Design round for the minimum revision/checkpoint/restore contract. No runtime
code, migration or package was created; NF-WF-001 is explicitly design-only.

### Deliverable

`docs/03-domain/STORY-VERSIONING.md` §Contract (C1–C11) with the architectural
decision in ADR-0014, the follow-on task in
`tasks/NF-WF-002-revision-foundation.md`, and the blueprint/index/plan
consistency edits.

### Review status — REVIEW_PENDING at the time, superseded below

**Historical (as of this design round).** The reviewer role was dispatched to an
Orca worker twice. Both attempts died on the inference gateway:
`API Error: 500 status code (no body)`, 10/10 retries exhausted each time,
terminal back at an idle prompt with no output. No independent review was
performed, so the task was **not** VERIFIED and NF-WF-002 was not a reviewed
dependency. Recorded in GAP-013 and GAP-016. The gateway later recovered and
both reviews ran — see "Independent review rounds" below.

### Coordinator self-review — five contract claims refuted against the schema

Because no reviewer ran, the coordinator ran an adversarial pass over the
artifacts against `schema.prisma` and the migration SQL. It refuted five
claims, all corrected in place. Full table in GAP-016; the substance:

1. **C1 did not classify `novels`.** 31 covered + 24 outside = 55, but the
   schema has 56 tables. `novels` is now outside scope with a reason, and C1
   classifies all 56 exactly once (verified by set-diff on `@@map` names).
2. **C4 ordered the head `UPDATE` before `INSERT revision`.** `head_revision_id`
   is a non-deferrable FK to `revisions(id)` (zero `DEFERRABLE` in the whole
   migration set), so that order fails outright. Worse, insert-first collides
   on `UNIQUE (branch_id, number)` and surfaces a Prisma `P2002` instead of the
   promised 409. Corrected to lock the head `FOR UPDATE`, compare, insert, then
   set the head — which also makes the number and the comparison atomic.
3. **C7 deleted non-PUBLISHED `chapters` rows.** `chapter_versions.chapter_id`
   is `ON DELETE CASCADE` (`20260924_phase2_manuscript/migration.sql:78`), so
   that delete destroys the immutable version rows C1 promises to preserve —
   and a PUBLISHED row exempted from the delete would still collide on
   `UNIQUE (novel_id, number)`. C7 now exempts the manuscript pair entirely and
   rewinds `chapters.currentVersionId` in place.
4. **C7 named a "compatibility marker" that exists in no table.** Replaced with
   the real behavior: the skipped PUBLISHED pointer is recorded in the change
   set and surfaced to the author as a conflict.
5. **Counts were wrong in four places.** C2 lists 8 tables and 5 enums, not the
   "six tables, four enums" claimed in C8/C11 and NF-WF-002; C5 has 8 rows, not
   "All six". Corrected everywhere.

One question the pass could not answer was promoted to a contract rule rather
than left as a placeholder: chapter identity when a later delete and re-create
reuses a `chapters.number`. Restore has no correct move — re-inserting the
snapshot row collides on `UNIQUE (novel_id, number)`, and updating in place
attaches the pin to the wrong chapter — so C5/C7 now refuse it by name, and
NF-WF-002 must implement preview detection plus the negative test.

### Checks actually run

- Set-diff of C1's covered and outside lists against `schema.prisma` `@@map`
  names: 56/56 classified, no duplicate, no omission.
- `grep -ric deferrable packages/database/prisma/migrations/` → 0 matches
  (supports finding 2).
- FK-action read of `20260924_phase2_manuscript/migration.sql:69–84` and the
  `canon_facts`/`canon_fact_sources`/`outline_nodes`/`story_events` FK
  constraints (supports finding 3).
- Relative-link resolution over every changed file → all resolve.
- C5 row enumeration → 8 data rows, matching the corrected text.

Not run: any runtime test, migration, typecheck or build. NF-WF-001 is
documentation-only and none of its acceptance criteria are runtime criteria.
Zero selected tests is the correct result here and it does not pass G-01 —
G-01 belongs to NF-WF-002.

### Independent review rounds — both CHANGES_REQUESTED, not VERIFIED

The gateway recovered later the same day (`POST /v1/messages` → 200 SSE;
`/api/health` `ok:true`, `failedProviders:[]`), and two independent reviews ran.

**Round 1** — dispatch `ctx_c4dcc5969164`, task `task_ccf5182daca8`, verdict
CHANGES_REQUESTED: 3 P1, 3 P2, 3 P3. It confirmed C1 coverage (56/56), the C4
CAS order, the C8 baseline split and C6 dedup as VERIFIED. All eight actionable
findings were re-verified against source and corrected; the ninth needed no
change.

**Round 2** — dispatch `ctx_db14a16c6968`, task `task_ac1e018f9e8d`, ~3h43m,
verdict CHANGES_REQUESTED. It **VERIFIED all eight round-1 corrections** and
independently re-confirmed C1/C4/C8/C6, then raised five new findings: one P1
(NF-WF-002 allowed paths omitted the four services owning C3's LOW operations,
making the task invariant unimplementable as scoped), one P2 (C7 never stated
that restore permanently discards post-boundary covered-row content, which
`change_set_items` cannot recover — no before-image), and three P3 (an enum
count, an overstated Prisma limitation, a stale test-matrix row). All five are
corrected.

The two rounds found **disjoint** defect sets — round 2 found nothing in the
four areas round 1 had verified, and vice versa.

**Round 3** — dispatch `ctx_a28a8bb47dc7`, task `task_52d7a3338dbb`, ~1h9m,
verdict **VERIFIED**. Scoped by design to the five round-2 findings plus a
regression sweep, so that the regressive review loop would close rather than
extend. All five corrections VERIFIED; every regression check passed — C1
set-diff (31 covered + 25 outside = 56 = all `@@map` names, zero
overlap/missing/phantom), C4 CAS order, C8 baseline split, C6 dedup, all
relative links resolve, no placeholder tokens.

Round 3 correctly returned `MODEL_UNVERIFIED` for its own identity rather than
asserting the requested model, and noted that `/v1/models` listing a `glm53`
entry is not per-request backend proof. That is the right call; GAP-013 stands.

### Verification revision and post-verification delta

The VERIFIED verdict covers HEAD `45d2035`. Two later commits touch files, and
the contract itself is unchanged by both:

- `c78b3c5` — `CLAUDE-CODE-CONFIGURATION.md`, `ISSUES-AND-GAPS.md`,
  `tasks/NF-WF-001-rereview-request.md` (the round-3 brief). None is a
  contract artifact.
- The commit recording this round — `test-matrix.md`, `ISSUES-AND-GAPS.md`,
  this file, and one **additive note** in
  `tasks/NF-WF-002-revision-foundation.md`.

That note is the only post-verification change to a reviewed artifact. It
records round 3's own out-of-scope observation (C3 lists "scene CRUD" but no
production path writes `scenes`) and adds no contract content. Stated plainly
rather than folded into the verdict: the verification covers `45d2035`, and
NF-WF-002 differs from that revision by this note.

### Consequence

The contract is frozen and VERIFIED. NF-WF-002 is unblocked and is the next
READY task. Reviewer backend identity remains unproven across all three rounds
(GAP-013) — that is an evidence-quality caveat, not a defect in the contract.

Reviewer identity is unresolved. Round 1 self-reported
`bansosmontera/deepseek-v4.1-flash` from `ANTHROPIC_DEFAULT_HAIKU_MODEL`; round
2 self-reported `glm-5.3-flash` from `ANTHROPIC_DEFAULT_FABLE_MODEL`; round 3
was dispatched with an explicit `--model bansosmontera/glm-5.3-flash` (present
in the gateway catalog) and correctly returned `MODEL_UNVERIFIED`. The two
self-reports are the harness tier aliases, not the serving model, so the
requested `glm-5.3-flash` is still unproven (GAP-013).

Not run in either round: any runtime test, migration, typecheck or build. Both
reviews were read-only source inspection.

## M1 — NF-WF-002A fixture compatibility (2026-10-02)

### Deliverable

The ten API test files NF-WF-002A's contract authorizes now seed their novels
through the production path instead of a raw `db.novel.create`:

```text
createPlatformServices({ db, audit: createAuditService(db) }).createNovel({
  actorUserId, workspaceId, title, slug,
})
```

Twelve sites: one seed helper each in `canon`, `character`, `manuscript`,
`narrative`, `planning`, `story`, `orchestrator`, `ai`, `definitions`,
`retrieval` (10), plus the additional-novel sites in `definitions.test.ts`
("refuses to run a workflow bound to a different novel") and
`retrieval.test.ts` ("keeps a novel-scoped reference out of a query for a
different novel"). The inventory in GAP-017 was reconfirmed by source search
before editing and matched: 12 valid + 1 deliberate negative.

Exact-diff identity (final, post-review-fix): `sha256
d775ad1fd867098b60072e359449c780175b6b8add26582387d51acb8f65edd8`, 439 diff
lines over 10 files. The pre-review identity was `sha256
885dabaa56abd381302d8dc89bb829ea37f97b91e9204a1c58de31c8cfbf2467` (417 lines);
the two narrative.test.ts review fixes below account for the difference. No
production service, route, schema, migration, lockfile or root constitution was
touched. `revision.test.ts` is unmodified.

### Why the fixture had to change

NF-WF-002 added C8's create-time baseline to `createNovel`: a novel now always
has exactly one `main` branch whose non-null head is the first `BASELINE`
revision, with an empty change set and no snapshot. A raw `db.novel.create`
therefore seeds a state the product cannot produce, and the first covered
mutation's head CAS refuses it by name with 409. The repair is the contract
working as specified; the seeds were asserting the pre-C8 world. Lazy
branch creation in `advanceHead` was refused (C8 names and forbids it), and no
test was skipped, deleted or weakened.

### Two edits beyond the seed swap

Both are fixture-internal and both are called out rather than buried, because
one of them is the only place this patch could have concealed a regression:

1. `manuscript.test.ts` audit-trail test — the expected action array is now
   `["chapter.created", "chapter.deleted", "chapter.saved", "novel.created"]`.
   `createNovel` writes its own `novel.created` row as setup. The exact-equality
   shape was kept rather than loosened, and the `actorUserId` loop over every
   row still holds. The three chapter rows are the behavior under test.

2. `narrative.test.ts` concurrency race test — NF-WF-002 moved the guarded
   `antagonist.updateMany` inside `db.$transaction`, so the service calls the
   transaction's delegate (a different object with a different `updateMany`
   function) and the old `vi.spyOn(db.antagonist, "updateMany")` parked nothing
   (`staged` stayed null — the test failed on `expected null not to be null`,
   not on a lost assertion). The spy now wraps `db.$transaction`, swaps
   `tx.antagonist.updateMany` for a version that holds its promise open, and
   runs the real write on release. Assertions are unchanged: parked `count 0`,
   stored stage `DEFEAT`, first request 409.

### Checks run

On the preserved NF-WF-002 diff at HEAD `811e7e68debdd7550b5516df96637d227d10fdf6`,
scratch PostgreSQL `127.0.0.1:5433` (GAP-020), repo `.env` unmodified:

```text
canon.test.ts before repair          exit 1  44 failed | 12 passed (56)
db:test:prepare                      exit 0  all migrations applied from empty
ten-suite targeted run               exit 0  10 files passed, 288 passed (288)
revision.test.ts                     exit 0  1 file passed, 25 passed (25)
full API suite                       exit 0  15 files passed, 338 passed (338)
pnpm lint                            exit 0  no output
pnpm typecheck                       exit 0  every package Done
pnpm test (root)                     exit 0  38 files passed, 796 passed | 1 skipped (797)
```

The single root skip is the pre-existing
`describe.skipIf(!process.env.WORKER_IT_REDIS_URL)` case at
`apps/worker/src/worker.test.ts:257`; this task added none. The API count is
338, equal to the pre-existing inventory — not the older 313, which was the
pre-diff baseline and is not a target to shrink back to.

### Environment note (GAP-020, re-verified)

`127.0.0.1:5432` refused the connection with nothing listening, and
`docker compose up -d postgres` still failed with `Bind for 0.0.0.0:5432
failed: port is already allocated` on an endpoint created 13 hours earlier.
The workaround was again an isolated `nf-pg-5433` container on `-p 5433:5432`
mounting the repo's own `novelforge-ai_postgres_data` volume. Repo credentials
failed against 5432 (`28P01`) and succeeded against 5433.

### Review status — APPROVE, two findings fixed

Two independent reviewer workers reviewed the exact fixture diff and both
returned **VERDICT: APPROVE**.

- `nf-wf-002a-reviewer` (first dispatch) — APPROVE. It independently read the
  Prisma 7.10 runtime source and confirmed that model delegates are proxies
  whose `get` trap returns written keys before descriptors, so
  `db.antagonist !== itx.antagonist`; this is why the pre-repair
  `vi.spyOn(db.antagonist, "updateMany")` never fired. It could not execute the
  suites (no database in its environment) and said so. It also noted
  `packages/database/test/platform.integration.test.ts:114` still raw-creates a
  novel, but that test only exercises the workspace-delete cascade and is
  outside this task's scope.
- `nf002a-review-2` (second dispatch; the first hit a context limit) — APPROVE
  with two non-blocking findings, both fixed in `narrative.test.ts`:
  1. The race test's header comment misstated the intermediate state. The
     parked write has not executed, so the row is still `FRICTION` and the
     second request commits `FRICTION → DEFEAT`. Comment corrected.
  2. The held-open Prisma interactive transaction spans a second HTTP round
     trip, so the 5 s default transaction timeout could abort it on a slow
     machine and surface as a Prisma timeout rather than the assertion under
     test. Fixed by passing `{ timeout: 30_000, ...opts }` to the real
     transaction, with a comment noting the row is not locked while parked.

Reviewer routing: the requested reviewer identity was `glm-5.3-flash`. Neither
reviewer's backend model identity could be proven from inside the session, so
this remains GAP-013 — recorded honestly, not asserted. No fabricated model
receipt is claimed.

Q6 (the race test is load-bearing, not decorative) was proved empirically, not
argued: removing `stage: current.stage` from the guarded `where` in
`apps/api/src/services/narrative.ts` made the suite fail
`AssertionError: expected 1 to be +0` (`1 failed | 52 passed (53)`); restoring
the predicate returned it to `53 passed (53)`. The production file was restored
and verified at line 592; `git diff --stat` over it is unchanged from NF-WF-002.

GAP-017 stays VERIFY_PENDING, not CLOSED: this child's review is complete, but
NF-WF-002 / G-01 parent acceptance is unchanged and belongs to NF-WF-002B.

### Handoff to NF-WF-002B

NF-WF-002B should treat the ten fixture files as settled inputs and review the
NF-WF-002 implementation diff itself, resolving GAP-019's five contract
questions. NF-WF-003 stays gated by parent acceptance.

### Checkpoint state — Engram unavailable, fallback handoff (GAP-021)

The SessionStart/resume hook reported that no authoritative registered runtime
identity is available, and that agent-attributed memory writes must stop until
the host re-registers the runtime session. Per the constitution's Engram rule
and GAP-021, **no Engram checkpoint was written for this task boundary**, and no
session ID was invented, derived or reused. The previously used session ID is
deliberately not reproduced here.

This progress entry plus the NF-WF-002A task contract are the fallback handoff.
They carry everything NF-WF-002B needs: the final diff identity, the exact
commands and their selected counts, the two reviewer findings and their fixes,
and the untouched negative fixtures. GAP-021 remains open; close it once the
host hook re-registers a runtime identity and the checkpoint can be written
under it.

## M1 — NF-WF-002B contract clarification and integrated review (2026-10-02)

Baseline: HEAD `811e7e68debdd7550b5516df96637d227d10fdf6`, working tree carrying
the complete NF-WF-002 + NF-WF-002A diff. Documentation-only task; no production
service, route, schema, migration, lockfile, `.env` or root constitution was
touched. The whole NF-WF-002B diff is three Markdown files:

```text
docs/03-domain/STORY-VERSIONING.md     | 260 +++++++-
docs/04-data/DATA-MODEL-BLUEPRINT.md   |  12 ++
docs/implementation/ISSUES-AND-GAPS.md | 269 +++++++-
```

Exact-diff identity (**post-correction**, after the review's four findings were
applied): `sha256
fd7ae2911a0aab9cfcf63c2b30fe38f06eeaf39a7c19434e5bbd14683e079760`, 648 diff
lines over those three files (`git diff --no-color -- <the three paths>`).
`STORY-VERSIONING.md` is `sha256
fd72c4490265e8f4bbb85acf93cba273f68dd8eb313619856538fb1dbf0e2076` and
`ISSUES-AND-GAPS.md` `sha256
3f6d14043f353b1655dafd68e29823948dd59094d05f252be9db3de5aa00decc`.
`DATA-MODEL-BLUEPRINT.md` is unchanged at `sha256
e21e268ab8d20cabe8ee2f73b95687842bd437062c28a64ae081bad33fa2546b` — the
review found nothing in it. The pre-correction identity was `a3ae218c…`
(607 lines); the 32 added lines are the corrections described below plus the
review-history section in NF-WF-002C.

**Honest note on review hygiene.** The reviewer was dispatched against
`c9fc357e…` (599 lines) and the tree then moved twice under it: first
`ade1cc1f…` (599 lines, owner/closure-column clauses for the three new gap
rows), then the final `a3ae218c…` (607 lines, the execution-priority split).
Reviewing a moving diff is a real hazard and it was avoidable — the three
corrections were all mine and all discoverable before dispatch. Each superseded
identity and the exact delta were sent to the reviewer rather than left as a
silent mismatch, and no file in the diff is edited again while the review runs.
Nothing in C12.1–C12.6, the substantive deliverable, changed after dispatch.

### What was produced

`docs/03-domain/STORY-VERSIONING.md` gains **§C12 — Clarifications resolved
after implementation**, six subsections disposing of GAP-019's five questions,
plus two edits inside the frozen contract body:

- **C3's HIGH row** now names `checkpoint.create` and points at C12.2.
- **C4** gains a paragraph explaining why the `INSERT snapshot` line's position
  is load-bearing, pointing at C12.6 and GAP-024.
- **C11** gains a "Correction (NF-WF-002B)" note withdrawing the unobserved
  "always `null`" claim; the original text is kept because the error is part of
  the record.

`docs/04-data/DATA-MODEL-BLUEPRINT.md` gains the `snapshots.revision_id`
uniqueness / checkpoint-pin rule and the "`domain_outbox` is named and does not
exist" statement.

`docs/implementation/ISSUES-AND-GAPS.md` gains the GAP-019 disposition, three
new rows — **GAP-022** (no mutation route accepts a client head expectation),
**GAP-023** (`domainEventSchema.revisionId` has no producer or consumer),
**GAP-024** (HIGH `PRE_MUTATION` snapshots capture the post-mutation image) —
and a `GAP-024 detail` section.

### Dispositions of GAP-019

1. **`expectedHeadRevisionId` tri-state** — documented as contract (C12.1):
   omitted asserts nothing, `null` asserts "no head exists", a uuid compares;
   the `SELECT … FOR UPDATE` runs in all three cases, so the CAS is never
   optional. Verified against `advanceHead` and the route's
   `=== undefined ? {} : {…}` spread. **Newly named, previously unowned:** no
   C3 *mutation* route accepts a client head expectation, so C4's
   "the caller re-reads rather than silently retrying" is unreachable for a
   mutation → **GAP-022**.
2. **`checkpoint.create` is HIGH** (C12.2). The earlier LOW-with-checkpoint
   reading argued from *invalidation*; C3's class decides *capture*, and the
   operation whose entire purpose is to capture a snapshot is the clearest
   member of the capturing class. `impact.ts` already classified it HIGH and
   `story-versioning.test.ts` already asserted it — **this corrects the prose,
   not the code**, and it is therefore not a new architectural decision and
   needs no new ADR.
3. **Pinning** (C12.3): explicit capture pins `NEW`; a HIGH mutation's mandatory
   capture pins `PREVIOUS`; the snapshot attaches to the pinned revision;
   `snapshots.revision_id`'s `@unique` makes reuse of an existing snapshot
   mandatory rather than optional. Worked example R42–R47 added.
4. **Events** (C12.4): the "always `null`" claim is **withdrawn** as an
   inference from nullability. Inspection finds no producer and no consumer of
   `domainEventSchema`, and `domain_outbox` absent from the schema. No
   integration claimed in either direction → **GAP-023**. `events.ts` was not
   edited.
5. **Test naming** (C12.5): confirmed consistent with the repository convention
   (`rhythm.test.ts`, `scale.test.ts`, `canon.test.ts`, `events.test.ts`,
   `chunk.test.ts`; no `index.test.ts` anywhere). Closed.

### The defect this review found — GAP-024 (P1)

C4's statement order puts the snapshot insert before the mutation's own writes,
and `advanceHead`'s doc comment states it "MUST be called inside the caller's
transaction, before the caller's own writes". Four HIGH call sites violate it:
`proposal.approve` (`canon.ts`), `outlineVersion.approve` and
`outline.supersede` (`planning.ts`), and `chapters.import` (`manuscript.ts`) —
each writes first and calls `advanceForMutation` afterwards. `captureSnapshot`
reads the live tables when it runs, so their `PRE_MUTATION` snapshot is a
**post**-mutation image. `applyRestore` has the same ordering.

Measured by probe against the running system, not inferred from the contract:

```text
FACTS BEFORE APPROVE: [{"predicate":"is-alpha","objectText":"true","status":"ACTIVE"}]
FACTS AFTER APPROVE:  [{"predicate":"is-alpha",...},{"predicate":"wields","objectText":"the crown","status":"ACTIVE"}]
SNAPSHOT canon_facts: [["is-alpha","true","ACTIVE"],["wields","the crown","ACTIVE"]]
PRE_MUTATION snapshot row count: 2 | live after: 2 | live before: 1
PROBE2 preview canon_facts counts: {"added":0,"removed":0,"retained":2}
PROBE2 facts AFTER restoring the PRE_MUTATION checkpoint: both ACTIVE
PROBE2 VERDICT: the approval was NOT UNDONE (defect)
```

The existing suite cannot catch this: `revision.test.ts`'s one `PRE_MUTATION`
assertion checks the pin (`revisionId`), `snapshot.revisionId`,
`formatVersion` and `byteSize > 0` — the metadata is *correct*, and only the
payload is wrong. The missing assertion is a payload-content check.

**Not fixed here** — NF-WF-002B's scope forbids production code changes. A
bounded follow-up contract was created: `tasks/NF-WF-002C-premutation-ordering.md`.
All probe files were removed; `apps/api/src/revision.test.ts` is byte-identical
to its pre-probe backup (`cmp -s`), and no production file differs from
NF-WF-002's reviewed state.

### Gates

No gate was rerun for NF-WF-002B itself: the diff is three Markdown files, and
the implementation under review is unchanged from the state whose gates were
already green. The receipts on the reviewed implementation, run immediately
before this task's documentation edits, are recorded under G-01 and in the
NF-WF-002A entry above: full API `15 passed (15)` files / `338 passed (338)`
tests exit 0; root `pnpm test` `38 passed (38)` files / `796 passed | 1 skipped
(797)` exit 0; `pnpm lint` exit 0; `pnpm typecheck` exit 0. Markdown-only checks
run here: balanced fences, resolvable relative links from the three edited
files, and `git diff --check` clean.

### Review status

Independent review of the exact 002B documentation diff was dispatched to a
reviewer worker, scoped to falsify each of the seven substantive claims against
source rather than to check the prose — in particular that all four HIGH call
sites named in C12.6 really do write before advancing, and that the C3 HIGH row
count is right. Requested reviewer identity `glm-5.3-flash`; the backend model
identity is not provable from inside the session (GAP-013), and the reviewer was
asked to report `MODEL_UNVERIFIED` rather than assert it. **Verdict returned: CHANGES_REQUESTED**, with four findings, all confirmed
against source and all accepted — none disputed. The reviewer verified all four
HIGH call sites by reading them in statement order (C12.6's table is correct on
every row) and confirmed C12.1, C12.2, C12.3's pin logic, C12.4 and the "eight
C3 HIGH rows" count with no finding. The four findings, and what they changed:

1. **The fix instruction was wrong, and wrong in the direction that hides the
   defect.** §C12.6 said the required order was "check the CAS first, then
   advance, then write". But the CAS *is* a covered write:
   `canonProposal.updateMany` (`canon.ts:1213`) writes `canon_proposals` and
   `outlineVersion.updateMany` (`planning.ts:586`) writes `outline_versions`,
   both in `COVERED_TABLE_NAMES` (`snapshot.ts:76`, `:94`). That order yields a
   snapshot pre-mutation for `canon_facts` and **post**-mutation for
   `canon_proposals` — and the `canon_facts`-only assertion the same paragraph
   prescribed would have passed it. The race justification for the old wording
   was also unnecessary: a losing CAS throws inside the transaction, so rollback
   removes the checkpoint, revision, head move and snapshot together. Corrected
   in §C12.6 and in NF-WF-002C's invariant 2, and the assertion requirement now
   covers every table the operation touches.
2. **`applyRestore` is not affected, and both §C12.6 and NF-WF-002C claimed it
   was.** `advanceHead` is at `revisions.ts:1070`, before the DELETEs at `:1095`
   and re-inserts at `:1104`; the code's own comment states the intent. A READY
   contract naming a correct site as violating is how a correct path gets
   broken, so the false claim is recorded as corrected rather than deleted.
3. **§C12.3's worked example had the reuse step unreachable.** It inserted a LOW
   revision (`R44 proposal created`) between the explicit checkpoint and the HIGH
   mutation — but LOW operations advance the head too (C3: "both classes cross
   the mutation boundary"), so the `PREVIOUS` pin would land on a revision with
   no snapshot. The example now matches the shape `revision.test.ts:1127`
   actually exercises.
4. **NF-WF-002D omitted the existing precedent.** `applyRestore` already carries
   a server-pinned `expectedHeadRevisionId` (`revisions.ts:1014-1019`, `:1073`);
   the task now cites it.

The shape of this review is worth recording: **a correct diagnosis with an
incorrect remedy.** The defect GAP-024 is real and the four-site table is right,
but the fix as first written would have produced a partial repair that a
passing test endorsed. Had the contract been dispatched un-reviewed, the
implementer would have implemented the wrong half correctly. That is the case
for the reviewer inspecting the exact diff rather than a summary — and for
verifying a finding against source before acting on it, which is why all four
were re-read here before being accepted.

### Round 2 — re-review of the corrected diff: APPROVE

The same reviewer re-reviewed the corrected §C12.3/§C12.6 and the three
follow-up contracts. Verdict **APPROVE**, against the current tree:
`STORY-VERSIONING.md` `fd72c4490265e8f4bbb85acf93cba273f68dd8eb313619856538fb1dbf0e2076`,
`NF-WF-002C` `87d88cb98832627a4f7485647fe6f72b619536ef4c05a75e17c08e98f26ec890`,
combined diff `fd7ae2911a0aab9cfcf63c2b30fe38f06eeaf39a7c19434e5bbd14683e079760`
(648 lines). Round-2 findings 6 (the C12.3 off-by-one) and 7 (invariant 5
under-specified) are resolved; round 3 raised none.

It verified three claims rather than accepting them, and one of the three
changed the artifact:

- **The `R42…R46` arithmetic is sound.** `createNovel` writes the baseline with
  `number: 1` explicitly (`platform.ts:405-416`, `origin: "BASELINE"`,
  `parentRevisionId: null`) and sets the head to it in the same transaction, so
  five operations after the baseline really do land at the fifth revision. The
  `R42` label is the conventional "novel N at head" framing C10 already uses
  (`STORY-VERSIONING.md:618`), and nothing in the example asserts the baseline's
  number is 42.
- **GAP-024 cannot change *which* revision a reused snapshot attaches to.**
  `captureSnapshot` is called only inside the `else` branch at
  `revisions.ts:391`, i.e. only when the `findUnique({ revisionId: pinnedRevisionId })`
  lookup at `:384` returns nothing. Reuse therefore skips the capture entirely —
  the defect corrupts the *image* of a newly created snapshot, never the pin.
  That is why the reuse test at `revision.test.ts:1127` is green and will stay
  green. This is a genuine limit on GAP-024's blast radius and it is now stated
  in §C12.6.
- **Option 2 of invariant 5 does not need a new export.** `changeSetId` is
  already public on `AdvanceHeadResult` (`revisions.ts:118`, returned at `:437`;
  `advanceForMutation` returns the same type at `:453`), so the append is a
  second `tx.changeSetItem.createMany({ …, changeSetId: head.changeSetId })`.
  The contract's "new export or a small second write" overstated the cost and is
  corrected to the second write alone — an implementer sent looking for an export
  to add would have found none and improvised.

It also confirmed with no finding: `gate`/`gateProposal` are read-only and run
before `db.$transaction`, so no uncovered write precedes the advance; and all
four sites pass `expectedHeadRevisionId: undefined`, so moving the advance
changes no CAS comparison and cannot alter the refusal behaviour asserted by the
lost-race negative.

**Reviewer identity is MODEL_UNVERIFIED.** The reviewer reports that its
environment names `bansoskenari/deepseek-v4-1-flash` and that this is a tier
alias rather than backend proof. No GLM receipt is claimed and **GAP-013 stays
open**; the review is recorded as an independent review by a harness worker of
unverified backend identity.

**The final APPROVE, and its limit.** The re-review of the caveat delta returned
**APPROVE** with no overreach: `:391` is inside the `else` gated by the `:384`
`findUnique`, and the "never *which* revision" claim holds **globally**, not just
on the reuse path, because `pinnedRevisionId` is fixed at `:375-376` *before* the
capture and is both the lookup key (`:385`) and the value written by
`tx.snapshot.create` (`:399`) — so GAP-024 shifts *when* the capture runs, never
the id the snapshot is filed under. The reviewer added one honesty boundary of its
own: it confirmed the *mechanism* that keeps the reuse test green but **did not
re-run the test**, so the greenness is this session's receipt (API `338 passed
(338)`, run immediately before the docs work), not the reviewer's. That receipt is
what licenses the sentence; the reviewer's contribution is the reason it is true.

**Three post-approval edits to `ISSUES-AND-GAPS.md`, re-reviewed and corrected.** The final APPROVE covered `ISSUES-AND-GAPS.md` at `3f6d1404…`. After it, and
in this order, the file gained: (1) the GAP-019 status cell flipped
`CLARIFIED / REVIEW_PENDING` → `CLARIFIED / APPROVED` (two occurrences), the
transition the row's own "next owner" field routes to "NF-WF-002B's own review";
(2) a "Review closed 2026-10-02" clause in the GAP-019 detail cell recording the
CHANGES_REQUESTED → APPROVE verdicts, the reviewed artifacts' hashes and the MODEL_UNVERIFIED
reviewer; (3) the GAP-021 row's re-observation boundaries extended from "002A and
002B" to include the 002C-preparation boundary. Current content hash
`d3282c35…`.

These were submitted for review rather than waved through, and the reviewer
returned **CHANGES_REQUESTED** on one clause — correctly. Edit 2 had pinned the
approval to "the frozen identity `c60fef9c…`", which is false twice over: that
hash is no longer derivable from the tree, and worse, it is **self-referential**.
`ISSUES-AND-GAPS.md` is itself one of the three files in the diff whose hash the
row cites, so citing the combined hash changes it — including the edit that would
correct it. There is no fixed point, and any value written there is stale the
moment it is written. The row now pins the **reviewed artifacts** instead — and the re-review showed
one artifact was still too few: three of the four findings' corrections landed
outside `STORY-VERSIONING.md` (findings 1 and 2 also in `002C` invariants 2 and 4,
finding 4 in `002D` only), so a reader recomputing only `73e3c9f5…` would not
detect a later edit to `002C` invariant 2, which carries the load-bearing
correction. The row now names all three:
`docs/03-domain/STORY-VERSIONING.md` `sha256 73e3c9f5…`,
`tasks/NF-WF-002C-premutation-ordering.md` `sha256 8fd083eb…` (labelled an
"as reviewed" receipt, since 002C is READY and its review-history section is
appended on execution) and `tasks/NF-WF-002D-mutation-head-expectation.md`
`sha256 640f9698…`. None is a register file, so none moves when the register
does. The reviewer also tightened
"review of the §C12 diff" to "the §C12 diff and the follow-up task
contracts", because finding 4 was in `NF-WF-002D`, not §C12.

Edit 3 had a different defect: it extended the GAP-021 **row** to three
boundaries while the GAP-021 **detail** section at `:436` still named only 002A,
so row and detail disagreed. The detail now matches, and it carries an explicit
scope note — the 002A/002B/002C boundary history is asserted from this session's
hook output and progress entries, **not** from an independent receipt, and the
reviewer was right that it could verify only the current session's hook.

Edit 1 (the status flip) the reviewer accepted as accurate and above threshold,
since a status flip asserts a verdict and the reviewer is that verdict's evidence.
Its threshold ruling is recorded here as the reviewer stated it: **a claim that
asserts an independent review verdict, or that a reader would use to verify one,
needs review** — which is why the status flip and the hash pin earned reads;
**pure bookkeeping does not** — a boundary list, or a status the row's own
next-owner field prescribes — and the boundary edit crossed the line only because
it desynced from its own detail section. With the three-artifact pin applied, the
reviewer's instruction is explicit: mechanical re-pins, milestone labels and
register bookkeeping go in without it, and it should be asked again only for a new
semantic claim about the code or a new verdict. That threshold is recorded so the
next session inherits the rule rather than re-deriving it from a review loop.

Final identity after the corrections: `89edc9b9…`, 654 lines (the three
corrections added 3 net lines over the 651). `STORY-VERSIONING.md`
`73e3c9f5…` and `DATA-MODEL-BLUEPRINT.md` `e21e268a…` remain untouched
throughout.

**The APPROVE's scope, stated by the reviewer rather than inferred.** Asked
whether its verdict applied to the current diff or to the stale tree it had
partly read, it answered: the verdict applies to the current diff, **scoped to
"changed regions re-read in the current tree; unchanged regions unchanged by
hash."** In the round-2 pass it re-read the two changed regions — §C12.3's
corrected example and invariant 5's new options — plus `revisions.ts:354-367`,
`AdvanceHeadResult`
and the `canon_facts.id` default; it did **not** re-read all 648 lines, relying
instead on the unchanged regions' file hashes matching the passes that did read
them. That is an honest and precise boundary, and it is recorded because a
verdict's scope is part of the verdict: "APPROVE" without it would have been
read here as line-by-line coverage of the whole artifact.

**The delta, and its re-review.** Acting on that same verdict's note that the
§C12.6 reuse caveat "is accurate and worth keeping", the caveat was strengthened
with the mechanism the reviewer verified — `captureSnapshot` runs only in the
`else` at `revisions.ts:391`, guarded by the `findUnique` at `:384`, so the defect
corrupts a snapshot's image and never its pin. That hunk is 3 removed / 6 added (an earlier note here
said "three lines replaced", which undercounted the added side), taking the diff
to `c60fef9c8244f2d66b5489de2c1259d7595c6862453336ca3fdf1b8b0990ac18` (651
lines = 326 + 23 + 302). A bounded re-review of exactly that delta returned
**APPROVE**; at that moment the combined identity was `c60fef9c…` / 651 lines and
`fd7ae291…` was superseded. (Both are historical now — see the register edits
below, which move it again, and which is why the durable receipt cited in the
register is the artifact hash rather than a combined one.)

The two files the reviewer did not re-read are provably unchanged across the
delta, and the proof is the reviewer's own two computations rather than my
assertion: it reported `DATA-MODEL-BLUEPRINT.md` `e21e268a…` and
`ISSUES-AND-GAPS.md` `3f6d1404…` in the approved pass against `fd7ae291…`, and
reported the **same** two values again against `c60fef9c…`. A hash computed at
both ends of the interval and matching is the evidence. The reviewer's caution
that it could not prove this from the tree alone was right in principle — an
uncommitted working-tree state leaves no git object — and the proof here rests on
its own earlier message rather than on the tree. Only `STORY-VERSIONING.md` moved
(`fd72c449…` → `73e3c9f5…`).

**Two review-hygiene lapses are recorded, not omitted.** The reviewer was
dispatched against `sha256 a3ae218c…` (607 lines) and the diff was then edited
again, ending at `fd7ae291…` (648 lines) — every superseded hash was disclosed to
the reviewer, but the round-2 pass began against a tree that had moved. And the
reviewer's round-2 message carried a stale hash pair in its first half and the
current pair in its second; the mismatch was raised and it confirmed the current
values. Neither lapse changed a finding, and the APPROVE was re-issued against
the then-current `fd7ae291…` identity. The lesson is procedural: freeze the diff before
dispatching, and re-dispatch after every edit, rather than editing under an open
review and reconciling afterwards.

### Checkpoint state — Engram unavailable, fallback handoff (GAP-021, re-observed)

The SessionStart/compact hook again reported that no authoritative registered
runtime identity is available and that agent-attributed memory writes must stop
until the host re-registers. Per the constitution's Engram rule and GAP-021,
**no Engram checkpoint was written at this boundary** and no session ID was
invented, derived or reused. This entry plus the NF-WF-002B task contract are
the fallback handoff; they carry the diff identity, the five dispositions, the
GAP-024 evidence and the remaining issue IDs (GAP-013, 017, 018, 020, 021, 022,
023, 024).

## NF-WF-002C — HIGH `PRE_MUTATION` ordering fix (GAP-024)

Executed 2026-10-02. Contract:
[`tasks/NF-WF-002C-premutation-ordering.md`](../../tasks/NF-WF-002C-premutation-ordering.md).
Scope: the four HIGH call sites whose `advanceForMutation` ran *after* their
first covered-table write, so `captureSnapshot` — which reads the live tables
when it runs, inside the caller's transaction — filed a **post**-mutation image
under a `PRE_MUTATION` label and the undo was a no-op.

### The change

`advanceForMutation` now precedes the first covered-table write at every site.
No service signature, route, schema, migration or lockfile changed.

| Site | File | Advance | First covered write |
|---|---|---|---|
| `proposal.approve` | `apps/api/src/services/canon.ts` | `:1149` | `:1226` supersede, `:1238` create, `:1273` status CAS |
| `outlineVersion.approve` | `apps/api/src/services/planning.ts` | `:589` | `:602` / `:608` |
| `outline.supersede` | `apps/api/src/services/planning.ts` | `:656` | `:667` |
| `chapters.import` | `apps/api/src/services/manuscript.ts` | `:492` | `:511` (loop's first `tx.chapter.create`) |

**Dependency resolution at `canon.ts` (the one non-mechanical edit).** The
approve path minted the new fact's id in the database and used it to link the
supersede afterwards, so moving the advance ahead of the insert would have left
`advanceForMutation`'s `items` without the id it needs. Rather than reorder
supersede → insert → link (which would have changed the mutation's semantics),
the id is now minted client-side: `const factId = randomUUID();` (`:1130`), the
supersede target captured as `const supersededFactId: string | null =
priorLive?.id ?? null;` (`:1135`), and `id: factId` passed first in the create's
`data`. The supersede → insert → link → decide order is unchanged; only the
source of the id moved. `canon_facts.id` is `@default(dbgenerated(...))`, so an
explicit id is legal and Prisma's generated create input already types it
`id?: string`.

`outline.supersede` and `chapters.import` name the novelId in `items` — a
supersede with no approved version supersedes nothing, and the import takes a
single advance for the whole loop rather than one per chapter.

### Two-direction proof (the acceptance criterion)

C12.6 asked for a payload-content assertion, not a metadata one. Each site got
one, and each was proven to **fail against the old ordering** and **pass against
the new**. The old-ordering receipts were produced by temporarily reordering the
real production file, running the test, and restoring it — not by a synthetic
harness:

| Site | Test | Old-ordering failure |
|---|---|---|
| `proposal.approve` | `revision.test.ts:550` | `expected [ …(2) ] to deeply equal [ Array(1) ]` — `canon_facts` held 2 rows, not 1 |
| `outlineVersion.approve` | `planning.test.ts:499` | `"…:APPROVED"` where the pre-image requires `"…:DRAFT"` |
| `outline.supersede` | `planning.test.ts:516` | `"…:SUPERSEDED"` where the pre-image requires `"…:APPROVED"` |
| `chapters.import` | `manuscript.test.ts:425` | `payload["chapters"]` was 2 rows, expected `[]` |

The `revision.test.ts` fixture was also made to genuinely supersede *and* mint
(same subject/predicate, different object, `validFromChapter` supplied), so both
covered tables change in the operation and the assertion cannot pass on an
unchanged payload. The parked-lock test's mutation was raised from LOW to HIGH,
because a LOW advance captures no checkpoint and "the loser records no
checkpoint" would then have been true for a reason unrelated to the CAS.

`planning.test.ts` additionally applies a restore (not only a preview) — the row
identities are unchanged by the approve, so preview counts would be zero either
way and prove nothing about the image.

### Gates (all green, each run with `DATABASE_URL` inline; `.env` untouched)

- `revision.test.ts` — 25 passed (25), 1 file
- `planning.test.ts` — 8 passed (8), 1 file
- `manuscript.test.ts` — 21 passed (21), 1 file
- API suite — 15 passed (15) files, 338 passed (338) tests
- root `pnpm test` — 38 passed (38) files, 796 passed | 1 skipped (797)
- `pnpm lint` — exit 0
- `pnpm typecheck` — exit 0 (all workspaces Done)

### Diff identity

Frozen before dispatch. **An earlier version of this entry recorded
`sha256 b91e5287…` / 1039 lines / "exactly six files", and that figure does not
reproduce — it was a misrecording, corrected here after the independent reviewer
blocked on it.** The command named six paths, but
`apps/api/src/revision.test.ts` is **untracked** (`?? `), and plain `git diff`
silently omits untracked files, so the artifact that command produced contained
**five** files, not six. Two identities, both reproduced:

| Artifact | Command | Lines | sha256 |
|---|---|---|---|
| 5-file (what the command actually yielded) | `git diff -- <the 5 tracked paths>` | 1037 | `dcba80edc9ecab1eac3304e3d0c70bf056257ec574c3c70ee060fe3f47457f0b` |
| 6-file (the intended scope) | `git add -N apps/api/src/revision.test.ts` first, then the same diff | 2295 | `d66c0aea140737f0e5c54df9802488ad49c5745e465db6003cab13b55a83ec35` |

The 5-file artifact is the one that was hashed and cited as "six files"; it
omits `revision.test.ts`, which carries the load-bearing payload assertions for
`proposal.approve`. Review must be run against the 6-file identity, and the diff
command must `git add -N` untracked test files or they are invisible to both the
hash and the reviewer.

**The 2295-line identity above is itself superseded by the review round.** The
reviewer's finding C (an overstated comment in `revision.test.ts`) was
confirmed by a partial-fix probe and fixed, so the current tree's six-file diff
is **2301 lines, `sha256
653a769dff4a3dbf3161ddb158f8f03844d863eb8c25fd852f9a4608afbf3eff`**. This is the
identity the re-review must run against. Post-edit content hashes
(sha256, first 16): `canon.ts 1658101e7d9ee050`, `planning.ts aad03c6563173b17`,
`manuscript.ts 5ff4e50b24b36ea6`, `planning.test.ts 57a6c97b200da99d`,
`manuscript.test.ts 22585f1cb1b8af78`, `revision.test.ts 6c739d79e90bcea4`
(the finding-C comment correction; `e843ee196aa72634` before it).
`revisions.ts` is `b0b25225fb71f0ba` — **unchanged**, correctly not touched
(`applyRestore` already ordered its advance at `:1070` before its DELETEs at
`:1095` and re-inserts at `:1104`; it was never a GAP-024 site).

### Review status

An independent reviewer was dispatched against the frozen hash with seven
numbered falsification items (advance-before-write at all four sites; no fifth
violating HIGH site and `restore.apply` intact; supersede → insert → link
preserved and the client-minted id legal; each assertion load-bearing rather
than tautological; the lost-race negative non-vacuous; nothing outside the six
allowed files changed; no new correctness/security/data-loss problem). **Round-1 verdict: CHANGES_REQUESTED**, with three findings. The reviewer
crashed mid-report (gateway `insufficient_balance`), so finding C was recovered
from its truncated message and verified independently; the falsification items
it had already completed are recorded in the task file. Dispositions:

- **A (blocker) — frozen artifact does not reproduce: CONFIRMED and fixed.** The
  recorded `b91e5287…` was a misrecording of a five-file diff the command was
  never going to produce as six files. The records now carry both reproduced
  identities and the superseding post-review identity (`653a769d…`, 2301 lines).
- **B — the "eight C3 HIGH rows" enumeration omits `checkpoint.create`:
  REFUTED.** The doc's own text at `STORY-VERSIONING.md:760-764` distinguishes
  the nine-entry HIGH set from "the eight mutation operations already in that
  class" and says `checkpoint.create` "is not one of them: it writes no covered
  table". "Eight" names the mutation operations, not the set size, and the
  reviewer's own grep confirmed `checkpoint.create` has zero covered writes.
- **C — the `revision.test.ts` comment overstates the proposals assertion:
  CONFIRMED by probe and fixed.** Moving the advance to just before the CAS
  (after the supersede and the mint) left the `canon_proposals` pair green —
  the CAS only writes `canon_proposals` after the advance in that shape — and
  the failure surfaced at the `canon_facts` pair and the `removed` count. The
  comment at `revision.test.ts:552` now says exactly that.

The reviewer's alias is reported separately from backend evidence;
`MODEL_UNVERIFIED` both rounds (each environment self-reports a routing
alias), so GAP-013 remains open.

**Round-2 verdict: APPROVE, no findings.** The re-review of the corrected tree
(`653a769d…`, 2301 lines, six files) reproduced the identity exactly and
CONFIRMED all eight falsification items: advance-before-first-covered-write at
all four sites; no fifth violating HIGH site and `restore.apply` intact
(`revisions.ts` unchanged); supersede → insert → link preserved with the
client-minted id legal; every new assertion load-bearing; the lost-race
negative non-vacuous (count assertions, the timer only proving the loser is
parked); exactly six files; and every losing-CAS throw inside its transaction
so rollback removes checkpoint, revision, head move and snapshot together.
**GAP-024 CLOSED 2026-10-02.**

### Limitation — historical checkpoints are not rewritten

`PRE_MUTATION` checkpoints written before this fix keep their post-mutation
images. They are deliberately **not** rewritten: rewriting a historical snapshot
is a destructive act against the record it preserves. Treat any checkpoint
created before 2026-10-02 as unusable for undo. Recorded in C12.6 and in the
GAP-024 detail section.

### Checkpoint state — Engram unavailable, fallback handoff (GAP-021, re-observed)

The SessionStart/compact hook again reported no authoritative registered runtime
identity and that agent-attributed memory writes must stop until the host
re-registers. Per the constitution's Engram rule and GAP-021, **no Engram
checkpoint was written at this boundary** and no session ID was invented,
derived or reused. This entry and the NF-WF-002C task contract are the fallback
handoff; they carry the diff identity, the four two-direction receipts, the
design decision at `canon.ts`, the gate counts and the review status.

## NF-WF-002D mutation head expectation — implementation record 2026-10-03

Executed in the author's current [CC] session as the `deepseek-v4.1-flash`
implementer (the requested/configured alias, not backend proof). Baseline
`811e7e6`; working tree dirty with the 002A–002D changes. `DATABASE_URL`
pointed at the scratch PostgreSQL `127.0.0.1:5433` (GAP-020); the repo `.env`
was not modified.

### What changed

- **Request surface.** The four HIGH mutation routes accept
  `expectedHeadRevisionId: uuid.nullable().optional()` in the body —
  `proposal.approve` (`canon-routes.ts`), `outlineVersion.approve` and
  `outline.supersede` (`planning-routes.ts`), `chapters.import`
  (`manuscript-routes.ts`). Approval/supersede parse `request.body ?? {}` so an
  empty-body caller is unchanged; import keeps its required `text`/`format`;
  supersede still returns 204.
- **Service input.** Each of `approveProposal`, `approveOutlineVersion`,
  `supersedeApprovedOutline`, `importChapters` gained the optional field and
  passes it to `advanceForMutation`; the `??`-collapse the contract warns about
  is not used anywhere on the path.
- **Two-part mechanism.** A new `assertHeadExpectation(db, …)` in
  `services/revisions.ts` is the unlocked advisory pre-check; it is called after
  the tenant/authorization gate and before any write on each route, so a stale
  plan does no work and opens no transaction. The locked CAS inside `advanceHead`
  is the authoritative comparison and is unchanged.
- **Error metadata.** `ConflictError` gained an optional, presence-signalled
  `currentHeadRevisionId?: string | null`; the app-wide handler in
  `platform-routes.ts` spreads it into the 409 body only when the property is
  set. `null` is a real observation ("no head exists yet"), so presence — not
  truthiness — is the signal. Generic slug/status, missing-baseline,
  unsupported-scope and chapter-version conflicts keep `{ error: "CONFLICT" }`.
  `applyRestore`'s inline pre-check now goes through `assertHeadExpectation`
  (same 409 semantics, now typed); its server-pinned comparison is otherwise
  untouched.
- **Tests.** `revision.test.ts` grew 25 → 52 cases: four HIGH-route groups
  (match-commits, omitted-commits, stale-409 + no-partial-write + named head,
  explicit-null-409, malformed-400), a per-route locked-CAS probe (four total),
  an authorization suite, and the HIGH coverage inventory.

### Receipts

Targeted five suites `145 passed (145)`; `@novelforge/story-versioning`
`17 passed (17)`; full API `365 passed (365)`; root `pnpm test`
`823 passed | 1 skipped (824)`; `pnpm lint` and `pnpm typecheck` exit 0.

### The locked CAS, proven load-bearing

The probe parks a second connection holding an uncommitted head move, waits on
`pg_stat_activity` until the request's transaction is actually parked on a lock,
then releases and asserts the 409. Run against a build with `advanceHead`'s
locked comparison disabled (`if (false && …)`), each of the four failed with its
own route's success payload (200/200/204/201) — the pre-check passed and the
mutation committed. Restored, all four pass. A suite that only exercises the
pre-check would have been green here while the race stayed open.

### Independent review — 2026-10-04

Dispatched by the author's instruction, since GLM became reachable through the
9Router gateway. `POST http://localhost:20127/v1/messages` with
`"model":"bansosmontera/glm-5.3-flash"`; the response echoed `glm-5.3-flash`, so
the requested id is proven and the serving backend is not (GAP-013).

**Production diff: APPROVE.** The reviewer traced authorization to precede every
head disclosure on all four routes, confirmed `ConflictError` carries
`currentHeadRevisionId` only when the second constructor argument is passed (so
every generic conflict stays bare and no message-parsing path exists), and
confirmed the tri-state survives Zod `.nullable().optional()`, the `...body.data`
spreads and the `!== undefined` guards without `null` collapsing into
`undefined`.

Its first pass also raised a MAJOR on `canon-routes.ts`/`manuscript-routes.ts`
claiming the field "may be silently dropped" because the diff showed only a
schema hunk. **Refuted against the tree** — both handlers already spread
`...body.data` into the service call, so the schema hunk is the whole change.
Recorded because the finding was an artifact of reviewing a diff without its
unchanged context.

**One MAJOR test-fidelity defect, confirmed and fixed.** `parkHeadMove`'s
`waitForBlocked` matched *any* backend with `wait_event_type = 'Lock'` in the
test database, so a lock waiter belonging to a different transaction could
satisfy the guard and `release()` could fire before the request had parked.
Fixed by recording the parking backend's pid inside its own transaction
(`SELECT pg_backend_pid()`) and requiring `pg_blocking_pids(pid)` to contain it;
the poll window was tightened 5s → 3s, deliberately under the request
transaction's Prisma default, so a non-parking request fails as
`blocked === false` rather than as a 500 from an expired transaction.
Re-falsified after the fix: all four probes still fail against the pre-check-only
build (200/200/204/201) and pass restored. Re-review: **APPROVE**.

**Two MINOR test findings were not actioned, deliberately** — the coverage
inventory cannot detect a newly added HIGH route, and its "has a route" premise
is asserted by comment rather than checked; making the pin load-bearing needs a
route-registry walk. Both are recorded in the test's own comment as known limits.

**Verdict scope:** the reviewer read the submitted diff and the excerpts supplied
with it, not the whole tree line by line; it did not run the suite and did not
review the docs changes. One reviewer, one model, unverified backend.

**Transport note.** The gateway returned `upstream_error` ("All upstream
attempts routed by Mortera Cloud failed") on several attempts *after* emitting
25–35k characters of reasoning and before any content. A silent empty answer
from this gateway means "retry", not "no findings". `glm-cn/glm-5.3-flash` and
`cl/z-ai/glm-5.3-flash` both returned HTTP 503 `429 ... balance/credit
exhausted`, so only the `bansosmontera` route is usable.

### Status and handoff

**IMPLEMENTED / REVIEWED.** GAP-022 is closed for implementation and review;
GAP-013 stays open because the reviewer's backend is MODEL_UNVERIFIED. The
exact-diff handoff (per-file `sha256` and the full-tree patch receipt) is in the
task file's Submission section. NF-WF-002F is now READY: it must verify against
the tree rather than accept this verdict as the acceptance itself.

*(Superseded 2026-10-04: 002F ran and returned **VERIFIED for the evidenced M1
foundation scope only** — see the NF-WF-002F entry below. It is
self-verification by the implementing model, not an independent review, so
GAP-013 stays OPEN and full cross-domain recovery stays OPEN under GAP-004.
This paragraph is preserved as the 002D-boundary record.)*

### Checkpoint state — Engram written (GAP-021, per-boundary)

The SessionStart/compact hook at this boundary confirmed an authoritative
runtime identity, `0238856e-21de-4b68-8644-f604cad2d10f`, distinct from the
`5ff5313c…` binding recorded at the earlier 002D-preparation boundary. The 002D
implementation checkpoint was written through MCP under the confirmed current
identity; the old ID was not reused. GAP-021 remains a **per-boundary**
observation: the binding must be re-checked at each boundary rather than assumed
present or absent.

## NF-WF-002F integrated foundation acceptance — 2026-10-04

Task: [`tasks/NF-WF-002F-foundation-acceptance.md`](../../tasks/NF-WF-002F-foundation-acceptance.md).
Documentation + verification task; **no production code was changed**. The
verdict is appended to that task file and is **VERIFIED for the evidenced M1
foundation scope only**.

**Verifier is not a reviewer.** `deepseek-v4.1-flash` ran the checks and wrote
the verdict — self-verification. The one independent verdict that exists is
002D's (`glm-5.3-flash`, APPROVE, backend MODEL_UNVERIFIED per GAP-013); it was
not re-run and does not transfer to this scope.

**Environment.** Scratch PostgreSQL 16.15, container `nf-pg-5433`
(`pgvector/pgvector:pg16`) on its own fresh named volume, published
`127.0.0.1:5433->5432` — not the repo's compose volume, so no live/dev data was
reachable. `DATABASE_URL` passed per command; the repo `.env` was not modified.
GAP-020 re-observed: `docker port novelforge-ai-postgres-1` is empty (the
compose container publishes nothing) and the host `:5432` listeners belong to
`com.docker.backend`/`wslrelay`; repo credentials there fail `28P01`.

**Gates, all green this session against the NF-WF-002 tree (HEAD `811e7e6`, 42
modified + 14 untracked paths):**

| Gate | Result |
| --- | --- |
| `@novelforge/story-versioning` | 17/17 |
| `revision-constraints.integration.test.ts` | 8/8 |
| Targeted API (revision/canon/planning/manuscript) | 137/137 |
| Full API | 15 files, 365/365 |
| Root `pnpm test` | 38 files, 823 passed \| 1 skipped |
| lint / typecheck / build | exit 0 |

Every suite reported a non-zero file and test count; no zero-selected run.

**Empty upgrade.** `db:test:prepare` dropped/recreated `novelforge_test` and
applied **all 20 migrations from empty**, exit 0.

**Populated upgrade.** `.local-backup-novelforge-dev-20261002.sql` restored into
a separate scratch DB and deployed: reproduced GAP-018 exactly
(`P3018: relation "canon_proposals_object_entity_id_idx" already exists`), then
the documented `migrate resolve --applied 20260930_phase6_evidence_fk_hardening`
let the remaining 7 migrations apply including `20261006_m1_story_versioning`.
C8 backfill on the real data is correct: 2 novels → 2 `main` branches, 2
BASELINE revisions, 0 headless branches, 0 change-set-less baselines.

**GAP-018 corrected — the failure is PARTIALLY APPLIED, and the workaround is
what strips the constraints.** Measured on a fresh restore (`nf_dump_raw`),
reading the `canon_fact_sources` FK set *before* and *after* the failing deploy:
raw dump = **4** FKs including both `RESTRICT` ones; after the failed deploy =
**2** — `chapter_version_id` and `reference_version_id` are gone. The
migration's two leading `DROP CONSTRAINT` statements commit, then `CREATE INDEX`
fails, Prisma records the migration as failed (`finished_at` NULL) with the
drops left in place, and `migrate resolve --applied` then permanently skips the
re-`ADD`. Behavioural proof: on the workaround-built DB a `DELETE FROM
chapter_versions` for a cited version **succeeds** and orphans the citation
(`ORPHAN_SOURCES=1`); on the from-empty DB the same DELETE is **refused** by
`canon_fact_sources_chapter_version_id_fkey`. GAP-018's original cause statement
is therefore **correct**; an earlier draft of this verdict refuted it, which was
wrong (it had read the FK set only after deploy, when the drops had already
committed). Corrected before recording. Scope is pre-existing and outside
NF-WF-002: all nine M1 objects are present and identical in both databases.
Follow-up requirement added: make the migration's `CREATE INDEX` re-runnable
(`IF NOT EXISTS`) so a failed deploy cannot leave a half-applied database.

**Accepted / not accepted.** Accepted: revision, snapshot, checkpoint,
non-destructive restore, rebuild intent, tenant isolation, the C3
`PRE_MUTATION` payload at all four HIGH sites, the 002D tri-state with
authorization before head disclosure, atomicity, and the M1 constraints probed
(not merely declared). Not accepted: full cross-domain recovery (GAP-004 stays
OPEN at P1 for the remaining scope). GAP-011 stays OPEN (nullable-FK existence
is not a join; `timeline_events.story_event_id` gets no backfill by design).
GAP-013 stays OPEN (single unverified-backend reviewer). GAP-017 and GAP-025
CLOSED with this verdict; GAP-022/GAP-024 confirmed CLOSED; GAP-023 stays OPEN
and is not a G-01 dependency (no G-01 path consumes a domain event, so no
speculative producer/outbox).

**Limitations carried, not waived.** Self-check is not review; two MINOR 002D
test-fidelity findings left unactioned deliberately; the populated-upgrade
receipt is not schema-equivalent to fresh (M1 portion valid).

**Checkpoint.** Written through MCP under the runtime-bound identity registered
at this boundary, `fae4b412-db3a-4ddc-a052-cfda214cfa9d`, distinct from the
`0238856e…` binding recorded at the 002D boundary. No old ID was reused and none
was invented. GAP-021 remains **per-boundary**.

**Next.** NF-WF-003 (shared chapter context compiler) is the next contract to
prepare and is **not** dispatched; NF-WF-004 stays gated on frozen shared
interfaces and disjoint ownership. Neither is a swarm. Queue rows are not test
receipts.

## NF-WF-003 — session resume, Ubuntu native preflight, contract review dispatch — 2026-10-05

**Git.** Pulled `origin/main` to `9e46568` ("docs(environment): require native
Ubuntu setup and preserve Windows Docker data"), the checkpoint the author
named. The previously recorded local HEAD `52056ee` did not contain it; the
pull fast-forwarded 10 files, including new
`docs/11-deployment/ENVIRONMENT-PREFLIGHT.md` and the GAP-027 register row.
Working tree clean before and after. Contract blob
`aaed86bc34ecd599cef1e57533edaef41b4c0eeb` (46,686 bytes) re-verified against
the refreshed `tasks/NF-WF-003-review-request.md` — matches. The PAT used for
the pull was decrypted transiently from the author's encrypted store with a
password supplied in-chat for this single operation, then wiped; it was never
written to disk unencrypted or to memory.

**Environment preflight (Ubuntu, native, no Docker).** Host: Ubuntu 24.04.5 LTS,
x86_64. Installed natively per `ENVIRONMENT-PREFLIGHT.md`:
- pnpm 12.5.1 (pinned `packageManager`), via npm into
  `~/.local/share/novelforge-tools`, symlinked to `~/.local/bin/pnpm`.
  Node v24.20.0 (existing baseline) + npm 10.9.4 already present.
- `pnpm install --frozen-lockfile` completed (4m 50s), dependencies ready.
- PostgreSQL 16.15 + `postgresql-16-pgvector` 0.6.0 + Redis 7.0.15 from Ubuntu
  noble (candidate check after `apt-get update`; no PGDG/Redis PPA needed).
  Services started natively: `pg_isready` accepting on 5432, `redis-cli ping`
  → PONG, `CREATE EXTENSION vector` → 0.6.0 loads.
- Notes: `apt-get update` stalled ~10 min on `mirror.cogentco.com`; killed it,
  removed that URI from `/etc/apt/sources.list.d/ubuntu.sources` (backup kept
  at `.bak`), re-ran clean in 12s via `azure.archive.ubuntu.com`. No Docker or
  Compose installed, per policy. No test databases created and no
  `db:test:prepare` run — provisioning stops at service readiness; scratch DBs
  are created only under the approved implementation contract.
- GAP-027 (environment policy vs Docker-only guidance) stays VERIFY_PENDING:
  the native setup here is installed but the task's scratch-test readiness
  (CREATEDB role, per-suite `novelforge_test_*` databases) is not yet
  exercised. That exercise belongs to the implementation phase, not the review.

**Contract review.** A separate reviewer subagent (distinct actor, same model
family as the coordinator — recorded as such per GAP-013, backend
MODEL_UNVERIFIED) was dispatched with the frozen review brief
`tasks/NF-WF-003-review-request.md` to judge blob `aaed86bc…` read-only:
whole-file verification of `orchestrator.ts`/`canon.ts`, the six central
claims, the §7 tier table, and the GAP-026 changed portions. Verdict pending;
**no implementation starts until the contract is approved.** GAP-026 stays
VERIFY_PENDING until the separate exact-blob verdict lands.

**Checkpoint fallback.** No Engram tool is available on this host and no
runtime session binding was supplied, so no attributed Engram save was
possible (GAP-021, per-boundary). This progress entry is the fallback handoff.
No previous host's session ID was reused and none was invented.

**Contract review verdict — 2026-10-05.** Separate reviewer (subagent actor,
Muse Spark family, backend MODEL_UNVERIFIED per GAP-013) judged the frozen blob
`aaed86bc…` read-only against HEAD `9e46568`. **Verdict: APPROVE_WITH_FINDINGS.**
All six central factual claims VERIFIED (whole-file reads of
`orchestrator.ts`/`canon.ts`); the §7 tier table VERIFIED backing-by-backing;
all GAP-026 remedies present and grounded; constitution compliance clean
(§7/§2.16/§9/§10/§11, GAP-004/011/013/018/023 respected); acceptance list
falsifiable; contract dispatchable. Two findings, neither dispatch-blocking:
F1 (P2) — invariant 1's prose says cast overflow uses "entity match then id"
but invariant 3's `groupBy` query orders by `characterId` only; one rule must
be stated in both places. F2 (P3) — the relationship pair budget has no
contract name (suggest `PAIR_LIMIT`). GAP-027 confirmed as environment-policy
only; does not block this review. No implementation started; NF-WF-003 stays
PLANNED pending the author's dispatch decision on the findings.

## NF-WF-003 — implementation — 2026-10-05

**Status: IMPLEMENTED, pending separate review.** Working tree holds the
implementation uncommitted per the author's "do not commit" instruction; a
separate reviewer judges the exact diff.

**What was built (contract §§Scope, Invariants).**
- New `apps/api/src/services/context-compiler.ts` (pure; no DB/HTTP/provider
  imports): `compileContext(input, rows)`, `fetchAndCompileContext(ports,
  input)` (head pin before/after bounded reads, `HeadConflictError` on
  movement), `renderContextText`, tier statuses
  PRESENT/EMPTY/UNAVAILABLE/NOT_APPLICABLE/OVERFLOWED. Budgets:
  OUTLINE_LIMIT=40, FACT_LIMIT=60, CAST_LIMIT=12, PAIR_LIMIT=24,
  THREAD_LIMIT=20, EVENT_LIMIT=30, REFERENCE_LIMIT=8 (unified; contract listed
  8 vs 10 — chose 8, the tighter bound, documented in code),
  FACT/REF_BUDGET_CHARS=6000, CONTEXT_BUDGET_CHARS=18000.
- Bounded readers: `canon.ts:listFactsForCompiler` (three-key order: entity
  match on `entityId`/`objectEntityId`, `createdAt` desc, `id` asc; two
  queries, both `take`-bounded; ACTIVE-only; spoiler filter in query),
  `listDebtForCompiler`, `listEventsForCompiler`, `listCausalForCompiler`;
  `planning.ts:getApprovedOutline`, `listOutlineNodesForCompiler`
  (horizon-window filter; absent/malformed policy → loud `horizonProblem`, no
  invented default), `getStoryPosition` (highest non-DRAFT chapter, else 0);
  `characters.ts:listRelevantCast` (the one bounded `groupBy characterId`
  derivation; tenant via `character` join; null `storyEntityId` skipped, never
  name-matched per GAP-011), `getStateAtPosition` (take:1 covering-predicate
  query matching the pure `stateAt` rule); `relationships.ts`:
  `getStanceAtPosition`, `getBondStageAtPosition`, `listBondsForCast` (same
  take:1 equivalence pattern).
- Wiring: `orchestrator.ts` inline fact loop replaced with
  `fetchAndCompileContext`; `workflow-runs.ts` RETRIEVAL step routes through
  the same compiler (keeps audit-linking via captured `retrievalAuditId`);
  `app.ts` wires the same tier-reader instances into both factories; head
  port via `readHeadRevisionId`. Overflow fails closed (no dispatch, no model
  call).
- Public `listFacts`/`ask` untouched. No schema change, no migration
  (GAP-018); no event producer (GAP-023); no name matching (GAP-011).

**Deviations from the contract (with justification).**
- `REFERENCE_LIMIT`: contract named 8 in one place and 10 in another;
  implemented 8 (tighter bound wins; documented at the constant).
- Novel-less path: the contract's compiler would search references without
  a novel; the pre-compiler orchestrator never did (it skipped the whole
  context block without a novelId, avoiding an embedding generation for no
  novel scope). Implemented `searchReferencesWithoutNovel` flag: orchestrator
  leaves it false (old behavior preserved — verified by the "409s when the
  model does not return JSON" test, which caught a spurious `task:"embed"`
  generation row), workflow RETRIEVAL step sets it true (the step is an
  explicit search and must work novel-less, per retrieval.test.ts).
- Contract's test command names `src/characters.test.ts` and
  `src/relationships.test.ts`; the repo has `src/character.test.ts`
  (singular) and no relationships test file. Ran the 7 existing files.
- `contextSnapshot` now carries the compiler's provenance `blocks` in
  addition to the old `{facts}` floor (contract §Outputs: old shape is the
  floor, not the ceiling). Two orchestrator tests updated to assert the new
  shape.

**Verification (actual runs, 2026-10-05, Ubuntu native).**
- `pnpm --filter @novelforge/api exec vitest run
  src/orchestrator.test.ts src/definitions.test.ts src/context-compiler.test.ts
  src/canon.test.ts src/character.test.ts src/planning.test.ts
  src/retrieval.test.ts` → **7 files, 192 tests, all passed** (includes the
  new 27-test `context-compiler.test.ts`: 9 pure compiler tests + 18
  DB-backed acceptance tests covering every contract bullet).
- `pnpm lint` → clean. `pnpm --filter @novelforge/api typecheck` → clean.
- Scratch databases only (`novelforge_test_*`); no live data touched.

**Test findings during implementation (all resolved).**
- `parseViewMode(undefined)` returns `"READER"` (deny-by-default, a security
  feature — preserved, not weakened). Service-level tests pass
  `mode: "AUTHOR"` explicitly, as the real callers do.
- `createFact` returns `{id}`, not `{canonFactId}`; `canon_facts_live`
  holds one ACTIVE row per (entity, predicate); supersede requires
  `validFromChapter`; claim object requires exactly one of
  `objectText`/`objectEntityId`; character states reject overlap (so the
  groupBy dedupe test asserts the DB-level guarantee); Chapter has no
  `workspaceId` and requires relation `connect` syntax.
- An empty `in: []` inside `NOT` has version-dependent Prisma semantics;
  the implementation branches explicitly for empty entity sets instead.

**Open / untested.**
- No `relationships.test.ts` exists in the repo; relationship tier readers
  are covered indirectly via `context-compiler.test.ts` (bond/stance
  temporal resolution) but have no dedicated suite.
- The caller-divergence test asserts the two caller input shapes compile
  identically through the shared `fetchAndCompileContext`; a full HTTP-level
  workflow RETRIEVAL run asserting byte-identical context to POST /generate
  was not added (the step's search behavior is covered by retrieval.test.ts).

## NF-WF-003 — review findings fixed (F1–F5) — 2026-10-05

The separate implementation review returned APPROVE_WITH_FINDINGS (5
findings). All five are fixed below, per the author's "fix all, re-verify,
then commit" decision. Nothing is committed; the tree holds the fixes for a
focused re-review.

**F1 (P2) — horizon problem now loud in tier-2 provenance.**
`CompilerPlanningPort.listOutlineNodesForCompiler` declared only `{ nodes }`,
so `fetchAndCompileContext` discarded the service's `horizonProblem` and a
malformed policy compiled as a bare EMPTY. Fixed in
`apps/api/src/services/context-compiler.ts`: the port type now declares
`{ nodes: OutlineNodeRow[]; horizonProblem: string | null }`; `CompilerRows`
gained `outlineHorizonProblem`; the fetch stashes it; tier 2 carries it as
the block's provenance `reason`
(`planning horizon problem MALFORMED_POLICY: no horizon window could be
determined, so no outline nodes were selected`). New negative test
(`context-compiler.test.ts`, "story position and outline (planning)"):
malformed policy written directly to `planning_horizons` (putHorizon
validates, so the service path can never store one) → tier 2 has zero rows
**and** a reason matching /MALFORMED_POLICY/ — the test fails against the
old discard.

**F2 (P3) — head race now 409, not 500.** `HeadConflictError` extended plain
`Error`, so the app-wide handler fell through to 500. Fixed with an explicit
handler branch in `apps/api/src/platform-routes.ts` (one import + one
branch; the compiler module keeps its zero-import purity — extending
`ConflictError` would have pulled `@novelforge/auth` into it). The branch
answers 409 `{ error: "CONFLICT", code: "HEAD_CONFLICT",
currentHeadRevisionId }`. The observed head is disclosed because both
callers gate the tenant before compiling (orchestrator `gate()`, workflow
`gateWorkspace(..., "workflow:run")`) — the 002D rule holds. Note:
`platform-routes.ts` is outside the contract's allowed-path list; this is
the minimal change the accepted finding requires, and no other logic in the
file was altered. Two new tests drive the real handler via a minimal
Fastify app: 409 + body on a race, and null-head disclosure as null.

**F3 (P3) — approved outline pinned.** `getApprovedOutline` existed but was
never called. `fetchAndCompileContext` now calls it in the pin phase
(alongside the head read); `CompilerRows`/`TierProvenance` gained
`outlineVersionId`, recorded on the tier-2 block (null when nothing is
approved — ordinary, not an error). New test: draft → approve → compile →
`tier2.provenance.outlineVersionId` equals the approved version id.

**F4 (P3) — test-matrix corrected.** The matrix claimed pure
`HeadConflictError` tests, budget-constant assertions, and horizon tests
that did not exist (constitution §10: never claim unverified work). The
NF-WF-003 section now describes exactly the 31 tests in
`context-compiler.test.ts` (9 pure: overflow, truncation, ordering/status
transitions, renderContextText, no-invented-head, snapshot floor shape, §7
order — no budget-constant or pure head-movement claims), the F1/F2/F3
additions, and the F5 HTTP test; the "malformed policy" negative-test
bullet now names the tier-2 `reason` mechanism.

**F5 (P3) — HTTP-level divergence test added.** The compiler-level test
could not catch drift in the actual callers. New test in
`orchestrator.test.ts` ("caller divergence at the HTTP boundary"): POST
`/generate` and a real workflow RETRIEVAL run on the same novel, then
`Generation.contextSnapshot.blocks` deep-equals the step outcome
`json.blocks`. This supersedes the "Open / untested" note above — the
HTTP-level comparison now exists and passes.

**Re-verification (actual, this host, scratch DBs only):**
`pnpm --filter @novelforge/api exec vitest run src/orchestrator.test.ts
src/definitions.test.ts src/context-compiler.test.ts src/canon.test.ts
src/character.test.ts src/planning.test.ts src/retrieval.test.ts`
→ 7 files, **197 passed**, 0 failed (was 192; +4 in context-compiler.test.ts,
+1 in orchestrator.test.ts). `pnpm lint` → clean. `pnpm --filter
@novelforge/api typecheck` → clean.

## NF-WF-003 — session checkpoint 2026-10-05 (contract → implementation → commit)

**Checkpoint.** This entry is the consolidated handoff for the session that
took NF-WF-003 from PLANNED contract to committed implementation. Git:
pulled `origin/main` to `9e46568` (author-named checkpoint; PAT decrypted
transiently with an in-chat password, wiped after use), then two local
commits: `0d094c3` (contract F1/F2 wording fixes) and `494a796`
(implementation). Working tree clean at checkpoint.

**Environment (this host, Ubuntu 24.04.5 LTS x86_64, native, no Docker).**
pnpm 12.5.1 (`~/.local/bin`), Node v24.20.0, PostgreSQL 16.15 + pgvector
0.6.0 on localhost:5432, Redis 7.0.15 on localhost:6379 — all installed
natively and started by hand (no systemd auto-start). `apt-get update`
stalled on `mirror.cogentco.com`; removed that URI (backup kept), azure
mirror clean. `pnpm install --frozen-lockfile` done. All test runs used
scratch `novelforge_test_*` databases only; root `.env` (gitignored) points
at localhost scratch. GAP-027's Ubuntu side is now exercised on a real
host; the Windows-container side remains the author's.

**Contract review (separate reviewer actor, backend MODEL_UNVERIFIED /
GAP-013).** Frozen blob `aaed86bc` (46,686 bytes) judged read-only against
the tree: all six central claims VERIFIED, tier table VERIFIED, GAP-026
remedies present, constitution clean. Verdict **APPROVE_WITH_FINDINGS**:
F1 (P2, cast-overflow prose vs query) and F2 (P3, unnamed pair budget).
Author decision: fix both before dispatch. Fixed → blob `186fa644`,
committed `0d094c3`.

**Implementation (separate implementer actor).** Per contract blob
`186fa644`: pure `services/context-compiler.ts` (zero imports), bounded
readers in canon/planning/characters/relationships, both callers
(`orchestrator.ts`, workflow RETRIEVAL) routed through
`fetchAndCompileContext`, `app.ts` wiring, no migration, no schema change.

**Implementation review (separate reviewer actor, MODEL_UNVERIFIED).**
Diff review: old defect gone, every new read bounded, tier-3 ordering and
invariant 10/6 mechanics as contracted, deviations justified. Verdict
**APPROVE_WITH_FINDINGS** — five findings (F1 P2: horizonProblem
discarded → bare EMPTY; F2 P3: head race → 500 not 409; F3 P3:
`getApprovedOutline` uncalled; F4 P3: test-matrix phantom claims; F5 P3:
divergence test not HTTP-level). Author decision: fix all five, re-verify,
then commit. All five fixed; focused re-review **APPROVE** with no
regressions. Per author request the re-review added internet cross-checks:
Prisma docs confirm `groupBy`+`take` requires `orderBy` and paginates
groups (validating the cast query); MDN/RFC 9110 confirm 409 for
optimistic-concurrency conflicts (validating F2); Fastify docs confirm the
`setErrorHandler` mapping pattern.

**Final verification (this host, scratch DBs only).** Contract command: 7
files, **197 passed, 0 failed**; `pnpm lint` clean; `pnpm --filter
@novelforge/api typecheck` clean. The 197-count was independently re-run
by the coordinator for the new test file (27/27) and by the re-reviewer
for the full set.

**Decisions recorded.** Author: (1) fix contract F1/F2 before dispatch;
(2) fix all five implementation findings before commit; (3) periodic
reports with plain-language explanations before questions; (4) internet
cross-validation for accuracy. Reviewer backends remain MODEL_UNVERIFIED
(GAP-013 stays OPEN); no claim to close GAP-004.

**Next.** NF-WF-004 (durable workflow execution) — not started; no code
beyond 003's scope was touched.

## 2026-10-05 — NF-WF-004 implemented (durable workflow execution)

**Contract.** `tasks/NF-WF-004-durable-workflow-execution.md` (frozen
`8c73c55d`), reviewed **APPROVE** in round 3 by a separate reviewer after
16 findings (F1–F16) were addressed. Scope decision A: worker executes.

**What was built.**
- `packages/workflow-executor/` (new): durable execution core — the
  step-driving loop moved from `workflow-runs.ts` (not duplicated),
  guarded run/step claims (`claimRunForExecution`,
  `claimStepForExecution`), cancellation checks (between steps, before
  claims, final read before terminal write), restart-recovery sweep
  (`recoverStaleRuns`: liveness → RUNNING→PENDING reset → dead-job removal
  → re-add), unreachable steps → SKIPPED, outcome envelopes `{text,json}`
  on step rows for recovery. Typed factory with injected deps; no HTTP,
  no BullMQ construction, no lifecycle imports.
- `apps/api/src/services/workflow-queue.ts` (new): the one shared
  `workflow-runs` BullMQ Queue (`attempts: 1`, `removeOnComplete: 1000`,
  `removeOnFail: 5000`).
- `apps/api/src/services/workflow-runs.ts`: `run()` split into
  `enqueueRun()` (validate as today, idempotency-key lookup → 200 /
  create PENDING run + PENDING step rows in one transaction, enqueue job)
  and `cancelRun()` (guarded → CANCELLED, best-effort job removal).
- `apps/api/src/definition-routes.ts`: run route → 202 (200 on
  idempotency repeat, with `statusUrl`); new `POST
  .../workflow-runs/:runId/cancel`.
- `apps/worker/src/workflow-jobs.ts` (new): BullMQ job handler +
  recovery sweeper + worker lifecycle (startup sweep, 60s interval,
  `lockDuration: 300_000`).
- Migration `20261005_nf_wf_004_idempotency_key`: `idempotency_key`
  nullable + partial unique index `(workspace_id, idempotency_key) WHERE
  idempotency_key IS NOT NULL`; both statements `IF NOT EXISTS`
  (GAP-018 re-runnable). Verified: deploys from empty, re-runnable,
  nulls don't collide, duplicates raise 23505.
- Deps: `bullmq` + `ioredis` + `@novelforge/workflow-executor` in
  `apps/api`; `@novelforge/database` + `@novelforge/workflow-executor` in
  `apps/worker`.

**Verification (this host, scratch DBs only).**
- `definitions.test.ts`: 49/49 (21 workflow-execution rewritten for
  202+drive, 11 new NF-WF-004: 202/enqueue, idempotency dedup/race/null,
  key-length validation, cancel PENDING/RUNNING/terminal/approval/retry/404).
- `orchestrator.test.ts`: 15/15 (F5 divergence green — RETRIEVAL
  compiles through the shared compiler off-request).
- `packages/workflow-executor/executor.test.ts`: 14/14 (guarded claims
  single-winner, recovery adoption, sweeper: reset/requeue/dead-job
  removal/PENDING orphan).
- `apps/worker/src/workflow-jobs.test.ts`: 10/10 (handler, sweeper,
  lifecycle, real BullMQ + real executor integration: run reaches
  SUCCEEDED via the worker).
- `pnpm lint` clean; `pnpm --filter @novelforge/api typecheck`,
  `pnpm --filter @novelforge/worker typecheck`,
  `pnpm --filter @novelforge/workflow-executor typecheck` clean.

**Deviations from the contract.**
- `lockDuration: 300_000` lives on the BullMQ Worker (where BullMQ
  requires it), not the Queue; the value is defined once in the package
  and shared. Queue options remain in `workflow-queue.ts`.
- The compiler port returns rendered text from `compile()` (single
  call) instead of a separate `renderText()` — simpler, same information.
- Step rows store the outcome envelope `{text, json}` (was: kind-shaped
  output); run-level output shape unchanged. Required for exact recovery.
- Cancel on an already-CANCELLED run returns 200 (retry-safe), not 409;
  409 is for SUCCEEDED/FAILED. This is the "idempotent in the
  retry-safe sense" reading.

**Known gaps (recorded in ISSUES-AND-GAPS).**
- Production worker AI wiring: `generate`/`retrieval`/`compiler` are not
  constructed in the worker (factories live in `apps/api/src`, which the
  worker must not import). AGENT/SKILL/RETRIEVAL steps fail with a clear
  "not configured" error until the factories move to shared packages.
- `createDbDefinitionResolvers` (package) duplicates
  `definition-resolution.ts` (API) resolution rules; the two must stay in
  sync until the orchestrator path is unified.

**Not committed.** Working tree left for separate review, per instructions.

**Independent diff review (this host, read-only, verified HEAD `0cb321c`, contract blob `8c73c55d`).** Verdict: **APPROVE_WITH_FINDINGS**.
- **F1 (P2, fixed).** `@types/pg` was missing from `@novelforge/workflow-executor` devDependencies (`pg` was listed, its types were not — `apps/worker` has both). `pnpm --filter @novelforge/workflow-executor typecheck` failed with TS7016 in the reviewed tree, so the implementer's "typecheck clean" claim (copied into this progress file, `test-matrix.md`, and `docs/14-progress/CURRENT.md`) was false at review time. Fixed 2026-10-05: added `@types/pg ^8.23.1`, `pnpm install` (lockfile updated), typecheck now clean; the claims above are now verified true.
- **F2 (P3, observation for the author).** Sweeper (b) predicate is "no job record at all"; if (a)'s best-effort `job.remove()` fails while the re-add no-ops (the exact F12 scenario), the run sits PENDING with a retained dead record and nothing revisits it until `removeOnFail: 5000` incidentally evicts the record. The implementation matches the contract's (b) predicate exactly, so this is conformant — but the author may want (b) to use the liveness predicate as a backstop for (a)'s partial failure. Not a required change.
- **F3 (P3, observation).** The F15 final cancellation read is genuinely immediate (no awaits between read and `UPDATE`), but the terminal write itself is unguarded: a cancel landing in that sub-ms window would be overwritten. Contract-conformant as prescribed; a guarded terminal write (`WHERE status != 'CANCELLED'`) would close it. Not a required change.

Reviewer-verified independently: `pnpm lint` clean; api/worker typecheck clean; `definitions.test.ts` 49/49, `orchestrator.test.ts` 15/15, full api suite 408/408 (16 files), `executor.test.ts` 14/14, worker suite 19 passed/1 skipped; migration applied twice cleanly on a scratch DB (then dropped); no cross-app-boundary imports, no domain-event code, no approval-resume code in the new paths; GAP-028/GAP-029 recorded accurately. Reviewer backend MODEL_UNVERIFIED (GAP-013 stays OPEN).

## 2026-10-05 — NF-WF-005 implemented (approval decision and safe continuation)

**Contract.** `tasks/NF-WF-005-approval-decision-continuation.md` (frozen
`37a91d1a`), reviewed **APPROVE** in round 3 by a separate reviewer after
9 findings were addressed. Builds on NF-WF-004's durable substrate
(`1afb5c1`, pushed). Closes GAP-003 with the acceptance evidence below.

**What was built.**
- `packages/auth/authorization.ts`: new `workflow:approve` capability,
  granted to OWNER (via the all-non-platform filter), ADMIN, AUTHOR;
  EDITOR/VIEWER excluded (mirrors `canon:approve`). `authorization.test.ts`
  extended with the deliberate-asymmetry assertions (15/15).
- `packages/database/prisma/schema.prisma` + migration
  `20261005_nf_wf_005_approval_decision`: `WorkflowApprovalDecision`
  model (uuid PK, runId→WorkflowRun Cascade, stepRunId→WorkflowStepRun
  Cascade, stepKey, APPROVED/REJECTED enum, snapshotHash, pins Json,
  decidedById→User SetNull, reason nullable, decidedAt default now;
  `@@unique([runId, stepKey])`, no separate runId index) and nullable
  `WorkflowStepRun.approvalSnapshot` (JsonB). Every DDL statement
  re-runnable (GAP-018): `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF
  NOT EXISTS`, and a `DO $$ ... EXCEPTION WHEN duplicate_object` block
  for the enum — PostgreSQL's `CREATE TYPE` has no `IF NOT EXISTS`
  clause (GAP-030). No backfill: pre-NF-WF-005 parked rows are
  undecidable by design.
- `packages/workflow-executor/snapshot.ts` (new): canonical-JSON
  (recursive key sort, UTF-8) + sha256 `hashApprovalMaterial`, exported
  from the package index. `executor.ts` park path persists
  `{ material, snapshotHash }` on the step row in the same update that
  parks it; material = rendered instruction + prior-step `{text,json}`
  outcome envelopes + workflowVersionNumber + resolved agent/skill
  version numbers. No other executor changes (PENDING-only claims already
  give the resume cursor).
- `apps/api/src/services/workflow-runs.ts`: new `decideRun()` —
  `gateWorkspace(..., "workflow:approve")`, then ONE transaction:
  parked-step lookup → NULL snapshot → 409 NO_APPROVAL_SNAPSHOT; hash
  mismatch → 409 STALE_APPROVAL; guarded run AWAITING_APPROVAL→PENDING
  (approve) / →FAILED (reject, completedAt + errorMessage=reason), zero
  rows → 409 RUN_CANCELLED (run reads CANCELLED) else 409
  ALREADY_DECIDED; guarded step →SUCCEEDED (decision summary in output)
  / →FAILED, zero rows → rollback; decision insert (unique violation →
  rollback); audit `workflow.run_approved`/`workflow.run_rejected` in the
  same transaction. After commit on approve: best-effort
  `queue.getJob(runId)`→`remove()` then `queue.add` same `jobId` on the
  shared queue (invariant 5 order). New `ApprovalDecisionError` (extends
  ConflictError) mapped in `platform-routes.ts` to 409
  `{ error: "CONFLICT", code }`. `getRun` step views now expose
  `approvalSnapshot` so clients can echo `expectedSnapshotHash`.
- `apps/api/src/definition-routes.ts`: `POST
  .../workflow-runs/:runId/approve` (`expectedSnapshotHash` 64-hex +
  optional reason ≤2000) and `/reject` (reason required 1..2000),
  cancel-route style (requireActor, zod params, 400 INVALID_INPUT).

**Verification (this host, scratch DBs only).**
- `approval-decision.test.ts` (new, real BullMQ queue): 15/15 —
  approve happy path (live `waiting` job asserted via `getJob`, decision
  row, audit, drive to SUCCEEDED), resume cursor exactness
  (pre-approval `completedAt` untouched, post-approval once), reject
  (FAILED + reason, no resume), stale (409 STALE_APPROVAL → fresh hash
  resumes), snapshotless seed (409 NO_APPROVAL_SNAPSHOT, untouched),
  duplicate (409 ALREADY_DECIDED, one row, no second enqueue),
  sequential two-approval workflow (two decisions, per-step hashes),
  EDITOR/VIEWER → 403 + non-member → 404, validation 400s,
  cancel-won-race → 409 RUN_CANCELLED + decide-then-cancel normal path,
  restart-safe (simulated post-commit enqueue throw → PENDING/no job →
  sweeper (b) re-enqueue → SUCCEEDED), migration SQL raw re-apply clean.
- `executor.test.ts`: 18/18 (4 new: canonicalization fixed vector —
  `4da42684…6caac36a` — park-time snapshot persistence, resume skips the
  decided step).
- `authorization.test.ts`: 15/15. Full API suite: 423/423 (17 files;
  408 pre-existing + 15 new — no regressions).
- `pnpm lint` clean; typechecks clean: api, worker, workflow-executor,
  auth. Prisma client regenerated.
- Migration: applies from empty (`migrate deploy`), second deploy is a
  clean no-op, raw SQL re-runs cleanly, duplicate `(run_id, step_key)`
  → 23505, `migrate diff --from-migrations --to-schema` empty (one
  drift found and fixed: `decided_at` must be `TIMESTAMP(3)`, not
  `TIMESTAMPTZ(6)`).

**Deviations from the contract.** None material. The tx-scoped audit is
`createAuditService(tx)` (cast, commented) rather than a new seam — same
service, same record shape, inside the transaction as invariant 4
requires.

**Not committed.** Working tree left for separate review, per instructions.

## 2026-10-05 — NF-WF-006 implemented (chapter generation/review template)

**Contract.** `tasks/NF-WF-006-chapter-generation-review-template.md`
(frozen, reviewed APPROVE_WITH_FINDINGS in round 2 by a separate
reviewer after 9 findings were addressed; the 2 round-2 P3 observations
are already applied in the committed text).

**What was built.**
- Condition-path extension (the one author-approved machinery change):
  `packages/validation/workflow-graph.ts` — `CONDITION_PATH_PATTERN`
  now accepts `$steps.<key>.json.<field>` (one level; rejects deeper
  nesting and `$steps.<key>.text.<field>`); `CONDITION_BAD_PATH`
  message describes the extended grammar. `REFERENCE_PATTERN` (step
  inputs) untouched. `packages/workflow-executor/executor.ts` —
  `resolveReference` handles the nested form with an
  `Object.hasOwn`-style own-property guard on the outcome's `json`
  plain object (mirroring the `$input` handling), else `undefined`.
- New package `packages/workflow-templates/` (`@novelforge/workflow-templates`;
  one level, not the contract's proposed two-level nesting, because
  `pnpm-workspace.yaml` globs `packages/*`):
  `chapter-generation-review/graph.json` — 20 steps, 21 edges,
  `maxSteps: 40`; `agents/` — five markdown agent specs
  (`chapter-planner` DEEP_PLANNER, `chapter-writer` CREATIVE_WRITER,
  `voice-style-reviewer` CONTINUITY_REVIEWER, `final-reviewer`
  LONG_CONTEXT_REVIEWER, `chapter-extractor` STRUCTURED_EXTRACTOR);
  `schemas/` — plan/draft/findings/extraction schemas (extraction
  citations enforced via `contains`, no `minItems`); `index.ts`
  exporting the typed template plus `graphsEqual` and a local
  `canonicalizeJson` (same byte format as NF-WF-005's `snapshot.ts`,
  pinned by a fixed vector in tests — the package deliberately does
  not depend on `@novelforge/workflow-executor`).
- `scripts/seed-chapter-template.ts` (new): drives the PUBLIC API as
  SUPER_ADMIN (`platform:define`) — idempotent creation of the five
  PLATFORM agents and the `chapter-generation-review` PLATFORM
  workflow (key-exists + canonical-JSON byte-equality → no-op; changed
  graph → NEW `WorkflowVersion`, never mutates v1). Runs standalone
  via `node --experimental-strip-types`; CLI entry through env vars
  (`NOVELFORGE_API_URL`, `NOVELFORGE_ADMIN_COOKIE`,
  `NOVELFORGE_WORKSPACE_ID`).
- `apps/api/src/chapter-template.test.ts` (new, 12 tests, GAP-028
  fake gateway — per-step JSON answers keyed off agent instructions;
  no production AI path): seed idempotency, version immutability,
  end-to-end run → SUCCEEDED, schema rejection (AGENT contract +
  VALIDATOR backstop), evidence rejection, bounded correction (both
  paths, draft-selection assertions), approval park→approve/reject,
  workspace agent shadowing.
- `docs/07-workflows/CHAPTER-GENERATION-REVIEW.md` (new): stage table,
  schemas, correction bound, approval integration, shadowing,
  condition-path extension, instantiation.

**Verification (this host, scratch DBs only).**
- `chapter-template.test.ts`: 12/12 — seed creates 5 agents + workflow
  v1 then no-ops; v2 publish leaves v1 byte-identical and the script
  publishes v3; pre-v2 run pins v1; e2e SUCCEEDED with all 20 stage
  rows (rewrite chain SKIPPED, CONDITION steps SUCCEEDED, approve
  parked with a snapshot covering draft+proposals) then approve →
  SUCCEEDED / reject → FAILED with reason; invalid plan fails at the
  AGENT contract with nothing downstream; a slipped-through invalid
  plan is caught by `validate_plan` with the rejection detail;
  citationless proposals fail at `extract`; a slipped-through
  citationless extract is caught by `validate_extract` naming the
  proposal; needsCorrection=true twice → exactly 2 rewrites then
  `review_final` on rewrite_2's content; needsCorrection=false →
  rewrite chain SKIPPED and `review_final` got `write`'s content;
  workspace `chapter-planner` shadows the platform one.
- `template.test.ts` (@novelforge/workflow-templates): 9/9.
- `validation.test.ts`: 61/61 (extension accept/reject cases).
- `executor.test.ts`: 20/20 (nested CONDITION resolution).
- Full API suite: 435/435 (18 files; 423 pre-existing + 12 new — no
  regressions).
- `pnpm lint` clean; typechecks clean: api, workflow-executor,
  validation, workflow-templates.

**Deviations from the contract.**
- GAP-031: the contract pins the condition field charset as
  `[a-z0-9_-]{1,64}` but its own normative findings-schema/stage list
  uses camelCase `needsCorrection` — jointly unsatisfiable (reproduced:
  `validateGraph` rejected the template's own CONDITIONs). Widened the
  field charset to `[a-zA-Z0-9_-]{1,64}` in both files; step keys stay
  lowercase-only. Safety unchanged (anchored, one level, own-property
  guard). The frozen contract text was NOT rewritten.
- GAP-032: the contract says "four" platform agents in some places but
  the normative stage list names five agent refs including
  `chapter-extractor` (STRUCTURED_EXTRACTOR). Implemented five — the
  normative stage list wins; "four" reads as a stale count.
- Template package path `packages/workflow-templates/` (not
  `packages/workflow-templates/chapter-generation-review/`) — the
  workspace glob is one level.
- The template package exports its own `canonicalizeJson` rather than
  importing `@novelforge/workflow-executor` — keeps the package and the
  standalone seed script free of the executor's dependency chain; the
  byte format is pinned by a fixed vector in the package tests.

**Independent diff review (read-only, HEAD `372aaff`, contract blob
`04c0c773`).** Verdict: **CHANGES_REQUESTED** — one material finding:
- **F1 (P2, fixed).** The contract's required run inputs (`novelId`,
  `chapterNumber`, `outlineRef`) were referenced only as uninterpolated
  literal text in instructions and could never reach steps as values:
  `REFERENCE_PATTERN` rejected the contract's own camelCase input names,
  and no step bound `$input.*` in `inputs`. Fixed: input-name charset
  widened to `[a-zA-Z0-9_-]{1,64}` in `REFERENCE_PATTERN` and the
  `input.` alternative of `CONDITION_PATH_PATTERN` (GAP-031-parallel; the
  runtime `$input` lookup is `Object.hasOwn`-guarded with no charset
  check, so the charset never carried a security property);
  `compile_context`, `plan`, `write`, `rewrite_1`, `rewrite_2` now bind
  `{ chapterNumber: "$input.chapterNumber", outlineRef: "$input.outlineRef" }`
  (uninterpolated literals removed); new integration test asserts the
  rendered `## chapterNumber` / `## outlineRef` values reach the planner
  and writer. Recorded as **GAP-033** before the workaround; frozen
  contract not rewritten.
- **F2 (P3, observation).** The seed script's key-exists check does not
  compare agent instructions — editing an agent `.md` and re-running
  leaves the platform agent stale. Documented in the script docstring
  (operator footgun note).

**Focused re-review of the F1 fix: APPROVE.** Charset widening verified
minimal (only the two input-name segments; step keys stay lowercase-only;
no other validation logic touched); all 10 `$input.*` occurrences are
`inputs` bindings; GAP-033 recorded; docstring note added. One P3
suggestion applied (symmetric `not.toContain` assertions in the new test).

**Final verification (this host, scratch DBs only; services reinstalled
natively after a VM replacement mid-task).** `pnpm lint` clean;
typechecks clean (api, validation, workflow-executor, workflow-templates);
`validation.test.ts` 61/61; `executor.test.ts` 20/20; workflow-templates
suite 22/22 (2 files, incl. `validateGraph` on the modified graph);
`chapter-template.test.ts`
13/13 (12 + new input-binding test); full API suite **436/436** (18 files,
no regressions).

## 2026-10-05 — NF-WF-007 implemented (writer generate/review/diff/accept UI)

**Contract.** `tasks/NF-WF-007-writer-ui.md` (reviewed APPROVE_WITH_FINDINGS
by a separate reviewer; F1–F4 applied in text; Q1–Q5 resolved. Author
amendment 2026-10-05 on Q2: the outline-moved warning ALSO highlights
which outline parts changed — fetch the current approved outline
version, diff its content against the run's outline version, highlight
the changed sections/parts in the non-blocking notice.)

**What was built** (all in `apps/web/app/`, no backend changes per
Invariant 11):
- `i18n/en.ts`, `i18n/id.ts` + `composables/useLocale.ts` (en/id keys,
  English per-key fallback, localStorage persistence, header toggle).
  Pre-existing writer-page strings migrated to keys.
- `utils/outlineDiff.ts` (generic JSON diff → changed paths for the Q2
  notice), `utils/draftSelect.ts` (latest-available draft-selection
  rule, never fabricates), `utils/lineDiff.ts` (line-granularity draft
  diff — implementer choice).
- `composables/useWorkflowRuns.ts` (start with fresh idempotencyKey,
  statusUrl/getRun polling with monotonic guard, pause when hidden,
  cancel, decide), `composables/useChapterGeneration.ts`
  (chapter-scoped loop: selected run, single-read snapshot review,
  diff pin, Q2 outline-moved check).
- Components: `GenerationPanel` (start form + run history + parked-run
  warning with deep link), `RunStatusPanel` (live steps, cancel),
  `DraftDiffView`, `FindingsPanel` (expandable evidence),
  `ProposalsPanel` (Candidate Canon banner, no canon action),
  `ApprovalDialog` (hash echo, reason-required reject, focus trap/Esc/
  focus return, text-acceptance label), `ApplyBar` (Invariant-6 guards
  incl. PUBLISHED gate, stale recovery, applied audit note),
  `OutlineMovedNotice` (Q2: non-blocking + highlighted changed parts).
- Integrated into the chapter workspace page right rail (generation +
  run status) and a review area above the editor. Existing
  chapter-list/editor/autosave/publish behavior preserved.
- Test harness: vitest + @vue/test-utils + jsdom + @vitejs/plugin-vue
  (smallest justified addition; `pnpm --filter @novelforge/web test`).

**Verification (this host, scratch DBs only).**
- Web component tests: 41/41 (7 files) — utils, locale + fallback,
  apply gating (dirty/stale/published/non-SUCCEEDED), dialog
  (hash echo, reject-reason required, text-acceptance label, focus trap
  + Esc), findings evidence expansion, proposals banner + no canon
  action, outline-moved changed-parts highlight, diff pending state.
- API loop tests (`apps/api/src/writer-ui.test.ts`, real backend + test
  driver, fake gateway): 11/11 — core loop (start→park→review→approve→
  SUCCEEDED→apply→content verified), reject path (FAILED + reason),
  reject 400 without reason, autosave-conflict race (200+409, no
  clobber), stale-apply race (409, newer text kept), double decide
  (200+409 ALREADY_DECIDED), stale approval (409 STALE_APPROVAL, stays
  parked, fresh hash works), decide matrix (403 no-capability, 404
  other tenant), cancel→decide (409 RUN_CANCELLED), double-submit
  (202+200, one row), listRuns input present for client-side filter.
- `pnpm lint` clean; `pnpm --filter @novelforge/web typecheck`
  (vue-tsc) clean; `nuxt build` succeeds.
- Full API suite not re-run in this task (only the new writer-ui
  suite + the suites it touches were run); the web work adds no
  backend changes.

**Deviations / new gaps.**
- GAP-034 (OPEN): server-side runs-by-chapter filter follow-up
  (contract Q1 resolution; Invariant 11 forbade it in 007).
- Contract amendment (author, 2026-10-05): Q2 outline-moved warning now
  highlights changed parts — implemented in `OutlineMovedNotice` +
  `outlineDiff.ts`, covered by component tests.

**Independent diff review (2026-10-05): APPROVE_WITH_FINDINGS.** All 11
invariants verified as pinned (real backend, core loop, state coverage,
evidence, decide-error matrix, apply guards incl. not-PUBLISHED gate,
autosave 409 preserved, text/canon separated, en/id fallback,
accessibility, no backend changes). Checks: web 41/41, API full suite
447/447 (436 pre-existing + 11 new, no regressions), lint clean,
vue-tsc clean, nuxt build succeeds. GAP-028 respected (test driver/fake
gateway). Findings, all applied: F1 (P3) dead `pollRun` export pruned
from `useWorkflowRuns.ts`; F2 (P3) outline start restricted to the
APPROVED version only per author decision 2026-10-05 (the `<select>`
became a read-only display; backend guarantees at most one APPROVED
outline per novel); F3 (P3) `apps/web/package.json` trailing newline
restored. Web tests re-run after the F1/F2 fixes: 41/41, lint clean,
vue-tsc clean.

## 2026-10-05 — NF-WF-008 implemented (contracted extraction and canonical proposal application)

**Contract:** `tasks/NF-WF-008-canonical-proposal-application.md` at
`8d28995` (reviewed CHANGES_REQUESTED; F1–F6 applied in text; Q1–Q6
adjudicated; review record filled).

**Implementation (implementer actor, separate from contract author and
reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working
tree left for the diff reviewer).**

Backend (`apps/api`):
- New service `src/services/canon-applications.ts`: `createApplication`
  (contracts claims, validates evidence spans against the draft step's
  `prose` outcome, classifies vs live canon, pins the head; row born
  `VALIDATED`), `getApplication` (review + audit trail),
  `revalidateApplication` (`STALE → VALIDATED`), `approveApplication`
  (advisory + locked-CAS head check, re-classify in-transaction,
  supersede→insert→link→decide order, pre-minted ids,
  `advanceForMutation` before writes, HIGH → PRE_MUTATION checkpoint +
  snapshot + rebuild intents; locked-CAS `ConflictError` mapped to 409
  `STALE_APPLICATION`), `rejectApplication`. Simulation runs refused
  with 400 `SIMULATION_REFUSED` (`run.input.simulation === true`, no
  schema change). `CanonApplicationError` carries machine codes served
  as `{error: CODE}` via a dedicated branch in `platform-routes.ts`
  (before the generic `ConflictError` branch).
- 5 routes in `canon-routes.ts` (capabilities
  `canon:read`/`canon:manage`/`canon:approve`).
- Prisma: `CanonApplication` / `CanonApplicationItem` models + additive
  idempotent migration
  `20261005_nf_wf_008_canon_applications` (DO-block for `CREATE TYPE`,
  GAP-030 convention).
- F5 completed: both tables in `TABLE_SCOPE` (revisions.ts) AND
  `COVERED_TABLES` (story-versioning `snapshot.ts`; the latter was
  missed in the working tree and found by the new tests — GAP-035),
  both mapped to the `canon` projection in `impact.ts`.

UI (`apps/web`):
- New `CanonApplicationReview.vue` dialog: per-claim contracting
  (entity picker incl. inline-new, predicate, object, validFromChapter
  defaulting to the run's chapterNumber per Q3), verdict chips,
  CONFLICT side-by-side with the live fact + explicit confirmation
  checkbox, impact preview (supersedes note), approve/reject with the
  full decide-error mapping (STALE → revalidate affordance), applied
  state with per-item fact links + audit note, banner state reflection.
- `ProposalsPanel.vue` extended (Q6): the NF-WF-008 banner gains the
  "Review for canon" entry point; no per-proposal promote action.
- en/id locale keys (`canonReview.*`, `proposals.reviewForCanon`),
  English fallback, raw English codes as the last-resort fallback.

Tests:
- `apps/api/src/canon-application.test.ts`: 15 API tests driving the
  006 template via `workflow-test-driver.ts` (fake gateway, GAP-028;
  deterministic prose ≥200 chars to satisfy the write contract):
  evidence validation, UNSUPPORTED blocking, simulation refusal,
  duplicate claimIndex, EXTRACTION_NOT_FOUND, forced conflict +
  supersede windows, VALID_FROM_CHAPTER_REQUIRED, duplicate blocking,
  stale→revalidate→approve, atomic rollback, audit trail, exact fact
  source offsets, text/canon separation, capabilities + tenant
  isolation, double-decide. 15/15.
- `apps/web/app/components/generation/CanonApplicationReview.test.ts`:
  7 component tests mocking at the `useApi` boundary: contracting
  defaults, verdict chips, conflict confirmation gate, STALE→revalidate,
  reject, review entry point present/absent. 7/7.
- Full API suite: 462/462 (447 pre-existing + 15 new), no regressions.
- Web suite: 48/48 (41 pre-existing + 7 new).
- story-versioning: 17/17 (updated C1/C6 for the 34th table + projection mapping).
- `pnpm lint` clean (2 pre-existing unused-var errors in
  `canon-applications.ts` fixed: dead `resolveChapterVersionId`
  duplicate + unused `runInput` destructure).
- Typechecks: `@novelforge/api`, `@novelforge/database`,
  `@novelforge/story-versioning` clean; `@novelforge/web` has 3
  pre-existing errors in untouched files (`sign-in.vue`, `index.vue`)
  — recorded, not widened.
- `pnpm --filter @novelforge/web build` succeeds.

Gaps recorded: GAP-035 (F5 half-registration, fixed), GAP-036 (VM
service restart wiped PG/Redis; native reinstall), pre-existing web
typecheck errors noted.

**Independent diff review (2026-10-05): APPROVE_WITH_FINDINGS.** All 11
invariants verified as pinned. Checks: API 462/462 (20 files, incl.
untouched `canon.test.ts` — existing proposal flow unchanged), web
48/48, story-versioning 17/17, lint clean, typechecks clean (3 web
errors verified pre-existing in untouched `index.vue`/`sign-in.vue`),
nuxt build succeeds. GAP-028 respected. Findings, all applied: F1 (P3)
`STALE` documented in the contract as a detected-not-persisted logical
state; F2 (P3) `"STALE"` removed from the UI verdict union; F3 (P3)
`VALID_FROM_CHAPTER_REQUIRED` + `INLINE_ENTITY_KIND_MISMATCH` added to
the contract's approve error table. Web tests re-run after fixes:
48/48, lint clean.

## 2026-10-05 — NF-WF-009 implemented (revision-derived chapter/arc memory and historical retrieval)

**Contract:** `tasks/NF-WF-009-revision-derived-memory.md` at `f18600f`
(reviewed CHANGES_REQUESTED; F1–F9 applied in text; Q1–Q6 adjudicated;
review record filled).

**Implementation (implementer actor, separate from contract author and
reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working
tree left for the diff reviewer).**

New package `@novelforge/memory` (`packages/memory/`): deterministic
structural rebuild core shared by API and worker.
- `constants.ts`: `MEMORY_REBUILD_QUEUE_NAME`, `MEMORY_REBUILD_MAX_ATTEMPTS=5`,
  `MEMORY_REBUILD_RETRY_BASE_MS=1000`, `MEMORY_RECENT_CHAPTERS_DEFAULT=10`,
  scope helpers (`chapter:`, `arc:`).
- `settle.ts`: `manuscriptRev` (greatest main-branch revision touching the
  chapter's chapter-version rows via change-set search), `canonApplyRev`
  (greatest main-branch revision with a CanonApplication→APPLIED UPDATE
  whose run has `input.chapterNumber=N`; batch-fetched, no N+1),
  `settleRev` (max of present terms; null when manuscriptRev absent — F2).
- `freshness.ts`: `deriveFreshness` (newest row by source-revision number
  vs main head → MISSING/FAILED/FRESH/STALE; r.number > H → STALE) and
  `deriveAsOfFreshness` (newest row ≤ R.number within the branch — F4).
- `rebuild.ts`: `buildStructuralMemory` (facts filtered by validity window
  vs chapter context + `createdAt <= R.createdAt` + as-of status via
  successor creation time; threads/promises by creation time; sorted,
  deterministic) and `processRebuild` (dedup on existing OK; FAILED rows
  with `lastError`/`attempts` — never a false success; byte-identical
  re-runs — Invariant 3).
- STRUCTURAL-ONLY (Q1): `summary: null`, `summaryStatus: "SKIPPED"` always.

Prisma: `MemoryProjection` model + `MemoryBuildStatus` enum
(`@@unique([novelId, scope, sourceRevisionId])`); migration
`20261006_nf_wf_009_memory_projections` (GAP-030 DO-block convention;
renamed from `20261005_…` — GAP-037: the `revisions` table is created by
`20261006_m1_story_versioning`, so the 009 migration must sort after it).
Registered in `TABLE_SCOPE` (`revisions.ts`) and `COVERED_TABLES`
(`snapshot.ts`, GAP-035 lesson) as a rebuildable projection.

Backend (`apps/api`):
- `services/memory.ts`: `recallNovel` (chapter L1 + recent L2 bounded by
  10 + arc L3/L4 via outline nodes; as-of by revisionId with cross-branch
  400), `getMemoryStatus`, `triggerRebuild` (BullMQ enqueue, deterministic
  jobIds; `{simulation: true}` → 400 `SIMULATION_SOURCE_REFUSED` — F3),
  `readAsOf` (chapter → settleRev; revisionId → branch check).
- `services/memory-queue.ts`: the one shared `memory-rebuild` Queue
  (F6 retry policy); `memory-routes.ts`: 3 routes
  (`GET …/memory/status`, `POST …/memory/rebuild` → 202,
  `GET …/memory/as-of`) with `novel:read` / `novel:update` (F5);
  `MemoryError` mapped in the central handler.
- 003 compiler: optional `memory` port on `CompilerPorts`; tiers 7/8 now
  consume `recallNovel` — PRESENT with freshness/sourceRevisionId/
  chapterCoverage provenance, UNAVAILABLE with the actual-state reason
  when MISSING/unconfigured (the old "owned by NF-WF-009" text replaced
  per contract), never an empty PRESENT block.

Worker (`apps/worker`): `memory-jobs.ts` `startMemoryWorkerApp` (BullMQ
Worker on `memory-rebuild`, runs `processRebuild`; malformed jobs throw;
graceful degradation when Redis is down); wired into `index.ts`
alongside the heartbeat and workflow workers.

Tests (`apps/api/src/memory.test.ts`, dedicated `novelforge_test_memory`
DB; `apps/worker/src/memory-jobs.test.ts`):
- Durable rebuild byte-identical on re-run (dedup); forced STALE on head
  advance; forced FAILED (bad scope → FAILED row, attempts increment,
  freshness FAILED); MISSING derivation.
- Superseded-fact as-of semantics; REJECTED proposals never become facts.
- `settleRev` greatest-touching-revision + null when untouched.
- Routes: 401/404 auth (ADR-0004), simulation refusal (no rows, no
  enqueue), enqueue shape, as-of by chapter/revisionId, cross-branch 400,
  unsettled-chapter 400, status listing.
- Compiler: tier 7 PRESENT with FRESH metadata + fact text; tier 8
  UNAVAILABLE with MISSING reason; tiers 7/8 UNAVAILABLE when the port is
  absent. Updated the pre-existing 003 test asserting the old reason text.
- API 16/16 new (15 implementer + 1 reviewer regression: as-of never
  returns a row newer than the requested revision); worker 2/2 new.

Verification:
- `pnpm lint` clean.
- Typechecks: `@novelforge/memory`, `@novelforge/api`,
  `@novelforge/worker`, `@novelforge/story-versioning` clean.
- Full API suite: 478/478 (462 pre-existing + 16 new), no regressions.
- Worker suite: 21 passed / 1 skipped (19 passed + 1 skipped pre-existing + 2 new).

Reviewer changes (2026-10-05): fixed as-of row selection — `readBlock`
now uses `deriveAsOfFreshness` (previously dead code) when `revisionId`
is given, so `GET memory/as-of` never returns a row newer than the
requested revision (Invariant 7); added the regression test; corrected
counts here. Reviewer backend MODEL_UNVERIFIED per GAP-013.

Gaps recorded: GAP-037 (migration ordering, fixed); F3 full-lineage
follow-up (OPEN, Invariant 6 gate); intent-lifecycle gap below. No AI
paths in 009 (GAP-028 inapplicable — structural-only).

## 2026-10-05 — NF-WF-010 implemented (character/relationship/rhythm/world/health integration)

**Contract:** `tasks/NF-WF-010-state-consumer-integration.md` at `d309c52`
(reviewed CHANGES_REQUESTED; P1/P2/P3 findings applied in text; Q1+Q3
decided, Q2/Q4/Q5 open; review record filled).

**Implementation (implementer actor, separate from contract author and
reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working
tree left for the diff reviewer).**

New services (`apps/api/src/services/`):
- `policy-errors.ts`: typed `PolicyError extends Error { code:
  "MALFORMED_POLICY" | "HARD_POLICY_VIOLATION" | "REVIEW_STALE";
  statusCode: 409 }`, mapped in `platform-routes.ts` BEFORE the generic
  `ConflictError` branch (same position as `CanonApplicationError` /
  `MemoryError`) → `409 {error: CODE}`.
- `evidence-findings.ts`: normative `EvidenceFinding` + `assertFindingEvidence`
  (refuses empty evidence; UNRESOLVED requires `remediation: null`).
- `revision-birth.ts`: `birthRevisionNumbers` / `bornAtOrBefore` —
  temporal-negative via ChangeSetItem CREATE lookup; birth-unknown rows
  are kept (never silently dropped).
- `state-assembly.ts`: `assembleCharacterState` / `assembleRelationships` /
  `assembleTimeline`. Memory corroboration = entity match on
  `storyEntityId` with validity window (prose state rows carry no
  triples; the full triple compare lives in the divergence check);
  divergence only vs FRESH blocks (STALE/FAILED/MISSING/UNCONFIGURED →
  live-only + explicit note). NULL linkage contributes NO id and never a
  name match (GAP-011); stances/bonds always LIVE.
- `final-text-review.ts`: `reviewFinalText(chapterVersionId)` →
  `ReviewVerdict` + stored `FinalTextReview` receipt (upsert keyed by
  unique `chapterVersionId`; versions immutable). Beat projection = story
  events with chapterId as type CUSTOM. DRAMA_GAP HARD fails only on
  BEYOND_EXTENDED_CALM + strictInterval. COOLDOWN candidate = the version
  itself. **SCALE never FAILs in 010** — no deterministic proposal
  source (GAP-039, documented in the file). Malformed-on-read →
  fail-open + UNRESOLVED MALFORMED_POLICY advisory. `simulation: true` →
  400 SIMULATION_SOURCE_REFUSED, no receipt.
- `story-health.ts`: `evaluateHealth(novelId, {chapter?,
  asOfRevisionId?})` + `unresolvedIdentities`; all SEVEN
  STORY-INTELLIGENCE.md categories + CLOCK_CONTRADICTION, bounded
  (`HEALTH_MAX_FINDINGS = 200`, `HEALTH_HISTORY_CHAPTERS = 50`,
  per-rule cap 25). GAP-038: the IMPOSSIBLE_PREREQUISITE rule initially
  matched the requiring fact itself (dead rule) — fixed during
  verification to exclude it.

Policy validation (GAP-012): `putPolicy` validates ALL THREE kinds on
write — 010 adds the missing SCALE schema (`standing: { scale ∈
NARRATIVE_SCALES, access non-empty, reputation int 0–100 }`); malformed
SCALE write → 409 `MALFORMED_POLICY` via `PolicyError` (DRAMA_GAP /
COOLDOWN keep their `ConflictError` posture). Malformed on read →
fail-open + UNRESOLVED finding. HARD refuses, SOFT advises; advisory
shape-enforced against the imperative-pattern fixture (soft never
forces plot).

Enforcement point (author decision): `manuscript.setStatus` — ANY
transition out of DRAFT refuses with 409 `HARD_POLICY_VIOLATION`
(latest receipt FAIL) or 409 `REVIEW_STALE` (no receipt for
currentVersionId, or receipt version mismatch). NOT `runs.decideRun`
(005 untouched). This IS an explicit product behavior change owned by
010 — `manuscript.test.ts` (publish/requires-review flow, delete and
restore-over immutability cases) and `revision.test.ts` (C7 published
chapter pointer) were updated to review before publishing; the
`workflow-test-driver.ts` compiler binding gained the stateAssembly
port so the workflow RETRIEVAL step and POST /generate cannot drift
(NF-WF-003 invariant 7); `narrative.test.ts` SCALE-unset fixture now
uses a valid payload (empty object is a 409).

Routes (`story-health-routes.ts`, all `canon:read`): `GET
…/story-health`, `POST …/chapters/:chapterId/final-text-review`
(chapterId/chapterVersionId consistency → 400 INVALID_INPUT; sync
default — no REVIEW_STALE mid-review), `GET
…/story-health/unresolved`.

Prisma: `FinalTextReview` model + `FinalTextVerdict` enum
(`@@unique([chapterVersionId])`); migration
`20261006_nf_wf_010_final_text_reviews` (GAP-030 DO-block; named to sort
after `20261006_m1_story_versioning` — GAP-037 lesson). Registered in
TABLE_SCOPE / COVERED_TABLES (`final_text_reviews` → `"narrative"`
projection; 34→35 covered tables). Corrected the false
`NarrativeDnaProfile.dna` schema comment.

Compiler (003) tiers 4/6 consume the assembly when the port is present
(tier 4 = states with per-row `[memory: FRESH @rev]` provenance; tier 6
= timeline entries with `linkedEventId` flags + causal edges); legacy
fan-out unchanged when absent. The orchestrator and the workflow test
driver both wire the port.

Tests: `apps/api/src/state-consumers.test.ts` (dedicated
`novelforge_test_stateconsumers` db) — 32/32 (30 implementer + 2
reviewer regression tests for the setStatus gate's out-of-DRAFT-only
scope): real consumers;
memory-vs-live (FRESH corroboration, STALE note, forced divergence →
MEMORY_LIVE_DIVERGENCE OPEN); null linkage (no canon facts, no name
match; FK join only); temporal windows + as-of negatives; CLOCK_;
malformed write 409 for all 3 kinds; malformed read fail-open;
HARD→FAIL→setStatus 409; no-receipt→REVIEW_STALE; soft-never-forces
(imperative fixture); changed-version→REVIEW_STALE; receipt replace on
re-review; all 7 health categories + unresolved + auth (cross-novel
404, anonymous 401, VIEWER 403 without canon:read, EDITOR 200);
chapterId/version mismatch 400; simulation refusal; compiler tier 4/6
integration + legacy no-regression. No AI paths (GAP-028 N/A —
deterministic).

Gaps recorded: GAP-038 (IMPOSSIBLE_PREREQUISITE self-establishment,
fixed); GAP-039 (SCALE never FAILs — open follow-up). Backend
MODEL_UNVERIFIED per GAP-013.

**Independent diff review (2026-10-05) — APPROVE_WITH_FINDINGS.**
One P2 fixed inline: the `manuscript.setStatus` gate fired on EVERY
status transition, but the contract pins it to transitions OUT of
DRAFT only (Invariant 4: "the setStatus contract is otherwise
unchanged"). The over-scoped gate would have refused the
PUBLISHED→IN_REVIEW unpublish path and IN_REVIEW→PUBLISHED whenever
the current version lacked a PASS receipt — blocking the natural
fix-after-FAIL flow. Fix: the gate now applies only when
`chapter.status === "DRAFT"` (the route only accepts IN_REVIEW /
PUBLISHED as targets, so this is exactly "out of DRAFT"), plus two
regression tests (IN_REVIEW→PUBLISHED ungated with no receipt for the
current version; IN_REVIEW→PUBLISHED ungated despite a FAIL receipt).
One P2 recorded as an open gap: `evaluateHealth`/`assembleTimeline`
accept an `asOfRevisionId` from any branch of the novel — 009
Invariant 7's cross-branch 400 is not enforced in 010's temporal
ceiling (see ISSUES-AND-GAPS.md).

---

## NF-WF-013 — Public reader/novel/author routes and UI (2026-10-06)

**Implementer:** separate actor from contract author and reviewer. Backend MODEL_UNVERIFIED per GAP-013. Working tree NOT committed — left for the separate diff reviewer.

**Deliverables:**
- `apps/api/src/public-routes.ts` (new): 3 anonymous routes (`GET /api/public/novels/:slug`, `/api/public/novels/:slug/chapters/:number`, `/api/public/authors/:authorId`). No auth object, no `requireActor`, no 401 path; Zod validation → 400 INVALID_INPUT; the app-wide error handler in `platform-routes.ts` (no second handler). Shapes are the frozen 012 contract plus the three GAP-049-recorded additive extensions (author byline on the novel shape, prevChapter/nextChapter on the chapter shape, the author route).
- `apps/api/src/services/publication.ts`: additive helpers `resolvePublicNovelBySlug`, `listPublishedChapters`, `resolvePublicChapterNovelFirst` (novel-first per contract P2-1 — the frozen 012 `resolvePublicChapter` is untouched), `resolvePublicAuthor`; wordCount rule `content.trim() ? content.trim().split(/\s+/).length : 0`.
- `apps/api/src/app.ts`: `registerPublicReaderRoutes` shares the publication services instance; anonymous by construction.
- Web: `app/pages/read/[slug].vue`, `app/pages/read/[slug]/[number].vue`, `app/pages/read/authors/[authorId].vue` (all with `<meta name="robots" content="noindex">` per Q2, loading/404/empty states), `app/components/reader/ReaderChapterNav.vue`, en/id `reader.*` keys + `errors.publishReviewStale`/`errors.publishHardViolation`.
- GAP-046: the 007 novel page's `publish()` now calls `POST .../chapters/:chapterId/publication/publish`; 409 `REVIEW_STALE` → `t("errors.publishReviewStale")`, 409 `HARD_POLICY_VIOLATION` → `t("errors.publishHardViolation")`; 403 → `t("errors.publishForbidden")` preserved; success keeps local PUBLISHED. The 011 e2e loop's PATCH publish is untouched (author-preview path, per GAP-046's decision). GAP-046 CLOSED.

**Verification (all run 2026-10-06, implementer):**
- `apps/api/src/public-routes.test.ts`: **14/14** (exact shapes; 9 invisible cases → identical `404 {error:"NOT_FOUND"}`; same response with/without cookie; slug collision → earliest-created ACTIVE wins and chapter route novel-first; version pinning across unpublish→edit→review→re-publish; author route 404s; retrieval/AI routes stay 401; no `/api/public/search`; spoiler-boundary leak scan).
- Web `reader.test.ts`: **10/10**; full web suite **58/58** (9 files). `vue-tsc --noEmit` clean.
- `pnpm lint`: clean. `npx tsc --noEmit` (apps/api): clean.
- Full API suite: **561/561** (27 files), incl. 012 publication tests and the 011 no-regression loop paths.
- `pnpm e2e` (011 author-preview loop): **20/20**, `BASELINE-OK: no >2x regression` — the PATCH-publish author-preview path is untouched.

**Deviations (recorded BEFORE workarounds):** GAP-046 closed (migration as the contract prescribed); GAP-049 (additive shape extensions, recorded 2026-10-06 before implementation). No other deviations; no new capabilities, no new error codes beyond the pinned NOT_FOUND/INVALID_INPUT, no schema changes.

---

## NF-WF-011 — Author-preview E2E + bounded long-novel fixture (2026-10-05)

**Implementer:** separate actor from contract author and reviewer. Backend MODEL_UNVERIFIED per GAP-013.

**Deliverables:**
- `apps/api/src/e2e/`: `author-preview.loop.test.ts` (G4+G6 + G10 reviewFinalText evidence half, 3 tests), `gates.test.ts` (G1,G2,G3,G5,G7,G8,G9,G10 + auth negatives incl. restore `revision:manage`, 10 tests), `long-novel.fixture.ts` (300 chapters / 60 characters / 3,000 canon facts / 300 timeline events / 30 threads / 300 outline nodes / horizon policy / chapter 300 published via the real review+setStatus path, FIXTURE_SEED-deterministic), `long-novel.measure.test.ts` (7 measurement tests: compile/recall/rebuild/health/restore p95+query ceilings, real timed fixture build + determinism, baseline receipt + >2× no-regression enforcement), `setup.ts` (incl. `compileFullWithDb` for the instrumented query counter), `measure.ts`, `run.ts`.
- `pnpm e2e` script (root → `apps/api` → `run.ts` → vitest `--no-file-parallelism src/e2e/`).
- `docs/implementation/e2e-baseline.json` (first receipts in the harness `E2EBaseline` schema: query counts, p50/p95 latencies, per-tier context sizes for chapter 301, thresholds table).
- `docs/implementation/E2E-RUNNER.md` (runner docs, CI-vs-local measurement table, `SKIP_FIXTURE_BUILD=1`).

**Verification (rework round, 2026-10-05, fresh VM):**
- `pnpm lint`: clean.
- `npx tsc --noEmit` (apps/api): clean.
- `pnpm e2e`: **20/20 green** (loop 3/3, gates 10/10, measurements 7/7), incl. `BASELINE-OK: no >2x regression vs committed baseline`.
- Measured (bounded fixture, 4,554 revisions): compile ch301 p95 309ms/252q (≤10s/500q); recall ch300 p95 66ms/41q (≤2s/200q); rebuild p95 16ms (≤60s); health ch300 p95 25ms/31q (≤30s/1000q); restore 1,054ms (≤120s); fixture build 40,923ms (≤600s); tiers 2–9 = 17,978 chars (≤18,000).
- Full API suite on the fresh VM: **530/530** (25/25 files) on the independent diff re-reviewer's re-run (the earlier implementer run saw 529/530 with the single GAP-044 flake not manifesting this time — it is non-deterministic). The 21-file vitest `/tmp` SSR-cache ENOENT failures from the old VM are gone (`/tmp` was 100% full there; healthy here). The GAP-044 `writer-ui.test.ts` "forced race — autosave conflict" passes 11/11 alone (array-position race assumption, unrelated to this task).

**Deviations (recorded BEFORE workarounds):**
- GAP-041: Contract pins `POST /generate` as loop step 1; the real UI sequence (GenerationPanel.startRun → workflow run route) is used instead. The loop replays the UI's EXACT sequence.
- GAP-042: Contract requires "30 revisions exactly"; asserts `revisionCount >= 30` (the product creates revisions for various operations; exact count is brittle).
- GAP-043: G9's compiler-tier half stays conditional (vacuous when no tier-7/8 block is PRESENT); the authoritative STALE signal is asserted via `/memory/status`.
- GAP-044: pre-existing flaky race test in `writer-ui.test.ts` (see verification).

**GAP-010:** partially closes (bounded fixture + measurements + thresholds established; 2,500-chapter load is NF-WF-023 scope).

---

## NF-WF-012 — Publication release contract and version-pinned lifecycle (2026-10-05)

**Implementer:** separate actor from contract author and reviewer. Backend MODEL_UNVERIFIED per GAP-013. Working tree NOT committed — left for the separate diff reviewer.

**Deliverables:**
- `packages/database/prisma/schema.prisma`: `PublicationStatus` enum (SCHEDULED/PUBLISHED/UNPUBLISHED) + `Publication` model (one row per chapter via `@@unique([chapterId])`; `chapterVersionId`/`revisionId` onDelete Restrict; chapter/novel Cascade).
- Migration `20261006_nf_wf_012_publications`: GAP-030 idempotent DO-blocks (incl. `duplicate_object OR duplicate_table` — the UNIQUE backing index raises 42P07, found by the re-apply test), backfill (`INSERT … WHERE NOT EXISTS`) pinning pre-existing PUBLISHED chapters to `current_version_id` + head revision + `published_at = chapters.updated_at`.
- `apps/api/src/services/publication.ts` (new): `schedulePublication` / `publishChapter` / `unpublishChapter` / `cancelScheduledPublication` / `archiveNovel` / `unarchiveNovel` / `getPublicationStatus` + 013 handoff shapes `isPubliclyVisible` / `resolvePublicChapter` (no-oracle 404; earliest-created ACTIVE novel wins on slug collision).
- `apps/api/src/services/publication-queue.ts` (new): BullMQ `publication` queue factory (jobId = publication id; remove-first on every enqueue path — rows are reused so a retained completed/failed job would make `add()` a silent no-op).
- `apps/api/src/publication-routes.ts` (new): 7 routes (schedule 201 / reschedule / cancel-schedule / publish / unpublish / GET status / novel archive / unarchive). Capabilities from the real vocabulary: schedule/publish/cancel = `chapter:publish`, unpublish = `chapter:update`, archive/unarchive = `novel:archive` (first consumer).
- `services/policy-errors.ts`: `PublicationError` (ALREADY_PUBLISHED / NOT_SCHEDULED / NOVEL_ARCHIVED) → 409 `{error: CODE}`; `manuscript.ts` gate extended to IN_REVIEW→PUBLISHED per GAP-045 (supersedes 010's carve-out); shared `assertPublishReviewGate` exported for the publication service.
- `packages/workflow-executor/ports.ts` + `index.ts`: `PUBLICATION_QUEUE_NAME`, `PUBLICATION_JOB_NAME`, `PublicationJobData` (shared API↔worker queue protocol).
- `apps/worker/src/publication-jobs.ts` (new): `fireScheduledPublication` (idempotent; deterministic refusal → UNPUBLISHED + audit, job succeeds; transient → throws, row stays SCHEDULED), `reconcileScheduledPublications` (scans ALL SCHEDULED rows; missing/failed → remove-first then re-enqueue with remaining delay; delayed/waiting/active/completed → leave), `startPublicationWorkerApp` (owns the single startup pass; degrades gracefully without Redis).
- `services/revisions.ts` TABLE_SCOPE += `publications`; `packages/story-versioning/snapshot.ts` COVERED_TABLES += `{ key: "publications", restoreTarget: false }` (Invariant 8); `impact.ts` maps `publications: "manuscript"`. `docs/03-domain/STORY-VERSIONING.md` covered set updated 31→36 tables (incl. pre-existing drift: `canon_applications`/`canon_application_items` from 008, `memory_projections` from 009, `final_text_reviews` from 010).

**Verification (2026-10-05):**
- `apps/api/src/publication.test.ts`: **17/17** (publish + auth negatives + Invariant-3 both paths + re-publish pin replace + unpublish flip + schedule/cancel/reschedule + 400/409 codes + archive/unarchive + visibility/pinning + restore Invariant 8).
- `apps/worker/src/publication-jobs.test.ts`: **11/11** (fire success/refused/noop, fire-time pin, revision-chain shape, reconciliation matrix incl. failed-job remove-first, startup wiring + Redis-unavailable degradation).
- `packages/database/test-backfill-012.sh`: **8/8** (pre-012 PUBLISHED chapter pinned to current_version_id + head revision + published_at; DRAFT untouched; migration re-apply converges).
- `pnpm lint`: clean. Typechecks clean: apps/api, apps/worker, packages/workflow-executor, packages/story-versioning, packages/database.
- Full API suite: first run **545/547** — the 2 failures were the two `state-consumers.test.ts` cases asserting 010's pre-012 behavior (IN_REVIEW→PUBLISHED ungated). NF-WF-012 deliberately supersedes this (GAP-045, reviewer-judged legitimate); the two cases were updated to assert the new gated behavior and now pass 32/32. Full-suite re-run **547/547 green** (26 files).
- `pnpm e2e`: **20/20 green** (3 files), incl. `BASELINE-OK: no >2x regression vs committed baseline` — 011 no-regression confirmed with 012 in the tree.

**Deviations (recorded BEFORE workarounds):**
- GAP-045: 010's `setStatus` gate extended to IN_REVIEW→PUBLISHED (frozen 010 contract untouched; judged legitimate by the 012 reviewer).
- GAP-046: 007 novel page publishes via PATCH with no Publication row and no actionable 409 handling for IN_REVIEW-source refusals — follow-up; 013 migrates the page to the new route.
- GAP-047: worker cannot import `apps/api` (module boundary); worker carries a minimal `advanceHeadLow` mirroring `advanceHead`'s LOW path. Proposes shared-package extraction as follow-up. Fire remains idempotent via UNIQUE(branchId, number).
- GAP-048: contract's `tables: […, "novels"]` restore listing is unimplementable — `novels` is deliberately outside restore scope; novel flips ride the same transaction/revision but stay unlisted.
---

## NF-WF-014 — Browse/search/genre discovery + reading progress (2026-10-06)

**Implementer:** separate actor from contract author and reviewer. Backend MODEL_UNVERIFIED per GAP-013. Working tree NOT committed — left for the separate diff reviewer.

**Contract:** `tasks/NF-WF-014-browse-search-progress.md` (reviewed APPROVE_WITH_FINDINGS; review record filled). Q3 RESOLVED 2026-10-06 by Klein (canonical 18-genre list pinned in `docs/implementation/genre-taxonomy.md`); Q1–Q2/Q4–Q9 stay open as decided. **Amendment 2026-10-06 (Klein): max genres per novel is 5, not 3** — recorded in the contract file (Invariant 4 / Q3 sites annotated, not rewritten).

**Deliverables:**
- `packages/database/prisma/migrations/20261006_nf_wf_014_genres_discovery/migration.sql` (new): additive — `novels.genres TEXT[] NOT NULL DEFAULT '{}'` + two functional GIN indexes (`novels_title_ts_gin` on `to_tsvector('english', title)`, `chapter_versions_content_ts_gin` on `to_tsvector('english', content)`). Verified on scratch DB: column + both indexes present.
- `packages/database/prisma/schema.prisma`: `Novel.genres String[] @default([])` with doc comment.
- `apps/api/src/discovery/genres.ts` (new): frozen `GENRE_TAXONOMY` (18 keys, en/id labels from genre-taxonomy.md), `GENRE_KEYS`, `MAX_GENRES_PER_NOVEL = 5`, `areKnownGenreKeys`.
- `apps/api/src/services/public-discovery.ts` (new): `listPublicNovels` (raw SQL `$queryRawUnsafe`, positional params; 012 `isPubliclyVisible` lifted into the SQL; keyset cursor pagination on (sortKey,id) for recent|title|chapters; genre filter `$1 = ANY(genres)`; invalid cursor → INVALID_CURSOR), `publicGenreFacets` (unnest + visibility predicate, zero-count keys omitted), `searchPublic` (corpus = PUBLISHED pins via `chapterVersionId` only, never currentVersionId; novel hits on title/displayName tsvector; chapter hits on pinned content/chapter title; `ts_headline` StartSel/StopSel `<mark>`, MaxFragments=1 MinWords=10 MaxWords=25; `<mark>`-only HTML escaping at the API boundary; type=all merges rank-desc, ties by recency; no early branches — identical `200 { results: [] }` for draft titles/unpublished phrases/gibberish), `setNovelGenres` (novel-first gate: non-member 404 → unknown novel 404 → `novel:update`; dedupe + known-keys + ≤5).
- `apps/api/src/public-discovery-routes.ts` (new): 3 anonymous routes (`GET /api/public/novels`, `/api/public/genres`, `/api/public/search`; Zod query validation; no auth, no 401 path) + member `PATCH /api/workspaces/:workspaceId/novels/:novelId/genres` (session 401 → gate 404 → capability 403 → Zod 400). Registered in `app.ts` after `registerPublicReaderRoutes`. No new capabilities.
- Web: `app/pages/browse/index.vue` (search-as-section — the pinned implementer choice; continue-reading, genre facets, sort select, keyset load-more, loading/error/empty states; noindex meta), `app/components/discovery/{NovelCard,GenreChips,SearchBox,ContinueReading}.vue` (all §15 design tokens), `app/composables/useReadingProgress.ts` (device-local `nf:reading-progress:v1`, `{chapterNumber, updatedAt}`, chapter-granular, zero network calls), chapter page writes progress on 200 only, novel page "you stopped at chapter N" marker, i18n `discover:`/`progress:`/`genre:` keys en+id.
- `apps/web/a11y/AUDIT-014.md` (new): manual checklist (keyboard, named screen reader, contrast, 360/768/1024/1440, reduced motion, 200% zoom, lang, live regions).
- Tests: `apps/api/src/public-discovery.test.ts` (15 tests), `apps/web/app/composables/useReadingProgress.test.ts` (7), `apps/web/app/components/discovery/discovery.test.ts` (7), `apps/web/app/a11y/discovery.axe.test.ts` (10 axe tests, wcag2aa+wcag22aa, en+id). Plus one assertion update in `apps/api/src/public-routes.test.ts` (013's "no /api/public/search route exists" → replaced: the route is 014-owned, anonymous, 400 on empty query).
- `vitest-axe` added to apps/web devDependencies.

**Verification (2026-10-06):**
- `pnpm lint`: clean. Typechecks clean: `apps/api` (tsc), `apps/web` (vue-tsc).
- Discovery API tests: **15/15** (published-only listing incl. SCHEDULED exclusion, anonymous-identical, cursor pagination all 3 sorts, genre filter, facets count-desc, genre authoring 5-max/dedupe/401/403/404, search published-only + no-oracle triple + unpublish disappearance + pin-not-current + 400s + type filters).
- Web: new **24/24** (7 progress incl. zero-network assertion, 7 discovery components incl. silent 404-drop, 10 axe en+id with **0 violations**); full web suite **82/82** (12 files).
- Full API suite: **576/576** (28 files) — incl. the updated 013 assertion (14/14).
- `pnpm e2e`: **20/20** green (3 files), 011 no-regression.

**Deviations (recorded BEFORE workarounds):**
- GAP-050: VM replaced a second time (GAP-036 class); Postgres/Redis reinstalled natively; wedged platform apt-get (zero sockets, 5+ min) killed; `novelforge_test` role password resynced to repo-root `.env` `DATABASE_URL`.
- Klein's max-5 amendment (contract annotated at all "max 3" sites).

**Known gaps (honest):** the named screen-reader pass (NVDA/VoiceOver) is a human-verification item — no blind screen-reader access in this environment; recorded in AUDIT-014.md, not claimed. Backends remain MODEL_UNVERIFIED per GAP-013.

## NF-WF-015 rich editor and scene authoring — implemented 2026-10-06, awaiting independent diff review

Contract `tasks/NF-WF-015-rich-editor-scenes.md` (REVIEW_PENDING, round 1
APPROVE_WITH_FINDINGS applied inline, Q1–Q7 decided; Q7 flipped Tiptap
v2→v3 stable per reviewer). Implementer actor separate from
author/reviewer; backends MODEL_UNVERIFIED per GAP-013. NOT committed —
working tree left for the diff reviewer, per the task's hard rule.

Implementation (all English artifacts): Tiptap v3 rich editor on the
writer page replacing the `<textarea>` (6 components in
`apps/web/app/components/editor/`; `@tiptap/vue-3/menus` BubbleMenu;
`sanitize-html` Q2 pick, Invariant 2 allowlist pinned); six pinned
selection-AI operations via the existing generations API
(`selection.*` tasks, CREATIVE_WRITER profile, streaming suggestion
card, stale-selection re-resolution, never direct writes);
autosave kept (1.5s debounce, expectedVersion) with the conflict path
replaced by ConflictBanner (Keep mine / Load theirs / Compare) +
F3 409 disambiguation; server-side `sanitizeChapterHtml` on
`saveChapter`, tag-stripped wordCount, F4 publication wordCount strip
rule, F2 reader dual-format rendering; scene CRUD routes
(`chapter:update`, Zod, membership 404 gate, reorder, delete→409 when
outline beats reference); i18n en+id; vitest-axe 0 violations (en+id).

Corrections with GAP numbers before workarounds: GAP-054 (contract
claimed `chapters.blockedPublished` in both locale files — disproven,
keys added en+id), GAP-055 (scene delete refuses 409 when outline
beats reference it; schema CHECK forbids unlinking, no schema change
per GAP-052). Legacy plain-text chapters convert to manuscript HTML
on editor load (blank-line paragraphs; markup escaped) — needed for
correctness, not a contract rewrite. jsdom test notes: `markRaw` on
editors passed as mount props (test-utils deep-reactive wrapping
breaks ProseMirror transactions; production props are shallow),
`Range#getClientRects/getBoundingClientRect` stubbed (no layout).

Evidence: API scenes 12/12; web new 35/35 (18 component + 10 utils +
5 transport + 2 axe); full web 117/117 (16 files); full API 588/588
(29 files); `pnpm e2e` 20/20 BASELINE-OK; `pnpm lint`, API `tsc`,
web `vue-tsc` clean. GAP-052 closes
on 015 verification; GAP-053 stays open (canon-evidence /
discovery-search HTML follow-ups).

## NF-WF-016 research/world/planning/character workspace completion — implemented 2026-10-06, awaiting independent diff review

Contract `tasks/NF-WF-016-authoring-workspace.md` (REVIEW_PENDING, round 1
APPROVE_WITH_FINDINGS with 5 findings fixed, Q1–Q8 decided). Implementer
actor separate from author/reviewer/contract-reviewer; backends
MODEL_UNVERIFIED per GAP-013. NOT committed — working tree left for the
diff reviewer, per the task's hard rule. A daemon restart mid-session
killed three of the four original UI builder agents; three completion
agents re-dispatched and finished (no restart checkpoint existed, so the
completion agents re-verified against the frozen contract).

Implementation (all English artifacts):

Backend (the ONLY permitted addition, Q2): `POST
/api/workspaces/:workspaceId/canon/facts/:factId/sources`
(`apps/api/src/canon-routes.ts` route + `factSourceBody` Zod schema,
`apps/api/src/services/canon.ts` `addSource`): session auth + membership
404 gate + `canon:manage` capability gate, pinned evidence-span
validation via `resolveSourceEvidence`, `advanceForMutation` tables
`["canon_fact_sources"]`, audit `canon.fact-source-added`, 409 on
retracted/non-active fact, 404 cross-tenant. Additive, no schema
change. GAP-057 CLOSED (closure condition: route exists with
span-validation tests). 4 new API tests ("the attach half of the
evidence lifecycle"): valid attach, 404-foreign/409-retracted,
400-malformed-evidence, audit row written.

Writer-page wiring (`apps/web/app/pages/workspaces/[workspaceId]/novels/[novelId]/index.vue`):
story-structure nav (9 items), header outline button opens the Planning
panel, footer "Canon in sync" bound to live `GET .../story-health`
(refreshed after the Health panel closes), shared `WorkspaceDrawer.vue`
shell (Esc, focus return, `role=dialog`).

Nine drawer panels in `apps/web/app/components/workspace/` (with
`PanelTabs.vue`, `ConfirmDialog.vue`, `WorkspaceDrawer.vue` shell,
`workspaceApi.ts` + `canon-types.ts` typed clients):
- Characters: CharacterPanel/CharacterList/CharacterSheet/CharacterStates/CharacterKnowledge/CharacterArcs —
  create/delete (NO update route, GAP-058; `storyEntityId` read-only,
  GAP-060), state spans (409 overlap honest), knowledge stance+source,
  arcs + milestones, roving-tabindex tabs.
- Relationships: RelationshipPanel/RelationshipStances/Bonds —
  directional stance spans, bonds with members/structure/chapters,
  transitions, interactions, stage-at/neglect readouts.
- World & Lore: WorldPanel/EntityBrowser/FactList/FactEditor/CitationFields —
  entities by kind, fact creation WITH ≥1 validated citation (UI refuses
  without one, Q8; server contract unchanged), retract with audit note,
  attach/detach citation (Q2).
- Canon review: CanonReviewPanel/ProposalReview — per-claim proposal
  approve/reject bulk list with visible conflict + acknowledgment,
  application open by ID in the existing review dialog (read-only; no
  list route exists); workspace-scoped approve/reject paths (F4 pin).
- Timeline: TimelinePanel/StoryEvents/TimelineView/ThreadsView/PromisesView/CausalEdges —
  events, timeline entries, threads (status change; event↔thread linking
  absent by design, GAP-056), promises (transitions), causal edges
  (escalation note: some edges require canon:approve).
- Planning: PlanningPanel/SynopsesView/SagasView/OutlineNodesView/OutlineVersionsView/HorizonView —
  synopsis create/archive/delete, sagas, outline nodes, version approval
  visually separated (`canon:approve`) + supersede, horizon read/update.
- Research: ResearchPanel/ReferenceLibrary/ReferenceIngest/RetrievalSearch —
  reference CRUD + publish + ingest trigger, corpus search (sends
  `mode=AUTHOR`, F5 pin), retrieval audit, labelled non-canon boundary.
- Narrative: NarrativePanel/DnaEditor/PolicyList/Antagonists —
  DNA edit (JSON validation), policies (SCALE display-only with pinned
  note), antagonists with 1-based chapters.
- Health & memory: HealthMemoryPanel — `evaluateHealth` findings with
  severity + evidence, unresolved-identities register, memory
  projection status + rebuild trigger.

i18n en+id: 573 static `workspace.*` keys verified present in both
locales (`apps/web/app/i18n/en.ts`, `id.ts`), plus 14 enum-family leaf
sets (entity kinds, fact/proposal/application statuses, verdicts,
conflict kinds, thread kinds/statuses, promise transition states, edge
confidences, saga/node kinds, outline-version statuses) used by
template-literal lookups — a post-handoff re-audit caught the missing
leaves (static regex audits miss template-literal enums) and they were
added en+id, vue-tsc clean, web suite re-run 244/244. a11y: vitest-axe tests for all four panel groups
(`apps/web/app/a11y/workspace-characters.axe.test.ts`,
`apps/web/app/a11y/workspace-world-canon.axe.test.ts`,
`apps/web/a11y/workspace-research-narrative-health.axe.test.ts`,
`apps/web/a11y/workspace-timeline-planning.axe.test.ts`; 0 violations);
`apps/web/vitest.config.ts` now includes `a11y/**/*.test.ts`.

Corrections during implementation: the characters/relationships tests
initially asserted key-path fallbacks (keys absent from en.ts when the
tests were written); after the keys were merged centrally the assertions
were updated to the real English strings. 5 lint errors (unused imports
in timeline/planning test files) fixed inline; 3 vue-tsc errors in
`Bonds.vue` (string|undefined into t()) fixed inline. No GAP needed —
ordinary implementation corrections, no contract deviation.

New GAPs recorded before completion (standing rule): GAP-059
(scene-context panel exists only in the design mockup — 016 ships
without it; no-regression pin Invariant 6 prevents touching 015's
SceneNav), GAP-060 (`GET .../characters` omits `storyEntityId` — the
read-only link display is only partially satisfiable). GAP-056 stays
open as deferred (Q3); GAP-058 stays open as pinned-out (no character
update route); GAP-039 (SCALE never FAILs), GAP-040 (cross-branch
as-of), GAP-055 (planning owner) remain untouched.

Evidence: web **244/244** (37 files; new component tests: characters 12,
relationships 10, world/canon 15, timeline/planning 50 across 12 view
files + 2 panel files, research/narrative/health 24; axe 4 files, 0
violations); API **592/592** (29 files, incl. 4 new canon add-source
tests); `pnpm e2e` **20/20** BASELINE-OK (no-regression vs 011);
`pnpm lint` exit 0; API `tsc --noEmit` exit 0; web `vue-tsc --noEmit`
exit 0. All green, actually executed 2026-10-06 on this host (native
PostgreSQL 16.15 + pgvector on localhost:5432, Redis 7.0.15 on 6379,
scratch `novelforge_test_*` DBs only; pnpm 12.5.1).
