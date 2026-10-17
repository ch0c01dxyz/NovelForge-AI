# NF-WF-055 — Verify and publish the platform-admin revision

Status: VERIFIED; author authorized commit/push after these checks.
Base: f61e97c4a4e19034ad4d81058a97430089522a67.
Owner: root integration executor. Reviewer: separate read-only review_model_fallback.

## Contract

Review the existing author-provided admin revision, fix concrete defects and
run focused personal checks before the explicitly authorized commit/push.
Read AGENTS, START-HERE, CURRENT, design tokens, existing admin routes/services,
frontend callers and tests. Memory392 is retained context, not source evidence.
Scope: platform-admin lists/pager, admin page/composables, en/id, focused tests
and this task/progress/single issue register. No dependency, lockfile, schema,
auth policy, routing policy, quota behavior, novel reset or unrelated changes.
One writer; reviewer does not edit this worktree. Preserve stash/Docker/data.

## Acceptance and evidence

Existing server contracts and roles remain enforced. Client-side search and
20-row paging work for five tabs; search resets page and refreshed data clamps
it. Locale labels/fallback and context formatting remain. Unknown capability
tokens retain fallback. Toast outcomes and counts match actual server responses;
success/error colors and dismissal remain readable. Existing UI design reused.

Root reproduced wrong count with the real numeric contract, fixed the shared
frontend annotation and consumer, and added 0/3 numeric plus paging regressions.
Final focused command: pnpm --filter @novelforge/web exec vitest run
app/components/platform-admin/ModelCatalog.test.ts app/pages/admin/index.test.ts
app/a11y/platform-admin.axe.test.ts app/composables/useLocale.test.ts
app/composables/usePlatformAdmin.test.ts — 5files/44tests PASS.
Scoped ESLint and final vue-tsc --noEmit passed (exit0).
No new dependency; jsdom canvas warning bounds axe contrast evidence.

Actual Chromium used a temporary real admin session and configured real gateway
model sync,200 {discovered:2960}; rendered toast count matched. Success/error
contrast10.54:1/9.57:1 measured from actual computed colors. Error came from
real401 after logout; no provider failure fabricated. Paging/filter/en/id/five
tabs/no-page-errors passed. Existing enabled flags/nf:markers preserved; novel
and chapter counts unchanged0/0; sessions41 before/after. Sync refreshes actual
catalog metadata and creates normal product audit history. Private receipt:
.nf-batch-worktrees/local-accounts/nf055-review-receipt.json.

Independent final exact-diff review APPROVE after fixing both recorded blockers.
Admin page blob d0faaaa; composable497ea93; catalog tests80f423e; admin tests741f856.
Retained earlier full web611test evidence was not rerun/claimed as current.

## Limits and recovery

Client-side paging still fetches full lists; Audit only searches its fetched
50rows. No migration or story rollback effect. Recover UI through a normal
future revert; do not revert the database or reset gateway configuration.
No human screen-reader acceptance claim. Verify exact staged scope and final
typecheck before committing; normal push only after fresh remote comparison.
Final browser screenshots were visually inspected by root; publication hashes
and remote read-back belong in the runtime-confirmed session checkpoint.
