# NF-WF-052 main working-tree integration — 2026-10-15

Authority: the author explicitly authorized application of the final reviewed
NF-WF-052 patch to main. This is working-tree application, not a Git merge,
commit, publication or deployment.

Baseline HEAD: `50609c0d2704380ac2b48fa5eb01164fe8e858ca`.
Applied artifact: `.nf-batch-worktrees/nf052-main-wip-anomalies.patch`, SHA256
`7d63a0c37451cc8210d0e578d8f6fe0a9e312f541b17ff629a428486229dfd88`.
Its separate exact-artifact APPROVE and 39-pass memory-suite evidence are
retained from the harness; these are not new local test or review claims.

## Observed integration proof

- Patch SHA256 and dry-run applicability verified before application.
- `git -c core.autocrlf=false apply` exited 0.
- All five applied files match candidate SHA256 byte-for-byte:

| Path | SHA256 |
|---|---|
| packages/memory/src/constants.ts | e46dcf1f2a85185a796e438fdf7b97d9d1d7aedeab08ed0b1ce484deb38a936d |
| packages/memory/src/types.ts | 3264487a7d7409f85961c6512127ba1efc471255cf6ec0a3608b0eca57999132 |
| packages/ai-services/src/memory.ts | cd49ef5ea8f13d8511a6a1b7bfef255f9ffe35852640f6e15a6bbcc96a961e78 |
| apps/api/src/memory-routes.ts | c2daaf6aedf4489810dd921021ffd2fe4449f9cc30dbc47becd56f8b0c0a66de |
| apps/api/src/memory.global.test.ts | 258b20fbc72e883b9efcb48136bf0a9a42e2525cd8432151aa6bf6ea6a95d480 |

- All other pre-existing tracked WIP hashes remained identical at application
  verification. NF051 interval work is preserved. Subsequent edits in this
  turn are the explicitly named integration evidence records only.
- HEAD, empty index and stash `nf050b-acceptance-wip` are unchanged.
- Reverse apply-check and touched tracked-source whitespace check exited 0.
- Local pre/post manifests: `.git/nf052-approved-integration-pre.json` and
  `.git/nf052-approved-integration-post.json`.

## Local typechecks and retained tests

| Check | Actual result |
|---|---|
| pnpm --filter @novelforge/memory typecheck | Exit0 |
| pnpm --filter @novelforge/ai-services typecheck | Exit0 |
| pnpm --filter @novelforge/api typecheck | Exit2, TS2550 in pre-existing untracked apps/api/scripts/gap051-loadmore-seed.ts:63 |

API include **/*.ts reaches the utility's Promise.withResolvers use, while
the shared compiler lib is ES2023. The script predates this patch and is absent
from the candidate; no baseline full API rerun was performed. It is preserved
unchanged, SHA256
`6ef128c4883aa69c6f791e42c3ceadbefE7c21d3de3e0d211f3fc3fafb15fd71`.
See ISSUES-AND-GAPS for scope and next action. The typecheck shell sequence
exits1 on that failure; do not report all three checks as green.
The candidate's 39-pass suites and package checks are retained because applied
postimages are identical. No database-backed tests were repeated here.

The route and additive anomaly contract are now present in main source.
No runtime restart, HTTP smoke request, database mutation, migration, broad
release battery or new author acceptance was performed. Existing runtime
processes have not been independently verified to serve the updated route.
D2 remains unapplied; ContinueReading rendered evidence remains UNKNOWN;
human screen-reader acceptance remains DEFERRED_BY_AUTHOR_DECISION.
