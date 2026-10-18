# NF-WF-057 — Review and repair workspace management with Monokai integration

Status: VERIFIED. Author explicitly authorized current-change repairs followed
by commit/push; no deployment/reset. Base:f42af8aecdac4c5baf4abb82dde64fd86044332b.
Owner: root integration executor. Independent read-only reviewers:
review_model_fallback (backend) and ci_lint_review (frontend/tooling).

## Scope and invariants

Read AGENTS, START-HERE, CURRENT, NF056 contract, platform/auth/database schemas,
workspace routes/services and all changed UI callers/tests. Preserve all prior
uncommitted work/stash/Docker and live accounts/data. Review current Monokai
migration plus standalone create/rename/delete workspaces; do not add features.
Allowed: affected API/platform service/export, workspace/home/dialog/locale/CSS
code, focused tests, private lint-ignore scope and task/progress/issue records.
No migration/dependency/business-flow change. One writer; reviewers read only.

## Bugs and repairs

Source review identified P1 count-before-lock novel deletion and stale OWNER
authorization races. Move checks inside the workspace-locked transaction,
recheck membership/capability, audit rename/delete atomically and refuse cascade
of novel-independent agents/skills/workflows/references. Preserve detached
audit/generation history. Actual test-only PostgreSQL locks establish concurrent
insertion/revocation; trigger failure proves mutation/audit rollback.

Frontend: snapshot submitted identity, gate initial loading, disable pending
controls/close, preserve unknown outcomes without automatic retry, map history
refusals accurately inside active confirmation. Native manager/wizard modality
plus shared Tab helper contain keyboard focus; nested confirmation busy/error
props retain existing callers. Narrow rows wrap. Native radio/checkbox colors
inherit Monokai. Exclude only private artifact tooling from lint; production
API/web/worker scope and worker import boundary stay tested.

## Verification and limits

- Full web97files/631tests PASS, then3affected files/37tests PASS after final
  shared Tab helper; API3files/38tests PASS.3ESLint scope/boundary tests PASS.
- Final API/ai-services/web typecheck and root lint exit0. No schema migration.
- Real Chromium uses actual isolated API3002/disposable novelforge_test_ws_mgmt,
  transparent transport forwarding, not fabricated responses.15route screenshots;
  workspace CRUD, protected-definition refusal, native/nested focus, en/id390px,
  five admin tabs/gateway form, real configured gateway health and model sync2980
  toast match, actual401error contrast5.69:1. CSS200%control height doubled.
- Native OS popup capture, native browser chrome zoom, all possible UI state
  combinations and human screen-reader acceptance are not claimed. Test fixture
  published state is for rendering only, not author sign-off/publication proof.
- Live counts unchanged2users/4sessions/2workspaces/2memberships/0novels/0chapters.
  Live API refreshed24784->43232 only after tests; ready/list200 and verification
  session removed. Worker/Nuxt/Docker preserved. No repeated reset/demo cleanup.
- Backend exact review APPROVE (platform9b43b3c, tests66895f5). UI final helper
  review APPROVE (helper SHA2560ce4a91d1a6ff1e1532d18e84e197349c153f4ac4574a66792baae93245e683c).
  Private receipts/screenshots under .nf-artifacts/nf056/; no secrets in commits.

## Handoff and recovery

Stage only reviewed files, verify exact contents/privacy, normal commit/push
after fresh remote comparison. Publication hashes belong in the verified own-
session checkpoint. Runtime data requires no rollback; a future code revert
must preserve database history and not rerun the historical reset prompts.
