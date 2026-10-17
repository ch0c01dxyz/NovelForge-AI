# NF-WF-054 — Finish review and reset local story data

HISTORICAL EXECUTED PROMPT: NF-WF-054 completed on2026-10-17. Do not replay
the reset or provisioning instructions below. Read CURRENT.md and the task's
Completion/coordinator-verification sections for the actual latest state.

You start with a clean conversation context. Work in
`C:\Users\ch0c0\Downloads\NovelForge-AI` using non-login PowerShell.
Reply in Indonesian; write project-owned artifacts in English.

## Authority and objective

Finish the existing author onboarding/admin-navigation task, then reset ALL
novels and their chapter/story data in the local working database. The author
explicitly approved that reset while preserving accounts, workspace records and
memberships, gateway/model/profile/routing settings and application configuration.
Do not ask for the same scope approval again. No commit, push, merge or deploy.

Use ONLY your own host-confirmed Engram binding. Never invent/reuse the previous
session identity, call session start/end, or reopen an old session. Read
`C:\Users\ch0c0\.codex\docs\ENGRAM-RUNTIME-BINDING.md`. The previous
harness saved/read checkpoint382, then its hook became UNBOUND again with
spawnSync engram.exe ETIMEDOUT. Registration alone is not a checkpoint save.
If unbound, keep a concise file handoff and disclose the failure; continue
independent authorized work. Do not store credentials or raw logs in memory.

## Required recovery and source verification

Read AGENTS.md, START-HERE.md, docs/14-progress/CURRENT.md,
tasks/NF-WF-054-author-onboarding-and-admin-navigation.md,
the NF054 entry in docs/implementation/ISSUES-AND-GAPS.md,
the relevant orchestration/evidence policy, and
.nf-batch-worktrees/local-accounts/HANDOFF.md. Treat recalled claims as context.
Verify HEAD, diff, untracked paths, stash and actual services before acting.

Expected HEAD:367b8b9c88773e1cb4ae4059596ea24c63034a58 on main. Preserve
stash@{0} nf050b-acceptance-wip and every ignored archive/worktree. The feature
is intentionally uncommitted. Never git clean/reset or reinstall/reset Docker.

## Already implemented and observed — reuse this evidence

- New GET /api/workspaces returns only the actor's memberships with existing
  server-derived novel:create capability. Existing creation APIs remain owners
  of validation, authorization and initial novel revision/branch/settings.
- Home has localized create CTA and actual-session SUPER_ADMIN admin entry;
  wizard: existing/new workspace -> title/slug -> review/create -> saved novel.
  No writes before confirmation, double-submit guard, retained workspace after
  novel rejection, ambiguous-result retry refusal. Existing five admin tabs reused.
- Explicitly requested local account separation is complete: designated owner
  sole platform admin, separate author created with real registration/login.
  Author admin API403 / admin200 verified; existing story data untouched then.
  No credentials in source, docs or memory. Account details can be verified
  privately through the ignored setup.mjs and current database; DO NOT rerun
  provisioning, change passwords or ask the author to repeat them.
- Backend actual disposable PostgreSQL/API tests:2files/24tests PASS;
  root API and ai-services typechecks PASS; scoped ESLint PASS.
- Child UI home/wizard12 + locale18 tests PASS; UI typecheck exit0 with a
  Vue router tooling-plugin warning. Fresh worktree needed existing Nuxt prepare.
- Independent read-only source review approved inspected diff with one nit:
  restore focus to Create after closing wizard. Root fixed this in home;
  focused12tests passed again and ACTUAL Chromium verified restored focus.
- Real Chromium through :3001 proxy/:3000 API verified en/id, hidden author
  admin link, new workspace+novel, another novel in same existing workspace,
  two persisted novels, admin home entry and five actual admin tabs.
  Receipt: .nf-batch-worktrees/local-accounts/browser-receipt.json.
  Screenshots:home-id.png,wizard-review.png,admin.png in that directory.
  Root visually inspected wizard-review.png. No LLM call was needed.
- Obscura blocks private network; existing Python Playwright worked without
  changing that guard. Do not repeat this connector failure or install tools.

Review submission manifest for original UI:
.git/author-onboarding-ui-20261017-manifest.json (6paths,hashes). Root's focus
fix changes home after that manifest; do not overwrite it from the child tree.
Final focus delta review/typecheck is unfinished. Request an independent
read-only exact-diff review as repository policy requires. Do not rerun the
entire already-passing release battery or repeat successful browser creation.

## Actual local environment — verify before reuse

- Working PostgreSQL: nf-pg-5433, host5433, novelforge_acceptance_050b.
  Root .env DATABASE_URL is stale; derive Docker credentials process-privately
  and use explicit5433. Never print URL/password or reset database credentials.
- Working Redis: nf-redis-acceptance, localhost6399/0. Do not flush Redis.
- API refreshed from41492 to43488 for the new endpoint; /ready200 observed.
  Current PID file: .nf-batch-worktrees/local-accounts/api.pid; logs api.out.log
  and api.err.log. Refresh helper already ran; do not replay stale hardcoded PID.
- Worker39984; Nuxt37132 at127.0.0.1:3001. Recheck process identity. Preserve
  running gateway and Docker data. Do not kill arbitrary node processes.
- Latest actual counts:28novels,75chapters,5workspaces,7users. Includes two
  task-created onboarding acceptance novels in one new workspace. Approved reset
  removes those novels too but preserves the workspace as explicitly requested.

## Next steps — implement, do not just propose

1. Finish focused review/typecheck for the small focus-restoration delta.
   Preserve existing uncommitted source. Read actual current callers/tests.
2. Prepare a FRESH full backup of the working DB after account setup and UI
   acceptance. Verify checksum and full archive TOC; prove restore into an owned
   disposable clone. Existing pre-change.dump predates account setup and is NOT
   the correct reset rollback baseline. Keep backups private/Git-ignored.
3. Inspect actual schema, current rows, delete constraints and background jobs.
   Document any blocker in ISSUES-AND-GAPS before workaround. Existing product
   deleteNovel intentionally refuses history in some cases; do not weaken it
   just for this one-time author-authorized maintenance reset.
   Known findings to verify: canon_facts -> novels is RESTRICT; canon facts/
   applications reference entities restrictively; workflow_runs restrictively
   references workflows/versions; scale decision history has restrictive links;
   nullable revision/branch/current-version cycles exist. Generations.novel_id
   and workflow_runs.novel_id are NOT enforced novel FKs. A bare novel delete
   cannot establish complete cleanup. Some tables have non-id primary keys.
4. Build the smallest explicit FK-aware maintenance plan scoped to all novel
   and derived story rows. Preserve workspace/global definitions and user/admin/
   gateway/configuration data. Inspect non-FK references and derived generation/
   workflow records; report any unknown rather than claim full cleanup. Do not
   DROP the working DB, disable constraints/triggers, or TRUNCATE CASCADE blindly.
   Prove the plan on the restored clone with before/after preservation checks.
5. Check five worker queues and active requests/jobs before live mutation.
   No active/wait Redis keys or workflow runs were returned in the last bounded
   check, but that is temporal evidence: recheck. Use a controlled maintenance
   window if needed, stop/resume only exact task-relevant verified processes,
   preserve queue configuration. Do not wipe unrelated jobs or all Redis keys.
6. Execute the proven reset transaction with current backup and integrity checks.
   Verify zero novels/chapters/story remnants in the planned scope and unchanged
   accounts, roles, workspace/membership and configuration fingerprints. Preserve
   auditability and state the actual boundary; no fabricated blanket claim.
   Verify API readiness and actual empty author library afterward without
   recreating a novel. Leave runtime ready for the author's own live testing.
7. Update task/CURRENT/single issue register with actual commands, receipts,
   limitations and rollback path. Save a concise checkpoint+summary with YOUR
   valid host identity and read back, or preserve fallback if unbound. Hand off
   without commit/push. State any unfinished step explicitly.

## Anti-hallucination contract

Distinguish observed, retained, inferred and unknown evidence. Never turn an
actor ID into human approval or label automated checks screen-reader acceptance.
Do not infer that memory contains the entire previous conversation. Do not invent
commands/results, source state, model dispatch, approval or health. The reset
scope is already author-approved above; permission to commit/push is absent.
Reuse actual evidence and run only checks justified by new changes or unresolved
risk. Use real APIs and persisted data for remaining acceptance; any LLM-dependent
step uses the configured real gateway, not fake provider acceptance. No unrelated
feature expansion, repeat onboarding provisioning, speculative redesign, or new
dependency. Stop the affected action and record evidence if preservation cannot
be proven; continue other authorized work.
