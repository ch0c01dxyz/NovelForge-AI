# NF-WF-054 — Author onboarding and admin navigation

Status: COMPLETED. Base367b8b9c88773e1cb4ae4059596ea24c63034a58.
Owner: root integration/backend executor; UI writer:web_test_repair in a
separate author-onboarding-ui worktree. Reviewer: separate read-only actor.
Runtime model identities are not asserted. No two writers in one worktree.

## Goal and approved design

The author observed missing novel creation and undiscoverable administration
after login. The author approved: prominent home create CTA; workspace ->
title/slug -> review/create wizard; redirect to the actual novel workspace;
conditional platform-admin entry with existing gateway/model/profile/routing/
audit menus. Preserve writer-workspace design and English/Indonesian locale
keys with English fallback. No synopsis or settings inputs that are not saved.

## Reading and dependency evidence

AGENTS, START-HERE, CURRENT, model evidence policy, task template,
ADR0004/0005, design tokens/workspace foundation; actual home, admin page,
platform/auth routes/services, locale resources and relevant tests. Existing
home only lists novels and directs creation through an API. Existing admin
UI exists but has no home entry. Both creation APIs already exist.

## Frozen contract and allowed paths

Add authenticated GET/api/workspaces returning the current member's rows:
`[{id,name,slug,role,canCreateNovel}]`. Compute canCreateNovel server-side
from the existing capability table; no cross-tenant/global-admin bypass.
POST/api/workspaces{name,slug}->{id} and workspace novel creation remain
existing contracts. The UI reads actual platformRole from auth/session;
never hardcode account emails or grant roles in frontend code.

Root paths: platform service/export as needed, API platform routes/tests,
task/progress/issue records. UI paths: home, focused wizard/component,
en/id resources and focused tests; minimal admin return navigation if needed.
Shared locks/manifests/tokens remain integration-owner only, no new dependency.
No schema migration, provider/model behavior change, canon or publication flow
change, role-editor feature or unrelated refactoring.

## Acceptance and negative cases

Create from both empty/populated home; existing permitted workspace or new
workspace; save only on final confirmation. Show validation/loading/error/
success states, preserve fields on failure, prevent duplicate clicks and
ambiguous blind retries. Retain a created workspace ID when novel creation
fails. Slugs/title/name follow actual server validation; no fake saved fields.
Admin link only actual SUPER_ADMIN; direct API refusals remain enforced.
Unauthorized/other-tenant workspace disclosure and readonly creation refused.
Verify en/id/fallback, keyboard/focus semantics and rendered final UI.

Use meaningful focused regressions plus real local API/browser acceptance on
owned disposable test data where mutations are required. Existing deterministic
unit tests allowed; do not replace real acceptance with mocks. Reuse baseline
CI/release evidence; no automatic full-suite repeat. Windows Docker/data must
be preserved. Do not print/store passwords or tokens.

## Local account and reset operations

Author separately authorized runtime account separation. Completed through
real registration/login and ADR0005 out-of-band audited role bootstrap after
private backup; credential not in project artifacts. Workspace roles remain
separate from platform administration. Personal account details stay private.
Author approved deleting ALL local novels and chapter/story data after UI
completion, preserving accounts, workspaces, gateway/model and application
configuration. Do not ask for the same approval again. Reset is NOT executed:
prepare a fresh recoverable backup, prove an FK-aware plan on an owned
disposable clone, and check the maintenance window and queues first.

## Handoff

Separate review of the exact integrated diff, commands/outcomes/source hashes,
rendered evidence, remaining limits and current Git state. No new commit/push
or deployment authorization inferred. Root Engram is currently UNBOUND due
hook timeout; no attributed writes until host reconfirms. Private fallback
handoff is local-accounts/HANDOFF.md under the ignored artifact root.

The host subsequently reconfirmed identity; checkpoint 382 was saved. Conflict
review then hit another ETIMEDOUT and blocked writes again. No further writes
until renewed confirmation. Backend focused real DB/API suites passed:
2 files / 24 tests. The UI worktree initially lacked generated Nuxt tsconfig;
existing Nuxt prepare resolved that prerequisite and focused UI/locale tests
then passed 30/30. See the subsequent evidence update below.

## Verified handoff update — 2026-10-17

UI integrated from six frozen child paths with SHA256 read-back. Root API and
ai-services typechecks and scoped ESLint passed. Child UI typecheck passed with
a Vue router tooling-plugin warning. Independent review approved inspected
product blobs with a focus-restoration nit. Root repaired that nit; 12 focused
home/wizard tests passed again and actual browser verified focus returns to
Create. That small delta still needs a final independent review/typecheck.

Real Chromium acceptance through Nuxt and the live API passed: author admin
link absent; en/id switch; new workspace plus novel creation; second novel in
the same existing workspace; both persisted; designated admin has five actual
tabs. Root inspected the review-step screenshot. No LLM call was required for
this metadata flow. Automated browser evidence is not human screen-reader or
author acceptance. Private receipts/screenshots remain in local-accounts/.

API refreshed from verified PID41492 to43488 to load the endpoint; ready200.
Worker39984, web37132 and Docker preserved. Initial process identity check
refused a different command spelling before any process action; exact command
and listener identity were then verified. Obscura refused private-network
access; existing local Python Playwright worked without changing its guard.

Handoff: HEAD367b8b9, stash preserved, feature uncommitted. Actual database:
28 novels,75 chapters,5 workspaces,7 users. No reset. Fresh backup, clone
rehearsal, scoped reset and read-back remain. The pre-account backup is NOT a
fresh reset backup. Latest runtime hook is UNBOUND again; no further attributed
writes. Checkpoint382 was read back before the latest failure. Continue via
tasks/NF-WF-054-NEXT-HARNESS-PROMPT.md using the next harness's own binding.

## Completion — 2026-10-17 (next harness)

The remaining steps finished under the next harness's own host-confirmed
binding. The focus-restoration delta (11 lines in `apps/web/app/pages/
index.vue`: `nextTick` import, `createButton` template ref, `closeWizard`
close-then-nextTick-then-focus, `ref="createButton"`, `@close="closeWizard"`)
passed 12/12 focused tests, `vue-tsc --noEmit` exit0 and scoped ESLint exit0
(the repo ESLint flat config covers only TS/JS; `.vue` files are outside its
scope by existing convention). An independent read-only exact-diff review
(byte-compare against the pre-fix worktree copy) returned APPROVE with no
required change; its only observation — no unit test pins the focus restore —
was accepted as in-scope-free for this delta because actual Chromium had
already verified the behavior.

The author-approved all-novel/story reset then executed on
`novelforge_acceptance_050b`: fresh full custom dump
`nf054-post-acceptance.dump` (653036 bytes, SHA256 dd426e4487dbc1db45591b9f9
c724e5688135382a69f2251736a76b83419f1aa, pg_restore TOC 861 entries) was taken
before mutation, restored into an owned disposable clone (28/75/5/7
read-back), the FK-aware plan `nf054-reset-plan.sql` was proven on that clone,
and the identical plan committed against the live database in one transaction.
Post-state: zero rows in all 77 story/derived tables; the only retained
generation row is one workspace-scoped `novel_id IS NULL`
AUTHOR_MODEL_FALLBACK_CONFIGURATION_CHECK record with its attempt, which is
not story data. Preserved fingerprints unchanged: users=7, workspaces=5,
memberships=6, sessions=40, audit_logs=782, author_follows=1, ai_gateways=1,
ai_models=2498, model_profile_mappings=43, notification_preferences=0,
_prisma_migrations=46. All five BullMQ queues had empty wait/active/delayed
immediately before and after; completed history and Redis keys were not
wiped. API `/ready` 200 and Nuxt 200 after reset. Boundary: author-session
`GET /api/novels` was not exercised because no credential is retained; the
empty author library follows from zero novel rows in all workspaces. No
commit/push. Feature remains uncommitted at HEAD367b8b9.

## Coordinator verification of the returned harness report — 2026-10-17

Recovered actual Engram383 and current source/receipt, verified backup SHA256,
HEAD and preserved stash. Retained restore/rehearsal evidence was not rerun.
Closed the reported missing author API/browser evidence without a password:
minted a short-lived server-side verification session for the actual author,
GET through Nuxt /api/novels200 [] and /api/models403, actual Chromium empty
library/create CTA visible and admin link absent. No story mutation. Temporary
session removed; session count returned to40. Current DB read-back:0novels,
0chapters,7users,5workspaces,6memberships. Private receipt and screenshot:
local-accounts/post-reset-library-receipt.json and post-reset-empty-library.png.
This proves post-reset authenticated behavior, not a new password-login test
or human acceptance. No reset repeat, commit or push.
